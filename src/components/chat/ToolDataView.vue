<script setup lang="ts">
import { computed } from 'vue';
import { labelFor, scalar } from './tool-views/labels';

defineOptions({ name: 'ToolDataView' });
const props = withDefaults(defineProps<{ data: unknown; depth?: number }>(), { depth: 0 });

const isObject = computed(() => props.data !== null && typeof props.data === 'object' && !Array.isArray(props.data));
const entries = computed(() => isObject.value ? Object.entries(props.data as Record<string, unknown>) : []);
const isPrimitiveArray = computed(() => Array.isArray(props.data) && props.data.every(v => v === null || typeof v !== 'object'));

function complex(value: unknown): boolean { return value !== null && typeof value === 'object'; }
</script>

<template>
  <div v-if="isObject" class="td-grid" :class="{ nested: depth > 0 }">
    <div v-for="([key, value]) in entries" :key="key" class="td-field" :class="{ wide: complex(value) }">
      <div class="td-label">{{ labelFor(key) }}</div>
      <ToolDataView v-if="complex(value)" :data="value" :depth="depth + 1" />
      <div v-else class="td-value">{{ scalar(value) }}</div>
    </div>
  </div>

  <div v-else-if="Array.isArray(data) && isPrimitiveArray" class="td-chips">
    <span v-for="(value, index) in data" :key="index" class="td-chip">{{ scalar(value) }}</span>
    <span v-if="!data.length" class="td-empty">暂无</span>
  </div>

  <div v-else-if="Array.isArray(data)" class="td-list">
    <div v-for="(value, index) in data" :key="index" class="td-list-item">
      <span class="td-index">{{ String(index + 1).padStart(2, '0') }}</span>
      <ToolDataView :data="value" :depth="depth + 1" />
    </div>
    <span v-if="!data.length" class="td-empty">暂无</span>
  </div>

  <span v-else class="td-value">{{ scalar(data) }}</span>
</template>

<style scoped>
.td-grid { display:flex; flex-wrap:wrap; gap:1px; background:color-mix(in srgb,var(--color-border) 72%,transparent); border:1px solid color-mix(in srgb,var(--color-border) 72%,transparent); border-radius:var(--radius-md); overflow:hidden; }
.td-grid.nested { border-color:color-mix(in srgb,var(--color-border) 48%,transparent); }
.td-field { flex:1 1 calc(25% - 1px); min-width:0; padding:9px 11px; background:color-mix(in srgb,var(--color-bg-secondary) 94%,var(--color-bg-tertiary)); }
.td-field.wide { flex-basis:100%; padding:10px 11px 11px; }
.td-label { margin-bottom:3px; color:var(--color-text-muted); font-size:.7rem; line-height:1.2; letter-spacing:.08em; text-transform:uppercase; }
.td-value { color:var(--color-text-primary); font-size:.81rem; line-height:1.48; overflow-wrap:anywhere; font-variant-numeric:tabular-nums; }
.td-chips { display:flex; flex-wrap:wrap; gap:5px; }
.td-chip { padding:3px 8px; border:1px solid color-mix(in srgb,var(--color-accent) 24%,var(--color-border)); border-radius:999px; background:color-mix(in srgb,var(--color-accent) 7%,var(--color-bg-secondary)); color:var(--color-text-secondary); font-size:.75rem; line-height:1.3; }
.td-list { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }
.td-list-item { display:grid; grid-template-columns:24px minmax(0,1fr); gap:5px; align-items:start; min-width:0; padding:6px; border:1px solid color-mix(in srgb,var(--color-border) 66%,transparent); border-radius:7px; background:color-mix(in srgb,var(--color-bg-secondary) 88%,transparent); }
.td-index { padding-top:2px; color:var(--color-accent); font-size:.68rem; font-variant-numeric:tabular-nums; letter-spacing:.04em; }
.td-empty { color:var(--color-text-muted); font-size:.76rem; }
@container (max-width:700px) { .td-field:not(.wide) { flex-basis:calc(50% - 1px); } }
@container (max-width:480px) { .td-field:not(.wide) { flex-basis:calc(50% - 1px); } }
@container (max-width:360px) { .td-list { grid-template-columns:1fr; } }
@container (max-width:230px) { .td-field:not(.wide) { flex-basis:100%; } }
</style>
