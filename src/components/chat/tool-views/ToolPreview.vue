<script setup lang="ts">
// Tiny visual shown in the collapsed card header: card thumbnails, pillars, glyphs, a score…
import { computed, onMounted } from 'vue';
import type { ToolDisplay } from '../../../../shared/types/tool-display.types';
import type { ToolViewKind } from './meta';
import { SIGN_GLYPHS } from '../../../utils/astro';
import { wuxingOf } from '../../../utils/fortune';
import ScoreRing from '../../common/ScoreRing.vue';
import TarotCard_ from '../../tarot/TarotCard.vue';
import { tarotCards, loadTarotRefs } from './tarotRefs';

const props = defineProps<{ kind: ToolViewKind | null; display?: ToolDisplay | null; data?: any; toolName?: string }>();

onMounted(() => { if (props.display?.kind === 'tarot') loadTarotRefs().catch(() => {}); });

const tarot = computed(() => (props.display?.kind === 'tarot' ? props.display.reading : null));

const glyphs = computed(() => {
  const d = props.display;
  const chart = d?.kind === 'astro-chart' ? d.chart : d?.kind === 'astro-composite' ? d.composite.chart : null;
  if (!chart) return [];
  const at = (k: string) => chart.planets.find((p) => p.key === k);
  return [
    { g: '☉︎', s: at('sun')?.signIndex }, { g: '☽︎', s: at('moon')?.signIndex }, { g: 'AC', s: chart.angles.asc.signIndex },
  ].filter((x) => x.s !== undefined);
});

const compat = computed(() => (props.display?.kind === 'astro-biwheel' ? props.display.wheel.compatibility : undefined));
const compatTone = computed(() => {
  const s = compat.value?.score ?? 0;
  return s >= 75 ? 'great' : s >= 60 ? 'good' : s >= 45 ? 'neutral' : s >= 30 ? 'bad' : 'terrible';
});

const pillars = computed<string[]>(() => {
  if (props.kind !== 'bazi' || !props.data?.pillars) return [];
  return (['year', 'month', 'day', 'hour'] as const).map((k) => `${props.data.pillars[k]?.gan ?? ''}${props.data.pillars[k]?.zhi ?? ''}`);
});

// Hexagram bits top → bottom for a mini glyph
const TRIGRAM: Record<string, number[]> = { 乾: [1, 1, 1], 兑: [1, 1, 0], 离: [1, 0, 1], 震: [1, 0, 0], 巽: [0, 1, 1], 坎: [0, 1, 0], 艮: [0, 0, 1], 坤: [0, 0, 0] };
const hexBits = computed<number[]>(() => {
  if (props.kind !== 'hexagram' || !props.data) return [];
  const d = props.data;
  if (Array.isArray(d.yaoLines)) return [...d.yaoLines].sort((a: any, b: any) => b.position - a.position).map((y: any) => (y.yinYang === '阳' ? 1 : 0));
  const bits = [...(TRIGRAM[d.lowerGua?.name] || []), ...(TRIGRAM[d.upperGua?.name] || [])];
  return bits.length === 6 ? bits.reverse() : [];
});
</script>

<template>
  <span v-if="tarot && tarotCards" class="pv pv-tarot">
    <span v-for="c in tarot.cards.slice(0, 5)" :key="c.positionId" class="pv-card">
      <TarotCard_ :card="tarotCards.get(c.cardId)" :reversed="c.reversed" :deck="tarot.deck" face-up />
    </span>
  </span>
  <span v-else-if="glyphs.length" class="pv pv-glyphs">
    <span v-for="x in glyphs" :key="x.g" class="pv-glyph"><small>{{ x.g }}</small>{{ SIGN_GLYPHS[x.s!] }}</span>
  </span>
  <span v-else-if="compat" class="pv pv-score" :class="`level-${compatTone}`">
    <ScoreRing :score="compat.score" :size="38" />
  </span>
  <span v-else-if="pillars.length" class="pv pv-pillars serif">
    <span v-for="(p, i) in pillars" :key="i" :class="{ day: i === 2 }">
      <b :class="`wx-${wuxingOf(p[0])}`">{{ p[0] }}</b><b :class="`wx-${wuxingOf(p[1])}`">{{ p[1] }}</b>
    </span>
  </span>
  <span v-else-if="hexBits.length" class="pv pv-hex" aria-hidden="true">
    <i v-for="(b, i) in hexBits" :key="i" :class="b ? 'yang' : 'yin'"><em /><em /></i>
  </span>
</template>

<style scoped>
.pv { display: inline-flex; align-items: center; flex-shrink: 0; }
.pv-tarot { gap: 3px; }
.pv-score { background: none; border-radius: 50%; }
.pv-card { width: 22px; }
.pv-glyphs { gap: 4px; }
.pv-glyph {
  display: inline-flex; align-items: baseline; gap: 2px; padding: 2px 7px; border-radius: 999px;
  background: var(--color-bg-tertiary); font-size: 0.95rem; color: var(--color-text-primary);
}
.pv-glyph small { font-size: 0.62rem; color: var(--color-text-muted); }
.pv-pillars { gap: 5px; font-size: 0.95rem; }
.pv-pillars span { display: flex; flex-direction: column; line-height: 1.05; padding: 1px 3px; border-radius: 4px; }
.pv-pillars span.day { background: var(--color-accent-soft); }
.pv-hex { flex-direction: column; gap: 2px; width: 22px; }
.pv-hex i { display: flex; gap: 3px; height: 3px; }
.pv-hex em { flex: 1; background: var(--color-text-secondary); border-radius: 1px; }
.pv-hex i.yang em:last-child { display: none; }
@media (max-width: 640px) { .pv-glyphs, .pv-tarot { display: none; } }
</style>
