<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { MapPin, AlertTriangle, RefreshCw, ArrowRight } from 'lucide-vue-next';
import { apiGetAstroChart } from '../../api/chart.api';
import { errorMessage } from '../../composables/useFeedback';
import LoadingSpinner from '../common/LoadingSpinner.vue';
import AstroWheel from './AstroWheel.vue';
import AstroChartDetails from './AstroChartDetails.vue';
import type { AstroChart, AstroHouseSystem, BirthPlaceResolution } from '../../../shared/types/astro.types';
import { HOUSE_SYSTEMS, PRECISION_LABEL, TXT, loadSettings, toServerSettings } from '../../utils/astro';

const props = withDefaults(defineProps<{ profileId: string; version?: number; showWorkbenchLink?: boolean }>(), { showWorkbenchLink: true });
const emit = defineEmits<{ 'edit-place': [] }>();

// Share the natal settings (aspects, orbs, dignity marks) configured in the 星盘工作台
const natalSettings = loadSettings('natal');
const chart = ref<AstroChart | null>(null);
const place = ref<BirthPlaceResolution | null>(null);
const loading = ref(false);
const error = ref('');
const houseSystem = ref<AstroHouseSystem>(natalSettings.houseSystem);

async function load() {
  if (!props.profileId) return;
  loading.value = true;
  error.value = '';
  try {
    const res = await apiGetAstroChart(props.profileId, houseSystem.value, { ...toServerSettings(natalSettings), houseSystem: houseSystem.value });
    chart.value = res.chart;
    place.value = res.place;
  } catch (err) {
    error.value = errorMessage(err, '星盘计算失败');
  } finally {
    loading.value = false;
  }
}

watch(() => [props.profileId, props.version, houseSystem.value], load, { immediate: true });

const bigThree = computed(() => {
  const c = chart.value; if (!c) return [];
  const sun = c.planets.find((p) => p.key === 'sun')!;
  const moon = c.planets.find((p) => p.key === 'moon')!;
  return [
    { label: '太阳', glyph: '☉' + TXT, sign: sun.sign, signGlyph: sun.signSymbol },
    { label: '月亮', glyph: '☽' + TXT, sign: moon.sign, signGlyph: moon.signSymbol },
    { label: '上升', glyph: 'ASC', sign: c.angles.asc.sign, signGlyph: c.angles.asc.signSymbol },
  ];
});

const lowPrecision = computed(() => place.value && (place.value.precision === 'province' || place.value.precision === 'default'));
</script>

<template>
  <div class="astro-card card">
    <!-- Header -->
    <div class="ac-head">
      <div>
        <h3 class="ac-title">西洋占星 · 本命星盘</h3>
        <div v-if="chart" class="ac-sub">
          {{ chart.input.birthDate }} {{ chart.input.birthTime }} · UTC{{ chart.utcOffset }}
          <span v-if="chart.input.timezone === 'Asia/Shanghai' && chart.utcOffset === '+09:00'" class="badge badge-warning">夏令时</span>
        </div>
      </div>
      <div class="ac-controls">
        <select v-model="houseSystem" class="input input-sm" aria-label="宫制">
          <option v-for="h in HOUSE_SYSTEMS" :key="h.value" :value="h.value">{{ h.label }}</option>
        </select>
        <button class="btn-icon sm" :disabled="loading" title="重新计算" aria-label="重新计算" @click="load">
          <RefreshCw :size="15" :class="{ spin: loading }" />
        </button>
        <router-link v-if="showWorkbenchLink" to="/astro" class="btn btn-secondary btn-sm">
          打开星盘工作台 <ArrowRight :size="14" />
        </router-link>
      </div>
    </div>

    <!-- Place -->
    <div v-if="place" class="ac-place" :class="{ warn: lowPrecision }">
      <MapPin :size="15" />
      <span class="ac-place-text">
        出生地：<b>{{ place.matched }}</b>
        <span class="tabular muted">{{ Math.abs(place.lat).toFixed(2) }}°{{ place.lat >= 0 ? 'N' : 'S' }} {{ Math.abs(place.lon).toFixed(2) }}°{{ place.lon >= 0 ? 'E' : 'W' }}</span>
        <span class="badge" :class="lowPrecision ? 'badge-warning' : place.precision === 'manual' ? 'badge-accent' : 'badge-success'">{{ PRECISION_LABEL[place.precision] }}</span>
      </span>
      <button class="btn btn-ghost btn-sm" @click="emit('edit-place')">修改经纬度</button>
    </div>
    <div v-if="lowPrecision" class="alert alert-warning ac-alert">
      <AlertTriangle :size="16" />
      <span>{{ place?.note || '出生地精度不足' }}。行星所在星座不受影响，但上升点、天顶与宫位可能偏差较大，建议在档案中填写出生地经纬度。</span>
    </div>
    <div v-if="chart?.houseSystemNote" class="alert alert-info ac-alert">{{ chart.houseSystemNote }}</div>

    <LoadingSpinner v-if="loading && !chart">星盘计算中…</LoadingSpinner>
    <div v-else-if="error" class="alert alert-error">{{ error }}</div>

    <template v-else-if="chart">
      <!-- Big three -->
      <div class="big-three">
        <div v-for="b in bigThree" :key="b.label" class="bt-item">
          <span class="bt-glyph">{{ b.glyph }}</span>
          <span class="bt-text"><small>{{ b.label }}</small><b>{{ b.signGlyph }} {{ b.sign }}</b></span>
        </div>
        <div class="bt-item">
          <span class="bt-glyph small">命主</span>
          <span class="bt-text"><small>命主星</small><b>{{ chart.chartRuler.name }}</b></span>
        </div>
      </div>

      <div class="wheel-wrap" :class="{ busy: loading }">
        <AstroWheel :chart="chart" :show-dignity="natalSettings.showDignity" />
      </div>

      <AstroChartDetails :chart="chart" :show-dignity="natalSettings.showDignity" />
    </template>
  </div>
</template>

<style scoped>
.ac-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-md); flex-wrap: wrap; margin-bottom: var(--space-sm); }
.ac-title { font-family: var(--font-serif); font-size: 1.1rem; }
.ac-sub { display: flex; align-items: center; gap: 6px; margin-top: 2px; font-size: 0.8rem; color: var(--color-text-muted); }
.ac-controls { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.ac-controls .input { width: auto; }

.ac-place {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 8px 10px; margin-bottom: var(--space-sm);
  border-radius: var(--radius-md); background: var(--color-bg-tertiary);
  font-size: 0.84rem; color: var(--color-text-secondary);
}
.ac-place > svg { color: var(--color-accent); flex-shrink: 0; }
.ac-place.warn > svg { color: var(--color-warning); }
.ac-place-text { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ac-place b { color: var(--color-text-primary); font-weight: 600; }
.ac-alert { margin-bottom: var(--space-sm); font-size: 0.82rem; }
.muted { color: var(--color-text-muted); }

/* Big three */
.big-three { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin: var(--space-sm) 0 var(--space-md); }
.bt-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg-secondary); min-width: 0; }
.bt-glyph {
  display: grid; place-items: center; width: 34px; height: 34px; flex-shrink: 0; border-radius: 50%;
  background: var(--color-accent-soft); color: var(--color-accent); font-size: 1.05rem; font-weight: 700;
  font-variant-emoji: text;
}
.bt-glyph.small { font-size: 0.68rem; font-family: var(--font-serif); }
.bt-text { display: flex; flex-direction: column; line-height: 1.25; min-width: 0; }
.bt-text small { font-size: 0.7rem; color: var(--color-text-muted); }
.bt-text b { font-family: var(--font-serif); font-size: 0.98rem; white-space: nowrap; font-variant-emoji: text; }

.wheel-wrap { display: flex; justify-content: center; margin-bottom: var(--space-lg); transition: opacity var(--transition-fast); }
.wheel-wrap.busy { opacity: 0.55; }

@media (max-width: 760px) {
  .big-three { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
