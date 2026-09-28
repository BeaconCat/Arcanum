/**
 * WebSocket client for chat runs (`/api/v1/chat/ws`).
 *
 * One shared connection per tab. It reconnects on its own (exponential backoff, refreshing the
 * access cookie when the handshake keeps failing) and tells listeners when it is back, so they
 * can resubscribe to runs with `afterSeq` and lose nothing. Protocol: shared/types/chat-run.types.ts.
 */
import http from './http-client';
import type {
  ChatRunInfo, ChatStartRequest, ChatWsClientMessage, ChatWsServerMessage,
} from '../../shared/types/chat-run.types';

type Listener = (msg: ChatWsServerMessage) => void;
export type SocketState = 'idle' | 'connecting' | 'open' | 'reconnecting';

const START_TIMEOUT_MS = 30_000;
const PING_MS = 20_000;
const MAX_BACKOFF_MS = 15_000;

class ChatSocket {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private stateListeners = new Set<(s: SocketState) => void>();
  private queue: ChatWsClientMessage[] = [];
  private pending = new Map<string, { resolve: (r: ChatRunInfo) => void; reject: (e: Error) => void; timer: number }>();
  private attempts = 0;
  private retryTimer: number | undefined;
  private pingTimer: number | undefined;
  private wanted = false;
  state: SocketState = 'idle';

  private setState(s: SocketState) {
    this.state = s;
    for (const fn of this.stateListeners) fn(s);
  }

  /** Open the connection (idempotent). */
  connect() {
    this.wanted = true;
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;
    clearTimeout(this.retryTimer);
    this.setState(this.attempts ? 'reconnecting' : 'connecting');

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/api/v1/chat/ws`);
    this.ws = ws;
    let opened = false;

    ws.onopen = () => {
      opened = true;
      this.attempts = 0;
      this.setState('open');
      const q = this.queue.splice(0);
      for (const m of q) ws.send(JSON.stringify(m));
      clearInterval(this.pingTimer);
      this.pingTimer = window.setInterval(() => this.send({ type: 'ping' }), PING_MS);
    };
    ws.onmessage = (e) => {
      let msg: ChatWsServerMessage;
      try { msg = JSON.parse(String(e.data)); } catch { return; }
      if (msg.type === 'started' || msg.type === 'rejected') {
        const p = this.pending.get(msg.reqId);
        if (p) {
          this.pending.delete(msg.reqId);
          clearTimeout(p.timer);
          if (msg.type === 'started') p.resolve(msg.run);
          else p.reject(Object.assign(new Error(msg.error), { runId: msg.runId }));
        }
      }
      for (const fn of this.listeners) fn(msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      clearInterval(this.pingTimer);
      // A start that was sent but never acknowledged can't be confirmed any more
      for (const [id, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new Error('连接中断，消息可能未发出'));
        this.pending.delete(id);
      }
      if (!this.wanted) { this.setState('idle'); return; }
      this.attempts++;
      this.setState('reconnecting');
      // Handshake refused twice in a row: most likely the access cookie expired
      const refresh = !opened && this.attempts >= 2 ? http.post('/auth/refresh').catch(() => {}) : Promise.resolve();
      const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** Math.min(this.attempts - 1, 5)) * (0.8 + Math.random() * 0.4);
      void refresh.then(() => {
        this.retryTimer = window.setTimeout(() => this.connect(), delay);
      });
    };
  }

  disconnect() {
    this.wanted = false;
    clearTimeout(this.retryTimer);
    clearInterval(this.pingTimer);
    this.ws?.close();
    this.ws = null;
    this.attempts = 0;
    this.queue = [];
    this.setState('idle');
  }

  /** Send now if connected, otherwise once the connection (re)opens. */
  send(msg: ChatWsClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
    else if (msg.type !== 'ping') {
      this.queue.push(msg);
      this.connect();
    }
  }

  /** Start a run; resolves once the server accepted it (the user message is then persisted). */
  start(body: ChatStartRequest): Promise<ChatRunInfo> {
    const reqId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(reqId);
        this.queue = this.queue.filter((m) => !(m.type === 'start' && m.reqId === reqId));
        reject(new Error('连接服务器超时，请检查网络后重试'));
      }, START_TIMEOUT_MS);
      this.pending.set(reqId, { resolve, reject, timer });
      this.send({ type: 'start', reqId, body });
    });
  }

  subscribe(runId: string, afterSeq = 0) { this.send({ type: 'subscribe', runId, afterSeq }); }
  stop(runId: string) { this.send({ type: 'stop', runId }); }

  on(fn: Listener) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
  onState(fn: (s: SocketState) => void) {
    this.stateListeners.add(fn);
    return () => { this.stateListeners.delete(fn); };
  }
}

export const chatSocket = new ChatSocket();
