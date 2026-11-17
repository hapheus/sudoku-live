import { randomUUID } from 'node:crypto';
import type { LogicalHint } from './types.ts';
import { OnlineGameClient } from '../../../src/services/online-game-client.js';
import { generateRandomPlayerName } from '../../../src/services/player-name.js';
import { buildProtocolMetadata } from '../../../src/services/multiplayer-protocol.js';
import type { GameSession } from './game-session.ts';

export interface HintPreviewPayload {
  mode: 'preview';
  index: number;
  digit: number | null;
  technique: string | null;
  unitType: string | null;
  unitIndex: number | null;
  contextEntries: [number, number][];
}

function buildHintPreviewPayload(hint: LogicalHint): HintPreviewPayload {
  return {
    mode: 'preview',
    index: hint.index,
    digit: hint.digit ?? null,
    technique: hint.technique ?? null,
    unitType: hint.unitType ?? null,
    unitIndex: hint.unitIndex ?? null,
    contextEntries: Array.from(hint.contextDelays.entries()),
  };
}

export class CentrifugoAdapter {
  private readonly online: OnlineGameClient;
  private revision = 0;
  private syncedRevision = -1;
  private hostCursorIndex: number | null = null;
  private hostActiveDigit: number | null = null;
  private hostHintPreview: HintPreviewPayload | null = null;
  private events: { type: string; data: Record<string, unknown> }[] = [];
  private guestCount = 0;
  private joinReservedUntil = 0;

  get hasGuests() { return this.guestCount > 0; }
  get shiftsAllowed() { return !this.hasGuests && Date.now() >= this.joinReservedUntil; }

  get needsSync() { return this.revision !== this.syncedRevision; }

  retryDiagnostic(error: unknown) {
    const rawCode = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    const code = typeof rawCode === 'number' && Number.isSafeInteger(rawCode) ? rawCode : undefined;
    return {
      reason: code === 1 ? 'timeout' : 'operation-failed',
      ...(code === undefined ? {} : { code }),
      connectionState: this.online.client?.state ?? 'uninitialized',
      roomState: this.online.gameChannel?.state ?? 'uninitialized',
      lobbyState: this.online.lobbyChannel?.state ?? 'uninitialized',
    };
  }

  get connected() {
    return this.online.client?.state === 'connected' && this.online.gameChannel?.state === 'subscribed'
      && this.online.lobbyChannel?.state === 'subscribed';
  }

  constructor(wsUrl: string) {
    this.online = new OnlineGameClient({ wsConfig: { wsUrl } });
    // Browser session storage is shared across clients in one Node process.
    // Each bot is a separate player, not three tabs with the same sender ID.
    this.online.clientId = randomUUID();
    this.online.playerName = generateRandomPlayerName();
  }

  private publish(channel: { publish(data: unknown): Promise<unknown> }, payload: { type: string; data: Record<string, unknown> }) {
    return channel.publish({ ...payload, data: this.online.buildOutgoingEnvelope(payload.data) });
  }

  async open(session: GameSession) {
    this.hostCursorIndex = session.preview()?.index ?? null;
    this.hostActiveDigit = null;
    this.hostHintPreview = null;
    if (!this.online.client) this.online.ensureClient().on('error', () => {});
    const updateGuests = () => {
      const count = (this.online.getGameMembers() || []).filter(member => member.role === 'guest').length;
      if (count === this.guestCount) return;
      this.guestCount = count;
      this.online.gameMode = count ? 'online' : 'solo';
      this.online.updateGameJoinPolicy('auto');
      this.revision++;
    };
    const room = this.online.joinGameChannel(session.id, { role: 'host', gameMode: 'solo', joinPolicy: 'auto',
      onPresenceChange: updateGuests, onMemberJoin: updateGuests, onMemberLeave: updateGuests,
      onEvent: (type, data) => {
        if ((type === 'join-request' || type === 'cell-update') && this.events.length < 256) this.events.push({ type, data });
      },
    });
    room.on('subscribed', () => { this.revision++; });
    room.on('join', () => { this.revision++; });
    const lobby = this.online.joinLobby({ gameId: session.id, status: session.solved ? 'solved' : 'in_progress',
      gameMode: 'solo', difficulty: session.difficulty, variant: session.variant,
      totalCells: session.snapshot().board.length, filledCount: session.filledCount, joinPolicy: 'auto' });
    lobby.on('subscribed', () => { this.revision++; });
    await this.sync(session);
  }

  private metadata(session: GameSession, status = session.solved ? 'solved' : 'in_progress') {
    return { id: this.online.clientId, serverClientId: this.online.serverClientId,
      game_id: session.id, status, game_mode: this.hasGuests ? 'online' : 'solo', difficulty: session.difficulty,
      variant: session.variant, total_cells: session.snapshot().board.length,
      ...buildProtocolMetadata(), host_name: this.online.playerName, elapsed_seconds: session.snapshot().elapsedSeconds,
      filled_count: session.filledCount, has_guest: this.hasGuests, join_policy: 'auto', updated_at: Date.now() };
  }

  async receive(session: GameSession): Promise<Set<number>> {
    const changed = new Set<number>();
    // Drain only the current bounded batch; WebSocket callbacks never mutate RAM
    // while an awaited bot publication is still in flight.
    const batch = this.events.slice();
    for (const event of batch) {
      const data = event.data;
      if (event.type === 'join-request' && typeof data.requestId === 'string' && data.requestId.length > 0 && data.requestId.length <= 128
        && typeof data.requesterId === 'string' && data.requesterId.length > 0 && data.requesterId.length <= 128
        && data.requesterId !== this.online.clientId) {
        const room = this.online.gameChannel;
        if (!room) throw new Error('Room not initialized');
        const accepted = !session.solved;
        if (accepted) this.joinReservedUntil = Date.now() + 15_000;
        await room.ready(5_000);
        await this.publish(room, { type: 'join-response', data: {
          requestId: data.requestId, requesterId: data.requesterId, accepted,
          ...(accepted ? {} : { reason: 'solved' }), eventId: randomUUID(),
        } });
        this.revision++;
      }
    }
    // Apply patches only after every awaited response has succeeded. A failed
    // response must not drop earlier edits or hide them from pending-move logic.
    for (const { type, data } of batch) {
      if (type === 'cell-update' && (this.hasGuests || Date.now() < this.joinReservedUntil)
        && session.applyGuestPatch(data)) {
        changed.add(Number(data.index));
        this.revision++;
      }
    }
    this.events.splice(0, batch.length);
    return changed;
  }

  async sync(session: GameSession, eventId: string = randomUUID(), gameState = session.snapshot()) {
    const room = this.online.gameChannel;
    const lobby = this.online.lobbyChannel;
    if (!room || !lobby) throw new Error('Subscriptions not initialized');
    await Promise.all([room.ready(5_000), lobby.ready(5_000)]);
    const revision = this.revision;
    await this.publish(room, { type: 'sync', data: { gameState, eventId,
      rematchRequestedBy: null, hints: [], hostCursorIndex: this.hostCursorIndex,
      hostActiveDigit: this.hostActiveDigit, hintPreview: this.hostHintPreview } });
    const data = this.metadata(session);
    this.online.hostedLobbyMeta = data;
    await this.publish(lobby, { type: 'lobby-update', data });
    this.syncedRevision = revision;
  }

  async move(move: NonNullable<ReturnType<GameSession['advance']>>) {
    const room = this.online.gameChannel;
    if (!room) throw new Error('Room not initialized');
    await room.ready(5_000);
    this.online.rememberEvent(move.eventId);
    await this.publish(room, { type: 'cell-update', data: move });
  }

  async fillCandidates(updates: ReturnType<GameSession['fillCandidates']>) {
    if (!updates.length) return;
    const room = this.online.gameChannel;
    if (!room) throw new Error('Room not initialized');
    await room.ready(5_000);
    for (const update of updates) {
      this.online.rememberEvent(update.eventId);
      await this.publish(room, { type: 'cell-update', data: { ...update, value: undefined } });
    }
    this.revision++;
  }

  async cursor(index: number | null, digit: number | null = null) {
    const room = this.online.gameChannel;
    if (!room) throw new Error('Room not initialized');
    this.hostCursorIndex = index;
    this.hostActiveDigit = digit;
    await room.ready(5_000);
    const sender = { senderId: this.online.clientId, role: 'host' };
    await this.publish(room, { type: 'cursor', data: { ...sender, index, eventId: randomUUID() } });
    await this.publish(room, { type: 'active-digit', data: { ...sender, digit, eventId: randomUUID() } });
  }

  async hintHighlight(hint: LogicalHint, mode: 'preview' | 'solve') {
    const room = this.online.gameChannel;
    if (!room) throw new Error('Room not initialized');
    this.hostHintPreview = mode === 'preview' ? buildHintPreviewPayload(hint) : null;
    await room.ready(5_000);
    await this.publish(room, {
      type: 'hint-highlight',
      data: {
        senderId: this.online.clientId,
        role: 'host',
        mode,
        index: hint.index,
        digit: hint.digit ?? null,
        technique: hint.technique ?? null,
        unitType: hint.unitType ?? null,
        unitIndex: hint.unitIndex ?? null,
        contextEntries: Array.from(hint.contextDelays.entries()),
        eventId: randomUUID(),
      },
    });
  }

  async clearHintHighlight() {
    if (!this.hostHintPreview) return;
    const room = this.online.gameChannel;
    if (!room) throw new Error('Room not initialized');
    this.hostHintPreview = null;
    await room.ready(5_000);
    await this.publish(room, {
      type: 'hint-highlight',
      data: { senderId: this.online.clientId, role: 'host', mode: 'clear', eventId: randomUUID() },
    });
  }

  async finish(session: GameSession) {
    const lobby = this.online.lobbyChannel;
    if (!lobby) return;
    await lobby.ready(5_000);
    const data = this.metadata(session, 'finished');
    this.online.hostedLobbyMeta = data;
    await this.publish(lobby, { type: 'lobby-update', data });
  }

  close() {
    this.hostCursorIndex = null;
    this.hostActiveDigit = null;
    this.hostHintPreview = null;
    this.events = [];
    this.guestCount = 0;
    this.joinReservedUntil = 0;
    this.online.disconnect();
  }
}
