<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { LineChart } from 'echarts/charts';
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  DataZoomComponent,
  MarkLineComponent,
} from 'echarts/components';
import VChart from 'vue-echarts';
import {
  CalendarDays, RefreshCw, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Gauge, Hash, UserCircle, Loader2,
} from 'lucide-vue-next';
import { useProfileStore } from '../stores/use-profile-store';
import { apiGetFortuneTrend } from '../api/fortune.api';
import type { TrendData, TrendPoint } from '../../shared/types/fortune.types';
import PageHeader from '../components/common/PageHeader.vue';
import EmptyState from '../components/common/EmptyState.vue';
import { useTheme, cssVar } from '../composables/useTheme';
import { formatDateCn } from '../utils/fortune';

use([
  CanvasRenderer,
  LineChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  DataZoomComponent,
  MarkLineComponent,
]);

const router = useRouter();
const profileStore = useProfileStore();
const { theme } = useTheme();
const loading = ref(false);
const trend = ref<TrendData | null>(null);

// Date range — default to current month
const now = new Date();
const rangeYear = ref(now.getFullYear());
const rangeMonth = ref(now.getMonth() + 1);

const rangeLabel = computed(() => `${rangeYear.value}年${rangeMonth.value}月`);
const isCurrentMonth = computed(() => rangeYear.value === now.getFullYear() && rangeMonth.value === now.getMonth() + 1);

function prevMonth() {
  if (rangeMonth.value === 1) {
    rangeYear.value--;
    rangeMonth.value = 12;
  } else {
    rangeMonth.value--;
  }
}

function nextMonth() {
  if (rangeMonth.value === 12) {
    rangeYear.value++;
    rangeMonth.value = 1;
  } else {
    rangeMonth.value++;
  }
}

function goThisMonth() {
  rangeYear.value = now.getFullYear();
  rangeMonth.value = now.getMonth() + 1;
}

// Dimensions — light/dark variants so lines stay legible on both backgrounds
interface DimDef {
  key: keyof TrendPoint;
  label: string;
  light: string;
  dark: string;
}

const DIMENSIONS: DimDef[] = [
  { key: 'overall', label: '综合', light: '#8b5e3c', dark: '#d2a86a' },
  { key: 'career', label: '事业', light: '#3f5fbf', dark: '#7f9cf5' },
  { key: 'wealth', label: '财运', light: '#c08a00', dark: '#f2c94c' },
  { key: 'relationship', label: '人际', light: '#d14b4b', dark: '#f28b82' },
  { key: 'health', label: '健康', light: '#3f8f3a', dark: '#81c995' },
  { key: 'study', label: '学业', light: '#1f8aa8', dark: '#6cc4dc' },
];

function dimColor(d: DimDef) {
  return theme.value === 'dark' ? d.dark : d.light;
}

const activeDims = ref<Set<string>>(new Set(['overall', 'career', 'wealth']));

function toggleDim(key: string) {
  if (activeDims.value.has(key)) {
    if (activeDims.value.size > 1) activeDims.value.delete(key);
  } else {
    activeDims.value.add(key);
  }
  activeDims.value = new Set(activeDims.value);
}

// Chart option — depends on theme so colors are re-resolved on toggle
const chartOption = computed(() => {
  void theme.value;
  const textMuted = cssVar('--color-text-muted', '#8f877e');
  const textPrimary = cssVar('--color-text-primary', '#1f1b16');
  const border = cssVar('--color-border', '#e3ddd3');
  const elevated = cssVar('--color-bg-elevated', '#ffffff');
  const tertiary = cssVar('--color-bg-tertiary', '#efeae2');
  const accent = cssVar('--color-accent', '#8b5e3c');

  const pts = trend.value?.points || [];
  const dates = pts.map((p) => p.date.slice(5));

  const series = DIMENSIONS.filter((d) => activeDims.value.has(d.key)).map((d) => {
    const color = dimColor(d);
    const isOverall = d.key === 'overall';
    return {
      name: d.label,
      type: 'line' as const,
      smooth: true,
      symbol: 'circle',
      symbolSize: isOverall ? 7 : 5,
      showSymbol: pts.length <= 20,
      lineStyle: { width: isOverall ? 3 : 2, color },
      itemStyle: { color, borderColor: elevated, borderWidth: 1.5 },
      emphasis: { focus: 'series' as const },
      areaStyle: isOverall
        ? {
            color: {
              type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: `${color}40` },
                { offset: 1, color: `${color}00` },
              ],
            },
          }
        : undefined,
      data: pts.map((p) => p[d.key] as number),
      markLine: isOverall ? {
        silent: true,
        symbol: 'none',
        lineStyle: { color: textMuted, type: 'dashed' as const, opacity: 0.6 },
        label: { color: textMuted, fontSize: 10, formatter: '中位 50' },
        data: [{ yAxis: 50 }],
      } : undefined,
    };
  });

  return {
    backgroundColor: 'transparent',
    textStyle: { fontFamily: 'inherit' },
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: elevated,
      borderColor: border,
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: textPrimary, fontSize: 12 },
      axisPointer: { type: 'line' as const, lineStyle: { color: accent, opacity: 0.5 } },
      extraCssText: 'border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.15);',
    },
    legend: { show: false },
    grid: {
      left: 36,
      right: 16,
      top: 20,
      bottom: pts.length > 15 ? 56 : 28,
    },
    xAxis: {
      type: 'category' as const,
      data: dates,
      boundaryGap: false,
      axisLine: { lineStyle: { color: border } },
      axisTick: { show: false },
      axisLabel: { fontSize: 11, color: textMuted, hideOverlap: true },
    },
    yAxis: {
      type: 'value' as const,
      min: 0,
      max: 100,
      splitNumber: 5,
      axisLabel: { fontSize: 11, color: textMuted },
      splitLine: { lineStyle: { color: border, type: 'dashed' as const } },
    },
    dataZoom: pts.length > 15 ? [
      { type: 'inside', start: 0, end: 100 },
      {
        type: 'slider', start: 0, end: 100, height: 18, bottom: 8,
        borderColor: border,
        backgroundColor: tertiary,
        fillerColor: `${accent}26`,
        handleStyle: { color: elevated, borderColor: accent },
        moveHandleStyle: { color: accent, opacity: 0.4 },
        textStyle: { color: textMuted, fontSize: 10 },
        dataBackground: { lineStyle: { color: border }, areaStyle: { color: border, opacity: 0.4 } },
        selectedDataBackground: { lineStyle: { color: accent }, areaStyle: { color: accent, opacity: 0.2 } },
      },
    ] : [],
    series,
  };
});

// Data fetching
async function fetchTrend() {
  const pid = profileStore.currentProfileId;
  if (!pid) return;

  loading.value = true;
  try {
    const mm = String(rangeMonth.value).padStart(2, '0');
    const daysInMonth = new Date(rangeYear.value, rangeMonth.value, 0).getDate();
    const from = `${rangeYear.value}-${mm}-01`;
    const to = `${rangeYear.value}-${mm}-${String(daysInMonth).padStart(2, '0')}`;
    trend.value = await apiGetFortuneTrend(pid, from, to);
  } catch {
    trend.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  if (!profileStore.profiles.length) await profileStore.loadProfiles();
  fetchTrend();
});

watch([rangeYear, rangeMonth, () => profileStore.currentProfileId], () => fetchTrend());

// Stats
const stats = computed(() => {
  const pts = trend.value?.points || [];
  if (!pts.length) return null;
  const scores = pts.map((p) => p.overall);
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  const bestDay = pts.find((p) => p.overall === max);
  const worstDay = pts.find((p) => p.overall === min);
  return { avg, max, min, bestDay, worstDay, count: pts.length };
});

function goDaily(date?: string) {
  if (date) router.push({ name: 'DailyDetail', params: { date } });
}
</script>

<template>
  <div class="page page-medium chart-page">
    <PageHeader
      title="运势趋势图"
      :subtitle="profileStore.currentProfile ? `命主：${profileStore.currentProfile.name}` : undefined"
    >
      <template #actions>
        <div class="month-nav">
          <button class="btn-icon" @click="prevMonth" aria-label="上个月"><ChevronLeft :size="18" /></button>
          <span class="month-label serif">{{ rangeLabel }}</span>
          <button class="btn-icon" @click="nextMonth" aria-label="下个月"><ChevronRight :size="18" /></button>
        </div>
        <button class="btn btn-secondary btn-sm" :disabled="isCurrentMonth" @click="goThisMonth">本月</button>
        <button class="btn-icon" @click="fetchTrend" :disabled="loading || !profileStore.currentProfileId" aria-label="刷新" title="刷新">
          <RefreshCw :size="16" :class="{ spin: loading }" />
        </button>
      </template>
    </PageHeader>

    <div v-if="!profileStore.currentProfileId" class="card">
      <EmptyState :icon="UserCircle" title="尚未选择命主" description="请先创建或选择一个命主档案。">
        <template #actions>
          <router-link to="/profile" class="btn btn-primary">前往命盘档案</router-link>
        </template>
      </EmptyState>
    </div>

    <template v-else>
      <!-- Stats summary -->
      <div v-if="stats && !loading" class="stats-grid">
        <div class="stat-card card">
          <div class="stat-icon"><Gauge :size="18" /></div>
          <div class="stat-body">
            <span class="stat-label">月均分</span>
            <span class="stat-value tabular">{{ stats.avg }}</span>
          </div>
        </div>
        <button class="stat-card card card-interactive best" @click="goDaily(stats.bestDay?.date)">
          <div class="stat-icon"><TrendingUp :size="18" /></div>
          <div class="stat-body">
            <span class="stat-label">最佳 · {{ stats.bestDay ? formatDateCn(stats.bestDay.date, false) : '' }}</span>
            <span class="stat-value tabular">{{ stats.max }}</span>
          </div>
        </button>
        <button class="stat-card card card-interactive worst" @click="goDaily(stats.worstDay?.date)">
          <div class="stat-icon"><TrendingDown :size="18" /></div>
          <div class="stat-body">
            <span class="stat-label">最低 · {{ stats.worstDay ? formatDateCn(stats.worstDay.date, false) : '' }}</span>
            <span class="stat-value tabular">{{ stats.min }}</span>
          </div>
        </button>
        <div class="stat-card card">
          <div class="stat-icon"><Hash :size="18" /></div>
          <div class="stat-body">
            <span class="stat-label">数据天数</span>
            <span class="stat-value tabular">{{ stats.count }}</span>
          </div>
        </div>
      </div>

      <!-- Chart -->
      <section class="card chart-card">
        <div class="chart-toolbar">
          <span class="chart-title">维度</span>
          <div class="dim-toggles">
            <button
              v-for="d in DIMENSIONS"
              :key="d.key"
              class="dim-pill"
              :class="{ active: activeDims.has(d.key) }"
              :style="{ '--dim-color': dimColor(d) }"
              :aria-pressed="activeDims.has(d.key)"
              @click="toggleDim(d.key)"
            >
              <span class="dim-dot" />
              {{ d.label }}
            </button>
          </div>
        </div>

        <div class="chart-body">
          <div v-if="loading" class="loading-state">
            <Loader2 :size="26" class="spin" />
            <span>加载中…</span>
          </div>
          <EmptyState
            v-else-if="!trend?.points?.length"
            :icon="CalendarDays"
            title="该月暂无数据"
            description="趋势图基于已生成的每日运势，请先在月历页生成该月运势。"
          >
            <template #actions>
              <router-link to="/calendar" class="btn btn-primary">前往月历</router-link>
            </template>
          </EmptyState>
          <VChart v-else class="chart" :option="chartOption" autoresize />
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
/* ── Header nav ── */
.month-nav {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
}
.month-nav .btn-icon { width: 30px; height: 30px; }
.month-label { min-width: 96px; text-align: center; font-size: 1rem; font-weight: 700; }

/* ── Stats ── */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-md);
  margin-bottom: var(--space-md);
}
.stat-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: var(--space-md);
  font: inherit;
  color: inherit;
  text-align: left;
}
.stat-icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: var(--radius-md);
  background: var(--color-accent-soft);
  color: var(--color-accent);
}
.stat-card.best .stat-icon { background: var(--color-success-soft); color: var(--color-success); }
.stat-card.worst .stat-icon { background: var(--color-warning-soft); color: var(--color-warning); }
.stat-body { display: flex; flex-direction: column; min-width: 0; }
.stat-label { font-size: 0.76rem; color: var(--color-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stat-value {
  font-family: var(--font-serif);
  font-size: 1.6rem;
  font-weight: 700;
  line-height: 1.2;
  color: var(--color-text-primary);
}
.stat-card.best .stat-value { color: var(--color-success); }
.stat-card.worst .stat-value { color: var(--color-warning); }

/* ── Chart card ── */
.chart-card { padding: var(--space-md) var(--space-lg) var(--space-lg); }
.chart-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: var(--space-sm);
}
.chart-title { font-size: 0.8rem; font-weight: 600; letter-spacing: 0.08em; color: var(--color-text-muted); }
.dim-toggles { display: flex; flex-wrap: wrap; gap: 6px; }
.dim-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}
.dim-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1.5px solid var(--dim-color);
  transition: background var(--transition-fast);
}
.dim-pill:hover { border-color: var(--dim-color); color: var(--color-text-primary); }
.dim-pill.active {
  border-color: color-mix(in srgb, var(--dim-color) 55%, transparent);
  background: color-mix(in srgb, var(--dim-color) 12%, transparent);
  color: var(--color-text-primary);
}
.dim-pill.active .dim-dot { background: var(--dim-color); }

.chart-body { min-height: 380px; display: flex; flex-direction: column; justify-content: center; }
.chart { width: 100%; height: 380px; }

@media (max-width: 800px) {
  .stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .stats-grid { gap: var(--space-sm); }
  .stat-card { padding: 12px; gap: 10px; }
  .stat-icon { width: 32px; height: 32px; }
  .stat-value { font-size: 1.3rem; }
  .chart-card { padding: var(--space-md) 10px; }
  .chart-body { min-height: 280px; }
  .chart { height: 280px; }
}
</style>
