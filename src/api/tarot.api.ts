import httpClient from './http-client';
import type { ApiResponse } from '../../shared/types/api.types';
import type {
  TarotCard, TarotSpread, TarotReading, TarotReadingPage, TarotDrawOptions,
} from '../../shared/types/tarot.types';

export async function apiGetTarotCards(): Promise<TarotCard[]> {
  const { data } = await httpClient.get<ApiResponse<TarotCard[]>>('/tarot/cards');
  return data.data!;
}

export async function apiGetTarotSpreads(): Promise<TarotSpread[]> {
  const { data } = await httpClient.get<ApiResponse<TarotSpread[]>>('/tarot/spreads');
  return data.data!;
}

export async function apiDrawTarot(opts: TarotDrawOptions): Promise<TarotReading> {
  const { data } = await httpClient.post<ApiResponse<TarotReading>>('/tarot/readings', opts);
  return data.data!;
}

export async function apiListTarotReadings(opts: { offset?: number; limit?: number; favorite?: boolean } = {}): Promise<TarotReadingPage> {
  const { data } = await httpClient.get<ApiResponse<TarotReadingPage>>('/tarot/readings', {
    params: { offset: opts.offset ?? 0, limit: opts.limit ?? 20, favorite: opts.favorite ? 1 : undefined },
  });
  return data.data!;
}

export async function apiGetTarotReading(id: string): Promise<TarotReading> {
  const { data } = await httpClient.get<ApiResponse<TarotReading>>(`/tarot/readings/${id}`);
  return data.data!;
}

export async function apiUpdateTarotReading(id: string, patch: { note?: string; favorite?: boolean }): Promise<TarotReading> {
  const { data } = await httpClient.patch<ApiResponse<TarotReading>>(`/tarot/readings/${id}`, patch);
  return data.data!;
}

export async function apiDeleteTarotReading(id: string): Promise<void> {
  await httpClient.delete(`/tarot/readings/${id}`);
}

export interface TarotInterpretCallbacks {
  onContent: (text: string) => void;
  onError?: (error: string) => void;
  onDone?: () => void;
}

/** Stream the AI interpretation (SSE). The server saves the final text to the reading. */
export async function apiInterpretTarot(id: string, cb: TarotInterpretCallbacks, signal?: AbortSignal): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api/v1/tarot/readings/${id}/interpret`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      signal,
    });
  } catch (err: any) {
    if (err?.name !== 'AbortError') cb.onError?.('网络错误，请稍后再试');
    cb.onDone?.();
    return;
  }
  if (!res.ok || !res.body) {
    const j = await res.json().catch(() => null);
    cb.onError?.(j?.error || '解读请求失败');
    cb.onDone?.();
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
        const t = line.trim();
        if (!t.startsWith('data: ')) continue;
        const payload = t.slice(6);
        if (payload === '[DONE]') { cb.onDone?.(); return; }
        try {
          const j = JSON.parse(payload);
          if (j.content) cb.onContent(j.content);
          if (j.error) cb.onError?.(j.error);
        } catch { /* skip malformed */ }
      }
    }
  } catch (err: any) {
    if (err?.name !== 'AbortError') cb.onError?.('连接中断');
  } finally {
    reader.releaseLock();
  }
  cb.onDone?.();
}
