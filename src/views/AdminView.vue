<script setup lang="ts">
import { computed, onMounted, ref, reactive } from 'vue';
import {
  apiGetSettings, apiUpdateSettings, apiTestLlm, apiTestSmtp,
  apiListUsers, apiCreateUser, apiDeleteUser, apiResetUserPassword,
  apiListRegCodes, apiGenerateRegCodes, apiDeleteRegCode,
  type RegCode,
} from '../api/admin.api';
import {
  Zap, CheckCircle2, XCircle, Loader2, Users, Key, Trash2, Plus, RefreshCw, Copy, Mail, Server, Send, KeyRound,
} from 'lucide-vue-next';
import PageHeader from '../components/common/PageHeader.vue';
import EmptyState from '../components/common/EmptyState.vue';
import AppModal from '../components/common/AppModal.vue';
import { useFeedback, errorMessage } from '../composables/useFeedback';
import type { LlmConfig, SmtpConfig } from '../../shared/types/settings.types';
import type { UserInfo } from '../../shared/types/auth.types';

type TabId = 'llm' | 'smtp' | 'users' | 'codes';

const { toast, confirm } = useFeedback();

const tabs: { id: TabId; label: string; icon: typeof Zap }[] = [
  { id: 'llm', label: 'LLM 配置', icon: Zap },
  { id: 'smtp', label: '邮件服务', icon: Mail },
  { id: 'users', label: '用户管理', icon: Users },
  { id: 'codes', label: '注册码', icon: Key },
];

const activeTab = ref<TabId>('llm');
const loading = ref(true);

// ── LLM ──
const saving = ref(false);
const testing = ref(false);
const testResult = ref<{ ok: boolean; message: string; latencyMs: number } | null>(null);

const llm = reactive<LlmConfig>({
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
});

const presets: { label: string; provider: string; baseUrl: string; model: string; contextWindow?: number }[] = [
  { label: 'llama.cpp (本地)', provider: 'llamacpp', baseUrl: 'http://127.0.0.1:8080/v1', model: 'default' },
  { label: 'Ollama (本地)', provider: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen2.5' },
  { label: 'OpenAI', provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o', contextWindow: 128000 },
  { label: 'DeepSeek', provider: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', contextWindow: 65536 },
  { label: 'Qwen (阿里百炼)', provider: 'qwen', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen3-plus', contextWindow: 131072 },
  { label: 'MiMo (小米)', provider: 'mimo', baseUrl: 'https://api.xiaomimimo.com/v1', model: 'mimo-v2.5-pro', contextWindow: 256000 },
];

function applyPreset(preset: typeof presets[0]) {
  llm.provider = preset.provider;
  llm.baseUrl = preset.baseUrl;
  llm.model = preset.model;
  if (preset.contextWindow) llm.contextWindow = preset.contextWindow;
}

async function handleSave() {
  saving.value = true;
  try {
    // Blank key means "keep current" — the server only skips masked '***' values, so omit it
    const payload: Partial<LlmConfig> = { ...llm };
    if (!payload.apiKey) delete payload.apiKey;
    await apiUpdateSettings({ llm: payload as LlmConfig });
    toast.success('LLM 设置已保存');
  } catch (err) {
    toast.error(errorMessage(err, '保存失败'));
  } finally {
    saving.value = false;
  }
}

async function handleTest() {
  testing.value = true;
  testResult.value = null;
  try {
    testResult.value = await apiTestLlm({ ...llm });
  } catch (err: any) {
    testResult.value = { ok: false, message: err.message || '请求失败', latencyMs: 0 };
  } finally {
    testing.value = false;
  }
}

// ── SMTP ──
const smtpSaving = ref(false);
const smtpTesting = ref(false);
const smtpTestResult = ref<{ ok: boolean; message: string } | null>(null);
const smtpTestTo = ref('');

const smtp = reactive<SmtpConfig>({
  host: '',
  port: 465,
  secure: true,
  user: '',
  pass: '',
  from: '天枢 Arcanum <noreply@example.com>',
  appUrl: 'http://localhost:3001',
});

async function handleSmtpSave() {
  smtpSaving.value = true;
  try {
    const payload: Partial<SmtpConfig> = { ...smtp };
    if (!payload.pass) delete payload.pass;
    await apiUpdateSettings({ smtp: payload as SmtpConfig });
    toast.success('邮件设置已保存');
  } catch (err) {
    toast.error(errorMessage(err, '保存失败'));
  } finally {
    smtpSaving.value = false;
  }
}

async function handleSmtpTest() {
  if (!smtpTestTo.value) { smtpTestResult.value = { ok: false, message: '请填写收件人邮箱' }; return; }
  smtpTesting.value = true;
  smtpTestResult.value = null;
  try {
    const res = await apiTestSmtp(smtpTestTo.value);
    smtpTestResult.value = { ok: res.success, message: res.success ? '测试邮件已发送' : (res.error || '发送失败') };
  } catch (err) {
    smtpTestResult.value = { ok: false, message: errorMessage(err, '请求失败') };
  } finally {
    smtpTesting.value = false;
  }
}

// ── Users ──
const users = ref<UserInfo[]>([]);
const usersLoading = ref(false);
const usersLoaded = ref(false);
const showCreateUser = ref(false);
const creatingUser = ref(false);
const newUser = reactive({ username: '', email: '', password: '', role: 'user' as string });
const createUserMsg = ref('');
const resetPwdUserId = ref<string | null>(null);
const resetPwdValue = ref('');
const resetPwdMsg = ref('');
const resettingPwd = ref(false);

const adminCount = computed(() => users.value.filter((u) => u.role === 'admin').length);
const resetPwdUsername = computed(() => users.value.find((u) => u.userId === resetPwdUserId.value)?.username || '');

async function loadUsers() {
  usersLoading.value = true;
  try {
    users.value = await apiListUsers();
    usersLoaded.value = true;
  } catch (err) {
    toast.error(errorMessage(err, '加载用户失败'));
  } finally {
    usersLoading.value = false;
  }
}

function openCreateUser() {
  newUser.username = ''; newUser.email = ''; newUser.password = ''; newUser.role = 'user';
  createUserMsg.value = '';
  showCreateUser.value = true;
}

async function handleCreateUser() {
  createUserMsg.value = '';
  creatingUser.value = true;
  try {
    await apiCreateUser(newUser.username, newUser.email, newUser.password, newUser.role);
    showCreateUser.value = false;
    toast.success(`已创建用户「${newUser.username}」`);
    await loadUsers();
  } catch (err) {
    createUserMsg.value = errorMessage(err, '创建失败');
  } finally {
    creatingUser.value = false;
  }
}

async function handleDeleteUser(userId: string, username: string) {
  const ok = await confirm({
    title: '删除用户',
    message: `确定要删除用户「${username}」吗？此操作不可恢复。`,
    confirmText: '删除',
    danger: true,
  });
  if (!ok) return;
  try {
    await apiDeleteUser(userId);
    toast.success('用户已删除');
    await loadUsers();
  } catch (err) {
    toast.error(errorMessage(err, '删除失败'));
  }
}

function openResetPwd(userId: string) {
  resetPwdUserId.value = userId;
  resetPwdValue.value = '';
  resetPwdMsg.value = '';
}

async function handleResetPassword() {
  resetPwdMsg.value = '';
  if (!resetPwdUserId.value) return;
  resettingPwd.value = true;
  try {
    await apiResetUserPassword(resetPwdUserId.value, resetPwdValue.value);
    toast.success(`已重置「${resetPwdUsername.value}」的密码`);
    resetPwdUserId.value = null;
    resetPwdValue.value = '';
  } catch (err) {
    resetPwdMsg.value = errorMessage(err, '重置失败');
  } finally {
    resettingPwd.value = false;
  }
}

// ── Reg Codes ──
const regCodes = ref<RegCode[]>([]);
const codesLoading = ref(false);
const codesLoaded = ref(false);
const genCount = ref(1);
const generating = ref(false);
const justGenerated = ref<string[]>([]);
const codeFilter = ref<'all' | 'unused' | 'used'>('all');

const usedCount = computed(() => regCodes.value.filter((c) => c.usedBy).length);
const unusedCount = computed(() => regCodes.value.length - usedCount.value);
const filteredCodes = computed(() => {
  if (codeFilter.value === 'used') return regCodes.value.filter((c) => c.usedBy);
  if (codeFilter.value === 'unused') return regCodes.value.filter((c) => !c.usedBy);
  return regCodes.value;
});

async function loadCodes() {
  codesLoading.value = true;
  try {
    regCodes.value = await apiListRegCodes();
    codesLoaded.value = true;
  } catch (err) {
    toast.error(errorMessage(err, '加载注册码失败'));
  } finally {
    codesLoading.value = false;
  }
}

async function handleGenerate() {
  generating.value = true;
  justGenerated.value = [];
  try {
    justGenerated.value = await apiGenerateRegCodes(genCount.value);
    toast.success(`已生成 ${justGenerated.value.length} 个注册码`);
    await loadCodes();
  } catch (err) {
    toast.error(errorMessage(err, '生成失败'));
  } finally {
    generating.value = false;
  }
}

async function handleDeleteCode(c: RegCode) {
  const ok = await confirm({
    title: '删除注册码',
    message: c.usedBy
      ? `注册码 ${c.code} 已被「${c.usedBy}」使用，删除仅移除记录，不影响该账号。确定删除？`
      : `确定删除未使用的注册码 ${c.code}？删除后将无法再用于注册。`,
    confirmText: '删除',
    danger: true,
  });
  if (!ok) return;
  try {
    await apiDeleteRegCode(c.code);
    justGenerated.value = justGenerated.value.filter((x) => x !== c.code);
    toast.success('注册码已删除');
    await loadCodes();
  } catch (err) {
    toast.error(errorMessage(err, '删除失败'));
  }
}

async function copyText(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (!ok) throw new Error('copy failed');
    }
    toast.success('已复制');
  } catch {
    toast.error('复制失败，请手动选择复制');
  }
}

function copyAllGenerated() {
  copyText(justGenerated.value.join('\n'));
}

onMounted(async () => {
  try {
    const settings = await apiGetSettings();
    Object.assign(llm, settings.llm);
    if (llm.apiKey.startsWith('***')) llm.apiKey = '';
    if (settings.smtp) {
      Object.assign(smtp, settings.smtp);
      if (smtp.pass.startsWith('***')) smtp.pass = '';
    }
  } catch (err) {
    toast.error(errorMessage(err, '加载系统设置失败'));
  }
  loading.value = false;
});

function switchTab(tab: TabId) {
  activeTab.value = tab;
  if (tab === 'users' && !usersLoaded.value) loadUsers();
  if (tab === 'codes' && !codesLoaded.value) loadCodes();
}
</script>

<template>
  <div class="page page-medium admin-page">
    <PageHeader title="管理后台" subtitle="模型接入、邮件服务、用户与注册码管理" />

    <div class="tabs admin-tabs" role="tablist">
      <button
        v-for="t in tabs"
        :key="t.id"
        class="tab"
        :class="{ active: activeTab === t.id }"
        role="tab"
        :aria-selected="activeTab === t.id"
        @click="switchTab(t.id)"
      >
        <component :is="t.icon" :size="15" /> {{ t.label }}
      </button>
    </div>

    <div v-if="loading" class="card">
      <div class="skeleton sk-line w40" />
      <div class="skeleton sk-line w70" />
      <div class="skeleton sk-block" />
      <div class="skeleton sk-block" />
    </div>

    <template v-else>
      <!-- ═══ LLM Tab ═══ -->
      <section v-show="activeTab === 'llm'" class="card">
        <h2 class="section-title"><Zap :size="18" class="icon" /> LLM 模型配置</h2>
        <p class="card-desc">配置大语言模型接口，支持任何兼容 OpenAI 协议的服务。</p>

        <div class="form-label preset-title">快捷预设</div>
        <div class="preset-grid">
          <button
            v-for="p in presets"
            :key="p.provider"
            type="button"
            class="preset-card"
            :class="{ active: llm.provider === p.provider }"
            @click="applyPreset(p)"
          >
            <span class="preset-name">{{ p.label }}</span>
            <span class="preset-model">{{ p.model }}</span>
          </button>
        </div>

        <form @submit.prevent="handleSave" class="settings-form">
          <div class="form-grid">
            <div class="form-group">
              <label>API 地址 (Base URL)</label>
              <input v-model="llm.baseUrl" class="input" placeholder="http://127.0.0.1:8080/v1" />
            </div>
            <div class="form-group">
              <label>模型名称</label>
              <input v-model="llm.model" class="input" placeholder="default" />
            </div>
            <div class="form-group full">
              <label>API Key</label>
              <input v-model="llm.apiKey" type="password" class="input" placeholder="sk-...（本地模型可留空；留空表示不修改）" autocomplete="off" />
            </div>
            <div class="form-group">
              <label>最大生成 Tokens</label>
              <input v-model.number="llm.maxTokens" type="number" class="input" min="128" max="32768" />
            </div>
            <div class="form-group">
              <label>上下文窗口 (tokens)</label>
              <input v-model.number="llm.contextWindow" type="number" class="input" min="4096" max="1048576" step="1024" />
              <span class="form-hint">{{ Math.round(llm.contextWindow / 1024) }}k — 控制历史压缩阈值</span>
            </div>
            <div class="form-group">
              <label>Temperature（创造性）</label>
              <input v-model.number="llm.temperature" type="number" class="input" min="0" max="2" step="0.1" />
            </div>
          </div>

          <div class="option-list">
            <div class="option-row">
              <label class="switch">
                <input type="checkbox" v-model="llm.enableThinking" />
                <span class="switch-track"></span>
                启用深度思考 (Think)
              </label>
              <span class="form-hint">开启后模型会在 &lt;think&gt; 标签中推理，可在对话中折叠查看</span>
            </div>

            <div class="form-group think-level" v-if="llm.enableThinking">
              <label>思考等级</label>
              <select v-model="llm.thinkingLevel" class="input">
                <option value="low">低 — 快速核对</option>
                <option value="medium">中 — 分步分析</option>
                <option value="high">高 — 深入推演与复核</option>
              </select>
              <span class="form-hint">聊天中开启思考时按此等级执行；MiMo 官方仅提供开关，等级通过推理指令控制。</span>
            </div>

            <div class="option-row">
              <label class="switch">
                <input type="checkbox" v-model="llm.enableToolStreaming" />
                <span class="switch-track"></span>
                工具流式输出
              </label>
              <span class="form-hint">开启后工具结果实时流式输出，关闭则等待完整结果后一次性显示</span>
            </div>
          </div>

          <div class="btn-row">
            <button type="submit" class="btn btn-primary" :disabled="saving">
              <Loader2 v-if="saving" :size="15" class="spin" />
              {{ saving ? '保存中…' : '保存设置' }}
            </button>
            <button type="button" class="btn btn-secondary" :disabled="testing" @click="handleTest">
              <Loader2 v-if="testing" :size="15" class="spin" />
              <Zap v-else :size="15" />
              {{ testing ? '测试中…' : '测试连接' }}
            </button>
          </div>
        </form>

        <div v-if="testResult" class="alert result-alert" :class="testResult.ok ? 'alert-success' : 'alert-error'">
          <CheckCircle2 v-if="testResult.ok" :size="18" class="alert-icon" />
          <XCircle v-else :size="18" class="alert-icon" />
          <div class="result-body">
            <div class="result-head">
              <strong>{{ testResult.ok ? '连接成功' : '连接失败' }}</strong>
              <span v-if="testResult.latencyMs" class="latency tabular">{{ testResult.latencyMs }} ms</span>
            </div>
            <p class="result-msg">{{ testResult.message }}</p>
          </div>
        </div>
      </section>

      <!-- ═══ SMTP Tab ═══ -->
      <section v-show="activeTab === 'smtp'" class="card">
        <h2 class="section-title"><Server :size="18" class="icon" /> 邮件服务配置</h2>
        <p class="card-desc">配置 SMTP 邮箱服务器，用于发送密码重置、欢迎邮件等。</p>

        <form @submit.prevent="handleSmtpSave" class="settings-form">
          <div class="form-grid">
            <div class="form-group">
              <label>SMTP 服务器</label>
              <input v-model="smtp.host" class="input" placeholder="smtp.example.com" />
            </div>
            <div class="form-group">
              <label>端口</label>
              <input v-model.number="smtp.port" type="number" class="input" placeholder="465" />
            </div>
            <div class="form-group">
              <label>账号</label>
              <input v-model="smtp.user" class="input" placeholder="user@example.com" autocomplete="off" />
            </div>
            <div class="form-group">
              <label>密码 / 授权码</label>
              <input v-model="smtp.pass" type="password" class="input" placeholder="留空表示不修改" autocomplete="off" />
            </div>
            <div class="option-row full">
              <label class="switch">
                <input type="checkbox" v-model="smtp.secure" />
                <span class="switch-track"></span>
                SSL/TLS 加密
              </label>
              <span class="form-hint">端口 465 通常开启，587 通常关闭（STARTTLS）</span>
            </div>
            <div class="form-group full">
              <label>发件人 (From)</label>
              <input v-model="smtp.from" class="input" placeholder="天枢 Arcanum <noreply@example.com>" />
            </div>
            <div class="form-group full">
              <label>应用地址 (App URL)</label>
              <input v-model="smtp.appUrl" class="input" placeholder="https://your-domain.com" />
              <span class="form-hint">用于邮件中的链接生成（重置密码、登录等）</span>
            </div>
          </div>

          <div class="btn-row">
            <button type="submit" class="btn btn-primary" :disabled="smtpSaving">
              <Loader2 v-if="smtpSaving" :size="15" class="spin" />
              {{ smtpSaving ? '保存中…' : '保存设置' }}
            </button>
          </div>
        </form>

        <div class="sub-section">
          <h3 class="sub-title">发送测试邮件</h3>
          <form class="inline-form" @submit.prevent="handleSmtpTest">
            <input v-model="smtpTestTo" type="email" class="input" placeholder="收件人邮箱" />
            <button type="submit" class="btn btn-secondary" :disabled="smtpTesting">
              <Loader2 v-if="smtpTesting" :size="15" class="spin" />
              <Send v-else :size="15" />
              {{ smtpTesting ? '发送中…' : '发送测试邮件' }}
            </button>
          </form>
          <div v-if="smtpTestResult" class="alert result-alert" :class="smtpTestResult.ok ? 'alert-success' : 'alert-error'">
            <CheckCircle2 v-if="smtpTestResult.ok" :size="18" class="alert-icon" />
            <XCircle v-else :size="18" class="alert-icon" />
            <div class="result-body">
              <strong>{{ smtpTestResult.ok ? '发送成功' : '发送失败' }}</strong>
              <p class="result-msg">{{ smtpTestResult.message }}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- ═══ Users Tab ═══ -->
      <section v-show="activeTab === 'users'">
        <div class="stat-row">
          <div class="stat card card-compact">
            <span class="stat-num tabular">{{ users.length }}</span>
            <span class="stat-label">用户总数</span>
          </div>
          <div class="stat card card-compact">
            <span class="stat-num tabular">{{ adminCount }}</span>
            <span class="stat-label">管理员</span>
          </div>
          <div class="stat card card-compact">
            <span class="stat-num tabular">{{ users.length - adminCount }}</span>
            <span class="stat-label">普通用户</span>
          </div>
        </div>

        <div class="toolbar">
          <h2 class="section-title toolbar-title"><Users :size="18" class="icon" /> 用户列表</h2>
          <div class="page-actions">
            <button class="btn btn-sm btn-ghost" @click="loadUsers" :disabled="usersLoading">
              <RefreshCw :size="14" :class="{ spin: usersLoading }" /> 刷新
            </button>
            <button class="btn btn-sm btn-primary" @click="openCreateUser">
              <Plus :size="14" /> 创建用户
            </button>
          </div>
        </div>

        <div class="card table-card">
          <div v-if="usersLoading && !users.length" class="table-skeleton">
            <div v-for="i in 4" :key="i" class="skeleton sk-row" />
          </div>
          <EmptyState v-else-if="!users.length" :icon="Users" title="暂无用户" compact />
          <div v-else class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>用户名</th>
                  <th class="hide-mobile">邮箱</th>
                  <th>角色</th>
                  <th class="hide-mobile">注册时间</th>
                  <th class="col-actions">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="u in users" :key="u.userId">
                  <td>
                    <div class="user-cell">
                      <span class="avatar">{{ u.username.slice(0, 1).toUpperCase() }}</span>
                      <div class="user-text">
                        <span class="user-name">{{ u.username }}</span>
                        <span class="user-email show-mobile">{{ u.email }}</span>
                      </div>
                    </div>
                  </td>
                  <td class="hide-mobile text-muted">{{ u.email }}</td>
                  <td>
                    <span class="badge" :class="u.role === 'admin' ? 'badge-accent' : ''">
                      {{ u.role === 'admin' ? '管理员' : '用户' }}
                    </span>
                  </td>
                  <td class="hide-mobile text-muted tabular">{{ u.createdAt?.slice(0, 10) }}</td>
                  <td class="col-actions">
                    <button class="btn-icon sm" title="重置密码" aria-label="重置密码" @click="openResetPwd(u.userId)">
                      <KeyRound :size="15" />
                    </button>
                    <button
                      v-if="u.role !== 'admin'"
                      class="btn-icon sm danger"
                      title="删除用户"
                      aria-label="删除用户"
                      @click="handleDeleteUser(u.userId, u.username)"
                    >
                      <Trash2 :size="15" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- ═══ Reg Codes Tab ═══ -->
      <section v-show="activeTab === 'codes'">
        <div class="stat-row">
          <div class="stat card card-compact">
            <span class="stat-num tabular">{{ regCodes.length }}</span>
            <span class="stat-label">注册码总数</span>
          </div>
          <div class="stat card card-compact">
            <span class="stat-num tabular ok">{{ unusedCount }}</span>
            <span class="stat-label">未使用</span>
          </div>
          <div class="stat card card-compact">
            <span class="stat-num tabular muted">{{ usedCount }}</span>
            <span class="stat-label">已使用</span>
          </div>
        </div>

        <div class="card gen-card">
          <h2 class="section-title"><Key :size="18" class="icon" /> 生成注册码</h2>
          <form @submit.prevent="handleGenerate" class="inline-form gen-form">
            <label class="form-label" for="gen-count">数量</label>
            <input id="gen-count" v-model.number="genCount" type="number" class="input gen-input" min="1" max="50" />
            <button type="submit" class="btn btn-primary" :disabled="generating">
              <Loader2 v-if="generating" :size="15" class="spin" />
              <Plus v-else :size="15" />
              生成注册码
            </button>
          </form>

          <div v-if="justGenerated.length" class="just-generated">
            <div class="jg-head">
              <span class="form-hint">新生成的注册码（点击单个复制）</span>
              <button v-if="justGenerated.length > 1" class="btn btn-sm btn-ghost" @click="copyAllGenerated">
                <Copy :size="13" /> 全部复制
              </button>
            </div>
            <div class="code-chips">
              <button v-for="c in justGenerated" :key="c" class="chip code-chip" @click="copyText(c)" title="点击复制">
                <Copy :size="12" /> {{ c }}
              </button>
            </div>
          </div>
        </div>

        <div class="toolbar">
          <div class="tabs filter-tabs">
            <button class="tab" :class="{ active: codeFilter === 'all' }" @click="codeFilter = 'all'">全部 {{ regCodes.length }}</button>
            <button class="tab" :class="{ active: codeFilter === 'unused' }" @click="codeFilter = 'unused'">未使用 {{ unusedCount }}</button>
            <button class="tab" :class="{ active: codeFilter === 'used' }" @click="codeFilter = 'used'">已使用 {{ usedCount }}</button>
          </div>
          <button class="btn btn-sm btn-ghost" @click="loadCodes" :disabled="codesLoading">
            <RefreshCw :size="14" :class="{ spin: codesLoading }" /> 刷新
          </button>
        </div>

        <div class="card table-card">
          <div v-if="codesLoading && !regCodes.length" class="table-skeleton">
            <div v-for="i in 4" :key="i" class="skeleton sk-row" />
          </div>
          <EmptyState
            v-else-if="!filteredCodes.length"
            :icon="Key"
            :title="regCodes.length ? '没有符合条件的注册码' : '暂无注册码'"
            :description="regCodes.length ? '' : '在上方生成注册码后分发给新用户注册。'"
            compact
          />
          <div v-else class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>注册码</th>
                  <th>状态</th>
                  <th class="hide-mobile">创建时间</th>
                  <th class="hide-mobile">使用者</th>
                  <th class="col-actions">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="c in filteredCodes" :key="c.code" :class="{ used: c.usedBy }">
                  <td>
                    <button class="code-text" @click="copyText(c.code)" title="点击复制">
                      <span class="mono">{{ c.code }}</span>
                      <Copy :size="12" class="code-copy" />
                    </button>
                  </td>
                  <td>
                    <span class="badge" :class="c.usedBy ? '' : 'badge-success'">{{ c.usedBy ? '已使用' : '未使用' }}</span>
                  </td>
                  <td class="hide-mobile text-muted tabular">{{ c.createdAt?.slice(0, 10) }}</td>
                  <td class="hide-mobile">{{ c.usedBy || '—' }}</td>
                  <td class="col-actions">
                    <button class="btn-icon sm danger" title="删除" aria-label="删除注册码" @click="handleDeleteCode(c)">
                      <Trash2 :size="15" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </template>

    <!-- Create user -->
    <AppModal v-model:open="showCreateUser" title="创建用户">
      <form id="create-user-form" class="modal-form" @submit.prevent="handleCreateUser">
        <div class="form-group">
          <label>用户名<span class="required">*</span></label>
          <input v-model="newUser.username" class="input" placeholder="2-20 字符" required />
        </div>
        <div class="form-group">
          <label>邮箱<span class="required">*</span></label>
          <input v-model="newUser.email" type="email" class="input" required />
        </div>
        <div class="form-group">
          <label>密码<span class="required">*</span></label>
          <input v-model="newUser.password" type="password" class="input" placeholder="至少 6 字符" autocomplete="new-password" required />
        </div>
        <div class="form-group">
          <label>角色</label>
          <select v-model="newUser.role" class="input">
            <option value="user">用户</option>
            <option value="admin">管理员</option>
          </select>
        </div>
        <div v-if="createUserMsg" class="alert alert-error">{{ createUserMsg }}</div>
      </form>
      <template #footer>
        <button type="button" class="btn btn-secondary" @click="showCreateUser = false">取消</button>
        <button type="submit" form="create-user-form" class="btn btn-primary" :disabled="creatingUser">
          <Loader2 v-if="creatingUser" :size="15" class="spin" />
          创建
        </button>
      </template>
    </AppModal>

    <!-- Reset password -->
    <AppModal
      :open="!!resetPwdUserId"
      title="重置密码"
      size="sm"
      @update:open="(v) => { if (!v) resetPwdUserId = null; }"
    >
      <form id="reset-pwd-form" class="modal-form" @submit.prevent="handleResetPassword">
        <p class="modal-desc">为用户 <strong>{{ resetPwdUsername }}</strong> 设置新密码</p>
        <div class="form-group">
          <label>新密码</label>
          <input v-model="resetPwdValue" type="password" class="input" placeholder="至少 6 字符" autocomplete="new-password" required />
        </div>
        <div v-if="resetPwdMsg" class="alert alert-error">{{ resetPwdMsg }}</div>
      </form>
      <template #footer>
        <button type="button" class="btn btn-secondary" @click="resetPwdUserId = null">取消</button>
        <button type="submit" form="reset-pwd-form" class="btn btn-primary" :disabled="resettingPwd">
          <Loader2 v-if="resettingPwd" :size="15" class="spin" />
          确认重置
        </button>
      </template>
    </AppModal>
  </div>
</template>

<style scoped>
.admin-tabs { margin-bottom: var(--space-lg); }

.card-desc { margin: -8px 0 var(--space-lg); font-size: 0.86rem; color: var(--color-text-muted); }

/* Loading skeleton */
.sk-line { height: 14px; margin-bottom: 12px; }
.sk-line.w40 { width: 40%; }
.sk-line.w70 { width: 70%; }
.sk-block { height: 38px; margin-top: 14px; }
.table-skeleton { display: flex; flex-direction: column; gap: 10px; padding: var(--space-md); }
.sk-row { height: 36px; }

/* Presets */
.preset-title { display: block; margin-bottom: 8px; }
.preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: var(--space-sm);
  margin-bottom: var(--space-lg);
}
.preset-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  text-align: left;
  cursor: pointer;
  transition: border-color var(--transition-fast), background var(--transition-fast), box-shadow var(--transition-fast);
}
.preset-card:hover { border-color: var(--color-accent); }
.preset-card.active {
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
  box-shadow: inset 0 0 0 1px var(--color-accent);
}
.preset-name { font-size: 0.86rem; font-weight: 600; }
.preset-model { font-family: var(--font-mono); font-size: 0.72rem; color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.preset-card.active .preset-name { color: var(--color-accent); }

/* Forms */
.settings-form { display: flex; flex-direction: column; gap: var(--space-lg); }
.option-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-md);
  border-radius: var(--radius-md);
  background: var(--color-bg-tertiary);
}
.option-row { display: flex; flex-direction: column; gap: 4px; }
.option-row .form-hint { padding-left: 46px; }
.think-level { padding-left: 46px; max-width: 460px; }
.btn-row { display: flex; align-items: center; gap: var(--space-sm); flex-wrap: wrap; }

.result-alert { margin-top: var(--space-md); }
.alert-icon { flex-shrink: 0; margin-top: 1px; }
.result-body { flex: 1; min-width: 0; }
.result-head { display: flex; align-items: center; gap: var(--space-sm); }
.latency { margin-left: auto; font-size: 0.76rem; opacity: 0.8; }
.result-msg { margin-top: 2px; color: var(--color-text-secondary); white-space: pre-wrap; word-break: break-all; }

.sub-section { margin-top: var(--space-lg); padding-top: var(--space-lg); border-top: 1px solid var(--color-border); }
.sub-title { font-size: 0.95rem; font-family: var(--font-sans); color: var(--color-text-secondary); margin-bottom: var(--space-sm); }
.inline-form { display: flex; align-items: center; gap: var(--space-sm); flex-wrap: wrap; }
.inline-form .input { flex: 1; min-width: 200px; }

/* Stats */
.stat-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-sm); margin-bottom: var(--space-md); }
.stat { display: flex; flex-direction: column; gap: 2px; }
.stat-num { font-family: var(--font-serif); font-size: 1.6rem; font-weight: 700; line-height: 1.2; color: var(--color-text-primary); }
.stat-num.ok { color: var(--color-success); }
.stat-num.muted { color: var(--color-text-muted); }
.stat-label { font-size: 0.78rem; color: var(--color-text-muted); }

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  flex-wrap: wrap;
  margin: var(--space-lg) 0 var(--space-sm);
}
.toolbar-title { margin-bottom: 0; }

/* Tables */
.table-card { padding: 0; overflow: hidden; }
.table-scroll { overflow-x: auto; }
.col-actions { width: 1%; white-space: nowrap; text-align: right; }
td.col-actions { display: table-cell; }
.col-actions .btn-icon + .btn-icon { margin-left: 2px; }

.user-cell { display: flex; align-items: center; gap: 10px; min-width: 0; }
.avatar {
  display: grid; place-items: center; flex-shrink: 0;
  width: 30px; height: 30px; border-radius: 50%;
  background: var(--color-accent-soft); color: var(--color-accent);
  font-family: var(--font-serif); font-weight: 700; font-size: 0.85rem;
}
.user-text { display: flex; flex-direction: column; min-width: 0; }
.user-name { font-weight: 600; }
.user-email { font-size: 0.74rem; color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

tr.used td { color: var(--color-text-muted); }
.code-text {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 3px 6px; margin-left: -6px;
  border: none; border-radius: var(--radius-sm);
  background: transparent; color: inherit; cursor: pointer;
}
.code-text:hover { background: var(--color-bg-tertiary); color: var(--color-accent); }
.code-copy { opacity: 0; transition: opacity var(--transition-fast); }
.code-text:hover .code-copy { opacity: 1; }
.mono { font-family: var(--font-mono); font-size: 0.84rem; letter-spacing: 0.02em; }

/* Generate */
.gen-card .section-title { margin-bottom: var(--space-sm); }
.gen-form .input.gen-input { flex: 0 0 90px; min-width: 0; text-align: center; }
.just-generated {
  margin-top: var(--space-md);
  padding: var(--space-sm) var(--space-md) var(--space-md);
  border: 1px dashed var(--color-accent);
  border-radius: var(--radius-md);
  background: var(--color-accent-soft);
}
.jg-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-sm); margin-bottom: var(--space-sm); min-height: 30px; }
.code-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.code-chip { font-family: var(--font-mono); font-size: 0.8rem; border-color: var(--color-accent); color: var(--color-accent); }

/* Modals */
.modal-form { display: flex; flex-direction: column; gap: var(--space-md); }
.modal-desc { font-size: 0.88rem; color: var(--color-text-secondary); }

@media (max-width: 640px) {
  .admin-tabs { display: flex; width: 100%; }
  .admin-tabs .tab { flex: 1; justify-content: center; padding: 0 8px; font-size: 0.8rem; }
  .preset-grid { grid-template-columns: repeat(2, 1fr); }
  .option-row .form-hint, .think-level { padding-left: 0; }
  .btn-row .btn { flex: 1; }
  .inline-form { flex-direction: column; align-items: stretch; }
  .inline-form .input { min-width: 0; }
  .gen-form { flex-direction: row; align-items: center; }
  .gen-form .btn { flex: 1; }
  .stat-num { font-size: 1.3rem; }
  .filter-tabs { flex: 1; }
  .filter-tabs .tab { flex: 1; justify-content: center; padding: 0 8px; }
  .table th, .table td { padding: 9px 10px; }
}
</style>
