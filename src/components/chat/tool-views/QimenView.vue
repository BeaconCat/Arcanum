<script setup lang="ts">
// qi_men: four layered boards (年/月/日/时) as small cards + overall verdict.
import { computed } from 'vue';

const props = defineProps<{ data: Record<string, any> }>();

const LAYERS = [
  { key: 'yearStar', label: '年盘', hint: '大环境' },
  { key: 'monthStar', label: '月盘', hint: '近期' },
  { key: 'dayStar', label: '日盘', hint: '今日' },
  { key: 'timeStar', label: '时盘', hint: '此刻' },
];
const GOOD_DOORS = ['开', '休', '生'];
const tone = (luck?: string) => (luck?.includes('吉') ? 'good' : luck?.includes('凶') ? 'bad' : '');

const boards = computed(() => LAYERS.map((l) => ({ ...l, s: props.data[l.key] || {} })));
</script>

<template>
  <div class="tv">
    <div class="qm-grid">
      <div v-for="b in boards" :key="b.key" class="qm-card" :class="tone(b.s.luck)">
        <div class="qm-top"><b>{{ b.label }}</b><small>{{ b.hint }}</small></div>
        <strong class="serif">{{ b.s.qiMen }}星</strong>
        <span class="qm-door" :class="{ good: GOOD_DOORS.includes(b.s.baMen) }">{{ b.s.baMen }}门</span>
        <small class="tv-muted">{{ b.s.position }}</small>
        <span class="tv-chip" :class="tone(b.s.luck)">{{ b.s.luck }}</span>
      </div>
    </div>
    <div class="tv-row">
      <span class="tv-chip" :class="tone(data.overallLuck)">综合 <b>{{ data.overallLuck }}</b></span>
      <span class="tv-chip accent">方位 {{ data.direction }}</span>
      <span v-if="data.question" class="tv-muted">问：{{ data.question }}</span>
    </div>
  </div>
</template>

<style scoped>
.qm-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.qm-card {
  display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center;
  padding: 10px 6px; border-radius: var(--radius-md); border: 1px solid var(--color-border); background: var(--color-bg-secondary);
}
.qm-card.good { border-color: color-mix(in srgb, var(--color-ji) 35%, var(--color-border)); }
.qm-card.bad { border-color: color-mix(in srgb, var(--color-xiong) 35%, var(--color-border)); }
.qm-top { display: flex; gap: 6px; align-items: baseline; font-size: 0.78rem; }
.qm-top small { color: var(--color-text-muted); font-size: 0.68rem; }
.qm-card strong { font-size: 1.05rem; }
.qm-door { font-size: 0.82rem; font-weight: 600; color: var(--color-text-secondary); }
.qm-door.good { color: var(--color-ji); }
@media (max-width: 640px) { .qm-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
