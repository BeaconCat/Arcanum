/**
 * Turn LLM provider failures into something readable. Providers return OpenAI-style
 * `{ error: { message, code, type } }` bodies (or plain text); we classify by HTTP status
 * plus keywords and never show the raw JSON as the assistant's reply.
 */
import type { ChatErrorInfo, ChatErrorKind } from '../../shared/types/chat-error.types';

export class LlmApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`LLM API error ${status}: ${body.slice(0, 500)}`);
    this.name = 'LlmApiError';
  }
}

function parseBody(body: string): { message?: string; code?: string; type?: string } {
  try {
    const j = JSON.parse(body);
    const e = j?.error ?? j;
    if (typeof e === 'string') return { message: e };
    return {
      message: typeof e?.message === 'string' ? e.message : undefined,
      code: e?.code !== undefined ? String(e.code) : undefined,
      type: typeof e?.type === 'string' ? e.type : undefined,
    };
  } catch {
    return { message: body.trim().slice(0, 300) || undefined };
  }
}

const TEXT: Record<ChatErrorKind, Pick<ChatErrorInfo, 'title' | 'message' | 'hint' | 'retryable' | 'adminAction'>> = {
  balance: {
    title: '模型服务余额不足',
    message: '天枢使用的大模型账户余额或额度已用完，这次回复没能生成。',
    hint: '充值后即可恢复使用；也可以在管理后台切换到其他模型服务。',
    retryable: false,
    adminAction: true,
  },
  auth: {
    title: '模型服务认证失败',
    message: '大模型服务拒绝了请求，通常是 API Key 无效、过期或没有该模型的权限。',
    hint: '请在管理后台检查 LLM 配置中的 API Key 与模型名称。',
    retryable: false,
    adminAction: true,
  },
  rate: {
    title: '请求太频繁了',
    message: '大模型服务暂时限制了请求频率。',
    hint: '稍等片刻再试一次。',
    retryable: true,
  },
  context: {
    title: '对话内容过长',
    message: '这段对话加上命盘资料超出了模型一次能处理的长度。',
    hint: '开一个新对话再问，或者把问题问得更聚焦一些。',
    retryable: false,
  },
  server: {
    title: '模型服务暂时不可用',
    message: '大模型服务那边出了点问题，这次没能完成回复。',
    hint: '通常过一会儿就会恢复，可以稍后重试。',
    retryable: true,
  },
  network: {
    title: '连不上模型服务',
    message: '服务器没能连接到大模型接口，可能是网络波动或服务地址不可达。',
    hint: '稍后重试；如果一直如此，请检查管理后台中的 API 地址。',
    retryable: true,
    adminAction: true,
  },
  config: {
    title: '模型配置有误',
    message: '大模型服务不认可当前的请求参数，可能是模型名称或接口地址填写有误。',
    hint: '请在管理后台检查 LLM 配置并使用「测试连接」确认。',
    retryable: false,
    adminAction: true,
  },
  unknown: {
    title: '回复生成失败',
    message: '生成回复时出现了意外错误。',
    hint: '可以重试一次；若反复出现，请把下方详情提供给管理员。',
    retryable: true,
  },
};

function classify(status: number | undefined, text: string): ChatErrorKind {
  const t = text.toLowerCase();
  if (status === 402 || /insufficient|balance|quota|credit|余额|欠费|billing/.test(t)) return 'balance';
  if (status === 401 || status === 403 || /api[ _-]?key|unauthori[sz]ed|forbidden|permission|invalid_api_key/.test(t)) return 'auth';
  if (status === 429 || /rate[ _-]?limit|too many requests/.test(t)) return 'rate';
  if (/context[ _-]?length|maximum context|too many tokens|context window|max_tokens/.test(t)) return 'context';
  if (status && status >= 500) return 'server';
  if (status === 404 || (status === 400 && /model/.test(t))) return 'config';
  if (!status && /fetch failed|econnrefused|enotfound|etimedout|econnreset|network|socket|timeout/.test(t)) return 'network';
  return 'unknown';
}

export function describeLlmError(err: unknown): ChatErrorInfo {
  if (err instanceof LlmApiError) {
    const b = parseBody(err.body);
    const kind = classify(err.status, `${b.message ?? ''} ${b.code ?? ''} ${b.type ?? ''}`);
    return { kind, ...TEXT[kind], status: err.status, code: b.code || b.type, detail: b.message };
  }
  const msg = String((err as any)?.cause?.code || (err as any)?.message || err || '');
  // Bare "LLM API error 402: {...}" strings (e.g. from older code paths)
  const m = /^LLM API error (\d{3}):\s*([\s\S]*)$/.exec(msg);
  if (m) return describeLlmError(new LlmApiError(Number(m[1]), m[2]));
  const kind = classify(undefined, msg);
  return { kind, ...TEXT[kind], detail: msg.slice(0, 300) || undefined };
}
