<script setup lang="ts">
import { ref, reactive, nextTick, onMounted, computed, watch } from 'vue';
import { storeToRefs } from 'pinia';
import {
  Send, Plus, Brain, Star, Compass, Sun, Calendar,
  ChevronDown, ChevronRight, Hexagon, Flower2, Shield, Search,
  Heart, Scroll, CalendarRange, PenTool, X, PanelLeft, Zap,
  ImageDown, Clock, Flame, ImagePlus, Navigation, BookOpen, Square,
  Copy, Check, ArrowDown, Wrench, Sparkles, Orbit, ScrollText, SunMedium,
  CalendarDays, Layers, BookMarked, HeartHandshake, Grid3x3, Map as MapIcon, Type, Users,
} from 'lucide-vue-next';
import { snapdom } from '@zumer/snapdom';
import { Marked } from 'marked';
import DOMPurify from 'dompurify';
import { useChatStore } from '../stores/use-chat-store';
import { QUICK_TOOLS, QUICK_TOOL_CATEGORIES, type QuickToolDef, type QuickToolCategory } from '../../shared/constants/quick-tools';
import { resolveQuickTool, paramDefault } from '../utils/quick-tools';
import { useProfileStore } from '../stores/use-profile-store';
import { useFeedback } from '../composables/useFeedback';
import type { Profile } from '../../shared/types/profile.types';
import ChatErrorCard from '../components/chat/ChatErrorCard.vue';
import { useAuthStore } from '../stores/use-auth-store';
import ToolCallCard from '../components/chat/ToolCallCard.vue';
import SessionList from '../components/chat/SessionList.vue';
import AppModal from '../components/common/AppModal.vue';
import BrandMark from '../components/common/BrandMark.vue';

const { toast, confirm } = useFeedback();

// Conversations live in the chat store: replies keep streaming (server-side runs over a
// self-healing WebSocket) while this page is closed, and several sessions can run at once.
const chat = useChatStore();
const { messages, sessions, runningIds, currentSessionId: sessionId } = storeToRefs(chat);
/** The conversation on screen is waiting for / receiving a reply */
const streaming = computed(() => chat.busy);

const message = ref('');
const pendingImages = ref<string[]>([]);  // base64 data URIs
const fileInputRef = ref<HTMLInputElement | null>(null);
const inputRef = ref<HTMLTextAreaElement | null>(null);
const messagesEl = ref<HTMLElement | null>(null);
const enableThinking = ref(false);
const toolsOpen = ref(false);
const tokenEstimate = computed(() => chat.current?.tokenEstimate || 0);
const mobileDrawerOpen = ref(false);
const fcMode = ref(true);

const currentTitle = computed(() =>
  sessions.value.find((s) => s.sessionId === sessionId.value)?.title || '新对话',
);

// ── Export (button-triggered single / multi-select) ──
const exportMode = ref(false);
const selectedIndexes = ref<Set<number>>(new Set());

function enterExportMode(i: number) {
  if (!messages.value.length) {
    toast.info('当前会话暂无可导出的消息');
    return;
  }
  exportMode.value = true;
  selectedIndexes.value = i >= 0 ? new Set([i]) : new Set();
}
function toggleSelect(i: number) {
  if (!exportMode.value) return;
  const s = new Set(selectedIndexes.value);
  s.has(i) ? s.delete(i) : s.add(i);
  selectedIndexes.value = s;
}
function selectAll() {
  selectedIndexes.value = new Set(messages.value.map((_, i) => i));
}
function cancelExportMode() {
  exportMode.value = false;
  selectedIndexes.value = new Set();
}

const EXPORT_WIDTH = 600;
const exporting = ref(false);

async function exportSelected() {
  const indexes = [...selectedIndexes.value].sort((a, b) => a - b);
  if (!indexes.length || !messagesEl.value) return;
  exporting.value = true;

  const container = messagesEl.value;
  const allBubbles = container.querySelectorAll<HTMLElement>(':scope > .chat-bubble');

  // 1. Hide non-selected bubbles, remove export visual classes
  const hidden: HTMLElement[] = [];
  allBubbles.forEach((el, i) => {
    if (!indexes.includes(i)) {
      el.style.display = 'none';
      hidden.push(el);
    } else {
      el.classList.remove('export-mode', 'selected');
    }
  });

  // 2. Also hide the empty-state placeholder if present
  const emptyEl = container.querySelector<HTMLElement>(':scope > .chat-empty');
  if (emptyEl) emptyEl.style.display = 'none';

  // 3. Force container to fixed width for clean export
  const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--color-bg-secondary').trim() || '#fffdf9';
  const origStyle = container.style.cssText;
  container.style.width = `${EXPORT_WIDTH}px`;
  container.style.maxWidth = `${EXPORT_WIDTH}px`;
  container.style.overflow = 'visible';
  container.style.height = 'auto';
  container.style.flex = 'none';
  container.classList.add('exporting');

  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  try {
    const result = await snapdom(container, { scale: 2, backgroundColor: bgColor });
    const img = await result.toPng();
    // Convert the PNG image to a downloadable blob with solid background
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    canvas.toBlob(blob => {
      if (blob) {
        downloadBlob(blob, `天枢对话-${Date.now()}.png`);
        toast.success('长图已导出');
      }
    }, 'image/png');
  } catch {
    toast.error('导出失败，请重试');
  } finally {
    // 4. Restore everything
    container.style.cssText = origStyle;
    container.classList.remove('exporting');
    hidden.forEach(el => el.style.display = '');
    if (emptyEl) emptyEl.style.display = '';
    exporting.value = false;
  }
  cancelExportMode();
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

const profileStore = useProfileStore();
const authStore = useAuthStore();

/** Retry a failed turn: resend the user message that preceded it. */
async function retryAt(i: number) {
  if (streaming.value) return;
  let u = i - 1;
  while (u >= 0 && messages.value[u].role !== 'user') u--;
  if (u < 0) return;
  const text = messages.value[u].content;
  // The server drops the failed exchange for the same question, so mirror that locally
  chat.truncate(u);
  message.value = text;
  await handleSend();
}
const currentProfileId = computed(() => profileStore.currentProfileId);

// Profile switch only affects prompt context (sent per-request).
// Session history is independent — no clearing needed.

/** lucide icons referenced by name in shared/constants/quick-tools.ts */
const QT_ICONS: Record<string, any> = {
  star: Star, compass: Compass, orbit: Orbit, flame: Flame, sparkles: Sparkles, 'book-open': BookOpen,
  'scroll-text': ScrollText, sun: Sun, 'calendar-range': CalendarRange, 'sun-medium': SunMedium,
  'calendar-days': CalendarDays, layers: Layers, hexagon: Hexagon, 'flower-2': Flower2, shield: Shield,
  search: Search, scroll: Scroll, calendar: Calendar, clock: Clock, 'book-marked': BookMarked,
  heart: Heart, 'heart-handshake': HeartHandshake, navigation: Navigation, 'grid-3x3': Grid3x3,
  map: MapIcon, type: Type, 'pen-tool': PenTool, users: Users,
};
const qtIcon = (t: QuickToolDef | null) => (t && QT_ICONS[t.icon]) || Sparkles;

// Welcome grid: 常用 + one tab per category
type QtTab = 'popular' | QuickToolCategory;
const QT_TABS: { id: QtTab; name: string }[] = [{ id: 'popular', name: '常用' }, ...QUICK_TOOL_CATEGORIES];
const qtTab = ref<QtTab>('popular');
const qtShown = computed(() => (qtTab.value === 'popular'
  ? QUICK_TOOLS.filter((t) => t.popular)
  : QUICK_TOOLS.filter((t) => t.category === qtTab.value)));
const qtByCategory = QUICK_TOOL_CATEGORIES.map((c) => ({ ...c, tools: QUICK_TOOLS.filter((t) => t.category === c.id) }));

const EXAMPLE_QUESTIONS = [
  '我今天适合做什么？有什么需要注意的？',
  '帮我看看今年的事业运和财运走势',
  '我的五行喜用神是什么？日常怎么补？',
  '最近感情上有些困惑，从命盘看该怎么调整？',
];

// ── Markdown rendering ──
// Local instance so chat's `breaks` option doesn't leak into other pages' global `marked`
const md = new Marked({ breaks: true, gfm: true });

// LLMs sometimes emit an odd number of ** on a line (e.g. **总结…记得**“…”**),
// which leaves a literal ** on screen. Drop the unmatched trailing one, skipping code fences.
function balanceStrong(src: string): string {
  let inFence = false;
  return src.split('\n').map((line) => {
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; return line; }
    if (inFence) return line;
    const count = line.match(/\*\*/g)?.length ?? 0;
    if (count % 2 === 0) return line;
    const i = line.lastIndexOf('**');
    return line.slice(0, i) + line.slice(i + 2);
  }).join('\n');
}

function fixStrong(src: string): string {
  // Insert zero-width space around ** so CommonMark flanking rules accept them next to CJK punctuation
  return balanceStrong(src)
    .replace(/(\*\*)([^\s*])/g, '$1​$2')
    .replace(/([^\s*])(\*\*)/g, '$1​$2');
}
function renderMd(src: string): string {
  if (!src) return '';
  return DOMPurify.sanitize(md.parse(fixStrong(src)) as string);
}
function renderThinkingMd(src: string): string {
  if (!src) return '';
  // Collapse excessive blank lines common in LLM thinking output
  const cleaned = src.replace(/\n{3,}/g, '\n\n').trim();
  return DOMPurify.sanitize(md.parse(fixStrong(cleaned)) as string);
}

function isLive(i: number) {
  return streaming.value && i === messages.value.length - 1;
}

// ── Copy ──
const copiedIdx = ref<number | null>(null);
async function copyMessage(i: number) {
  const text = messages.value[i]?.content || '';
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
  copiedIdx.value = i;
  toast.success('已复制到剪贴板');
  setTimeout(() => { if (copiedIdx.value === i) copiedIdx.value = null; }, 1800);
}

// ── Quick tools ──
// Every quick tool goes through the main function-calling chat: the server runs the tool(s)
// first (cards appear immediately) and 天枢 interprets them in the conversation.
const pendingTool = ref<QuickToolDef | null>(null);
const paramValues = reactive<Record<string, unknown>>({});
const pick = reactive<{ profile: string; profile2: string }>({ profile: '', profile2: '' });
const dialogError = ref('');
const profiles = computed<Profile[]>(() => profileStore.profiles);

function defaultProfileId(): string {
  const list = profiles.value;
  return (list.find((p) => p.profileId === currentProfileId.value) || list.find((p) => p.isPrimary) || list[0])?.profileId || '';
}

function needsDialog(t: QuickToolDef): boolean {
  return !!t.params?.length || t.subject === 'pair';
}

async function runTool(t: QuickToolDef) {
  if (streaming.value) return;
  toolsOpen.value = false;
  if (t.subject && !profiles.value.length) await profileStore.loadProfiles().catch(() => {});
  if (t.subject && !profiles.value.length) {
    toast.warning('请先在「命盘档案」里创建档案');
    return;
  }
  if (needsDialog(t)) {
    openToolDialog(t);
    return;
  }
  await launchTool(t);
}

function openToolDialog(t: QuickToolDef) {
  Object.keys(paramValues).forEach((k) => delete paramValues[k]);
  for (const p of t.params || []) paramValues[p.key] = paramDefault(p);
  pick.profile = defaultProfileId();
  pick.profile2 = profiles.value.find((p) => p.profileId !== pick.profile)?.profileId || '';
  dialogError.value = '';
  pendingTool.value = t;
}

function cancelToolDialog() {
  pendingTool.value = null;
}

async function confirmToolDialog() {
  const t = pendingTool.value;
  if (!t) return;
  const missing = (t.params || []).find((p) => p.required && (paramValues[p.key] === '' || paramValues[p.key] === undefined || paramValues[p.key] === null));
  if (missing) { dialogError.value = `请填写「${missing.label}」`; return; }
  if (t.subject && !pick.profile) { dialogError.value = '请选择命主'; return; }
  if (t.subject === 'pair') {
    if (!pick.profile2) { dialogError.value = '请选择对方档案'; return; }
    if (pick.profile2 === pick.profile) { dialogError.value = '甲乙双方不能是同一个人'; return; }
  }
  pendingTool.value = null;
  await launchTool(t);
}

async function launchTool(t: QuickToolDef) {
  const byId = (id: string) => profiles.value.find((p) => p.profileId === id) || null;
  const { prompt, presetTools } = resolveQuickTool(t, {
    params: { ...paramValues },
    profile: t.subject ? byId(pick.profile || defaultProfileId()) : null,
    profile2: t.subject === 'pair' ? byId(pick.profile2) : null,
  });
  await sendFcPrompt(prompt, presetTools);
}

// ── Scrolling: follow the stream only while the user is near the bottom ──
const atBottom = ref(true);
const NEAR_BOTTOM_PX = 120;

function onMessagesScroll() {
  const el = messagesEl.value;
  if (!el) return;
  atBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
}

function scrollBottom(force = false) {
  if (!force && !atBottom.value) return;
  nextTick(() => {
    const el = messagesEl.value;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    atBottom.value = true;
  });
}

function jumpToBottom() {
  const el = messagesEl.value;
  if (!el) return;
  el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  atBottom.value = true;
}

onMounted(() => {
  // Back on the page: an in-progress (or just finished) conversation continues where it was;
  // otherwise open on the welcome screen with past sessions one click away in the sidebar
  chat.enterPage();
  scrollBottom(true);
});

// Follow the visible conversation as events arrive
watch(() => chat.tick, () => scrollBottom());

async function loadSession(sid: string) {
  cancelExportMode();
  try {
    await chat.openSession(sid);
    scrollBottom(true);
  } catch {
    toast.error('加载会话失败');
  }
}

function newSession() {
  cancelExportMode();
  chat.openWelcome();
  mobileDrawerOpen.value = false;
  nextTick(() => inputRef.value?.focus());
}

async function deleteSession(sid: string) {
  const title = sessions.value.find((s) => s.sessionId === sid)?.title || '该会话';
  const ok = await confirm({
    title: '删除会话',
    message: runningIds.value.has(sid)
      ? `「${title}」还在生成回复，删除会同时停止生成，聊天记录将无法恢复。`
      : `确定删除「${title}」吗？聊天记录将无法恢复。`,
    confirmText: '删除',
    danger: true,
  });
  if (!ok) return;
  try {
    await chat.deleteSession(sid);
    toast.success('会话已删除');
  } catch {
    toast.error('删除失败');
  }
}

function pickSession(sid: string) {
  mobileDrawerOpen.value = false;
  if (sid !== chat.currentKey) loadSession(sid);
}

/** Send a preset prompt through the function-calling chat (quick tools). */
async function sendFcPrompt(prompt: string, presetTools?: { name: string; args: Record<string, unknown> }[]) {
  if (streaming.value) return;
  scrollBottom(true);
  await chat.send({
    text: prompt, mode: 'fc', presetTools,
    enableThinking: enableThinking.value, profileId: currentProfileId.value || undefined,
  });
}

// ── Images ──
const MAX_IMAGE_BYTES = 50 * 1024 * 1024;

function addImageFile(file: File) {
  if (!file.type.startsWith('image/')) return;
  if (file.size > MAX_IMAGE_BYTES) { toast.warning(`图片 ${file.name || ''} 超过 50MB`); return; }
  const reader = new FileReader();
  reader.onload = () => {
    pendingImages.value = [...pendingImages.value, reader.result as string];
  };
  reader.readAsDataURL(file);
}

function triggerImageUpload() {
  fileInputRef.value?.click();
}

function handleImageSelect(e: Event) {
  const files = (e.target as HTMLInputElement).files;
  if (!files?.length) return;
  for (const file of Array.from(files)) addImageFile(file);
  (e.target as HTMLInputElement).value = '';
}

function handlePaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items;
  if (!items) return;
  let found = false;
  for (const item of Array.from(items)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile();
      if (f) { addImageFile(f); found = true; }
    }
  }
  if (found) e.preventDefault();
}

function removePendingImage(idx: number) {
  pendingImages.value = pendingImages.value.filter((_, i) => i !== idx);
}

function clearPendingImages() {
  pendingImages.value = [];
}

// ── Composer ──
const MAX_INPUT_HEIGHT = 200;

function autosize() {
  const el = inputRef.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  el.style.overflowY = el.scrollHeight > MAX_INPUT_HEIGHT ? 'auto' : 'hidden';
}
watch(message, () => nextTick(autosize));

function onInputKeydown(e: KeyboardEvent) {
  if (e.key !== 'Enter' || e.shiftKey) return;
  // IME composition (e.g. 拼音 selecting candidates) must not send
  if (e.isComposing || e.keyCode === 229) return;
  e.preventDefault();
  if (!streaming.value) handleSend();
}

const canSend = computed(() => !streaming.value && (!!message.value.trim() || pendingImages.value.length > 0));

function sendExample(q: string) {
  if (streaming.value) return;
  message.value = q;
  handleSend();
}

function stopStreaming() {
  chat.stop();
}

async function handleSend() {
  const text = message.value.trim();
  if (!text && !pendingImages.value.length) return;
  if (streaming.value) return;

  const imgs = [...pendingImages.value];
  message.value = '';
  pendingImages.value = [];
  scrollBottom(true);
  await chat.send({
    text, images: imgs, mode: fcMode.value ? 'fc' : 'plain',
    enableThinking: enableThinking.value, profileId: currentProfileId.value || undefined,
  });
}

const toolDialogOpen = computed({
  get: () => !!pendingTool.value,
  set: (v: boolean) => { if (!v) cancelToolDialog(); },
});
</script>

<template>
  <div class="chat-page">
    <!-- Session sidebar (desktop) -->
    <aside class="session-sidebar card">
      <SessionList
        :sessions="sessions"
        :active-id="sessionId"
        :running="runningIds"
        @select="pickSession"
        @remove="deleteSession"
        @create="newSession"
      />
    </aside>

    <!-- Main -->
    <section class="chat-main card">
      <header class="chat-top-bar">
        <button class="btn-icon sm drawer-btn" @click="mobileDrawerOpen = true" aria-label="会话列表" title="会话列表">
          <PanelLeft :size="18" />
        </button>
        <div class="top-title">
          <h1>{{ currentTitle }}</h1>
          <span v-if="profileStore.currentProfile" class="top-sub">
            命主 · {{ profileStore.currentProfile.name }}
          </span>
        </div>
        <div class="top-actions">
          <button
            class="mode-toggle"
            :class="{ active: fcMode }"
            :aria-pressed="fcMode"
            @click="fcMode = !fcMode"
            title="工具模式：AI 会按需自动调用命理计算工具"
          >
            <Zap :size="14" />
            <span>工具</span>
          </button>
          <button
            class="mode-toggle"
            :class="{ active: enableThinking }"
            :aria-pressed="enableThinking"
            @click="enableThinking = !enableThinking"
            title="深度思考：展示推理过程"
          >
            <Brain :size="14" />
            <span>思考</span>
          </button>
          <span class="top-divider" />
          <button class="btn-icon sm" @click="enterExportMode(-1)" title="选择消息导出长图" aria-label="导出长图">
            <ImageDown :size="17" />
          </button>
          <button class="btn-icon sm" @click="newSession" title="新对话" aria-label="新对话">
            <Plus :size="18" />
          </button>
        </div>
      </header>

      <div class="messages-wrap">
        <div ref="messagesEl" class="chat-messages" :class="{ 'export-active': exportMode && !exporting }" @scroll.passive="onMessagesScroll">
          <!-- Empty / welcome -->
          <div v-if="messages.length === 0" class="chat-empty">
            <div class="welcome">
              <BrandMark :size="52" />
              <h2>向天枢提问</h2>
              <p>
                结合
                <strong v-if="profileStore.currentProfile">{{ profileStore.currentProfile.name }}</strong>
                <template v-else>您</template>
                的命盘与当下运势，给出个性化的命理解读。
              </p>
            </div>

            <div class="examples">
              <button v-for="q in EXAMPLE_QUESTIONS" :key="q" class="example-btn" @click="sendExample(q)">
                <Sparkles :size="14" class="ex-icon" />
                <span>{{ q }}</span>
              </button>
            </div>

            <div class="tools-head">
              <div class="tools-heading"><Wrench :size="14" /> 命理工具</div>
              <div class="qt-tabs" role="tablist">
                <button
                  v-for="c in QT_TABS"
                  :key="c.id"
                  class="qt-tab"
                  :class="{ active: qtTab === c.id }"
                  role="tab"
                  :aria-selected="qtTab === c.id"
                  @click="qtTab = c.id"
                >{{ c.name }}</button>
              </div>
            </div>
            <div class="tool-grid">
              <button
                v-for="tool in qtShown"
                :key="tool.id"
                class="tool-card"
                :disabled="streaming"
                :title="tool.description"
                @click="runTool(tool)"
              >
                <span class="tool-icon"><component :is="qtIcon(tool)" :size="16" /></span>
                <span class="tool-text">
                  <strong>{{ tool.name }}<Users v-if="tool.subject === 'pair'" :size="12" class="tool-pair" aria-label="双人" /></strong>
                  <small>{{ tool.description }}</small>
                </span>
              </button>
            </div>
          </div>

          <div
            v-for="(msg, i) in messages"
            :key="i"
            class="chat-bubble"
            :class="[msg.role, { selected: selectedIndexes.has(i), 'export-mode': exportMode }]"
            @click="exportMode ? toggleSelect(i) : undefined"
          >
            <span v-if="exportMode && !exporting" class="select-dot" :class="{ on: selectedIndexes.has(i) }">
              <Check v-if="selectedIndexes.has(i)" :size="12" />
            </span>

            <!-- Tool call -->
            <ToolCallCard
              v-if="msg.role === 'tool'"
              :tool-name="msg.toolName"
              :args="msg.toolArgs"
              :content="msg.content"
              :raw="msg.toolRaw"
              :recomputed="msg.recomputed"
              :display="msg.toolDisplay"
              :expanded="!!msg.userTriggered"
              :live="streaming && !msg.content"
            />

            <!-- User -->
            <div v-else-if="msg.role === 'user'" class="user-bubble">
              <div v-if="msg.imagePreviews?.length" class="chat-images-row">
                <img v-for="(img, j) in msg.imagePreviews" :key="j" :src="img" class="chat-image-preview" alt="上传的图片" />
              </div>
              <div class="bubble-content markdown-body" v-html="renderMd(msg.content)"></div>
            </div>

            <!-- Assistant -->
            <template v-else>
              <div class="ai-avatar"><BrandMark :size="30" /></div>
              <div class="ai-body">
                <div v-if="msg.thinking?.trim() || (isLive(i) && msg.thinking !== undefined && !msg.content)" class="think-block" :class="{ open: msg.thinkingOpen }">
                  <button class="think-toggle-btn" @click.stop="msg.thinkingOpen = !msg.thinkingOpen">
                    <Brain :size="13" />
                    <span v-if="isLive(i) && !msg.content" class="thinking-live">思考中<span class="dots"><i /><i /><i /></span></span>
                    <span v-else>思考过程</span>
                    <component :is="msg.thinkingOpen ? ChevronDown : ChevronRight" :size="14" class="think-chevron" />
                  </button>
                  <div v-if="msg.thinkingOpen && msg.thinking?.trim()" class="think-content markdown-body" v-html="renderThinkingMd(msg.thinking || '')"></div>
                </div>

                <div v-if="msg.imagePreviews?.length" class="chat-images-row">
                  <img v-for="(img, j) in msg.imagePreviews" :key="j" :src="img" class="chat-image-preview" alt="图片" />
                </div>

                <div
                  v-if="msg.content"
                  class="bubble-content markdown-body"
                  :class="{ typing: isLive(i) }"
                  v-html="renderMd(msg.content)"
                ></div>
                <div v-else-if="isLive(i) && !msg.thinking?.trim() && !msg.error" class="typing-dots" aria-label="正在回复">
                  <i /><i /><i />
                </div>

                <ChatErrorCard
                  v-if="msg.error"
                  :error="msg.error"
                  :is-admin="authStore.isAdmin"
                  :can-retry="!streaming && !exportMode"
                  @retry="retryAt(i)"
                />

                <div v-if="msg.content && !isLive(i) && !exportMode" class="msg-actions">
                  <button class="msg-action" @click.stop="copyMessage(i)" :title="copiedIdx === i ? '已复制' : '复制'">
                    <component :is="copiedIdx === i ? Check : Copy" :size="13" />
                    <span>{{ copiedIdx === i ? '已复制' : '复制' }}</span>
                  </button>
                  <button class="msg-action" @click.stop="enterExportMode(i)" title="导出为图片">
                    <ImageDown :size="13" />
                    <span>导出</span>
                  </button>
                </div>
              </div>
            </template>
          </div>
        </div>

        <Transition name="fade-up">
          <button v-if="!atBottom && messages.length" class="jump-bottom" @click="jumpToBottom" aria-label="回到底部">
            <ArrowDown :size="16" />
          </button>
        </Transition>
      </div>

      <!-- Composer -->
      <div class="chat-bottom">
        <Transition name="fade-up">
          <div class="tool-bar" v-if="toolsOpen">
            <div class="tool-bar-head">
              <span>快捷工具</span>
              <small>服务端先演算，再由天枢解读</small>
            </div>
            <div class="tool-bar-groups">
              <div v-for="g in qtByCategory" :key="g.id" class="tool-bar-group">
                <span class="tool-bar-cat">{{ g.name }}</span>
                <div class="tool-bar-chips">
                  <button
                    v-for="tool in g.tools"
                    :key="tool.id"
                    class="chip tool-chip"
                    :disabled="streaming"
                    :title="tool.description"
                    @click="runTool(tool)"
                  >
                    <component :is="qtIcon(tool)" :size="13" />
                    {{ tool.name }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Transition>

        <form @submit.prevent="handleSend" class="composer" :class="{ busy: streaming }">
          <!-- Image preview strip -->
          <div v-if="pendingImages.length" class="image-preview-strip">
            <div v-for="(img, idx) in pendingImages" :key="idx" class="image-thumb-wrap">
              <img :src="img" class="image-thumb" alt="待发送图片" />
              <button type="button" class="image-remove-btn" @click="removePendingImage(idx)" aria-label="移除图片"><X :size="12" /></button>
            </div>
            <button v-if="pendingImages.length > 1" type="button" class="image-clear-all" @click="clearPendingImages">全部清除</button>
          </div>

          <textarea
            ref="inputRef"
            v-model="message"
            class="composer-input"
            rows="1"
            :placeholder="streaming ? '天枢正在回复…' : '问问天枢：今天运势如何？'"
            @keydown="onInputKeydown"
            @paste="handlePaste"
          ></textarea>

          <div class="composer-bar">
            <div class="composer-tools">
              <button type="button" class="btn-icon sm" :class="{ on: toolsOpen }" @click="toolsOpen = !toolsOpen" title="命理工具" aria-label="命理工具">
                <Wrench :size="17" />
              </button>
              <button type="button" class="btn-icon sm" @click="triggerImageUpload" title="上传图片（也可直接粘贴）" aria-label="上传图片">
                <ImagePlus :size="17" />
              </button>
              <input ref="fileInputRef" type="file" accept="image/*" multiple hidden @change="handleImageSelect" />
              <span v-if="tokenEstimate" class="token-hint" title="当前会话上下文估算">≈{{ tokenEstimate < 1000 ? '<1' : Math.round(tokenEstimate / 1000) }}k tokens</span>
            </div>
            <button v-if="!streaming" type="submit" class="send-btn" :disabled="!canSend" aria-label="发送">
              <Send :size="16" />
            </button>
            <button v-else type="button" class="send-btn stop" @click="stopStreaming" title="停止生成" aria-label="停止生成">
              <Square :size="13" fill="currentColor" />
            </button>
          </div>
        </form>
        <p class="composer-note"><span class="hide-mobile">Enter 发送 · Shift+Enter 换行 · </span>AI 解读仅供参考，重要决定请理性判断</p>
      </div>
    </section>

    <!-- Mobile session drawer -->
    <Teleport to="body">
      <Transition name="drawer">
        <div v-if="mobileDrawerOpen" class="chat-drawer-overlay" @click.self="mobileDrawerOpen = false">
          <aside class="chat-drawer">
            <div class="chat-drawer-header">
              <h3>会话列表</h3>
              <button class="btn-icon sm" @click="mobileDrawerOpen = false" aria-label="关闭"><X :size="18" /></button>
            </div>
            <SessionList
              :sessions="sessions"
              :active-id="sessionId"
              :running="runningIds"
              @select="pickSession"
              @remove="deleteSession"
              @create="newSession"
            />
          </aside>
        </div>
      </Transition>
    </Teleport>

    <!-- Exporting loading overlay -->
    <Teleport to="body">
      <div v-if="exporting" class="export-loading-overlay">
        <div class="export-loading-content">
          <span class="export-spinner" />
          <span>正在生成长图…</span>
        </div>
      </div>
    </Teleport>

    <!-- Export action bar -->
    <Teleport to="body">
      <Transition name="bar">
        <div v-if="exportMode && !exporting" class="export-action-bar">
          <span class="export-count">已选 <strong>{{ selectedIndexes.size }}</strong> 条</span>
          <button class="btn btn-ghost btn-sm" @click="selectAll">全选</button>
          <button class="btn btn-secondary btn-sm" @click="cancelExportMode">取消</button>
          <button class="btn btn-primary btn-sm" :disabled="selectedIndexes.size === 0" @click="exportSelected">
            <ImageDown :size="14" /> 导出长图
          </button>
        </div>
      </Transition>
    </Teleport>

    <!-- Tool param dialog -->
    <AppModal v-model:open="toolDialogOpen" :title="pendingTool?.name" size="md">
      <template v-if="pendingTool">
        <div class="tool-dialog-intro">
          <span class="tool-icon lg"><component :is="qtIcon(pendingTool)" :size="18" /></span>
          <p>{{ pendingTool.description }}<br /><small class="text-muted">提交后会先运行对应的演算工具，再由天枢在对话中解读。</small></p>
        </div>

        <form class="tool-form" @submit.prevent="confirmToolDialog">
          <div v-if="pendingTool.subject" class="form-group">
            <label>{{ pendingTool.subject === 'pair' ? '甲方' : '命主' }}</label>
            <select v-model="pick.profile" class="input">
              <option v-for="p in profiles" :key="p.profileId" :value="p.profileId">
                {{ p.name }}（{{ p.relation }}，{{ p.birthDate }}）
              </option>
            </select>
          </div>
          <div v-if="pendingTool.subject === 'pair'" class="form-group">
            <label>乙方</label>
            <select v-model="pick.profile2" class="input">
              <option value="" disabled>请选择</option>
              <option v-for="p in profiles" :key="p.profileId" :value="p.profileId" :disabled="p.profileId === pick.profile">
                {{ p.name }}（{{ p.relation }}，{{ p.birthDate }}）
              </option>
            </select>
          </div>

          <div v-for="p in pendingTool.params || []" :key="p.key" class="form-group">
            <label>
              {{ p.label }}
              <span v-if="p.required" class="required">*</span>
            </label>
            <input v-if="p.type === 'text'" v-model="paramValues[p.key]" class="input" type="text" :placeholder="p.placeholder || ''" />
            <input v-else-if="p.type === 'number'" v-model.number="paramValues[p.key]" class="input" type="number" :placeholder="p.placeholder || ''" />
            <input v-else-if="p.type === 'year'" v-model.number="paramValues[p.key]" class="input" type="number" min="1850" max="2200" step="1" />
            <input v-else-if="p.type === 'date'" v-model="paramValues[p.key]" class="input" type="date" />
            <select v-else-if="p.type === 'select'" v-model="paramValues[p.key]" class="input">
              <option v-for="opt in p.options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
            <span v-if="p.hint" class="form-hint">{{ p.hint }}</span>
          </div>
          <p v-if="dialogError" class="alert alert-error">{{ dialogError }}</p>
          <button type="submit" hidden />
        </form>
      </template>
      <template #footer>
        <button class="btn btn-secondary" @click="cancelToolDialog">取消</button>
        <button class="btn btn-primary" @click="confirmToolDialog">
          <component :is="qtIcon(pendingTool)" :size="15" />
          开始演算
        </button>
      </template>
    </AppModal>
  </div>
</template>

<style scoped>
/* ═══ Layout ═══ */
.chat-page {
  display: flex;
  gap: var(--space-md);
  height: 100%;
  min-height: 0;
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
}

.session-sidebar {
  width: 248px;
  flex-shrink: 0;
  padding: 12px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.chat-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
}

/* ═══ Top bar ═══ */
.chat-top-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px 10px 18px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.drawer-btn { display: none; }
.top-title { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.top-title h1 {
  font-family: var(--font-serif);
  font-size: 1.02rem;
  font-weight: 700;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.top-sub { font-size: 0.72rem; color: var(--color-text-muted); }
.top-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.top-divider { width: 1px; height: 20px; background: var(--color-border); margin: 0 2px; }

.mode-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 11px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}
.mode-toggle:hover { color: var(--color-text-primary); border-color: var(--color-text-muted); }
.mode-toggle.active {
  background: var(--color-accent-soft);
  border-color: color-mix(in srgb, var(--color-accent) 45%, transparent);
  color: var(--color-accent);
}

/* ═══ Messages ═══ */
.messages-wrap { position: relative; flex: 1; min-height: 0; display: flex; }
.chat-messages {
  container: chatmsgs / inline-size;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 24px 20px 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  background: var(--color-bg-secondary);
  scroll-behavior: auto;
}
.chat-messages.exporting { padding: 24px 22px; }

.chat-bubble {
  position: relative;
  display: flex;
  gap: 12px;
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
  font-size: 0.93rem;
  line-height: 1.75;
  animation: fadeIn 0.25s ease;
}
.chat-bubble.user { justify-content: flex-end; }
.chat-bubble.tool { max-width: 840px; }

/* User bubble */
.user-bubble {
  max-width: min(78%, 620px);
  padding: 10px 15px;
  border-radius: 18px 18px 6px 18px;
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  box-shadow: var(--shadow-sm);
}
.user-bubble .markdown-body { line-height: 1.65; }
.user-bubble :deep(.markdown-body strong),
.user-bubble :deep(strong) { color: inherit; }
.user-bubble :deep(blockquote) {
  border-left-color: currentColor;
  color: inherit;
  background: rgba(255, 255, 255, 0.12);
}
.user-bubble :deep(code) { background: rgba(255, 255, 255, 0.18); }
.user-bubble :deep(a) { color: inherit; }

/* Assistant */
.ai-avatar { flex-shrink: 0; padding-top: 2px; }
.ai-body { flex: 1; min-width: 0; color: var(--color-text-primary); }
.ai-body .bubble-content { max-width: 70ch; }
.ai-body .bubble-content :deep(p) { margin: 0.5em 0; }
.ai-body .bubble-content :deep(blockquote) { font-family: var(--font-serif); }
.ai-body .bubble-content :deep(h1),
.ai-body .bubble-content :deep(h2),
.ai-body .bubble-content :deep(h3) { margin-top: 1em; }

/* Typing caret on the last block while streaming */
.bubble-content.typing :deep(> *:last-child)::after {
  content: '';
  display: inline-block;
  width: 7px;
  height: 1.05em;
  margin-left: 3px;
  vertical-align: -0.15em;
  border-radius: 1px;
  background: var(--color-accent);
  animation: caret 1s steps(2, start) infinite;
}
@keyframes caret { to { visibility: hidden; } }

.typing-dots, .dots { display: inline-flex; align-items: center; gap: 4px; }
.typing-dots { height: 30px; padding: 0 2px; }
.typing-dots i, .dots i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-accent);
  opacity: 0.35;
  animation: dot 1.2s ease-in-out infinite;
}
.dots { gap: 2px; margin-left: 2px; }
.dots i { width: 3px; height: 3px; background: currentColor; }
.typing-dots i:nth-child(2), .dots i:nth-child(2) { animation-delay: 0.15s; }
.typing-dots i:nth-child(3), .dots i:nth-child(3) { animation-delay: 0.3s; }
@keyframes dot { 0%, 80%, 100% { opacity: 0.25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }

/* Thinking */
.think-block {
  margin-bottom: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-primary);
  overflow: hidden;
  max-width: 70ch;
}
.think-toggle-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 7px 12px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 0.78rem;
  text-align: left;
  cursor: pointer;
}
.think-toggle-btn:hover { color: var(--color-text-secondary); }
.think-chevron { margin-left: auto; }
.thinking-live { display: inline-flex; align-items: center; color: var(--color-accent); }
.think-content {
  padding: 4px 14px 12px 30px;
  max-height: 360px;
  overflow-y: auto;
  border-top: 1px dashed var(--color-border);
  font-size: 0.8rem;
  line-height: 1.6;
  color: var(--color-text-muted);
}
.think-content :deep(strong) { color: var(--color-text-secondary); }

/* Message actions */
.msg-actions {
  display: flex;
  gap: 2px;
  margin-top: 6px;
  margin-left: -6px;
  opacity: 0;
  transition: opacity var(--transition-fast);
}
.chat-bubble:hover .msg-actions, .msg-actions:focus-within { opacity: 1; }
@media (hover: none) { .msg-actions { opacity: 1; } }
.msg-action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 0.74rem;
  cursor: pointer;
}
.msg-action:hover { background: var(--color-bg-tertiary); color: var(--color-text-primary); }

/* Images */
.chat-images-row { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
.chat-image-preview {
  max-width: 220px;
  max-height: 160px;
  border-radius: var(--radius-md);
  object-fit: cover;
}

/* Export selection */
.chat-bubble.export-mode { cursor: pointer; user-select: none; padding: 8px; margin-top: -8px; margin-bottom: -8px; border-radius: var(--radius-lg); transition: background var(--transition-fast); }
.chat-bubble.export-mode:hover { background: var(--color-bg-tertiary); }
.chat-bubble.export-mode.selected { background: var(--color-accent-soft); box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--color-accent) 55%, transparent); }
.chat-messages.export-active .chat-bubble { padding-left: 38px; }
.select-dot {
  position: absolute;
  left: 10px;
  top: 12px;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border: 1.5px solid var(--color-border-strong);
  border-radius: 50%;
  background: var(--color-bg-secondary);
  color: var(--color-accent-contrast);
}
.select-dot.on { background: var(--color-accent); border-color: var(--color-accent); }

/* Jump to bottom */
.jump-bottom {
  position: absolute;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  background: var(--color-bg-elevated);
  color: var(--color-text-secondary);
  box-shadow: var(--shadow-md);
  cursor: pointer;
}
.jump-bottom:hover { color: var(--color-accent); border-color: var(--color-accent); }

/* ═══ Empty / welcome ═══ */
.chat-empty {
  width: 100%;
  max-width: 760px;
  margin: auto;
  padding: 12px 0 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.welcome { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; }
.welcome h2 { font-family: var(--font-serif); font-size: 1.5rem; letter-spacing: 0.08em; margin-top: 4px; }
.welcome p { max-width: 440px; font-size: 0.9rem; color: var(--color-text-muted); line-height: 1.7; }
.welcome strong { color: var(--color-accent); }

.examples {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  width: 100%;
  margin-top: 26px;
}
.example-btn {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-primary);
  color: var(--color-text-secondary);
  font-size: 0.86rem;
  line-height: 1.5;
  text-align: left;
  cursor: pointer;
  transition: all var(--transition-fast);
}
.example-btn:hover { border-color: color-mix(in srgb, var(--color-accent) 50%, transparent); color: var(--color-text-primary); background: var(--color-accent-soft); }
.ex-icon { flex-shrink: 0; margin-top: 3px; color: var(--color-accent); }

.tools-heading {
  display: flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  margin: 28px 0 10px;
  font-size: 0.76rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: var(--color-text-muted);
}
.tool-grid {
  display: grid;
  /* Fixed 4 / 2 columns (every tab holds a multiple of 4 tools) so the last row is always full */
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  width: 100%;
}
@container chatmsgs (max-width: 720px) {
  .tool-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
.tool-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  text-align: left;
  cursor: pointer;
  transition: all var(--transition-fast);
}
.tool-card:hover { border-color: color-mix(in srgb, var(--color-accent) 50%, transparent); box-shadow: var(--shadow-sm); transform: translateY(-1px); }
.tool-icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 8px;
  background: var(--color-accent-soft);
  color: var(--color-accent);
}
.tool-icon.lg { width: 40px; height: 40px; border-radius: 10px; }
.tool-text { display: flex; flex-direction: column; min-width: 0; }
.tool-text strong { font-size: 0.84rem; font-weight: 600; color: var(--color-text-primary); }
.tool-text strong { display: inline-flex; align-items: center; gap: 4px; }
/* Two lines instead of a one-line ellipsis — descriptions were getting cut off */
.tool-text small {
  font-size: 0.72rem; line-height: 1.4; color: var(--color-text-muted);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.tool-pair { color: var(--color-text-muted); }
.tool-card:disabled { opacity: 0.55; cursor: not-allowed; transform: none; box-shadow: none; }

.tools-head { align-self: stretch; display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin: 28px 0 10px; }
.tools-head .tools-heading { margin: 0; align-self: center; }
.qt-tabs { display: flex; gap: 2px; padding: 3px; border-radius: var(--radius-full); background: var(--color-bg-tertiary); overflow-x: auto; scrollbar-width: none; }
.qt-tabs::-webkit-scrollbar { display: none; }
.qt-tab {
  flex-shrink: 0; height: 26px; padding: 0 11px; border: none; border-radius: var(--radius-full);
  background: transparent; color: var(--color-text-secondary); font-size: 0.76rem; cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}
.qt-tab:hover { color: var(--color-text-primary); }
.qt-tab.active { background: var(--color-bg-secondary); color: var(--color-accent); font-weight: 600; box-shadow: var(--shadow-sm); }

/* ═══ Composer ═══ */
.chat-bottom {
  flex-shrink: 0;
  /* Room + stacking above .chat-messages (a containment context that paints over siblings),
     otherwise the composer's 3px focus ring gets clipped along its top edge */
  position: relative;
  z-index: 1;
  padding: 4px 16px 10px;
  background: var(--color-bg-secondary);
}
.tool-bar {
  max-width: 800px;
  margin: 0 auto 8px;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-primary);
}
.tool-bar-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 8px; }
.tool-bar-head span { font-size: 0.78rem; font-weight: 600; color: var(--color-text-secondary); }
.tool-bar-head small { font-size: 0.7rem; color: var(--color-text-muted); }
.tool-bar-groups { display: flex; flex-direction: column; gap: 8px; max-height: 240px; overflow-y: auto; }
.tool-bar-group { display: grid; grid-template-columns: 64px 1fr; gap: 8px; align-items: start; }
.tool-bar-cat { padding-top: 6px; font-size: 0.72rem; font-weight: 600; color: var(--color-text-muted); letter-spacing: 0.06em; }
.tool-bar-chips { display: flex; flex-wrap: wrap; gap: 6px; }
@media (max-width: 640px) { .tool-bar-group { grid-template-columns: 1fr; gap: 4px; } .tool-bar-cat { padding-top: 0; } }
.tool-chip { height: 28px; padding: 0 10px; font-size: 0.76rem; }

.composer {
  max-width: 800px;
  margin: 0 auto;
  border: 1px solid var(--color-border-strong);
  border-radius: 18px;
  background: var(--color-bg-elevated);
  box-shadow: var(--shadow-sm);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}
.composer:focus-within { border-color: var(--color-accent); box-shadow: var(--focus-ring); }
.composer-input {
  display: block;
  width: 100%;
  min-height: 46px;
  max-height: 200px;
  padding: 13px 16px 4px;
  border: none;
  outline: none;
  resize: none;
  overflow-y: hidden;
  background: transparent;
  color: var(--color-text-primary);
  font-size: 0.94rem;
  line-height: 1.6;
}
.composer-input::placeholder { color: var(--color-text-muted); }
.composer-input:focus-visible { box-shadow: none; }
.composer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 8px 8px;
}
.composer-tools { display: flex; align-items: center; gap: 2px; min-width: 0; }
.composer-tools .btn-icon.on { background: var(--color-accent-soft); color: var(--color-accent); }
.token-hint { margin-left: 6px; font-size: 0.7rem; color: var(--color-text-muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
.send-btn {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border: none;
  border-radius: 50%;
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  cursor: pointer;
  transition: background var(--transition-fast), transform var(--transition-fast), opacity var(--transition-fast);
}
.send-btn:hover:not(:disabled) { background: var(--color-accent-hover); }
.send-btn:active:not(:disabled) { transform: scale(0.92); }
.send-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.send-btn.stop { background: var(--color-text-primary); color: var(--color-bg-secondary); }
.composer-note { margin-top: 6px; text-align: center; font-size: 0.68rem; color: var(--color-text-muted); }

/* Pending images */
.image-preview-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 10px 12px 0;
}
.image-thumb-wrap { position: relative; }
.image-thumb {
  width: 58px;
  height: 58px;
  object-fit: cover;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}
.image-remove-btn {
  position: absolute;
  top: -6px;
  right: -6px;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  background: var(--color-bg-elevated);
  color: var(--color-text-muted);
  cursor: pointer;
  box-shadow: var(--shadow-sm);
}
.image-remove-btn:hover { color: var(--color-error); border-color: var(--color-error); }
.image-clear-all {
  border: none;
  background: none;
  color: var(--color-text-muted);
  font-size: 0.75rem;
  cursor: pointer;
}
.image-clear-all:hover { color: var(--color-error); }

/* Tool dialog */
.tool-dialog-intro {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  margin-bottom: 16px;
  border-radius: var(--radius-md);
  background: var(--color-bg-tertiary);
}
.tool-dialog-intro p { font-size: 0.86rem; color: var(--color-text-secondary); line-height: 1.6; }
.tool-form { display: flex; flex-direction: column; gap: 14px; }

/* Transitions */
.fade-up-enter-active, .fade-up-leave-active { transition: opacity 160ms ease, transform 160ms ease; }
.fade-up-enter-from, .fade-up-leave-to { opacity: 0; transform: translate(-50%, 6px); }
.tool-bar.fade-up-enter-from, .tool-bar.fade-up-leave-to { transform: translateY(6px); }

/* ═══ Responsive ═══ */
@media (max-width: 1024px) {
  .session-sidebar { width: 216px; }
}

@media (max-width: 860px) {
  .session-sidebar { display: none; }
  .drawer-btn { display: inline-flex; }
}

@media (max-width: 640px) {
  .chat-page { gap: 0; }
  .chat-main { border-radius: var(--radius-lg); }
  .chat-top-bar { padding: 8px 8px 8px 6px; gap: 6px; }
  .top-title h1 { font-size: 0.95rem; }
  .mode-toggle { padding: 0 9px; height: 28px; }
  .mode-toggle span { display: none; }
  .top-divider { display: none; }

  .chat-messages { padding: 16px 12px 24px; gap: 16px; }
  .chat-bubble { font-size: 0.92rem; gap: 8px; }
  .ai-avatar :deep(svg) { width: 24px; height: 24px; }
  .user-bubble { max-width: 88%; padding: 9px 13px; }
  .think-content { max-height: 220px; }

  .examples { grid-template-columns: 1fr; margin-top: 18px; }
  .tool-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .welcome h2 { font-size: 1.3rem; }

  .chat-bottom { padding: 0 8px 8px; }
  /* ≥16px avoids iOS auto-zoom on focus */
  .composer-input { font-size: 16px; padding: 11px 14px 2px; }
  .composer-note { display: none; }
  .chat-image-preview { max-width: 160px; max-height: 120px; }
}
</style>

<style>
/* Teleported elements (global) */
.chat-drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-drawer);
  background: var(--color-overlay);
  backdrop-filter: blur(2px);
}
.chat-drawer {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 300px;
  max-width: 84vw;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 12px calc(12px + env(safe-area-inset-bottom));
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border);
  box-shadow: var(--shadow-lg);
}
.chat-drawer-header { display: flex; align-items: center; justify-content: space-between; padding: 2px 2px 4px 6px; }
.chat-drawer-header h3 { font-family: var(--font-serif); font-size: 1.02rem; }
.chat-drawer > :last-child { flex: 1; min-height: 0; }
.drawer-enter-active, .drawer-leave-active { transition: opacity 200ms ease; }
.drawer-enter-active .chat-drawer, .drawer-leave-active .chat-drawer { transition: transform 240ms cubic-bezier(.2,.8,.2,1); }
.drawer-enter-from, .drawer-leave-to { opacity: 0; }
.drawer-enter-from .chat-drawer, .drawer-leave-to .chat-drawer { transform: translateX(-100%); }

.export-action-bar {
  position: fixed;
  bottom: calc(24px + env(safe-area-inset-bottom));
  left: 50%;
  transform: translateX(-50%);
  z-index: calc(var(--z-modal) - 1);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px 8px 18px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-bg-elevated);
  box-shadow: var(--shadow-lg);
}
.export-count { margin-right: 4px; font-size: 0.84rem; color: var(--color-text-secondary); white-space: nowrap; }
.export-count strong { color: var(--color-accent); }
.bar-enter-active, .bar-leave-active { transition: opacity 180ms ease, transform 200ms ease; }
.bar-enter-from, .bar-leave-to { opacity: 0; transform: translate(-50%, 12px); }
@media (max-width: 640px) {
  .export-action-bar { bottom: calc(12px + env(safe-area-inset-bottom)); gap: 4px; padding: 6px 6px 6px 14px; }
}

.export-loading-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-toast);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-overlay);
  backdrop-filter: blur(4px);
}
.export-loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 22px 28px;
  border-radius: var(--radius-xl);
  background: var(--color-bg-elevated);
  box-shadow: var(--shadow-lg);
  color: var(--color-text-secondary);
  font-size: 0.9rem;
}
.export-spinner {
  width: 28px;
  height: 28px;
  border: 2.5px solid var(--color-accent-soft-strong);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
</style>
