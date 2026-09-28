export interface LlmConfig {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  contextWindow: number;
  temperature: number;
  enableThinking: boolean;
  thinkingLevel: 'low' | 'medium' | 'high';
  enableToolStreaming: boolean;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  appUrl: string;
}

export interface SystemSettings {
  llm: LlmConfig;
  smtp: SmtpConfig;
}

export const DEFAULT_SETTINGS: SystemSettings = {
  llm: {
    provider: 'llamacpp',
    baseUrl: 'http://127.0.0.1:8080/v1',
    apiKey: '',
    model: 'default',
    maxTokens: 4096,
    contextWindow: 131072,
    temperature: 0.7,
    enableThinking: false,
    thinkingLevel: 'medium',
    enableToolStreaming: true,
  },
  smtp: {
    host: '',
    port: 465,
    secure: true,
    user: '',
    pass: '',
    from: '天枢 Arcanum <noreply@example.com>',
    appUrl: 'http://localhost:3001',
  },
};

// ── Data sources available for AI context injection ──

export interface DataSourceDef {
  id: string;
  name: string;
  description: string;
}

export const AVAILABLE_DATA_SOURCES: DataSourceDef[] = [
  { id: 'profiles', name: '命盘档案', description: '获取用户所有档案列表（姓名、生辰、性别）' },
  { id: 'bazi', name: '八字命盘', description: '获取指定档案的八字命盘详情' },
  { id: 'ziwei', name: '紫微命盘', description: '获取指定档案的紫微斗数命盘详情' },
  { id: 'todayFortune', name: '今日运势', description: '获取指定档案的今日运势数据' },
  { id: 'natalAnalysis', name: '命理分析', description: '获取指定档案的AI命理分析报告' },
];
