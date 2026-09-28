/** A failed chat generation, described for people instead of as a raw provider payload. */
export type ChatErrorKind =
  | 'balance'   // 余额不足 / 配额用尽
  | 'auth'      // API Key 无效或无权限
  | 'rate'      // 请求过于频繁
  | 'context'   // 对话超出上下文长度
  | 'server'    // 模型服务 5xx
  | 'network'   // 连不上模型服务
  | 'config'    // 模型名、地址等配置有误
  | 'unknown';

export interface ChatErrorInfo {
  kind: ChatErrorKind;
  /** Short headline, e.g. 模型服务余额不足 */
  title: string;
  /** One or two sentences explaining what happened */
  message: string;
  /** What the user (or admin) can do about it */
  hint?: string;
  /** Whether sending again is likely to help */
  retryable: boolean;
  /** Needs someone with access to 管理后台 → LLM 配置 */
  adminAction?: boolean;
  status?: number;
  code?: string;
  /** Provider's original message, shown under 详情 */
  detail?: string;
}
