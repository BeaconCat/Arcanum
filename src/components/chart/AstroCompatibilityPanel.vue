<script setup lang="ts">
import { computed } from 'vue';
import { ThumbsUp, ThumbsDown, Scale } from 'lucide-vue-next';
import ScoreRing from '../common/ScoreRing.vue';
import type { AstroCompatibility } from '../../../shared/types/astro.types';

/** Synastry compatibility: overall ring, five dimensions, strongest contacts. */
const props = defineProps<{ data: AstroCompatibility; labelA: string; labelB: string }>();

function tone(score: number) {
  if (score >= 75) return 'great';
  if (score >= 60) return 'good';
  if (score >= 45) return 'neutral';
  if (score >= 30) return 'bad';
  return 'terrible';
}
const overallTone = computed(() => tone(props.data.score));
const icons = { positive: ThumbsUp, negative: ThumbsDown, mixed: Scale };
</script>

<template>
  <section class="compat card">
    <div class="cp-head">
      <div class="cp-ring" :class="`level-${overallTone}`">
        <ScoreRing :score="data.score" :size="96" label="匹配度" />
      </div>
      <div class="cp-summary">
        <span class="cp-kicker">{{ labelA }} × {{ labelB }}</span>
        <h3 class="cp-level">{{ data.level }}</h3>
        <p class="cp-note">基于比较盘的行星相位与宫位互动计算，仅供参考，关系的经营更取决于双方。</p>
      </div>
    </div>

    <div class="cp-dims">
      <div v-for="d in data.dimensions" :key="d.key" class="dim">
        <div class="dim-top">
          <span class="dim-name">{{ d.name }}</span>
          <span class="dim-score tabular">{{ Math.round(d.score) }}</span>
        </div>
        <div class="dim-track"><div class="dim-fill" :class="`fill-${tone(d.score)}`" :style="{ width: `${Math.max(3, Math.min(100, d.score))}%` }" /></div>
        <ul v-if="d.notes?.length" class="dim-notes">
          <li v-for="(n, i) in d.notes.slice(0, 3)" :key="i">{{ n }}</li>
        </ul>
      </div>
    </div>

    <div v-if="data.highlights?.length" class="cp-hl">
      <h4>关键互动</h4>
      <ul>
        <li v-for="(h, i) in data.highlights" :key="i" :class="h.effect">
          <component :is="icons[h.effect] || Scale" :size="14" class="hl-icon" />
          <span class="hl-text">{{ h.text }}</span>
          <span class="hl-w tabular">{{ h.weight > 0 ? '+' : '' }}{{ Number(h.weight).toFixed(1) }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.compat { display: flex; flex-direction: column; gap: var(--space-md); }
.cp-head { display: flex; align-items: center; gap: var(--space-lg); flex-wrap: wrap; }
.cp-ring { border-radius: 50%; padding: 6px; background: transparent; }
.cp-summary { flex: 1; min-width: 200px; }
.cp-kicker { font-size: 0.78rem; color: var(--color-text-muted); letter-spacing: 0.04em; }
.cp-level { font-family: var(--font-serif); font-size: 1.35rem; margin: 2px 0 4px; }
.cp-note { font-size: 0.8rem; color: var(--color-text-muted); line-height: 1.6; }

.cp-dims { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
.dim { padding: 10px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg-secondary); }
.dim-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
.dim-name { font-weight: 600; font-size: 0.88rem; }
.dim-score { font-family: var(--font-serif); font-weight: 700; font-size: 1.05rem; }
.dim-track { height: 7px; border-radius: 999px; background: var(--color-bg-tertiary); overflow: hidden; }
.dim-fill { height: 100%; border-radius: 999px; transition: width 0.5s ease; }
.fill-great { background: var(--color-level-great-text); }
.fill-good { background: var(--color-level-good-text); }
.fill-neutral { background: var(--color-level-neutral-text); }
.fill-bad { background: var(--color-level-bad-text); }
.fill-terrible { background: var(--color-level-terrible-text); }
.dim-notes { margin-top: 7px; display: flex; flex-direction: column; gap: 2px; font-size: 0.76rem; color: var(--color-text-secondary); line-height: 1.5; }
.dim-notes li::before { content: '· '; color: var(--color-text-muted); }

.cp-hl h4 { font-family: var(--font-serif); font-size: 0.95rem; margin-bottom: 8px; }
.cp-hl ul { display: flex; flex-direction: column; gap: 4px; }
.cp-hl li { display: grid; grid-template-columns: 20px 1fr auto; align-items: center; gap: 6px; padding: 6px 10px; border-radius: var(--radius-sm); font-size: 0.84rem; background: var(--color-bg-tertiary); }
.cp-hl li.positive { background: var(--color-ji-soft); }
.cp-hl li.positive .hl-icon, .cp-hl li.positive .hl-w { color: var(--color-ji); }
.cp-hl li.negative { background: var(--color-xiong-soft); }
.cp-hl li.negative .hl-icon, .cp-hl li.negative .hl-w { color: var(--color-xiong); }
.cp-hl li.mixed .hl-icon, .cp-hl li.mixed .hl-w { color: var(--color-warning); }
.hl-w { font-size: 0.78rem; font-weight: 700; }
</style>
