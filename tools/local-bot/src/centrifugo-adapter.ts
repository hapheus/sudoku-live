import { randomUUID } from 'node:crypto';
import { HINT_USED_EVENT } from '../../../src/domain/game-contributions.js';
import type { LogicalHint } from './types.ts';
import { OnlineGameClient } from '../../../src/services/online-game-client.js';
import { generateRandomPlayerName } from '../../../src/services/player-name.js';
import { buildProtocolMetadata } from '../../../src/services/multiplayer-protocol.js';
import type { BotPlayer, GameSession } from './game-session.ts';
import type { BotJoinPolicy } from './player-profile.ts';

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
  private readonly wsUrl: string;
  private readonly defaultJoinPolicy: BotJoinPolicy;
  private guests: OnlineGameClient[] = [];
  private revision = 0;
  private syncedRevision = -1;
  private hostCursorIndex: number | null = null;
  private hostActiveDigit: number | null = null;
  private hostHintPreview: HintPreviewPayload | null = null;
  private events: { type: string; data: Record<string, unknown> }[] = [];
  private joinPolicy: BotJoinPolicy;
  private guestCount = 0;
  private joinReservedUntil = 0;

  get hasGuests() { return this.guests.length > 0 || this.guestCount > 0; }
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
    return [this.online, ...this.guests].every(client => client.client?.state === 'connected'
      && client.gameChannel?.state === 'subscribed') && this.online.lobbyChannel?.state === 'subscribed';
  }

  get playerName() { return this.online.playerName; }

  constructor(wsUrl: string, joinPolicy: BotJoinPolicy = 'auto', previousName?: string) {
    this.wsUrl = wsUrl;
    this.defaultJoinPolicy = joinPolicy;
    this.joinPolicy = joinPolicy;
    this.online = new OnlineGameClient({ wsConfig: { wsUrl } });
    // Browser session storage is shared across clients in one Node process.
    // Each bot is a separate player, not three tabs with the same sender ID.
    this.online.clientId = randomUUID();
    do { this.online.playerName = generateRandomPlayerName(); } while (this.online.playerName === previousName);
  }

  private publish(channel: { publish(data: unknown): Promise<unknown> }, payload: { type: string; data: Record<string, unknown> },
    client = this.online) {
    return channel.publish({ ...payload, data: client.buildOutgoingEnvelope(payload.data) });
  }

  playerAt(moveIndex: number): BotPlayer {
    const players = [this.online, ...this.guests];
    const client = players[moveIndex % players.length];
    return { senderId: client.clientId, playerName: client.playerName, role: client === this.online ? 'host' : 'guest' };
  }

  private clientFor(senderId?: string) {
    return this.guests.find(client => client.clientId === senderId) || this.online;
  }

  private closeGuests() {
    for (const guest of this.guests) guest.disconnect();
    this.guests = [];
  }

  private async joinGuests(session: GameSession, count: number) {
    try {
      for (let index = 0; index < count; index++) {
        const guest = new OnlineGameClient({ wsConfig: { wsUrl: this.wsUrl }, playerName: generateRandomPlayerName() });
        guest.clientId = randomUUID();
        this.guests.push(guest);
        guest.ensureClient().on('error', () => {});
        const room = guest.joinGameChannel(session.id, { role: 'guest', gameMode: 'online' });
        await room.ready(5_000);
      }
      session.rememberPlayers([this.online, ...this.guests].map((client, index) => ({
        id: client.clientId, name: client.playerName, role: index === 0 ? 'host' : 'guest',
      })));
    } catch (error) {
      this.closeGuests();
      throw error;
    }
  }

  async open(session: GameSession, coopGuests = 0) {
    this.closeGuests();
    this.joinPolicy = coopGuests ? 'auto' : this.defaultJoinPolicy;
    session.setHost(this.online.clientId, this.online.playerName);
    this.hostCursorIndex = session.preview()?.index ?? null;
    this.hostActiveDigit = null;
    this.hostHintPreview = null;
    if (!this.online.client) this.online.ensureClient().on('error', () => {});
    const updateGuests = () => {
      const count = this.joinPolicy === 'auto'
        ? (this.online.getGameMembers() || []).filter(member => member.role === 'guest').length : 0;
      if (count === this.guestCount) return;
      this.guestCount = count;
      this.online.gameMode = count ? 'online' : 'solo';
      this.online.updateGameJoinPolicy(this.joinPolicy);
      this.revision++;
    };
    const room = this.online.joinGameChannel(session.id, { role: 'host', gameMode: coopGuests ? 'online' : 'solo', joinPolicy: this.joinPolicy,
      onPresenceChange: updateGuests, onMemberJoin: updateGuests, onMemberLeave: updateGuests,
      onEvent: (type, data) => {
        if (this.guests.some(guest => guest.clientId === data.senderId)) return;
        if ((type === 'join-request' || type === 'cell-update' || type === HINT_USED_EVENT)
          && this.events.length < 256) this.events.push({ type, data });
      },
    });
    room.on('subscribed', () => { this.revision++; });
    room.on('join', () => { this.revision++; });
    const lobby = this.online.joinLobby({ gameId: session.id, status: session.solved ? 'solved' : 'in_progress',
      gameMode: 'solo', difficulty: session.difficulty, variant: session.variant,
      totalCells: session.snapshot().board.length, filledCount: session.filledCount, joinPolicy: this.joinPolicy });
    lobby.on('subscribed', () => { this.revision++; });
    await this.sync(session);
    if (coopGuests) {
      await this.joinGuests(session, coopGuests);
      await this.sync(session);
    }
  }

  private metadata(session: GameSession, status = session.solved ? 'solved' : 'in_progress') {
    return { id: this.online.clientId, serverClientId: this.online.serverClientId,
      game_id: session.id, status, game_mode: this.hasGuests ? 'online' : 'solo', difficulty: session.difficulty,
      variant: session.variant, total_cells: session.snapshot().board.length,
      ...buildProtocolMetadata(), host_name: this.online.playerName, elapsed_seconds: session.snapshot().elapsedSeconds,
      filled_count: session.filledCount, has_guest: this.hasGuests, join_policy: this.joinPolicy, updated_at: Date.now() };
  }

  async receive(session: GameSession): Promise<Set<number>> {
    const changed = new Set<number>();
    session.rememberPlayers(this.online.getGameMembers() || []);
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
        const accepted = !session.solved && this.joinPolicy === 'auto';
        if (accepted) this.joinReservedUntil = Date.now() + 15_000;
        await room.ready(5_000);
        await this.publish(room, { type: 'join-response', data: {
          requestId: data.requestId, requesterId: data.requesterId, accepted,
          ...(accepted ? {} : { reason: session.solved ? 'solved' : 'disabled' }), eventId: randomUUID(),
        } });
        this.revision++;
      }
    }
    // Apply patches only after every awaited response has succeeded. A failed
    // response must not drop earlier edits or hide them from pending-move logic.
    for (const { type, data } of batch) {
      if (this.joinPolicy !== 'auto' || (!this.hasGuests && Date.now() >= this.joinReservedUntil)) continue;
      if (type === HINT_USED_EVENT) {
        session.recordGuestHint(data);
        this.revision++;
      }
      if (type === 'cell-update' && session.applyGuestPatch(data)) {
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
    const client = this.clientFor(move.authorId);
    const room = client.gameChannel;
    if (!room) throw new Error('Room not initialized');
    await room.ready(5_000);
    client.rememberEvent(move.eventId);
    await this.publish(room, { type: 'cell-update', data: move }, client);
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

  async cursor(index: number | null, digit: number | null = null, senderId?: string) {
    const client = this.clientFor(senderId);
    const room = client.gameChannel;
    if (!room) throw new Error('Room not initialized');
    if (client === this.online) {
      this.hostCursorIndex = index;
      this.hostActiveDigit = digit;
    }
    await room.ready(5_000);
    const sender = { senderId: client.clientId, role: client === this.online ? 'host' : 'guest' };
    await this.publish(room, { type: 'cursor', data: { ...sender, index, eventId: randomUUID() } }, client);
    await this.publish(room, { type: 'active-digit', data: { ...sender, digit, eventId: randomUUID() } }, client);
  }

  async hintHighlight(hint: LogicalHint, mode: 'preview' | 'solve', hintsUsed?: number, senderId?: string) {
    const client = this.clientFor(senderId);
    const room = client.gameChannel;
    if (!room) throw new Error('Room not initialized');
    if (client === this.online) this.hostHintPreview = mode === 'preview' ? buildHintPreviewPayload(hint) : null;
    await room.ready(5_000);
    if (hintsUsed !== undefined) {
      await this.publish(room, {
        type: HINT_USED_EVENT, data: { playerName: client.playerName, hintsUsed },
      }, client);
    }
    await this.publish(room, {
      type: 'hint-highlight',
      data: {
        senderId: client.clientId,
        role: client === this.online ? 'host' : 'guest',
        mode,
        index: hint.index,
        digit: hint.digit ?? null,
        technique: hint.technique ?? null,
        unitType: hint.unitType ?? null,
        unitIndex: hint.unitIndex ?? null,
        contextEntries: Array.from(hint.contextDelays.entries()),
        eventId: randomUUID(),
      },
    }, client);
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
    this.closeGuests();
    this.hostCursorIndex = null;
    this.hostActiveDigit = null;
    this.hostHintPreview = null;
    this.events = [];
    this.guestCount = 0;
    this.joinReservedUntil = 0;
    this.online.disconnect();
  }
}
