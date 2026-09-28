<script setup lang="ts">
// compare_bazi: 甲方 / 乙方 side by side.
import { computed } from 'vue';
import { wuxingOf } from '../../../utils/fortune';

const props = defineProps<{ data: Record<string, any> }>();

const sides = computed(() => (['甲方', '乙方'] as const).map((k) => {
  const s = props.data[k] || {};
  const counts: any[] = s.wuXingAnalysis?.counts || [];
  const max = Math.max(1, ...counts.map((c) => c.count));
  return {
    k,
    name: String(s['对象'] || k).split(/[（(]/)[0],
    pillars: String(s['八字'] || '').split(/\s+/).filter(Boolean),
    dayMaster: s['日主'], wx: s['五行'], naYin: s['纳音'], zodiac: s['生肖'],
    strength: s.wuXingAnalysis?.dayMasterStrength,
    missing: s.wuXingAnalysis?.missing || [],
    counts: counts.map((c) => ({ ...c, pct: (c.count / max) * 100, key: wuxingOf(c.element) })),
  };
}));
</script>

<template>
  <div class="tv">
    <div class="cb-grid">
      <div v-for="s in sides" :key="s.k" class="cb-side">
        <div class="cb-head"><small>{{ s.k }}</small><b>{{ s.name }}</b></div>
        <div class="cb-pillars">
          <span v-for="(p, i) in s.pillars" :key="i" class="serif" :class="{ day: i === 2 }">
            <b :class="`wx-${wuxingOf(p[0])}`">{{ p[0] }}</b><b :class="`wx-${wuxingOf(p[1])}`">{{ p[1] }}</b>
          </span>
        </div>
        <div class="tv-row">
          <span class="tv-chip accent">日主 {{ s.dayMaster }}{{ s.wx }}</span>
          <span v-if="s.strength" class="tv-chip">{{ s.strength }}</span>
          <span class="tv-chip">属{{ s.zodiac }}</span>
          <span class="tv-chip">{{ s.naYin }}</span>
          <span v-if="s.missing.length" class="tv-chip bad">缺{{ s.missing.join('') }}</span>
        </div>
        <div class="cb-wx">
          <div v-for="c in s.counts" :key="c.element" class="cb-wx-row">
            <span :class="`wx-${c.key}`">{{ c.element }}</span>
            <div class="tv-bar"><i :style="{ width: `${c.pct}%`, background: `var(--wx-${c.key}-bar)` }" /></div>
            <small class="tabular">{{ c.count }}</small>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cb-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.cb-side { display: flex; flex-direction: column; gap: 9px; padding: 12px; border-radius: var(--radius-lg); border: 1px solid var(--color-border); background: var(--color-bg-secondary); min-width: 0; }
.cb-head { display: flex; align-items: baseline; gap: 8px; }
.cb-head small { font-size: 0.68rem; color: var(--color-text-muted); letter-spacing: 0.1em; }
.cb-head b { font-family: var(--font-serif); font-size: 1rem; }
.cb-pillars { display: flex; gap: 8px; font-size: 1.25rem; }
.cb-pillars span { display: flex; flex-direction: column; align-items: center; padding: 2px 5px; border-radius: 6px; line-height: 1.15; }
.cb-pillars span.day { background: var(--color-accent-soft); }
.cb-wx { display: flex; flex-direction: column; gap: 4px; }
.cb-wx-row { display: grid; grid-template-columns: 1.4em 1fr 1.4em; gap: 6px; align-items: center; font-size: 0.78rem; }
.cb-wx-row span { font-family: var(--font-serif); font-weight: 700; text-align: center; }
.cb-wx-row small { color: var(--color-text-muted); text-align: right; }
@media (max-width: 640px) { .cb-grid { grid-template-columns: 1fr; } }
</style>
