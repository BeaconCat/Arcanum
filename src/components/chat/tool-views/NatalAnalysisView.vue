<script setup lang="ts">
// get_natal_analysis: saved 本命详解 report — key points per section, full text on demand.
import { computed, ref } from 'vue';
import { Marked } from 'marked';
import DOMPurify from 'dompurify';

const props = defineProps<{ data: Record<string, any> }>();
const md = new Marked({ gfm: true, breaks: true });

const sections = computed(() => Object.entries((props.data['报告'] || {}) as Record<string, any>).map(([key, v]) => ({
  key, title: v?.['标题'] || key, points: (v?.['要点'] || []) as string[], body: String(v?.['正文'] || ''),
})));
const open = ref<string | null>(null);
const html = (s: string) => DOMPurify.sanitize(md.parse(s) as string);
const pointHtml = (s: string) => DOMPurify.sanitize(md.parseInline(s) as string);
</script>

<template>
  <div class="tv">
    <div v-if="data['生成时间']" class="tv-muted">生成于 {{ String(data['生成时间']).slice(0, 10) }}</div>
    <div v-for="s in sections" :key="s.key" class="na-sec">
      <div class="na-title">{{ s.title }}</div>
      <ul class="na-points">
        <li v-for="(p, i) in s.points" :key="i" v-html="pointHtml(p)" />
      </ul>
      <button v-if="s.body" type="button" class="na-more" @click="open = open === s.key ? null : s.key">
        {{ open === s.key ? '收起全文' : '展开全文' }}
      </button>
      <div v-if="open === s.key" class="markdown-body na-body" v-html="html(s.body)" />
    </div>
  </div>
</template>

<style scoped>
.na-sec { padding: 10px 12px; border-radius: var(--radius-md); background: color-mix(in srgb, var(--color-bg-tertiary) 55%, transparent); }
.na-title { font-family: var(--font-serif); font-weight: 700; margin-bottom: 4px; }
.na-points { display: flex; flex-direction: column; gap: 3px; padding-left: 1.1em; list-style: disc; font-size: 0.82rem; line-height: 1.6; color: var(--color-text-secondary); }
.na-points li::marker { color: var(--color-accent); }
.na-more { margin-top: 6px; border: none; background: none; padding: 0; color: var(--color-accent); font-size: 0.78rem; cursor: pointer; }
.na-body { margin-top: 8px; font-size: 0.84rem; }
</style>
