<script setup lang="ts">
// Natal (or composite) chart: compact wheel, the big three + chart ruler, patterns, tightest aspects.
import { computed } from 'vue';
import type { AstroChart } from '../../../../shared/types/astro.types';
import AstroWheel from '../../chart/AstroWheel.vue';
import AspectList from './AspectList.vue';

const props = defineProps<{ chart: AstroChart; note?: string }>();

const at = (k: string) => props.chart.planets.find((p) => p.key === k);
const core = computed(() => [
  { label: '太阳', p: at('sun') },
  { label: '月亮', p: at('moon') },
].filter((x) => x.p));
</script>

<template>
  <div class="tv">
    <div class="tv-wheel"><AstroWheel :chart="chart" :show-dignity="false" /></div>
    <div class="tv-row">
      <span v-for="c in core" :key="c.label" class="tv-chip accent">{{ c.label }} <b>{{ c.p!.sign }}</b> {{ c.p!.house }}宫</span>
      <span class="tv-chip accent">上升 <b>{{ chart.angles.asc.sign }}</b></span>
      <span class="tv-chip">天顶 {{ chart.angles.mc.sign }}</span>
      <span class="tv-chip">命主星 {{ chart.chartRuler.name }}</span>
    </div>
    <div v-if="chart.patterns?.length" class="tv-row">
      <span v-for="(p, i) in chart.patterns" :key="i" class="tv-chip good" :title="p.bodyNames.join('、')">{{ p.detail || p.name }}</span>
    </div>
    <div class="tv-section-label">主要相位</div>
    <AspectList :aspects="chart.aspects" :limit="6" />
    <p v-if="note" class="tv-muted">{{ note }}</p>
  </div>
</template>
