/**
 * WebSocket transport for chat runs: `/api/v1/chat/ws`.
 *
 * Clients start runs and (re)subscribe to them by id; a run keeps generating on the server
 * regardless of the socket, so navigating away or reconnecting never loses a reply.
 * Protocol types: shared/types/chat-run.types.ts.
 */
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyAccessToken } from '../middleware/auth';
import { listRuns, subscribeRun, stopRun, onUserRuns } from '../services/chat-runs.service';
import { startChatTurn, ChatTurnError } from '../routes/chat.routes';
import type { ChatWsClientMessage, ChatWsServerMessage } from '../../shared/types/chat-run.types';

const WS_PATH = '/api/v1/chat/ws';
const HEARTBEAT_MS = 25_000;
/** Per-connection cap on inbound messages (starts are also limited per account in startChatTurn) */
const MAX_MSGS_PER_MIN = 120;
const IS_PROD = process.env.NODE_ENV === 'production';
const MAX_CONNECTIONS_PER_USER = 10;
/** userId → open sockets */
const connections = new Map<string, number>();

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/**
 * Browsers attach cookies to cross-site WebSocket handshakes, so check Origin explicitly
 * (cross-site WebSocket hijacking). Allowed: CORS_ORIGIN entries, the request's own host,
 * and any localhost origin outside production (Vite dev proxy).
 */
function originAllowed(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return !IS_PROD;
  let host: string;
  try { host = new URL(origin).host; } catch { return false; }
  const allowed = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (allowed.some((a) => a === origin || a.replace(/^https?:\/\//, '') === host)) return true;
  if (req.headers.host && host === req.headers.host) return true;
  const fwd = req.headers['x-forwarded-host'];
  if (typeof fwd === 'string' && fwd.split(',')[0].trim() === host) return true;
  return !IS_PROD && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
}

function reject(socket: Duplex, status: number, text: string) {
  socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

export function attachChatWs(server: Server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 72 * 1024 * 1024 });

  server.on('upgrade', (req, socket, head) => {
    if (!req.url?.startsWith(WS_PATH)) return; // other upgrade handlers (e.g. Vite HMR) may exist
    if (!originAllowed(req)) return reject(socket, 403, 'Forbidden');
    void verifyAccessToken(parseCookies(req.headers.cookie).accessToken).then((user) => {
      if (!user) return reject(socket, 401, 'Unauthorized');
      if ((connections.get(user.userId) || 0) >= MAX_CONNECTIONS_PER_USER) return reject(socket, 429, 'Too Many Requests');
      wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, user.userId));
    });
  });

  // Heartbeat: drop sockets that stopped answering pings
  const alive = new WeakMap<WebSocket, boolean>();
  wss.on('connection', (ws) => {
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));
  });
  const timer = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.get(ws)) { ws.terminate(); continue; }
      alive.set(ws, false);
      ws.ping();
    }
  }, HEARTBEAT_MS);
  timer.unref?.();
  wss.on('close', () => clearInterval(timer));
}

function onConnection(ws: WebSocket, userId: string) {
  connections.set(userId, (connections.get(userId) || 0) + 1);
  const send = (msg: ChatWsServerMessage) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };
  const subs = new Map<string, () => void>();
  const recent: number[] = [];

  const subscribe = (runId: string, afterSeq = 0) => {
    subs.get(runId)?.();
    const sub = subscribeRun(userId, runId, afterSeq, (event) => {
      send({ type: 'event', runId, sessionId: sub!.run.sessionId, event });
      if (event.data.runEnd) { subs.get(runId)?.(); subs.delete(runId); }
    });
    if (!sub) { send({ type: 'error', error: '生成任务不存在或已过期', runId }); return; }
    send({ type: 'replay', run: sub.run, events: sub.replay });
    if (sub.run.status === 'running') subs.set(runId, sub.unsubscribe);
    else sub.unsubscribe();
  };

  const offRuns = onUserRuns(userId, (run, change) => send({ type: 'runs', change, run }));
  send({ type: 'hello', runs: listRuns(userId) });

  ws.on('message', async (raw) => {
    const now = Date.now();
    while (recent.length && now - recent[0] > 60_000) recent.shift();
    if (recent.length >= MAX_MSGS_PER_MIN) return send({ type: 'error', error: '请求过于频繁，请稍后再试' });
    recent.push(now);
    let msg: ChatWsClientMessage;
    try { msg = JSON.parse(String(raw)); } catch { return send({ type: 'error', error: '消息格式错误' }); }
    switch (msg.type) {
      case 'ping':
        return send({ type: 'pong' });
      case 'subscribe':
        if (subs.size >= 20 && !subs.has(String(msg.runId))) return send({ type: 'error', error: '订阅过多' });
        return subscribe(String(msg.runId), Number(msg.afterSeq) || 0);
      case 'stop':
        stopRun(userId, String(msg.runId));
        return;
      case 'start': {
        try {
          const run = await startChatTurn(userId, msg.body);
          send({ type: 'started', reqId: msg.reqId, run });
          subscribe(run.runId, 0);
        } catch (err: any) {
          send({
            type: 'rejected', reqId: msg.reqId,
            error: err?.message || '发送失败',
            runId: err instanceof ChatTurnError ? err.runId : undefined,
          });
        }
        return;
      }
      default:
        send({ type: 'error', error: '未知的消息类型' });
    }
  });

  ws.on('close', () => {
    for (const off of subs.values()) off();
    subs.clear();
    offRuns();
    const n = (connections.get(userId) || 1) - 1;
    if (n > 0) connections.set(userId, n); else connections.delete(userId);
  });
}
