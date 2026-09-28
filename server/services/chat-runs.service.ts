/**
 * Chat generation runs, decoupled from the HTTP/WebSocket connection that started them.
 *
 * A run keeps generating (and persists its result) even if the client navigates away or
 * disconnects. Every event it emits is buffered with a sequence number, so a client that
 * (re)subscribes gets the full replay followed by live events. One active run per session;
 * different sessions run concurrently.
 */
import { randomUUID } from 'node:crypto';
import type { ChatRunEvent, ChatRunInfo } from '../../shared/types/chat-run.types';

export interface RunContext {
  runId: string;
  signal: AbortSignal;
  emit: (event: Record<string, unknown>) => void;
}

interface Run extends ChatRunInfo {
  userId: string;
  events: ChatRunEvent[];
  listeners: Set<(e: ChatRunEvent) => void>;
  abort: AbortController;
}

type RunListener = (runInfo: ChatRunInfo, change: 'started' | 'finished') => void;

const runs = new Map<string, Run>();
/** userId:sessionId → runId of the active run */
const activeBySession = new Map<string, string>();
/** Per-user listeners for run start/finish (sidebar indicators) */
const userListeners = new Map<string, Set<RunListener>>();

const KEEP_FINISHED_MS = 5 * 60 * 1000;
const key = (userId: string, sessionId: string) => `${userId}:${sessionId}`;

function info(r: Run): ChatRunInfo {
  const { runId, sessionId, status, startedAt, finishedAt, userMessage, lastSeq } = r;
  return { runId, sessionId, status, startedAt, finishedAt, userMessage, lastSeq };
}

function notifyUser(userId: string, r: Run, change: 'started' | 'finished') {
  for (const fn of userListeners.get(userId) || []) {
    try { fn(info(r), change); } catch { /* listener errors must not break the run */ }
  }
}

export class RunConflictError extends Error {
  constructor(public runId: string) {
    super('这个对话正在生成回复，请等它完成或先停止');
  }
}

export function activeRunFor(userId: string, sessionId: string): ChatRunInfo | null {
  const id = activeBySession.get(key(userId, sessionId));
  const r = id ? runs.get(id) : undefined;
  return r ? info(r) : null;
}

/** Runs of this user that are still generating, plus recently finished ones. */
export function listRuns(userId: string): ChatRunInfo[] {
  return [...runs.values()].filter((r) => r.userId === userId).map(info);
}

/**
 * Start a run. `execute` performs the generation (it must honour ctx.signal and persist its
 * own results); its thrown errors are turned into an `error` event by the caller-provided code.
 */
export function startRun(
  userId: string,
  sessionId: string,
  userMessage: ChatRunInfo['userMessage'],
  execute: (ctx: RunContext) => Promise<void>,
): ChatRunInfo {
  const k = key(userId, sessionId);
  const existing = activeBySession.get(k);
  if (existing && runs.get(existing)?.status === 'running') throw new RunConflictError(existing);

  const r: Run = {
    runId: randomUUID(),
    userId,
    sessionId,
    status: 'running',
    startedAt: new Date().toISOString(),
    userMessage,
    lastSeq: 0,
    events: [],
    listeners: new Set(),
    abort: new AbortController(),
  };
  runs.set(r.runId, r);
  activeBySession.set(k, r.runId);

  const emit = (data: Record<string, unknown>) => {
    const ev: ChatRunEvent = { seq: ++r.lastSeq, data };
    r.events.push(ev);
    for (const fn of r.listeners) {
      try { fn(ev); } catch { /* a broken subscriber shouldn't stop generation */ }
    }
  };

  notifyUser(userId, r, 'started');
  void (async () => {
    try {
      await execute({ runId: r.runId, signal: r.abort.signal, emit });
      r.status = r.abort.signal.aborted ? 'stopped' : 'done';
    } catch (err) {
      r.status = r.abort.signal.aborted ? 'stopped' : 'error';
      if (r.status === 'error') console.warn('[chat-run] run failed:', (err as Error)?.message || err);
    } finally {
      r.finishedAt = new Date().toISOString();
      emit({ runEnd: true, status: r.status });
      if (activeBySession.get(k) === r.runId) activeBySession.delete(k);
      notifyUser(userId, r, 'finished');
      r.listeners.clear();
      setTimeout(() => runs.delete(r.runId), KEEP_FINISHED_MS).unref?.();
    }
  })();
  return info(r);
}

/**
 * Subscribe to a run: returns the events after `afterSeq` (replay) and keeps delivering new
 * ones until the run ends or `unsubscribe` is called.
 */
export function subscribeRun(
  userId: string,
  runId: string,
  afterSeq: number,
  fn: (e: ChatRunEvent) => void,
): { run: ChatRunInfo; replay: ChatRunEvent[]; unsubscribe: () => void } | null {
  const r = runs.get(runId);
  if (!r || r.userId !== userId) return null;
  const replay = r.events.filter((e) => e.seq > afterSeq);
  if (r.status === 'running') r.listeners.add(fn);
  return { run: info(r), replay, unsubscribe: () => r.listeners.delete(fn) };
}

export function stopRun(userId: string, runId: string): boolean {
  const r = runs.get(runId);
  if (!r || r.userId !== userId || r.status !== 'running') return false;
  r.abort.abort();
  return true;
}

export function onUserRuns(userId: string, fn: RunListener): () => void {
  let set = userListeners.get(userId);
  if (!set) userListeners.set(userId, (set = new Set()));
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (!set!.size) userListeners.delete(userId);
  };
}
