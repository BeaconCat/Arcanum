<script setup lang="ts">
/**
 * A tool call in the chat. Header: category seal, title, who it's about, a one-line gist and a
 * tiny preview — readable while collapsed. Body: 图示 (rich view) / 数据 (structured data) /
 * 解读 (manual tools' AI interpretation) tabs, plus a link into the full workbench.
 */
import { computed, ref, watch } from 'vue';
import { ChevronDown, Check, ArrowRight, RotateCcw } from 'lucide-vue-next';
import { load } from 'js-yaml';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import ToolDataView from './ToolDataView.vue';
import ToolView from './tool-views/ToolView.vue';
import ToolPreview from './tool-views/ToolPreview.vue';
import { CATEGORY_META, toolCategory, toolSubject, toolSummary, toolTitle, toolViewKind } from './tool-views/meta';
import type { ToolDisplay } from '../../../shared/types/tool-display.types';

const props = withDefaults(defineProps<{
  toolName?: string;
  args?: Record<string, unknown>;
  content: string;
  /** Engine data behind a manually-run tool; content is then the interpretation (markdown) */
  raw?: string;
  /** Result was recomputed from the stored args (old sessions saved only the call) */
  recomputed?: boolean;
  /** Structured payload for the rich view (sent by the server alongside the text result) */
  display?: ToolDisplay | null;
  expanded?: boolean;
  live?: boolean;
}>(), { expanded: false, live: false, display: null });

function parseYaml(text?: string): Record<string, any> | null {
  if (!text?.trim()) return null;
  try {
    const parsed = load(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, any> : null;
  } catch { return null; }
}

// With raw data present, content is the LLM interpretation → markdown
const result = computed(() => (props.raw ? null : parseYaml(props.content)));
const rawData = computed(() => parseYaml(props.raw));
/** Data the rich views read: engine output (manual tools) or the YAML result */
const viewData = computed(() => rawData.value || result.value);

const category = computed(() => toolCategory(props.toolName, props.display));
const meta = computed(() => CATEGORY_META[category.value]);
const title = computed(() => toolTitle(props.toolName));
const subject = computed(() => toolSubject(props.display, viewData.value, props.args));
const summary = computed(() => toolSummary(props.toolName, props.display, viewData.value));
const viewKind = computed(() => toolViewKind(props.toolName, props.display, viewData.value));

const contentHtml = computed(() => DOMPurify.sanitize(marked.parse(props.content || '正在演算…') as string));
const hasArgs = computed(() => !!props.args && Object.keys(props.args).length > 0);

type Tab = 'view' | 'data' | 'reading';
const tabs = computed(() => {
  const t: { id: Tab; label: string }[] = [];
  if (props.raw) t.push({ id: 'reading', label: '解读' });
  if (viewKind.value) t.push({ id: 'view', label: '图示' });
  t.push({ id: 'data', label: '数据' });
  return t;
});
const tab = ref<Tab>(tabs.value[0].id);
watch(tabs, (t) => { if (!t.some((x) => x.id === tab.value)) tab.value = t[0].id; });

// Rich views open by default once a result is in; plain data stays collapsed
const open = ref(props.expanded);
</script>

<template>
  <article class="tc-card" :class="[{ open, live }, `cat-${category}`]" :style="{ '--tc-tone': meta.tone }">
    <button class="tc-head" type="button" :aria-expanded="open" @click="open = !open">
      <span class="tc-seal"><component :is="meta.icon" :size="17" /></span>
      <span class="tc-heading">
        <span class="tc-line1">
          <strong>{{ title }}</strong>
          <span v-if="subject" class="tc-subject">{{ subject }}</span>
          <span class="tc-kind">{{ meta.label }}</span>
        </span>
        <span class="tc-summary">{{ live && !content ? '正在演算…' : (summary || (raw ? '天枢已完成解读' : '演算完成，展开查看结果')) }}</span>
      </span>
      <ToolPreview v-if="!live" class="tc-preview" :kind="viewKind" :display="display" :data="viewData" :tool-name="toolName" />
      <span class="tc-badges">
        <span v-if="recomputed" class="tc-state recomputed" title="旧版本当时只保存了调用记录，这里按原参数重新演算"><RotateCcw :size="11" />重算</span>
        <span v-if="live" class="tc-state live"><i class="tc-spinner" />演算中</span>
        <span v-else class="tc-state done"><Check :size="11" />完成</span>
      </span>
      <ChevronDown :size="17" class="tc-chevron" :class="{ open }" />
    </button>
    <div v-if="live" class="tc-progress" aria-hidden="true"><i /></div>

    <div v-if="open" class="tc-body">
      <div v-if="tabs.length > 1" class="tc-tabs" role="tablist">
        <button
          v-for="t in tabs" :key="t.id" type="button" role="tab"
          class="tc-tab" :class="{ active: tab === t.id }" :aria-selected="tab === t.id" @click="tab = t.id"
        >{{ t.label }}</button>
      </div>

      <div v-if="tab === 'reading'" class="tc-reading markdown-body" v-html="contentHtml" />

      <div v-else-if="tab === 'view' && viewKind" class="tc-view">
        <ToolView :kind="viewKind" :display="display" :data="viewData" :tool-name="toolName" />
      </div>

      <div v-else class="tc-data">
        <section v-if="hasArgs" class="tc-section">
          <div class="tc-section-title">调用参数</div>
          <ToolDataView :data="args" />
        </section>
        <section class="tc-section">
          <div class="tc-section-title">{{ raw ? '演算数据' : '计算结果' }}</div>
          <ToolDataView v-if="raw ? rawData : result" :data="raw ? rawData : result" />
          <pre v-else-if="raw" class="tc-text tc-pre">{{ raw }}</pre>
          <div v-else class="tc-text markdown-body" v-html="contentHtml" />
        </section>
      </div>

      <router-link v-if="display?.link" :to="display.link.to" class="tc-link">
        {{ display.link.label }} <ArrowRight :size="14" />
      </router-link>
    </div>
  </article>
</template>

<style scoped>
.tc-card {
  --tc-tone: var(--color-accent);
  position: relative;
  width: 100%;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--tc-tone) 22%, var(--color-border));
  border-radius: var(--radius-lg);
  background: var(--color-bg-secondary);
  box-shadow: var(--shadow-sm);
  transition: box-shadow var(--transition-fast), border-color var(--transition-fast);
}
.tc-card::before {
  content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
  background: linear-gradient(180deg, var(--tc-tone), color-mix(in srgb, var(--tc-tone) 30%, transparent));
}
.tc-card.open { box-shadow: var(--shadow-md); }

.tc-head {
  width: 100%;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto auto 18px;
  align-items: center;
  gap: 11px;
  padding: 11px 13px 11px 15px;
  border: 0;
  background: linear-gradient(90deg, color-mix(in srgb, var(--tc-tone) 7%, var(--color-bg-secondary)), var(--color-bg-secondary) 55%);
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.tc-head:hover { background: color-mix(in srgb, var(--tc-tone) 9%, var(--color-bg-secondary)); }
.tc-seal {
  width: 38px; height: 38px; display: grid; place-items: center; border-radius: 10px;
  color: var(--tc-tone);
  background: color-mix(in srgb, var(--tc-tone) 12%, var(--color-bg-secondary));
  border: 1px solid color-mix(in srgb, var(--tc-tone) 28%, var(--color-border));
}
.tc-heading { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.tc-line1 { display: flex; align-items: center; gap: 7px; min-width: 0; }
.tc-line1 strong { font-family: var(--font-serif); font-size: 0.96rem; font-weight: 700; letter-spacing: 0.02em; white-space: nowrap; }
.tc-subject {
  padding: 1px 8px; border-radius: 999px; font-size: 0.7rem; font-weight: 600; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; max-width: 12em;
  color: var(--tc-tone); background: color-mix(in srgb, var(--tc-tone) 11%, transparent);
}
.tc-kind { font-size: 0.66rem; letter-spacing: 0.1em; color: var(--color-text-muted); white-space: nowrap; }
.tc-summary { font-size: 0.8rem; color: var(--color-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.tc-badges { display: flex; align-items: center; gap: 6px; }
.tc-state {
  display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 999px;
  font-size: 0.68rem; white-space: nowrap; border: 1px solid transparent;
}
.tc-state.done { color: var(--color-success); background: var(--color-success-soft); }
.tc-state.live { color: var(--color-warning); background: var(--color-warning-soft); }
.tc-state.recomputed { color: var(--color-info); background: var(--color-info-soft); cursor: help; }
.tc-spinner { width: 9px; height: 9px; border-radius: 50%; border: 1.5px solid currentColor; border-right-color: transparent; animation: spin 0.8s linear infinite; }
.tc-chevron { color: var(--color-text-muted); transition: transform var(--transition-fast); }
.tc-chevron.open { transform: rotate(180deg); }

.tc-progress { height: 2px; overflow: hidden; background: color-mix(in srgb, var(--tc-tone) 12%, transparent); }
.tc-progress i { display: block; width: 35%; height: 100%; background: var(--tc-tone); animation: tc-slide 1.3s ease-in-out infinite; }
@keyframes tc-slide { from { transform: translateX(-100%); } to { transform: translateX(300%); } }

.tc-body { display: flex; flex-direction: column; gap: 12px; padding: 12px 15px 15px 17px; border-top: 1px solid color-mix(in srgb, var(--color-border) 70%, transparent); }
.tc-tabs { display: inline-flex; align-self: flex-start; gap: 2px; padding: 3px; border-radius: var(--radius-md); background: var(--color-bg-tertiary); }
.tc-tab {
  height: 28px; padding: 0 14px; border: none; border-radius: 6px; background: transparent;
  color: var(--color-text-secondary); font-size: 0.8rem; font-weight: 500; cursor: pointer;
}
.tc-tab.active { background: var(--color-bg-secondary); color: var(--tc-tone); box-shadow: var(--shadow-sm); }

.tc-view { container-type: inline-size; min-width: 0; }
.tc-data { display: flex; flex-direction: column; gap: 12px; }
.tc-section { container-type: inline-size; }
.tc-section-title { margin-bottom: 7px; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; color: var(--color-text-muted); }
.tc-text {
  max-height: 460px; overflow: auto; padding: 10px 12px; border-radius: var(--radius-md);
  background: var(--color-bg-tertiary); color: var(--color-text-secondary); font-size: 0.8rem; line-height: 1.6;
}
.tc-pre { white-space: pre-wrap; font-family: var(--font-mono); font-size: 0.76rem; }
.tc-reading { font-size: 0.88rem; line-height: 1.75; }

.tc-link {
  align-self: flex-end; display: inline-flex; align-items: center; gap: 4px;
  padding: 5px 12px; border-radius: 999px; font-size: 0.8rem; font-weight: 600;
  color: var(--tc-tone); background: color-mix(in srgb, var(--tc-tone) 10%, transparent);
  transition: background var(--transition-fast);
}
.tc-link:hover { background: color-mix(in srgb, var(--tc-tone) 18%, transparent); }

@media (max-width: 640px) {
  .tc-head { grid-template-columns: 32px minmax(0, 1fr) auto 16px; gap: 9px; padding: 9px 10px 9px 12px; }
  .tc-seal { width: 32px; height: 32px; border-radius: 8px; }
  .tc-preview { display: none; }
  .tc-kind { display: none; }
  .tc-state.done { display: none; }
  .tc-body { padding: 10px 10px 12px 12px; }
}
@media (prefers-reduced-motion: reduce) {
  .tc-progress i, .tc-spinner { animation: none; }
}
</style>
