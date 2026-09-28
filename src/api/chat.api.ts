import http from './http-client';
import type { ToolDisplay } from '../../shared/types/tool-display.types';
import type { ChatErrorInfo } from '../../shared/types/chat-error.types';

export interface SessionMeta {
  sessionId: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

export interface ChatStreamCallbacks {
  onContent: (text: string) => void;
  onThinking?: (text: string) => void;
  /** info: structured description from the server (absent for transport errors) */
  onError?: (error: string, info?: ChatErrorInfo) => void;
  onDone?: (sessionId: string) => void;
}

export interface ChatStreamOptions {
  message: string;
  sessionId?: string;
  context?: string;
  enableThinking?: boolean;
  enabledTools?: string[];
  clientTime?: string;
  timezone?: string;
  profileId?: string;
  imagesBase64?: string[];
}

/**
 * Send a chat message and receive SSE streaming response.
 * Distinguishes thinking vs content chunks.
 */
export async function apiChatStream(
  opts: ChatStreamOptions,
  callbacks: ChatStreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/v1/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    signal,
    body: JSON.stringify({
      ...opts,
      clientTime: opts.clientTime || new Date().toISOString(),
      timezone: opts.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  }).catch(() => null);
  if (!res) { callbacks.onDone?.(''); return; }

  let sid = res.headers.get('X-Session-Id') || opts.sessionId || '';

  if (!res.ok) {
    const err = await res.text().catch(() => '请求失败');
    callbacks.onError?.(err);
    callbacks.onDone?.(sid);
    return;
  }

  if (!res.body) {
    callbacks.onError?.('无响应内容');
    callbacks.onDone?.(sid);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') {
          callbacks.onDone?.(sid);
          return;
        }
        try {
          const json = JSON.parse(payload);
          if (json.sessionId) sid = json.sessionId;
          if (json.content) callbacks.onContent(json.content);
          if (json.thinking) callbacks.onThinking?.(json.thinking);
          if (json.error) callbacks.onError?.(json.error, json.errorInfo);
        } catch {
          // skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  callbacks.onDone?.(sid);
}

/**
 * Get list of chat sessions with metadata.
 */
export async function apiGetSessions(): Promise<SessionMeta[]> {
  const res = await http.get('/chat/sessions');
  return res.data.data;
}

export interface ChatSessionMessage {
  role: string;
  content: string;
  thinking?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolRaw?: string;
  userTriggered?: boolean;
  recomputed?: boolean;
  /** Structured payload for rich tool views (charts, spreads, maps) */
  toolDisplay?: ToolDisplay;
  /** Set on a failed assistant turn */
  error?: ChatErrorInfo;
  images?: string[];
}

/**
 * Load a specific chat session.
 */
export async function apiGetSession(sessionId: string): Promise<{
  sessionId: string;
  title: string;
  messages: ChatSessionMessage[];
  tokenEstimate?: number;
}> {
  const res = await http.get(`/chat/sessions/${sessionId}`);
  return res.data.data;
}

/**
 * Delete a chat session.
 */
export async function apiDeleteSession(sessionId: string): Promise<void> {
  await http.delete(`/chat/sessions/${sessionId}`);
}

/**
 * Rename a chat session.
 */
export async function apiRenameSession(sessionId: string, title: string): Promise<void> {
  await http.patch(`/chat/sessions/${sessionId}`, { title });
}

/**
 * Get a data source for AI context injection.
 */
export async function apiGetDataSource(
  sourceId: string,
  params?: Record<string, string>,
): Promise<{ name: string; data: unknown }> {
  const res = await http.get(`/chat/data-sources/${sourceId}`, { params });
  return res.data.data;
}

/**
 * Callbacks for FC streaming.
 */
export interface FcStreamCallbacks {
  onToolCall?: (tc: { name: string; args: Record<string, unknown>; result: string; display?: ToolDisplay }) => void;
  onContent?: (text: string) => void;
  onThinking?: (text: string) => void;
  /** info: structured description from the server (absent for transport errors) */
  onError?: (error: string, info?: ChatErrorInfo) => void;
  onDone?: (sessionId: string) => void;
}

/**
 * Function-calling chat with SSE streaming.
 * Tool call events are emitted as they happen, then content streams in.
 */
export async function apiChatFcStream(
  opts: {
    message: string; sessionId?: string; enableThinking?: boolean; profileId?: string; imagesBase64?: string[];
    clientTime?: string; timezone?: string;
    /** Quick tools: run these on the server before the model answers */
    presetTools?: { name: string; args: Record<string, unknown> }[];
  },
  callbacks: FcStreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/v1/chat/fc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    signal,
    body: JSON.stringify({
      ...opts,
      clientTime: opts.clientTime || new Date().toISOString(),
      timezone: opts.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  }).catch(() => null);
  if (!res) { callbacks.onDone?.(''); return; }

  let sid = res.headers.get('X-Session-Id') || opts.sessionId || '';

  if (!res.ok) {
    const err = await res.text().catch(() => '请求失败');
    callbacks.onError?.(err);
    callbacks.onDone?.(sid);
    return;
  }

  if (!res.body) {
    callbacks.onError?.('无响应内容');
    callbacks.onDone?.(sid);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') {
          callbacks.onDone?.(sid);
          return;
        }
        try {
          const json = JSON.parse(payload);
          if (json.sessionId) sid = json.sessionId;
          if (json.toolCall) callbacks.onToolCall?.(json.toolCall);
          if (json.content) callbacks.onContent?.(json.content);
          if (json.thinking) callbacks.onThinking?.(json.thinking);
          if (json.error) callbacks.onError?.(json.error, json.errorInfo);
        } catch {
          // skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  callbacks.onDone?.(sid);
}
