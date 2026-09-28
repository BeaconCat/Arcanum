<script setup lang="ts">
/**
 * 卦象 for liu_yao (six lines with 六亲/六神/世应/动爻) and mei_hua (trigrams + 体用).
 * Lines are drawn top (上爻) to bottom (初爻); a moving line shows its changed state on the right.
 */
import { computed } from 'vue';

const props = defineProps<{ data: Record<string, any>; mode: 'liuyao' | 'meihua' }>();

// Trigram lines bottom → top (1 = yang)
const TRIGRAM: Record<string, number[]> = {
  乾: [1, 1, 1], 兑: [1, 1, 0], 离: [1, 0, 1], 震: [1, 0, 0],
  巽: [0, 1, 1], 坎: [0, 1, 0], 艮: [0, 0, 1], 坤: [0, 0, 0],
};

interface Line {
  pos: number; yang: boolean; changedYang: boolean; moving: boolean;
  qin?: string; zhi?: string; wx?: string; shen?: string; shi?: boolean; ying?: boolean;
}

const lines = computed<Line[]>(() => {
  const d = props.data;
  if (props.mode === 'liuyao' && Array.isArray(d.yaoLines)) {
    return d.yaoLines.map((y: any) => ({
      pos: y.position, yang: y.yinYang === '阳', changedYang: y.changedYinYang === '阳', moving: !!y.isDong,
      qin: y.liuQin, zhi: y.diZhi, wx: y.wuXing, shen: y.liuShen, shi: y.isShi, ying: y.isYing,
    })).sort((a: Line, b: Line) => b.pos - a.pos);
  }
  const bits = [...(TRIGRAM[d.lowerGua?.name] || []), ...(TRIGRAM[d.upperGua?.name] || [])];
  if (bits.length !== 6) return [];
  return bits.map((b, i) => {
    const moving = Number(d.dongYao) === i + 1;
    return { pos: i + 1, yang: b === 1, changedYang: moving ? b !== 1 : b === 1, moving };
  }).reverse();
});

const hasChange = computed(() => lines.value.some((l) => l.moving));

const SYMBOL: Record<string, string> = { 乾: '☰', 兑: '☱', 离: '☲', 震: '☳', 巽: '☴', 坎: '☵', 艮: '☶', 坤: '☷' };
function trigramOf(bits: number[]): string {
  return Object.keys(TRIGRAM).find((k) => TRIGRAM[k].join() === bits.join()) || '';
}
/** 上卦 / 下卦 of the changed hexagram, derived from the drawn lines */
const bianParts = computed(() => {
  const up = lines.value.map((l) => (l.changedYang ? 1 : 0)).reverse(); // bottom → top
  if (up.length !== 6) return null;
  const lower = trigramOf(up.slice(0, 3));
  const upper = trigramOf(up.slice(3));
  return lower && upper ? { upper, lower } : null;
});
const benSub = computed(() => {
  const d = props.data;
  if (!d.upperGua?.name) return '';
  return `${d.upperGua.symbol || SYMBOL[d.upperGua.name] || ''}${d.upperGua.name}上 · ${d.lowerGua?.symbol || SYMBOL[d.lowerGua?.name] || ''}${d.lowerGua?.name}下`;
});
const bianSub = computed(() => {
  const b = bianParts.value;
  return b ? `${SYMBOL[b.upper]}${b.upper}上 · ${SYMBOL[b.lower]}${b.lower}下` : '';
});
const POS_NAME = ['', '初', '二', '三', '四', '五', '上'];
</script>

<template>
  <div class="tv">
    <!-- 梅花：本卦 / 变卦 side by side, headers sitting directly over their own lines -->
    <div v-if="mode === 'meihua'" class="hx-panel mh" :class="{ single: !(data.bianGua && hasChange) }">
      <div class="hx-gua">
        <small>本卦</small>
        <strong class="serif">{{ data.gua64Name }}</strong>
        <span class="tv-muted">{{ benSub }}</span>
      </div>
      <template v-if="data.bianGua && hasChange">
        <span class="hx-arrow" aria-hidden="true">→</span>
        <div class="hx-gua">
          <small>变卦</small>
          <strong class="serif">{{ data.bianGua }}</strong>
          <span class="tv-muted">{{ bianSub }}</span>
        </div>
      </template>

      <div class="mh-bars">
        <span v-for="l in lines" :key="l.pos" class="hx-bar" :class="[l.yang ? 'yang' : 'yin', { moving: l.moving }]" :title="`${POS_NAME[l.pos]}爻`"><i /><i /></span>
      </div>
      <template v-if="data.bianGua && hasChange">
        <div class="mh-marks">
          <span v-for="l in lines" :key="l.pos" class="hx-mark">{{ l.moving ? (l.yang ? '○' : '×') : '' }}</span>
        </div>
        <div class="mh-bars">
          <span v-for="l in lines" :key="l.pos" class="hx-bar" :class="[l.changedYang ? 'yang' : 'yin', { dim: !l.moving }]"><i /><i /></span>
        </div>
      </template>
    </div>

    <template v-else>
      <div class="hx-head">
        <div class="hx-gua">
          <small>本卦</small>
          <strong class="serif">{{ data.gua64Name }}</strong>
          <span class="tv-muted">{{ benSub }}</span>
        </div>
        <template v-if="data.bianGua && hasChange">
          <span class="hx-arrow" aria-hidden="true">→</span>
          <div class="hx-gua">
            <small>变卦</small>
            <strong class="serif">{{ data.bianGua }}</strong>
            <span class="tv-muted">{{ bianSub }}</span>
          </div>
        </template>
      </div>

      <div class="hx-lines liuyao">
        <div v-for="l in lines" :key="l.pos" class="hx-line" :class="{ moving: l.moving }">
          <span class="hx-shen">{{ l.shen }}</span>
          <span class="hx-qin">{{ l.qin }}<small>{{ l.zhi }}{{ l.wx }}</small></span>
          <span class="hx-bar" :class="[l.yang ? 'yang' : 'yin', { moving: l.moving }]" :title="`${POS_NAME[l.pos]}爻`"><i /><i /></span>
          <span class="hx-mark">{{ l.moving ? (l.yang ? '○' : '×') : '' }}</span>
          <span class="hx-sy">{{ l.shi ? '世' : l.ying ? '应' : '' }}</span>
          <span v-if="hasChange" class="hx-bar small" :class="[l.changedYang ? 'yang' : 'yin', { dim: !l.moving }]"><i /><i /></span>
        </div>
      </div>
    </template>

    <div class="tv-row">
      <template v-if="mode === 'liuyao'">
        <span class="tv-chip">{{ data.palace }}（{{ data.palaceWuXing }}）</span>
        <span class="tv-chip">月建 {{ data.monthGanZhi }}</span>
        <span class="tv-chip">日辰 {{ data.dayGanZhi }}</span>
        <span class="tv-chip accent">{{ data.dongYaoList?.length ? `动爻 ${data.dongYaoList.join('、')}` : '静卦' }}</span>
      </template>
      <template v-else>
        <span class="tv-chip">体卦 <b>{{ data.tiGua }}</b></span>
        <span class="tv-chip">用卦 <b>{{ data.yongGua }}</b></span>
        <span class="tv-chip accent">{{ data.tiYongRelation }}</span>
        <span class="tv-chip">动爻 {{ data.dongYao }}</span>
      </template>
      <span v-if="data.question" class="tv-muted">问：{{ data.question }}</span>
    </div>
  </div>
</template>

<style scoped>
.hx-head { display: flex; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
.hx-gua { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.hx-gua small { font-size: 0.68rem; letter-spacing: 0.1em; color: var(--color-text-muted); }
.hx-gua strong { font-size: 1.2rem; line-height: 1.35; white-space: nowrap; }
.hx-gua .tv-muted { font-size: 0.76rem; white-space: nowrap; }
.hx-arrow { align-self: center; font-size: 1.1rem; color: var(--color-accent); }
.hx-head .hx-arrow { margin-top: 14px; align-self: flex-start; }

/* Shared line drawing */
.hx-bar { display: flex; gap: 12px; height: 10px; }
.hx-bar i { flex: 1; border-radius: 2px; background: var(--color-text-primary); }
.hx-bar.yang i:last-child { display: none; }
.hx-bar.moving i { background: var(--color-seal); }
.hx-bar.dim i { opacity: 0.22; }
.hx-mark { display: grid; place-items: center; height: 10px; line-height: 1; font-size: 0.78rem; color: var(--color-seal); font-weight: 700; }

/* 梅花 panel: 3-column grid (本卦 | marks | 变卦), header row above the line row */
.hx-panel {
  display: grid;
  grid-template-columns: minmax(100px, 1fr) 1.4em minmax(100px, 1fr);
  column-gap: 14px; row-gap: 14px;
  align-items: start;
  padding: 14px 16px 16px;
  width: fit-content; max-width: 100%;
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-bg-tertiary) 55%, transparent);
}
.hx-panel.single { grid-template-columns: minmax(100px, max-content); }
.hx-panel .hx-arrow { margin-top: 18px; text-align: center; align-self: start; }
.mh-bars, .mh-marks { display: flex; flex-direction: column; gap: 9px; }
.mh-bars { width: 100%; }

/* 六爻 table */
.hx-lines { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: var(--radius-lg); background: color-mix(in srgb, var(--color-bg-tertiary) 55%, transparent); width: fit-content; max-width: 100%; }
.hx-line { display: grid; align-items: center; gap: 10px; height: 18px; font-size: 0.8rem; }
.liuyao .hx-line { grid-template-columns: 2.4em 4.6em 84px 1em 1.2em 84px; }
.hx-shen { color: var(--color-text-muted); font-size: 0.74rem; }
.hx-qin small { margin-left: 3px; color: var(--color-text-muted); font-size: 0.72rem; }
.hx-bar.small { height: 10px; }
.hx-sy { font-family: var(--font-serif); font-weight: 700; color: var(--color-accent); }

@media (max-width: 640px) {
  .liuyao .hx-line { grid-template-columns: 2.2em 4.4em 64px 1em 1.2em 64px; gap: 7px; }
  .hx-panel { column-gap: 10px; padding: 12px; }
}
</style>
