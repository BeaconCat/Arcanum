<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { BookOpenText, ChevronDown, Search, RefreshCw, Lightbulb, X } from 'lucide-vue-next';
import EmptyState from '../common/EmptyState.vue';
import { apiGetAstroInterpretation, type AstroInterpretRequest } from '../../api/astro-interpret.api';
import { errorMessage } from '../../composables/useFeedback';
import type { AstroInterpretation, AstroInterpretationItem } from '../../../shared/types/astro-interpret.types';

/*
 * 星盘解读面板：根据盘型与参数请求原创文案解读，分组折叠展示，可搜索。
 * 点击条目会 emit('focus', refs)，父组件可用来高亮盘面上的行星。
 */
const props = defineProps<{ request: AstroInterpretRequest | null }>();
const emit = defineEmits<{ focus: [refs: string[]] }>();

const data = ref<AstroInterpretation | null>(null);
const loading = ref(false);
const error = ref('');
const query = ref('');
const collapsed = ref<Set<string>>(new Set());
const activeKey = ref('');
let seq = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

async function load() {
  const req = props.request;
  if (!req?.a) { data.value = null; return; }
  const id = ++seq;
  loading.value = true;
  error.value = '';
  try {
    const r = await apiGetAstroInterpretation(req);
    if (id !== seq) return;
    data.value = r;
    // Long sections start collapsed so the panel stays scannable
    collapsed.value = new Set(r.sections.filter((s, i) => i > 1 && s.items.length > 6).map((s) => s.key));
  } catch (err) {
    if (id !== seq) return;
    error.value = errorMessage(err, '解读加载失败');
  } finally {
    if (id === seq) loading.value = false;
  }
}

// Debounce: date/time pickers can change several times in a row
watch(() => JSON.stringify(props.request), () => {
  clearTimeout(timer);
  timer = setTimeout(load, 250);
}, { immediate: true });
onBeforeUnmount(() => clearTimeout(timer));

const q = computed(() => query.value.trim().toLowerCase());
const matches = (it: AstroInterpretationItem) =>
  !q.value || [it.title, it.text, it.advice || '', ...it.keywords].some((s) => s.toLowerCase().includes(q.value));

const sections = computed(() => (data.value?.sections || [])
  .map((s) => ({ ...s, items: s.items.filter(matches) }))
  .filter((s) => s.items.length));
const total = computed(() => sections.value.reduce((n, s) => n + s.items.length, 0));

function toggle(key: string) {
  const s = new Set(collapsed.value);
  s.has(key) ? s.delete(key) : s.add(key);
  collapsed.value = s;
}
const isOpen = (key: string) => !!q.value || !collapsed.value.has(key);

function pick(it: AstroInterpretationItem) {
  activeKey.value = activeKey.value === it.key + it.title ? '' : it.key + it.title;
  if (it.refs?.length) emit('focus', it.refs);
}
</script>

<template>
  <div class="interp">
    <header class="ip-head">
      <div class="ip-title">
        <BookOpenText :size="18" class="text-accent" />
        <div>
          <h3>{{ data?.title || '星盘解读' }}</h3>
          <p v-if="data?.subtitle" class="ip-sub">{{ data.subtitle }}</p>
        </div>
      </div>
      <div class="ip-tools">
        <label class="ip-search">
          <Search :size="15" />
          <input v-model="query" class="ip-search-input" placeholder="搜索关键词，如“事业”“金星”" aria-label="搜索解读" />
          <button v-if="query" class="ip-clear" aria-label="清空搜索" @click="query = ''"><X :size="14" /></button>
        </label>
        <button class="btn-icon sm" :disabled="loading" title="刷新解读" aria-label="刷新解读" @click="load">
          <RefreshCw :size="16" :class="{ spin: loading }" />
        </button>
      </div>
    </header>

    <div v-if="loading && !data" class="ip-skeleton">
      <div v-for="i in 4" :key="i" class="skeleton ip-sk-row" />
    </div>

    <EmptyState v-else-if="error" compact title="解读加载失败" :description="error">
      <template #actions><button class="btn btn-secondary btn-sm" @click="load">重试</button></template>
    </EmptyState>

    <EmptyState v-else-if="!data" compact title="暂无解读" description="选择命主后即可查看对应的解读。" />

    <template v-else>
      <p v-if="q" class="ip-count">找到 {{ total }} 条相关解读</p>
      <EmptyState v-if="!sections.length" compact title="没有匹配的解读" description="换个关键词试试。" />

      <section v-for="s in sections" :key="s.key" class="ip-section" :class="{ dim: loading }">
        <button class="ip-sec-head" :aria-expanded="isOpen(s.key)" @click="toggle(s.key)">
          <span class="ip-sec-title">{{ s.title }}</span>
          <span class="badge">{{ s.items.length }}</span>
          <ChevronDown :size="16" class="ip-chev" :class="{ open: isOpen(s.key) }" />
        </button>
        <div v-show="isOpen(s.key)" class="ip-items">
          <article
            v-for="it in s.items"
            :key="it.key + it.title"
            class="ip-item"
            :class="{ active: activeKey === it.key + it.title }"
            tabindex="0"
            @click="pick(it)"
            @keydown.enter="pick(it)"
          >
            <div class="ip-item-head">
              <h4>{{ it.title }}</h4>
              <span v-if="it.note" class="ip-note">{{ it.note }}</span>
            </div>
            <div class="ip-kws">
              <span v-for="k in it.keywords" :key="k" class="ip-kw">{{ k }}</span>
            </div>
            <p class="ip-text">{{ it.text }}</p>
            <p v-if="it.advice" class="ip-advice"><Lightbulb :size="14" /> {{ it.advice }}</p>
          </article>
        </div>
      </section>

      <p class="ip-disclaimer">{{ data.disclaimer }}</p>
    </template>
  </div>
</template>

<style scoped>
.interp { display: flex; flex-direction: column; gap: var(--space-md); }
.ip-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-md); flex-wrap: wrap; }
.ip-title { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.ip-title :deep(svg) { margin-top: 4px; flex-shrink: 0; }
.ip-title h3 { font-family: var(--font-serif); font-size: 1.08rem; }
.ip-sub { font-size: 0.8rem; color: var(--color-text-muted); margin-top: 2px; }
.ip-tools { display: flex; align-items: center; gap: 6px; flex: 1 1 260px; justify-content: flex-end; }
.ip-search {
  display: flex; align-items: center; gap: 6px; flex: 1; max-width: 320px;
  height: 34px; padding: 0 8px 0 10px;
  border: 1px solid var(--color-border-strong); border-radius: var(--radius-full);
  background: var(--color-bg-secondary); color: var(--color-text-muted);
}
.ip-search:focus-within { border-color: var(--color-accent); box-shadow: var(--focus-ring); }
.ip-search-input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; color: var(--color-text-primary); font-size: 0.85rem; }
.ip-clear { display: grid; place-items: center; width: 22px; height: 22px; border: none; border-radius: 50%; background: var(--color-bg-tertiary); color: var(--color-text-muted); cursor: pointer; }

.ip-skeleton { display: flex; flex-direction: column; gap: 10px; }
.ip-sk-row { height: 64px; }
.ip-count { font-size: 0.8rem; color: var(--color-text-muted); }

.ip-section { border: 1px solid var(--color-border); border-radius: var(--radius-lg); overflow: hidden; transition: opacity var(--transition-fast); }
.ip-section.dim { opacity: 0.6; }
.ip-sec-head {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 11px 14px; border: none; cursor: pointer; text-align: left;
  background: color-mix(in srgb, var(--color-bg-tertiary) 55%, var(--color-bg-secondary));
  color: var(--color-text-primary);
}
.ip-sec-head:hover { background: var(--color-bg-tertiary); }
.ip-sec-title { font-family: var(--font-serif); font-weight: 700; font-size: 0.95rem; }
.ip-chev { margin-left: auto; color: var(--color-text-muted); transition: transform var(--transition-fast); }
.ip-chev.open { transform: rotate(180deg); }

.ip-items { display: flex; flex-direction: column; }
.ip-item {
  padding: 12px 14px 13px; border-top: 1px solid var(--color-border);
  cursor: pointer; transition: background var(--transition-fast);
}
.ip-item:hover { background: color-mix(in srgb, var(--color-accent-soft) 50%, transparent); }
.ip-item.active { background: var(--color-accent-soft); box-shadow: inset 3px 0 0 var(--color-accent); }
.ip-item:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--color-accent); }
.ip-item-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.ip-item-head h4 { font-size: 0.92rem; font-weight: 650; color: var(--color-text-primary); }
.ip-note { font-size: 0.72rem; color: var(--color-text-muted); }
.ip-kws { display: flex; flex-wrap: wrap; gap: 5px; margin: 6px 0 6px; }
.ip-kw {
  padding: 1px 8px; border-radius: var(--radius-full); font-size: 0.72rem;
  background: var(--color-accent-soft); color: var(--color-accent);
}
.ip-text { font-size: 0.88rem; line-height: 1.75; color: var(--color-text-secondary); }
.ip-advice {
  display: flex; align-items: flex-start; gap: 6px; margin-top: 7px;
  padding: 6px 10px; border-radius: var(--radius-md);
  background: var(--color-success-soft); color: var(--color-success); font-size: 0.82rem; line-height: 1.55;
}
.ip-advice :deep(svg) { flex-shrink: 0; margin-top: 3px; }
.ip-disclaimer { font-size: 0.74rem; color: var(--color-text-muted); line-height: 1.6; }

@media (max-width: 640px) {
  .ip-tools { justify-content: stretch; }
  .ip-search { max-width: none; }
  .ip-item { padding: 11px 12px; }
}
</style>
