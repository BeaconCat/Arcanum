/** Server-side chat generation runs and the WebSocket protocol used to follow them. */

export type ChatRunStatus = 'running' | 'done' | 'error' | 'stopped';

export interface ChatRunInfo {
  runId: string;
  sessionId: string;
  status: ChatRunStatus;
  startedAt: string;
  finishedAt?: string;
  /** The user message that started the run (so a reconnecting client can show it) */
  userMessage: { content: string; images?: string[] };
  /** Sequence number of the last emitted event */
  lastSeq: number;
}

/**
 * One buffered event. `data` has the same shape as the SSE payloads:
 * { sessionId } | { toolCall } | { content } | { thinking } | { error, errorInfo } | { runEnd, status }
 */
export interface ChatRunEvent {
  seq: number;
  data: Record<string, unknown>;
}

export interface ChatStartRequest {
  mode: 'fc' | 'plain';
  message: string;
  sessionId?: string;
  enableThinking?: boolean;
  profileId?: string;
  imagesBase64?: string[];
  presetTools?: { name: string; args: Record<string, unknown> }[];
  clientTime?: string;
  timezone?: string;
}

// ── WebSocket messages ──

export type ChatWsClientMessage =
  | { type: 'start'; reqId: string; body: ChatStartRequest }
  | { type: 'subscribe'; runId: string; afterSeq?: number }
  | { type: 'stop'; runId: string }
  | { type: 'ping' };

export type ChatWsServerMessage =
  | { type: 'hello'; runs: ChatRunInfo[] }
  | { type: 'started'; reqId: string; run: ChatRunInfo }
  | { type: 'rejected'; reqId: string; error: string; runId?: string }
  | { type: 'replay'; run: ChatRunInfo; events: ChatRunEvent[] }
  | { type: 'event'; runId: string; sessionId: string; event: ChatRunEvent }
  | { type: 'runs'; change: 'started' | 'finished'; run: ChatRunInfo }
  | { type: 'pong' }
  /** runId is set when the error concerns a specific run (e.g. it expired) */
  | { type: 'error'; error: string; runId?: string };
