<script setup lang="ts">
// Compact 四柱 table for get_bazi_chart results (parsed YAML).
import { computed } from 'vue';
import { wuxingOf } from '../../../utils/fortune';

const props = defineProps<{ data: Record<string, any> }>();

const KEYS = ['year', 'month', 'day', 'hour'] as const;
const LABEL = { year: '年柱', month: '月柱', day: '日柱', hour: '时柱' };

const pillars = computed(() => KEYS.map((k) => {
  const p = props.data.pillars?.[k] || {};
  return {
    key: k, label: LABEL[k],
    gan: p.gan || '', zhi: p.zhi || '',
    ganTenGod: k === 'day' ? '日主' : (p.ganTenGod || ''),
    hide: (p.hideGanDetail || []).map((h: any) => ({ gan: h.gan, tenGod: h.tenGod })),
    naYin: p.naYin || '', diShi: p.diShi || '',
  };
}));

const counts = computed(() => {
  const list: { element: string; count: number; status?: string }[] = props.data.wuXingAnalysis?.counts || [];
  const max = Math.max(1, ...list.map((c) => c.count));
  return list.map((c) => ({ ...c, pct: (c.count / max) * 100, wx: wuxingOf(c.element) }));
});

// Skip the leading 童限 entry (no 干支 before the first 大运)
const daYun = computed<any[]>(() => (props.data.daYun || []).filter((d: any) => d.gan && d.zhi).slice(0, 10));
const cur = computed(() => props.data.currentDaYun);
const isCur = (d: any) => cur.value && d.gan === cur.value.gan && d.zhi === cur.value.zhi && d.startAge === cur.value.startAge;
</script>

<template>
  <div class="tv">
    <div class="bz-table">
      <div v-for="p in pillars" :key="p.key" class="bz-col" :class="{ day: p.key === 'day' }">
        <small class="bz-label">{{ p.label }}</small>
        <span class="bz-god">{{ p.ganTenGod }}</span>
        <span class="bz-char" :class="`wx-${wuxingOf(p.gan)}`">{{ p.gan }}</span>
        <span class="bz-char" :class="`wx-${wuxingOf(p.zhi)}`">{{ p.zhi }}</span>
        <span class="bz-hide">
          <span v-for="h in p.hide" :key="h.gan"><b :class="`wx-${wuxingOf(h.gan)}`">{{ h.gan }}</b>{{ h.tenGod }}</span>
        </span>
        <small class="bz-meta">{{ p.naYin }}</small>
        <small class="bz-meta">{{ p.diShi }}</small>
      </div>
    </div>

    <div v-if="counts.length" class="bz-wx">
      <div v-for="c in counts" :key="c.element" class="bz-wx-row">
        <span class="bz-wx-el" :class="`wx-${c.wx}`">{{ c.element }}</span>
        <div class="tv-bar"><i :style="{ width: `${c.pct}%`, background: `var(--wx-${c.wx}-bar)` }" /></div>
        <span class="tv-muted tabular">{{ c.count }}</span>
        <span class="tv-muted">{{ c.status }}</span>
      </div>
      <div class="tv-row">
        <span v-if="data.wuXingAnalysis?.dayMasterStrength" class="tv-chip accent">{{ data.wuXingAnalysis.dayMasterStrength }}</span>
        <span v-if="data.wuXingAnalysis?.missing?.length" class="tv-chip bad">缺 {{ data.wuXingAnalysis.missing.join('') }}</span>
        <span v-if="data.wuXingAnalysis?.dominant" class="tv-chip">最旺 {{ data.wuXingAnalysis.dominant }}</span>
      </div>
    </div>

    <template v-if="daYun.length">
      <div class="tv-section-label">大运</div>
      <div class="bz-dayun tv-scroll-x">
        <div v-for="d in daYun" :key="`${d.gan}${d.zhi}${d.startAge}`" class="bz-dy" :class="{ cur: isCur(d) }">
          <span class="serif"><b :class="`wx-${wuxingOf(d.gan)}`">{{ d.gan }}</b><b :class="`wx-${wuxingOf(d.zhi)}`">{{ d.zhi }}</b></span>
          <small>{{ d.startAge }}–{{ d.endAge }}</small>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.bz-table { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.bz-col {
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  padding: 8px 4px 9px; border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-bg-tertiary) 55%, transparent);
  border: 1px solid transparent;
}
.bz-col.day { border-color: color-mix(in srgb, var(--color-accent) 35%, var(--color-border)); background: var(--color-accent-soft); }
.bz-label { font-size: 0.68rem; letter-spacing: 0.1em; color: var(--color-text-muted); }
.bz-god { font-size: 0.72rem; color: var(--color-accent); min-height: 1.1em; }
.bz-char { font-family: var(--font-serif); font-size: 1.75rem; font-weight: 700; line-height: 1.1; }
.bz-hide { display: flex; flex-direction: column; align-items: center; gap: 1px; font-size: 0.7rem; color: var(--color-text-secondary); min-height: 2.6em; }
.bz-hide b { font-family: var(--font-serif); margin-right: 2px; }
.bz-meta { font-size: 0.7rem; color: var(--color-text-muted); }

.bz-wx { display: flex; flex-direction: column; gap: 5px; }
.bz-wx-row { display: grid; grid-template-columns: 1.6em 1fr 1.6em 1.6em; gap: 8px; align-items: center; }
.bz-wx-el { font-family: var(--font-serif); font-weight: 700; text-align: center; }

.bz-dayun { display: flex; gap: 6px; padding-bottom: 2px; }
.bz-dy {
  display: flex; flex-direction: column; align-items: center; flex-shrink: 0; min-width: 52px;
  padding: 5px 8px; border-radius: var(--radius-md); border: 1px solid var(--color-border); background: var(--color-bg-secondary);
}
.bz-dy .serif { font-size: 1rem; letter-spacing: 0.05em; }
.bz-dy small { font-size: 0.66rem; color: var(--color-text-muted); }
.bz-dy.cur { border-color: var(--color-accent); box-shadow: 0 0 0 2px var(--color-accent-soft); }

@media (max-width: 640px) {
  .bz-char { font-size: 1.4rem; }
}
</style>
