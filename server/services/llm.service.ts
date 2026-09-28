import { readYaml, writeYaml } from './storage.service';
import { LlmApiError } from './llm-errors';
import type { SystemSettings, LlmConfig } from '../../shared/types/settings.types';
import { DEFAULT_SETTINGS } from '../../shared/types/settings.types';

const SETTINGS_PATH = 'system/settings.yaml';

// ── Settings persistence ──

let cachedSettings: SystemSettings | null = null;

export async function getSettings(): Promise<SystemSettings> {
  if (cachedSettings) return cachedSettings;
  const stored = await readYaml<SystemSettings>(SETTINGS_PATH);
  if (stored) {
    // Merge with defaults to fill any missing fields from older config
    cachedSettings = {
      ...DEFAULT_SETTINGS,
      ...stored,
      llm: { ...DEFAULT_SETTINGS.llm, ...stored.llm },
      smtp: { ...DEFAULT_SETTINGS.smtp, ...(stored.smtp || {}) },
    };
  } else {
    cachedSettings = { ...DEFAULT_SETTINGS };
  }
  return cachedSettings;
}

export async function updateSettings(patch: Partial<SystemSettings>): Promise<SystemSettings> {
  const current = await getSettings();
  const merged = { ...current, ...patch };
  if (patch.llm) {
    merged.llm = { ...current.llm, ...patch.llm };
  }
  if (patch.smtp) {
    merged.smtp = { ...current.smtp, ...patch.smtp };
  }
  await writeYaml(SETTINGS_PATH, merged);
  cachedSettings = merged;
  return merged;
}

// ── Types ──

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  thinking?: string;
  meta?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  /** Raw engine data behind a user-triggered tool's interpretation (content holds the LLM summary). */
  toolRaw?: string;
  /** Tool run manually from the chat toolbar (vs. called by the model). */
  userTriggered?: boolean;
  /** Result was recomputed from stored args because an old version saved only a stub. */
  recomputed?: boolean;
  /** Structured payload for the chat UI (see shared/types/tool-display.types.ts); never sent to the model */
  toolDisplay?: unknown;
  /** Set on an assistant turn that failed; content holds whatever was generated before the failure */
  error?: import('../../shared/types/chat-error.types').ChatErrorInfo;
  images?: string[];  // base64 data URIs for multimodal (vision)
}

/** Convert a ChatMessage to the OpenAI-compatible message format, handling multimodal */
function toApiMessage(m: ChatMessage, provider?: string): Record<string, unknown> {
  if (m.images?.length && m.role === 'user') {
    // Images first, then text — MiMo and most providers expect this order
    const parts: unknown[] = [];
    for (const img of m.images) {
      const imgPart: Record<string, unknown> = { url: img };
      // Only add 'detail' for OpenAI-compatible providers (MiMo doesn't support it)
      if (provider !== 'mimo') imgPart.detail = 'auto';
      parts.push({ type: 'image_url', image_url: imgPart });
    }
    parts.push({ type: 'text', text: m.content });
    console.log(`[llm] multimodal message: ${m.images.length} image(s), text=${m.content.substring(0, 50)}...`);
    return { role: m.role, content: parts };
  }
  return { role: m.role, content: m.content };
}

export interface LlmResponse {
  content: string;
  thinking?: string;
  finishReason: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

/** Chunk types emitted during streaming */
export interface StreamChunk {
  type: 'thinking' | 'content' | 'error';
  text: string;
}

// ── Token estimation ──

/**
 * Rough token estimate: ~1.5 chars per token for Chinese, ~4 chars for English.
 * This is intentionally conservative (overestimates) to prevent context overflow.
 */
export function estimateTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    if (ch.charCodeAt(0) > 0x2e80) cjk++;
    else other++;
  }
  return Math.ceil(cjk / 1.5 + other / 4);
}

export function estimateMessagesTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content) + 4, 0);
}

// ── Message compression ──

/**
 * Compress old messages by summarizing them into a single system message.
 * Keeps the most recent `keepRecent` messages verbatim.
 * The compression threshold adapts to the configured context window (70% of it).
 */
export async function compressHistory(
  messages: ChatMessage[],
  keepRecent: number = 6,
  profileName?: string,
): Promise<ChatMessage[]> {
  if (messages.length <= keepRecent) return messages;

  const oldMessages = messages.slice(0, messages.length - keepRecent);
  const recentMessages = messages.slice(messages.length - keepRecent);

  const settings = await getSettings();
  const contextWindow = settings.llm.contextWindow || 131072;
  // Start compressing when old messages exceed 70% of context window
  const compressThreshold = Math.floor(contextWindow * 0.7);

  const oldTokens = estimateMessagesTokens(oldMessages);
  if (oldTokens < compressThreshold) return messages;

  const subjectHint = profileName ? `本次对话的分析对象是"${profileName}"。` : '';
  const summaryPrompt: ChatMessage[] = [
    {
      role: 'system',
      content: `${subjectHint}请将以下对话历史压缩为一段简明摘要（200字以内），保留关键信息、用户偏好和重要结论。摘要中凡涉及命盘数据或人名，必须明确注明是哪个人的，不得混淆。只输出摘要，不要其他内容。`,
    },
    {
      role: 'user',
      content: oldMessages.map((m) => `${m.role}: ${m.content}`).join('\n'),
    },
  ];

  try {
    const result = await chatCompletion(summaryPrompt, { maxTokens: 512, temperature: 0.3, enableThinking: false });
    const subjectTag = profileName ? `（分析对象：${profileName}）` : '';
    const compressed: ChatMessage = {
      role: 'system',
      content: `[对话历史摘要${subjectTag}] ${result.content}`,
      meta: 'compressed',
    };
    return [compressed, ...recentMessages];
  } catch {
    // Fallback: just keep recent messages
    return recentMessages;
  }
}

// ── Memory system ──

export interface MemoryEntry {
  key: string;
  content: string;
  createdAt: string;
  source: string;
  scope?: 'global' | 'session';
  sessionId?: string;
}

export interface UserMemory {
  entries: MemoryEntry[];
}

function memoryPath(userId: string): string {
  return `users/${userId}/memory.yaml`;
}

export async function loadMemory(userId: string): Promise<UserMemory> {
  const data = await readYaml<UserMemory>(memoryPath(userId));
  return data ?? { entries: [] };
}

export async function saveMemory(userId: string, memory: UserMemory): Promise<void> {
  // Keep max 50 entries
  if (memory.entries.length > 50) {
    memory.entries = memory.entries.slice(-50);
  }
  await writeYaml(memoryPath(userId), memory);
}

export async function addMemoryEntry(
  userId: string,
  key: string,
  content: string,
  source: string,
  scope: 'global' | 'session' = 'global',
  sessionId?: string,
): Promise<void> {
  const memory = await loadMemory(userId);
  // Update existing or add new (match by key + scope + sessionId)
  const idx = memory.entries.findIndex((e) => e.key === key && (e.scope || 'global') === scope && e.sessionId === sessionId);
  const entry: MemoryEntry = { key, content, createdAt: new Date().toISOString(), source, scope, sessionId };
  if (idx >= 0) {
    memory.entries[idx] = entry;
  } else {
    memory.entries.push(entry);
  }
  await saveMemory(userId, memory);
}

/**
 * Extract key facts from a conversation and store as memories.
 * This runs as a background "subagent" call after each conversation turn.
 */
// Keys that represent stable user/profile identity facts (shared across all sessions)
const GLOBAL_KEY_PATTERNS = [
  /^(user_)?name$/i, /birth/i, /gender/i, /shengxiao/i, /zodiac/i,
  /day_?master/i, /wu_?xing/i, /ming_?gong/i, /shen_?gong/i,
  /^p_[a-z0-9]+_(name|birth|gender)/i,
  /preference/i, /style/i, /location/i, /occupation/i, /age/i,
];

function isGlobalKey(key: string): boolean {
  return GLOBAL_KEY_PATTERNS.some((p) => p.test(key));
}

export async function extractMemories(
  userId: string,
  recentMessages: ChatMessage[],
  profileId?: string,
  sessionId?: string,
): Promise<void> {
  if (recentMessages.length < 2) return;

  const last4 = recentMessages.slice(-4);
  const keyPrefix = profileId ? `p_${profileId.slice(-6)}_` : '';
  const prompt: ChatMessage[] = [
    {
      role: 'system',
      content: `你是一个信息提取助手。从对话中提取值得长期记住的关键信息。
每条记忆一行，格式: KEY: CONTENT
KEY 用简短英文标识（如 birth_date, preference_color, question_style），若内容属于特定人物的命盘数据，KEY须包含人名前缀（如 zhangsan_career_advice）
CONTENT 用中文简述，若涉及具体人物须注明姓名
只提取确定的事实，不要推测。如果没有值得记住的信息，回复"无"。`,
    },
    {
      role: 'user',
      content: last4.map((m) => `${m.role}: ${m.content}`).join('\n'),
    },
  ];

  try {
    const result = await chatCompletion(prompt, { maxTokens: 256, temperature: 0.2, enableThinking: false });
    const text = result.content.trim();
    if (text === '无' || !text) return;

    for (const line of text.split('\n')) {
      const match = line.match(/^([a-z_]+):\s*(.+)$/i);
      if (match) {
        const key = keyPrefix + match[1].toLowerCase();
        const scope = isGlobalKey(key) ? 'global' : 'session';
        await addMemoryEntry(userId, key, match[2].trim(), 'auto', scope, scope === 'session' ? sessionId : undefined);
      }
    }
  } catch {
    // Non-critical, silently fail
  }
}

export function formatMemoryForPrompt(memory: UserMemory, sessionId?: string): string {
  if (memory.entries.length === 0) return '';
  // Include: global entries + session entries matching current sessionId
  const relevant = memory.entries.filter((e) => {
    const scope = e.scope || 'global';
    if (scope === 'global') return true;
    if (scope === 'session' && sessionId && e.sessionId === sessionId) return true;
    return false;
  });
  if (relevant.length === 0) return '';
  const lines = relevant.map((e) => `- ${e.key}: ${e.content}`);
  return `\n[用户记忆]\n${lines.join('\n')}`;
}

// ── Core LLM calls ──

function buildHeaders(cfg: LlmConfig): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) {
    headers['Authorization'] = `Bearer ${cfg.apiKey}`;
    // MiMo also supports api-key header
    if (isMimoConfig(cfg)) headers['api-key'] = cfg.apiKey;
  }
  return headers;
}

function isMimoConfig(cfg: Pick<LlmConfig, 'provider' | 'baseUrl' | 'model'>): boolean {
  return cfg.provider.toLowerCase() === 'mimo' || /xiaomimimo\.com/i.test(cfg.baseUrl) || /^mimo-/i.test(cfg.model);
}

function effectiveProvider(cfg: LlmConfig): string {
  return isMimoConfig(cfg) ? 'mimo' : cfg.provider;
}

/**
 * Apply provider-specific thinking/reasoning control to the request body.
 *
 * - llamacpp: chat_template_kwargs.enable_thinking + reasoning_format
 * - ollama:   same as llamacpp (uses jinja templates)
 * - deepseek: no API-level toggle; thinking stripped post-hoc
 * - openai:   no thinking mode for standard models
 */
function applyThinkingControl(
  body: Record<string, unknown>,
  provider: string,
  enableThinking: boolean,
): void {
  switch (provider) {
    case 'llamacpp':
      // chat_template_kwargs controls the jinja template (Qwen3, etc.)
      body.chat_template_kwargs = { enable_thinking: enableThinking };
      // reasoning_format tells the server how to parse <think> blocks
      body.reasoning_format = enableThinking ? 'deepseek' : 'none';
      break;
    case 'ollama':
      // Ollama supports the same jinja kwargs for Qwen3-style models
      body.chat_template_kwargs = { enable_thinking: enableThinking };
      break;
    case 'qwen':
      // Qwen/DashScope compatible-mode: enable_thinking in extra_body
      body.enable_thinking = enableThinking;
      break;
    case 'deepseek':
      // DeepSeek API doesn't expose a toggle;
      // thinking content arrives in reasoning_content field — handled in parsing
      break;
    case 'mimo':
      // MiMo uses thinking.type = enabled/disabled
      body.thinking = { type: enableThinking ? 'enabled' : 'disabled' };
      break;
    case 'openai':
    default:
      // Standard OpenAI models have no thinking mode
      break;
  }
}

export function buildBody(
  cfg: LlmConfig,
  messages: ChatMessage[],
  stream: boolean,
  thinkingOverride?: boolean,
): Record<string, unknown> {
  const provider = effectiveProvider(cfg);
  const isMimo = provider === 'mimo';
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: messages.map(m => toApiMessage(m, provider)),
    stream,
  };
  // MiMo uses max_completion_tokens; others use max_tokens
  if (isMimo) {
    body.max_completion_tokens = cfg.maxTokens;
  } else {
    body.max_tokens = cfg.maxTokens;
    body.temperature = cfg.temperature;
  }

  const enableThinking = thinkingOverride ?? cfg.enableThinking;
  applyThinkingControl(body, provider, enableThinking);

  console.log(`[llm] provider=${provider} thinking=${enableThinking} max_tokens=${cfg.maxTokens} stream=${stream}`);

  return body;
}

function apiUrl(cfg: LlmConfig): string {
  return `${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

/**
 * Synchronous LLM call (non-streaming).
 */
export async function chatCompletion(
  messages: ChatMessage[],
  overrides?: Partial<LlmConfig> & { enableThinking?: boolean },
): Promise<LlmResponse> {
  const settings = await getSettings();
  const { enableThinking: thinkingOverride, ...cfgOverrides } = overrides || {};
  const cfg = { ...settings.llm, ...cfgOverrides };

  const res = await fetch(apiUrl(cfg), {
    method: 'POST',
    headers: buildHeaders(cfg),
    body: JSON.stringify(buildBody(cfg, messages, false, thinkingOverride)),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new LlmApiError(res.status, errText);
  }

  const data = await res.json() as any;
  const choice = data.choices?.[0];
  let content = choice?.message?.content ?? '';
  let thinking: string | undefined;

  // DeepSeek-style / reasoning_format=deepseek: reasoning in separate field
  if (choice?.message?.reasoning_content) {
    thinking = choice.message.reasoning_content;
  }

  // Strip all <think>...</think> blocks from content
  // Qwen3.5 with enable_thinking=false prefills empty <think>\n\n</think> — must be removed
  const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
  let thinkMatch;
  while ((thinkMatch = thinkRegex.exec(content)) !== null) {
    const thinkContent = thinkMatch[1].trim();
    if (thinkContent) {
      thinking = (thinking ? thinking + '\n' : '') + thinkContent;
    }
  }
  content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

  return {
    content,
    thinking,
    finishReason: choice?.finish_reason ?? 'unknown',
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens ?? 0,
          completionTokens: data.usage.completion_tokens ?? 0,
          totalTokens: data.usage.total_tokens ?? 0,
        }
      : undefined,
  };
}

/**
 * Streaming LLM call. Yields StreamChunk objects that distinguish
 * thinking content from main content.
 */
export async function* chatCompletionStream(
  messages: ChatMessage[],
  overrides?: Partial<LlmConfig> & { enableThinking?: boolean; signal?: AbortSignal },
): AsyncGenerator<StreamChunk, void, unknown> {
  const settings = await getSettings();
  const { enableThinking: thinkingOverride, signal, ...cfgOverrides } = overrides || {};
  const cfg = { ...settings.llm, ...cfgOverrides };

  const res = await fetch(apiUrl(cfg), {
    method: 'POST',
    headers: buildHeaders(cfg),
    body: JSON.stringify(buildBody(cfg, messages, true, thinkingOverride)),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new LlmApiError(res.status, errText);
  }

  if (!res.body) throw new Error('No response body for streaming');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let inThink = false;

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
        if (payload === '[DONE]') return;

        try {
          const json = JSON.parse(payload) as any;
          const deltaObj = json.choices?.[0]?.delta;

          // DeepSeek / llama.cpp reasoning_format=deepseek: reasoning in separate field
          const reasoningDelta: string = deltaObj?.reasoning_content ?? '';
          if (reasoningDelta) {
            yield { type: 'thinking', text: reasoningDelta };
          }

          let delta: string = deltaObj?.content ?? '';
          if (!delta && !reasoningDelta) continue;
          if (!delta) continue;

          // Parse think tags within stream
          while (delta.length > 0) {
            if (inThink) {
              const endIdx = delta.indexOf('</think>');
              if (endIdx >= 0) {
                const thinkPart = delta.slice(0, endIdx);
                if (thinkPart) yield { type: 'thinking', text: thinkPart };
                delta = delta.slice(endIdx + 8);
                inThink = false;
              } else {
                yield { type: 'thinking', text: delta };
                delta = '';
              }
            } else {
              const startIdx = delta.indexOf('<think>');
              if (startIdx >= 0) {
                const contentPart = delta.slice(0, startIdx);
                if (contentPart) yield { type: 'content', text: contentPart };
                delta = delta.slice(startIdx + 7);
                inThink = true;
              } else {
                yield { type: 'content', text: delta };
                delta = '';
              }
            }
          }
        } catch {
          // Skip malformed SSE lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── Function Calling (tool_use) ──

export interface FnToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCallResult {
  content: string;
  thinking?: string;
  toolCalls?: { id: string; name: string; args: Record<string, unknown>; result?: string }[];
  finishReason: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

/** A tool executor may return plain text, or text for the model plus a structured payload for the UI. */
export type ToolExecOutput = string | { text: string; display?: unknown };

function normalizeToolOutput(out: ToolExecOutput): { text: string; display?: unknown } {
  return typeof out === 'string' ? { text: out } : out;
}

const MAX_TOOL_ROUNDS = 20;
const MAX_TOOL_CALLS = 32;
const MAX_MODEL_TOOL_RESULT_CHARS = 16_000;
const MAX_FINAL_RECOVERY_ATTEMPTS = 2;
const FINAL_ANSWER_INSTRUCTION = '工具数据已经齐全。现在停止调用工具，直接综合已有数据给出完整中文答复；不要输出工具原始 YAML/JSON，不要以“工具结果”开头。';

function toolCallKey(name: string, args: Record<string, unknown>): string {
  const sorted = Object.keys(args).sort().reduce<Record<string, unknown>>((acc, key) => {
    acc[key] = args[key];
    return acc;
  }, {});
  return `${name}:${JSON.stringify(sorted)}`;
}

function truncateToolResultForModel(result: string): string {
  if (result.length <= MAX_MODEL_TOOL_RESULT_CHARS) return result;
  const half = Math.floor((MAX_MODEL_TOOL_RESULT_CHARS - 160) / 2);
  return `${result.slice(0, half)}\n\n[工具结果过长，已为模型上下文省略中间部分；界面仍保留完整结果]\n\n${result.slice(-half)}`;
}

function isInvalidFinalAnswer(content: string): boolean {
  const value = content.trim();
  if (!value) return true;
  return /^(?:\[?工具结果[:：]|tool\s*(?:result|response)[:：])/i.test(value);
}

/**
 * Chat completion with function calling support.
 * If the model returns tool_calls, the caller-provided executor runs each tool,
 * and we loop back with the results until the model produces a final text response.
 * Max 5 rounds to prevent infinite loops.
 */
export async function chatCompletionWithTools(
  messages: ChatMessage[],
  tools: FnToolDef[],
  executor: (name: string, args: Record<string, unknown>) => Promise<ToolExecOutput>,
  overrides?: Partial<LlmConfig> & { enableThinking?: boolean; signal?: AbortSignal },
): Promise<ToolCallResult> {
  const settings = await getSettings();
  const { enableThinking: thinkingOverride, signal, ...cfgOverrides } = overrides || {};
  const cfg = { ...settings.llm, ...cfgOverrides };
  const allToolCalls: ToolCallResult['toolCalls'] = [];

  // Build a mutable messages array for the loop (supports multimodal content parts)
  const provider = effectiveProvider(cfg);
  const loopMsgs: Array<Record<string, unknown>> = messages.map(m => toApiMessage(m, provider));
  const isMimo = provider === 'mimo';
  const resultCache = new Map<string, { text: string; display?: unknown }>();
  let recoveryAttempts = 0;
  let forceFinalAnswer = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS + MAX_FINAL_RECOVERY_ATTEMPTS; round++) {
    const body: Record<string, unknown> = {
      model: cfg.model,
      messages: loopMsgs,
      stream: false,
      tools,
      tool_choice: forceFinalAnswer ? 'none' : 'auto',
    };
    if (isMimo) {
      body.max_completion_tokens = cfg.maxTokens;
    } else {
      body.max_tokens = cfg.maxTokens;
      body.temperature = cfg.temperature;
    }
    const enableThinking = thinkingOverride ?? cfg.enableThinking;
    applyThinkingControl(body, provider, enableThinking);

    signal?.throwIfAborted();
    const res = await fetch(apiUrl(cfg), {
      method: 'POST',
      headers: buildHeaders(cfg),
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new LlmApiError(res.status, errText);
    }

    const data = await res.json() as any;
    const choice = data.choices?.[0];
    const msg = choice?.message;

    // Extract thinking
    let thinking: string | undefined;
    if (msg?.reasoning_content) thinking = msg.reasoning_content;
    let content = msg?.content ?? '';
    const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
    let thinkMatch;
    while ((thinkMatch = thinkRegex.exec(content)) !== null) {
      const tc = thinkMatch[1].trim();
      if (tc) thinking = (thinking ? thinking + '\n' : '') + tc;
    }
    content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    // Check for tool calls
    if (msg?.tool_calls?.length) {
      // Append the assistant message with tool_calls (preserve reasoning_content for MiMo)
      const assistantEntry: Record<string, unknown> = { role: 'assistant', content: msg.content || null, tool_calls: msg.tool_calls };
      if (msg.reasoning_content) assistantEntry.reasoning_content = msg.reasoning_content;
      loopMsgs.push(assistantEntry as any);

      for (const tc of msg.tool_calls) {
        const fnName = tc.function?.name || '';
        let fnArgs: Record<string, unknown> = {};
        try { fnArgs = JSON.parse(tc.function?.arguments || '{}'); } catch { /* ok */ }
        console.log(`[llm] tool_call: ${fnName}(${JSON.stringify(fnArgs)})`);

        const cacheKey = toolCallKey(fnName, fnArgs);
        let out = resultCache.get(cacheKey);
        if (out === undefined) {
          try {
            out = normalizeToolOutput(await executor(fnName, fnArgs));
          } catch (err: any) {
            out = { text: `工具执行失败: ${err.message}` };
          }
          resultCache.set(cacheKey, out);
        }
        const result = out.text;

        allToolCalls!.push({ id: tc.id, name: fnName, args: fnArgs, result });

        // Append tool result message
        loopMsgs.push({
          role: 'tool',
          content: truncateToolResultForModel(result),
          tool_call_id: tc.id,
          name: fnName,
        });
      }
      if (allToolCalls.length >= MAX_TOOL_CALLS || round >= MAX_TOOL_ROUNDS - 1) {
        forceFinalAnswer = true;
        loopMsgs.push({ role: 'system', content: FINAL_ANSWER_INSTRUCTION });
      }
      continue; // Next round
    }

    // No tool calls — final response
    if ((isInvalidFinalAnswer(content) || choice?.finish_reason === 'length') && recoveryAttempts < MAX_FINAL_RECOVERY_ATTEMPTS) {
      recoveryAttempts++;
      forceFinalAnswer = true;
      if (content) loopMsgs.push({ role: 'assistant', content });
      loopMsgs.push({ role: 'system', content: FINAL_ANSWER_INSTRUCTION });
      continue;
    }
    return {
      content,
      thinking,
      toolCalls: allToolCalls.length ? allToolCalls : undefined,
      finishReason: choice?.finish_reason ?? 'stop',
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens ?? 0,
        completionTokens: data.usage.completion_tokens ?? 0,
        totalTokens: data.usage.total_tokens ?? 0,
      } : undefined,
    };
  }

  // Max rounds exceeded
  return {
    content: '工具数据已获取，但模型未能完成综合答复。请点击重新生成，我会直接基于现有数据作答。',
    toolCalls: allToolCalls.length ? allToolCalls : undefined,
    finishReason: 'tool_loop_limit',
  };
}

/**
 * Stream chunk types for FC streaming.
 * - tool_call: emitted when a tool is invoked (name + args + result)
 * - content: streamed final response text
 * - thinking: streamed thinking text
 * - done: final metadata
 */
export type FcStreamChunk =
  | { type: 'tool_call'; name: string; args: Record<string, unknown>; result: string; display?: unknown }
  | { type: 'content'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'done'; sessionId?: string; finishReason: string; toolCalls?: ToolCallResult['toolCalls'] };

/**
 * Streaming version of chatCompletionWithTools.
 * Tool-calling rounds are non-streaming (they're fast), but each tool call is yielded as an event.
 * The final LLM response round is streamed via SSE for real-time content delivery.
 */
export async function* chatCompletionWithToolsStream(
  messages: ChatMessage[],
  tools: FnToolDef[],
  executor: (name: string, args: Record<string, unknown>) => Promise<ToolExecOutput>,
  overrides?: Partial<LlmConfig> & { enableThinking?: boolean; signal?: AbortSignal },
): AsyncGenerator<FcStreamChunk, void, unknown> {
  const settings = await getSettings();
  const { enableThinking: thinkingOverride, signal, ...cfgOverrides } = overrides || {};
  const cfg = { ...settings.llm, ...cfgOverrides };
  const allToolCalls: ToolCallResult['toolCalls'] = [];

  const provider = effectiveProvider(cfg);
  const loopMsgs: Array<Record<string, unknown>> = messages.map(m => toApiMessage(m, provider));
  const isMimo = provider === 'mimo';
  const resultCache = new Map<string, { text: string; display?: unknown }>();
  let recoveryAttempts = 0;
  let forceFinalAnswer = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS + MAX_FINAL_RECOVERY_ATTEMPTS; round++) {
    const enableThinking = thinkingOverride ?? cfg.enableThinking;

    // For tool-calling rounds, use non-streaming to detect tool_calls
    const body: Record<string, unknown> = {
      model: cfg.model,
      messages: loopMsgs,
      stream: false,
      tools,
      tool_choice: forceFinalAnswer ? 'none' : 'auto',
    };
    if (isMimo) {
      body.max_completion_tokens = cfg.maxTokens;
    } else {
      body.max_tokens = cfg.maxTokens;
      body.temperature = cfg.temperature;
    }
    applyThinkingControl(body, provider, enableThinking);

    signal?.throwIfAborted();
    const res = await fetch(apiUrl(cfg), {
      method: 'POST',
      headers: buildHeaders(cfg),
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new LlmApiError(res.status, errText);
    }

    const data = await res.json() as any;
    const choice = data.choices?.[0];
    const msg = choice?.message;

    // Check for tool calls
    if (msg?.tool_calls?.length) {
      const aEntry: any = { role: 'assistant', content: msg.content || null, tool_calls: msg.tool_calls };
      if (msg.reasoning_content) aEntry.reasoning_content = msg.reasoning_content;
      loopMsgs.push(aEntry);

      for (const tc of msg.tool_calls) {
        const fnName = tc.function?.name || '';
        let fnArgs: Record<string, unknown> = {};
        try { fnArgs = JSON.parse(tc.function?.arguments || '{}'); } catch { /* ok */ }
        console.log(`[llm] tool_call: ${fnName}(${JSON.stringify(fnArgs)})`);

        const cacheKey = toolCallKey(fnName, fnArgs);
        let out = resultCache.get(cacheKey);
        if (out === undefined) {
          try {
            out = normalizeToolOutput(await executor(fnName, fnArgs));
          } catch (err: any) {
            out = { text: `工具执行失败: ${err.message}` };
          }
          resultCache.set(cacheKey, out);
        }
        const result = out.text;

        allToolCalls!.push({ id: tc.id, name: fnName, args: fnArgs, result });
        loopMsgs.push({ role: 'tool', content: truncateToolResultForModel(result), tool_call_id: tc.id, name: fnName });

        // Yield tool call event to client
        yield { type: 'tool_call', name: fnName, args: fnArgs, result, display: out.display };
      }
      if (allToolCalls.length >= MAX_TOOL_CALLS || round >= MAX_TOOL_ROUNDS - 1) {
        forceFinalAnswer = true;
        loopMsgs.push({ role: 'system', content: FINAL_ANSWER_INSTRUCTION });
      }
      continue; // Next round
    }

    // No tool calls — this is the final response.
    // If we already have the non-streaming result, just yield it and return.
    // But for better UX, let's re-do this final round as streaming.
    // Remove the last non-streaming call result and stream instead.

    // Actually, we already have the full response from the non-streaming call.
    // For simplicity and to avoid a double call, extract and stream the content we have.
    let thinking: string | undefined;
    if (msg?.reasoning_content) thinking = msg.reasoning_content;
    let content = msg?.content ?? '';
    const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
    let thinkMatch;
    while ((thinkMatch = thinkRegex.exec(content)) !== null) {
      const tc = thinkMatch[1].trim();
      if (tc) thinking = (thinking ? thinking + '\n' : '') + tc;
    }
    content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    if ((isInvalidFinalAnswer(content) || choice?.finish_reason === 'length') && recoveryAttempts < MAX_FINAL_RECOVERY_ATTEMPTS) {
      recoveryAttempts++;
      forceFinalAnswer = true;
      if (content) loopMsgs.push({ role: 'assistant', content });
      loopMsgs.push({ role: 'system', content: FINAL_ANSWER_INSTRUCTION });
      continue;
    }

    if (thinking) yield { type: 'thinking', text: thinking };
    // Stream content in chunks for smooth rendering
    const CHUNK_SIZE = 20;
    for (let i = 0; i < content.length; i += CHUNK_SIZE) {
      yield { type: 'content', text: content.slice(i, i + CHUNK_SIZE) };
    }
    yield {
      type: 'done',
      finishReason: choice?.finish_reason ?? 'stop',
      toolCalls: allToolCalls.length ? allToolCalls : undefined,
    };
    return;
  }

  // Max rounds exceeded
  yield { type: 'content', text: '工具数据已获取，但模型未能完成综合答复。请点击重新生成，我会直接基于现有数据作答。' };
  yield {
    type: 'done',
    finishReason: 'tool_loop_limit',
    toolCalls: allToolCalls.length ? allToolCalls : undefined,
  };
}

/**
 * Subagent call: independent LLM call that does NOT enter the main session history.
 * Returns a concise analysis result.
 */
export async function subagentCall(
  systemPrompt: string,
  userPrompt: string,
  overrides?: Partial<LlmConfig>,
): Promise<LlmResponse> {
  return chatCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { ...overrides, temperature: 0.4, enableThinking: false },
  );
}

/**
 * Streaming subagent call: independent LLM call that yields StreamChunk.
 * Used when enableToolStreaming is on.
 */
export async function* subagentCallStream(
  systemPrompt: string,
  userPrompt: string,
  overrides?: Partial<LlmConfig>,
): AsyncGenerator<StreamChunk, void, unknown> {
  yield* chatCompletionStream(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { ...overrides, temperature: 0.4, enableThinking: false },
  );
}

/**
 * Quick test: send a simple ping to verify LLM connectivity.
 */
export async function testConnection(overrides?: Partial<LlmConfig>): Promise<{ ok: boolean; message: string; latencyMs: number }> {
  const start = Date.now();
  try {
    const result = await chatCompletion(
      [{ role: 'user', content: '请用一句话回答：你好' }],
      { ...overrides, maxTokens: 64 },
    );
    return {
      ok: true,
      message: result.content.slice(0, 200),
      latencyMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      ok: false,
      message: err.message || String(err),
      latencyMs: Date.now() - start,
    };
  }
}
