<script setup lang="ts">
// get_daily_fortune: month overview as a score strip, or a single day with its details.
import { computed } from 'vue';
import ScoreRing from '../../common/ScoreRing.vue';
import { ratingToLevel } from '../../../utils/fortune';

const props = defineProps<{ data: Record<string, any> }>();

interface Day { date: string; gz: string; score: number; rating: string; tagline: string }
// "2026-09-01 戊寅 42分 凶｜破日逢冲，财官受阻"
const days = computed<Day[]>(() => (Array.isArray(props.data['逐日']) ? props.data['逐日'] : [])
  .map((l: string) => {
    const m = /^(\d{4}-\d{2}-\d{2})\s+(\S+)\s+(\d+)分\s+(\S+)｜(.*)$/.exec(String(l));
    return m ? { date: m[1], gz: m[2], score: Number(m[3]), rating: m[4], tagline: m[5] } : null;
  })
  .filter((d: Day | null): d is Day => !!d));

const avg = computed(() => (days.value.length ? Math.round(days.value.reduce((a, d) => a + d.score, 0) / days.value.length) : 0));
const best = computed(() => [...days.value].sort((a, b) => b.score - a.score).slice(0, 3));
const day = computed(() => props.data['日历'] as Record<string, any> | undefined);
</script>

<template>
  <div class="tv">
    <template v-if="days.length">
      <div class="df-head">
        <div class="level-neutral df-ring"><ScoreRing :score="avg" :size="58" label="月均" /></div>
        <div class="tv-list df-best">
          <div class="tv-section-label">本月高分日</div>
          <div v-for="d in best" :key="d.date" class="tv-row">
            <span class="tv-chip" :class="`level-${ratingToLevel(d.rating)}`">{{ d.score }}</span>
            <b class="tabular">{{ d.date.slice(5) }}</b><span class="serif">{{ d.gz }}</span>
            <span class="tv-muted">{{ d.tagline }}</span>
          </div>
        </div>
      </div>
      <div class="df-strip" role="img" :aria-label="`${data.month} 逐日运势`">
        <div v-for="d in days" :key="d.date" class="df-col" :title="`${d.date} ${d.gz} ${d.score}分 ${d.rating}｜${d.tagline}`">
          <i :class="`level-${ratingToLevel(d.rating)}`" :style="{ height: `${Math.max(8, d.score)}%` }" />
          <small>{{ Number(d.date.slice(8)) }}</small>
        </div>
      </div>
    </template>

    <template v-else-if="day">
      <div class="df-head">
        <div :class="`level-${ratingToLevel(day.rating)} df-ring`"><ScoreRing :score="day.overallScore" :size="64" :label="day.rating" /></div>
        <div>
          <div class="tv-title">{{ day.date }} · {{ day.dayGanZhi }}</div>
          <div class="tv-muted">{{ day.lunarDate }}</div>
          <p class="df-tag">{{ day.tagline }}</p>
        </div>
      </div>
      <p v-if="day.overview" class="df-overview">{{ day.overview }}</p>
      <div class="tv-row">
        <span v-for="f in day.favorable || []" :key="`y${f}`" class="tv-chip good">宜 {{ f }}</span>
        <span v-for="u in day.unfavorable || []" :key="`j${u}`" class="tv-chip bad">忌 {{ u }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.df-head { display: flex; gap: 14px; align-items: center; }
.df-ring { display: grid; place-items: center; padding: 6px; border-radius: 50%; }
.df-best { flex: 1; min-width: 0; gap: 4px; }
.df-best .tv-muted { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.df-strip { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 2px; height: 86px; align-items: end; }
.df-col { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; gap: 3px; }
.df-col i { width: 100%; border-radius: 3px 3px 1px 1px; }
.df-col small { font-size: 0.58rem; color: var(--color-text-muted); }
.df-tag { margin-top: 4px; font-weight: 600; }
.df-overview { color: var(--color-text-secondary); line-height: 1.7; font-size: 0.84rem; }
</style>
