<script setup lang="ts">
// Picks the rich view for a tool result. Heavy views (wheel, map, spread) load on demand.
import { defineAsyncComponent } from 'vue';
import type { ToolDisplay } from '../../../../shared/types/tool-display.types';
import type { ToolViewKind } from './meta';
import BaziView from './BaziView.vue';
import HexagramView from './HexagramView.vue';
import QimenView from './QimenView.vue';
import AlmanacView from './AlmanacView.vue';
import CompareBaziView from './CompareBaziView.vue';
import DailyFortuneView from './DailyFortuneView.vue';
import NatalAnalysisView from './NatalAnalysisView.vue';
import KeyFactsView from './KeyFactsView.vue';
import AstroInterpView from './AstroInterpView.vue';
import './tool-views.css';

const AstroChartView = defineAsyncComponent(() => import('./AstroChartView.vue'));
const AstroBiWheelView = defineAsyncComponent(() => import('./AstroBiWheelView.vue'));
const AcgView = defineAsyncComponent(() => import('./AcgView.vue'));
const TarotView = defineAsyncComponent(() => import('./TarotView.vue'));
const ZiweiView = defineAsyncComponent(() => import('./ZiweiView.vue'));

defineProps<{ kind: ToolViewKind; display?: ToolDisplay | null; data?: any; toolName?: string }>();
</script>

<template>
  <template v-if="display">
    <AstroChartView v-if="display.kind === 'astro-chart'" :chart="display.chart" />
    <AstroBiWheelView v-else-if="display.kind === 'astro-biwheel'" :wheel="display.wheel" />
    <AstroChartView v-else-if="display.kind === 'astro-composite'" :chart="display.composite.chart" :note="display.composite.note" />
    <AstroInterpView v-else-if="display.kind === 'astro-interpretation'" :interpretation="display.interpretation" />
    <AcgView v-else-if="display.kind === 'acg'" :result="display.result" :focus="display.focus" :theme="display.theme" :ranked="display.ranked" />
    <TarotView v-else-if="display.kind === 'tarot'" :reading="display.reading" />
  </template>
  <template v-else-if="data">
    <BaziView v-if="kind === 'bazi'" :data="data" />
    <ZiweiView v-else-if="kind === 'ziwei'" :data="data" />
    <HexagramView v-else-if="kind === 'hexagram'" :data="data" :mode="toolName === 'mei_hua' ? 'meihua' : 'liuyao'" />
    <QimenView v-else-if="kind === 'qimen'" :data="data" />
    <AlmanacView v-else-if="kind === 'huangli'" :data="data" mode="day" />
    <AlmanacView v-else-if="kind === 'shichen'" :data="data" mode="hours" />
    <CompareBaziView v-else-if="kind === 'compare-bazi'" :data="data" />
    <DailyFortuneView v-else-if="kind === 'daily-fortune'" :data="data" />
    <NatalAnalysisView v-else-if="kind === 'natal-analysis'" :data="data" />
    <KeyFactsView v-else-if="kind === 'key-facts'" :data="data" />
  </template>
</template>
