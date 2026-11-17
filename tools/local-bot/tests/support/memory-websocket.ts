// In-memory replacement for the external WebSocket boundary, not for worker code.
// This deliberately does NOT stand in for a real Centrifugo integration test.
type Handler = ((event: { data: string; code?: number; reason?: string }) => void) | null;
export function memoryWebSocket() {
  const sockets = new Set<Socket>();
  const publications: { channel: string; data: { type: string; data: Record<string, unknown> } }[] = [];
  const attempts: typeof publications = [];
  const history = new Map<string, object[]>();
  let counter = 0;
  let failure: { type?: string; channel?: string } | null = null;
  class Socket {
    readonly id = `connection-${++counter}`;
    readonly channels = new Set<string>();
    readyState = 0;
    onopen: (() => void) | null = null;
    onmessage: Handler = null;
    onerror: Handler = null;
    onclose: Handler = null;
    constructor(_url: string) {
      sockets.add(this);
      queueMicrotask(() => { this.readyState = 1; this.onopen?.(); });
    }
    receive(value: object) { this.onmessage?.({ data: JSON.stringify(value) }); }
    send(raw: string) {
      for (const line of raw.split('\n').filter(Boolean)) {
        const command = JSON.parse(line);
        queueMicrotask(() => {
          if (this.readyState !== 1) return;
          const id = command.id;
          if (command.connect) this.receive({ id, connect: { client: this.id, version: 'test', expires: false } });
          else if (command.subscribe) {
            const channel = command.subscribe.channel;
            this.channels.add(channel);
            this.receive({ id, subscribe: { recoverable: true, positioned: true, epoch: 'test', offset: 0 } });
            for (const socket of sockets) if (socket.channels.has(channel)) {
              socket.receive({ push: { channel, join: { info: { client: this.id, user: '' } } } });
            }
          } else if (command.presence) {
            const presence = Object.fromEntries([...sockets].filter(s => s.channels.has(command.presence.channel))
              .map(s => [s.id, { client: s.id, user: '' }]));
            this.receive({ id, presence: { presence } });
          } else if (command.history) {
            this.receive({ id, history: { publications: history.get(command.history.channel) || [], epoch: 'test', offset: 0 } });
          } else if (command.publish) {
            const { channel, data } = command.publish;
            attempts.push({ channel, data });
            if (failure && (!failure.type || data.type === failure.type) && (!failure.channel || channel === failure.channel)) {
              this.receive({ id, error: { code: 100, message: 'injected outage' } }); return;
            }
            publications.push({ channel, data });
            const entry = { data, info: { client: this.id, user: '' }, offset: publications.length };
            history.set(channel, [...(history.get(channel) || []), entry].slice(-25));
            for (const socket of sockets) if (socket.channels.has(channel)) socket.receive({ push: { channel, pub: entry } });
            this.receive({ id, publish: {} });
          } else if (command.unsubscribe) {
            this.channels.delete(command.unsubscribe.channel);
            this.receive({ id, unsubscribe: {} });
          } else this.receive({ id });
        });
      }
    }
    close() {
      if (this.readyState === 3) return;
      this.readyState = 3;
      sockets.delete(this);
      for (const channel of this.channels) {
        for (const socket of sockets) if (socket.channels.has(channel)) {
          socket.receive({ push: { channel, leave: { info: { client: this.id, user: '' } } } });
        }
      }
      this.channels.clear();
      this.onclose?.({ data: '', code: 1000, reason: '' });
    }
  }
  return { Socket, publications, attempts, sockets, fail: (value: boolean, type?: string, channel?: string) => {
    failure = value ? { type, channel } : null;
  } };
}
