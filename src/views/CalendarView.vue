<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import {
  ChevronLeft, ChevronRight, ArrowLeft, Loader2, Sparkles, RefreshCw,
  ThumbsUp, ThumbsDown, ArrowRight, CalendarDays, UserCircle,
} from 'lucide-vue-next';
import { useProfileStore } from '../stores/use-profile-store';
import { apiGetMonthlyCalendar, apiGenerateWeek, apiGenerateFullMonth } from '../api/fortune.api';
import type { MonthlyCalendar, DailyFortune } from '../../shared/types/fortune.types';
import PageHeader from '../components/common/PageHeader.vue';
import EmptyState from '../components/common/EmptyState.vue';
import ScoreRing from '../components/common/ScoreRing.vue';
import { useFeedback, errorMessage } from '../composables/useFeedback';
import { ratingToLevel, localDateStr, formatDateCn } from '../utils/fortune';

const profileStore = useProfileStore();
const router = useRouter();
const { toast, confirm } = useFeedback();

const now = new Date();
const todayStr = localDateStr(now);
const currentYear = ref(now.getFullYear());
const currentMonth = ref(now.getMonth() + 1);

const calendar = ref<MonthlyCalendar | null>(null);
const loading = ref(false);
const generatingWeek = ref<number | null>(null);
const generatingAll = ref(false);
const busy = computed(() => generatingWeek.value !== null || generatingAll.value);

// Layer: 'grid' | 'cards'
const layer = ref<'grid' | 'cards'>('grid');

const profileId = computed(() => profileStore.currentProfileId);
const isCurrentMonth = computed(() => currentYear.value === now.getFullYear() && currentMonth.value === now.getMonth() + 1);

const LEGEND = [
  { level: 'great', label: '大吉' },
  { level: 'good', label: '吉' },
  { level: 'neutral', label: '平' },
  { level: 'bad', label: '凶' },
  { level: 'terrible', label: '大凶' },
];

// ── Calendar grid helpers ──

const daysInMonth = computed(() => new Date(currentYear.value, currentMonth.value, 0).getDate());
const firstDayOfWeek = computed(() => {
  const d = new Date(currentYear.value, currentMonth.value - 1, 1).getDay();
  // Convert Sun=0 to Mon-based: Mon=0..Sun=6
  return d === 0 ? 6 : d - 1;
});

interface GridCell {
  day: number;
  dateStr: string;
  fortune: DailyFortune | null;
  weekend: boolean;
}

const gridCells = computed<(GridCell | null)[]>(() => {
  const cells: (GridCell | null)[] = [];
  for (let i = 0; i < firstDayOfWeek.value; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth.value; d++) {
    const mm = String(currentMonth.value).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    const dateStr = `${currentYear.value}-${mm}-${dd}`;
    const fortune = calendar.value?.days.find((f) => f.date === dateStr) || null;
    const col = (firstDayOfWeek.value + d - 1) % 7;
    cells.push({ day: d, dateStr, fortune, weekend: col >= 5 });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
});

const weeks = computed(() => calendar.value?.weeks || []);
const generatedCount = computed(() => weeks.value.filter((w) => w.generated).length);
const allGenerated = computed(() => weeks.value.length > 0 && generatedCount.value === weeks.value.length);
const progressPct = computed(() => (weeks.value.length ? (generatedCount.value / weeks.value.length) * 100 : 0));
const sortedDays = computed(() => {
  if (!calendar.value?.days) return [];
  return [...calendar.value.days].sort((a, b) => a.date.localeCompare(b.date));
});

// ── Data loading ──

async function loadCalendar() {
  if (!profileId.value) return;
  loading.value = true;
  try {
    calendar.value = await apiGetMonthlyCalendar(profileId.value, currentYear.value, currentMonth.value);
  } catch {
    calendar.value = null;
  } finally {
    loading.value = false;
  }
}

async function requestGenerateWeek(weekIndex: number) {
  if (!profileId.value) return;
  const week = weeks.value[weekIndex];
  if (week?.generated) {
    const ok = await confirm({
      title: '重新生成',
      message: `确定重新生成第 ${weekIndex + 1} 周（${week.startDate.slice(5)} ~ ${week.endDate.slice(5)}）的运势吗？`,
      confirmText: '重新生成',
    });
    if (!ok) return;
  }
  doGenerateWeek(weekIndex);
}

async function doGenerateWeek(weekIndex: number) {
  if (!profileId.value) return;
  generatingWeek.value = weekIndex;
  try {
    calendar.value = await apiGenerateWeek(profileId.value, currentYear.value, currentMonth.value, weekIndex);
    toast.success(`第 ${weekIndex + 1} 周运势已生成`);
  } catch (err) {
    toast.error(errorMessage(err, '生成失败，请稍后重试'));
  } finally {
    generatingWeek.value = null;
  }
}

async function requestGenerateAll() {
  if (!profileId.value) return;
  if (allGenerated.value) {
    const ok = await confirm({ title: '重新生成', message: '确定重新生成整月运势吗？', confirmText: '重新生成' });
    if (!ok) return;
    doGenerateAll(true);
    return;
  }
  doGenerateAll();
}

async function doGenerateAll(force = false) {
  if (!profileId.value) return;
  generatingAll.value = true;
  try {
    calendar.value = await apiGenerateFullMonth(profileId.value, currentYear.value, currentMonth.value, force);
    toast.success(`${currentMonth.value} 月运势已生成`);
  } catch (err) {
    toast.error(errorMessage(err, '生成失败，请稍后重试'));
  } finally {
    generatingAll.value = false;
  }
}

function prevMonth() {
  if (currentMonth.value === 1) {
    currentMonth.value = 12;
    currentYear.value--;
  } else {
    currentMonth.value--;
  }
}

function nextMonth() {
  if (currentMonth.value === 12) {
    currentMonth.value = 1;
    currentYear.value++;
  } else {
    currentMonth.value++;
  }
}

function goToday() {
  currentYear.value = now.getFullYear();
  currentMonth.value = now.getMonth() + 1;
}

function openCards(dateStr: string) {
  layer.value = 'cards';
  nextTick(() => {
    const el = document.getElementById(`card-${dateStr}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function backToGrid() {
  layer.value = 'grid';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goToDailyDetail(dateStr: string) {
  router.push({ name: 'DailyDetail', params: { date: dateStr } });
}

// ── Lifecycle ──

onMounted(async () => {
  if (!profileStore.profiles.length) await profileStore.loadProfiles();
  loadCalendar();
});

watch([currentYear, currentMonth], () => {
  layer.value = 'grid';
  loadCalendar();
});

watch(profileId, () => {
  loadCalendar();
});
</script>

<template>
  <div class="page page-medium calendar-page">
    <PageHeader
      title="运势月历"
      :subtitle="profileStore.currentProfile ? `命主：${profileStore.currentProfile.name}` : undefined"
    >
      <template #actions>
        <div class="month-nav">
          <button class="btn-icon" @click="prevMonth" aria-label="上个月"><ChevronLeft :size="18" /></button>
          <span class="month-label serif">{{ currentYear }}年{{ currentMonth }}月</span>
          <button class="btn-icon" @click="nextMonth" aria-label="下个月"><ChevronRight :size="18" /></button>
        </div>
        <button class="btn btn-secondary btn-sm" :disabled="isCurrentMonth" @click="goToday">今天</button>
      </template>
    </PageHeader>

    <!-- No profile selected -->
    <div v-if="!profileId" class="card">
      <EmptyState :icon="UserCircle" title="尚未选择命主" description="请先在档案页创建或选择一个命主档案，再查看运势月历。">
        <template #actions>
          <router-link to="/profile" class="btn btn-primary">前往命盘档案</router-link>
        </template>
      </EmptyState>
    </div>

    <!-- Loading -->
    <div v-else-if="loading" class="card loading-state">
      <Loader2 :size="26" class="spin" />
      <span>加载中…</span>
    </div>

    <!-- ═══ Layer 1: Monthly Grid ═══ -->
    <div v-else-if="layer === 'grid'" class="grid-layer">
      <!-- Generation controls -->
      <section v-if="weeks.length > 0" class="card card-compact gen-panel">
        <div class="gen-head">
          <div class="gen-progress">
            <div class="gen-progress-text">
              <span>本月运势</span>
              <strong class="tabular">已生成 {{ generatedCount }}/{{ weeks.length }} 周</strong>
            </div>
            <div class="progress-track"><div class="progress-fill" :style="{ width: `${progressPct}%` }" /></div>
          </div>
          <button
            class="btn btn-sm"
            :class="allGenerated ? 'btn-secondary' : 'btn-primary'"
            :disabled="busy"
            @click="requestGenerateAll"
          >
            <Loader2 v-if="generatingAll" :size="14" class="spin" />
            <RefreshCw v-else-if="allGenerated" :size="14" />
            <Sparkles v-else :size="14" />
            {{ generatingAll ? '生成中…' : allGenerated ? '重新生成整月' : '生成整月' }}
          </button>
        </div>
        <div class="week-chips">
          <button
            v-for="w in weeks"
            :key="w.weekIndex"
            class="week-chip"
            :class="{ generated: w.generated, generating: generatingWeek === w.weekIndex }"
            :disabled="busy"
            :title="w.generated ? '点击重新生成本周' : '点击生成本周'"
            @click="requestGenerateWeek(w.weekIndex)"
          >
            <span class="wc-icon">
              <Loader2 v-if="generatingWeek === w.weekIndex" :size="12" class="spin" />
              <RefreshCw v-else-if="w.generated" :size="12" />
              <Sparkles v-else :size="12" />
            </span>
            <span class="wc-range tabular">{{ w.startDate.slice(5).replace('-', '/') }}–{{ w.endDate.slice(5).replace('-', '/') }}</span>
          </button>
        </div>
      </section>

      <!-- Grid -->
      <div class="card month-card">
        <div class="month-grid">
          <div
            v-for="(d, i) in ['一', '二', '三', '四', '五', '六', '日']"
            :key="d"
            class="weekday-header"
            :class="{ weekend: i >= 5 }"
          >{{ d }}</div>
          <template v-for="(cell, idx) in gridCells" :key="idx">
            <div v-if="!cell" class="grid-cell empty" />
            <button
              v-else
              type="button"
              class="grid-cell"
              :class="[
                cell.fortune ? `level-${ratingToLevel(cell.fortune.rating)} has-data` : 'no-data',
                { today: cell.dateStr === todayStr, weekend: cell.weekend },
              ]"
              :disabled="!cell.fortune"
              :aria-label="cell.fortune ? `${cell.dateStr} ${cell.fortune.rating} ${cell.fortune.overallScore}分` : cell.dateStr"
              @click="cell.fortune && openCards(cell.dateStr)"
            >
              <div class="cell-top">
                <span class="cell-day tabular">{{ cell.day }}</span>
                <span v-if="cell.fortune" class="cell-score tabular">{{ cell.fortune.overallScore }}</span>
              </div>
              <template v-if="cell.fortune">
                <span class="cell-ganZhi serif">{{ cell.fortune.dayGanZhi }}</span>
                <span class="cell-lunar">{{ cell.fortune.lunarDate }}</span>
              </template>
              <span v-if="cell.dateStr === todayStr" class="today-dot">今</span>
            </button>
          </template>
        </div>

        <div class="legend">
          <span v-for="l in LEGEND" :key="l.level" class="legend-item">
            <span class="legend-swatch" :class="`level-${l.level}`" />{{ l.label }}
          </span>
          <span class="legend-hint">点击已生成的日期查看运势卡片</span>
        </div>
      </div>

      <div v-if="!weeks.length && !calendar?.days?.length" class="card">
        <EmptyState compact :icon="CalendarDays" title="本月暂无数据" description="该月份暂无可生成的运势数据。" />
      </div>
    </div>

    <!-- ═══ Layer 2: Card Flow ═══ -->
    <div v-else class="card-layer">
      <div class="cards-toolbar">
        <button class="btn btn-secondary btn-sm" @click="backToGrid">
          <ArrowLeft :size="14" /> 返回月历
        </button>
        <span class="text-muted cards-count">{{ currentMonth }}月 · 共 {{ sortedDays.length }} 天</span>
      </div>

      <article
        v-for="day in sortedDays"
        :key="day.date"
        :id="`card-${day.date}`"
        class="card day-card"
        :class="{ today: day.date === todayStr }"
      >
        <div class="dc-head">
          <div class="dc-rating" :class="`level-${ratingToLevel(day.rating)}`">
            <ScoreRing :score="day.overallScore" :size="54" :label="day.rating" />
          </div>
          <div class="dc-info">
            <div class="dc-date-row">
              <span class="dc-date">{{ formatDateCn(day.date) }}</span>
              <span v-if="day.date === todayStr" class="badge badge-solid">今天</span>
            </div>
            <div class="dc-meta">
              <span class="dc-ganZhi serif">{{ day.dayGanZhi }}</span>
              <span>{{ day.lunarDate }}</span>
              <span v-if="day.tenGod" class="badge">{{ day.tenGod }}</span>
            </div>
          </div>
        </div>

        <p v-if="day.tagline" class="dc-tagline serif">{{ day.tagline }}</p>
        <p v-if="day.overview" class="dc-overview">{{ day.overview }}</p>

        <div v-if="day.favorable.length || day.unfavorable.length" class="dc-yiji">
          <div v-if="day.favorable.length" class="yj-row">
            <span class="yj-label yi"><ThumbsUp :size="12" /> 宜</span>
            <div class="yj-tags">
              <span v-for="(f, i) in day.favorable" :key="i" class="yj-tag">{{ f }}</span>
            </div>
          </div>
          <div v-if="day.unfavorable.length" class="yj-row">
            <span class="yj-label ji"><ThumbsDown :size="12" /> 忌</span>
            <div class="yj-tags">
              <span v-for="(u, i) in day.unfavorable" :key="i" class="yj-tag">{{ u }}</span>
            </div>
          </div>
        </div>

        <div class="dc-foot">
          <button class="btn btn-ghost btn-sm" @click="goToDailyDetail(day.date)">
            查看详解 <ArrowRight :size="14" />
          </button>
        </div>
      </article>
    </div>
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
.month-label {
  min-width: 96px;
  text-align: center;
  font-size: 1rem;
  font-weight: 700;
}

/* ── Generation panel ── */
.gen-panel { margin-bottom: var(--space-md); }
.gen-head {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  margin-bottom: 12px;
}
.gen-progress { flex: 1; min-width: 0; }
.gen-progress-text {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-sm);
  margin-bottom: 6px;
  font-size: 0.82rem;
  color: var(--color-text-muted);
}
.gen-progress-text strong { color: var(--color-text-primary); font-weight: 600; }
.progress-track {
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--color-bg-tertiary);
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--color-accent);
  transition: width 0.4s ease;
}
.week-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.week-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 0.76rem;
  cursor: pointer;
  transition: all var(--transition-fast);
}
.week-chip .wc-icon { display: inline-flex; color: var(--color-accent); }
.week-chip:hover:not(:disabled) { border-color: var(--color-accent); color: var(--color-accent); }
.week-chip.generated {
  border-style: solid;
  border-color: color-mix(in srgb, var(--color-success) 35%, var(--color-border));
  background: var(--color-success-soft);
  color: var(--color-success);
}
.week-chip.generated .wc-icon { color: inherit; }
.week-chip.generating { border-color: var(--color-accent); color: var(--color-accent); }
.week-chip:disabled { cursor: not-allowed; opacity: 0.6; }
.week-chip.generating:disabled { opacity: 1; }

/* ── Month grid ── */
.month-card { padding: var(--space-md); }
.month-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
}
.weekday-header {
  padding: 4px 0 6px;
  text-align: center;
  font-size: 0.76rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--color-text-muted);
}
.weekday-header.weekend { color: var(--color-accent); }

.grid-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  min-height: 84px;
  padding: 7px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  font: inherit;
  text-align: left;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast), border-color var(--transition-fast);
}
.grid-cell.empty { border-color: transparent; background: transparent; }
.grid-cell.no-data { color: var(--color-text-muted); background: color-mix(in srgb, var(--color-bg-tertiary) 45%, transparent); cursor: default; }
.grid-cell.has-data { cursor: pointer; }
.grid-cell.has-data:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
.grid-cell.level-great, .grid-cell.level-good, .grid-cell.level-neutral,
.grid-cell.level-bad, .grid-cell.level-terrible { border-color: transparent; }
[data-theme='dark'] .grid-cell.has-data { border-width: 1px; }
[data-theme='dark'] .grid-cell.level-great { border-color: var(--color-level-great-border); }
[data-theme='dark'] .grid-cell.level-good { border-color: var(--color-level-good-border); }
[data-theme='dark'] .grid-cell.level-neutral { border-color: var(--color-level-neutral-border); }
[data-theme='dark'] .grid-cell.level-bad { border-color: var(--color-level-bad-border); }
[data-theme='dark'] .grid-cell.level-terrible { border-color: var(--color-level-terrible-border); }

.grid-cell.today {
  box-shadow: 0 0 0 2px var(--color-accent);
}
.grid-cell.today.has-data:hover { box-shadow: 0 0 0 2px var(--color-accent), var(--shadow-md); }

.cell-top { display: flex; align-items: baseline; justify-content: space-between; width: 100%; }
.cell-day { font-size: 0.95rem; font-weight: 700; line-height: 1.2; }
.grid-cell.weekend.no-data .cell-day { color: var(--color-accent); opacity: 0.7; }
.cell-score {
  font-family: var(--font-serif);
  font-size: 0.8rem;
  font-weight: 700;
}
.cell-ganZhi { font-size: 0.8rem; font-weight: 600; opacity: 0.9; margin-top: 2px; }
.cell-lunar { font-size: 0.68rem; opacity: 0.72; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.today-dot {
  position: absolute;
  right: 6px;
  bottom: 6px;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font-family: var(--font-serif);
  font-size: 0.64rem;
  font-weight: 700;
}

/* Legend */
.legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 14px;
  margin-top: var(--space-md);
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
  font-size: 0.76rem;
  color: var(--color-text-secondary);
}
.legend-item { display: inline-flex; align-items: center; gap: 5px; }
.legend-swatch {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  border: 1px solid transparent;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, currentColor 30%, transparent);
}
.legend-hint { margin-left: auto; color: var(--color-text-muted); }

/* ── Card flow ── */
.card-layer { display: flex; flex-direction: column; gap: var(--space-md); }
.cards-toolbar {
  position: sticky;
  top: calc(var(--header-height) + 8px);
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-bg-secondary) 88%, transparent);
  backdrop-filter: blur(8px);
}
.cards-count { font-size: 0.8rem; }

.day-card {
  scroll-margin-top: calc(var(--header-height) + 64px);
  padding: var(--space-md) var(--space-lg);
}
.day-card.today { border-color: var(--color-accent); }
.dc-head { display: flex; align-items: center; gap: var(--space-md); }
.dc-rating {
  display: grid;
  place-items: center;
  padding: 4px;
  border-radius: 50%;
  background: transparent !important;
}
.dc-info { min-width: 0; }
.dc-date-row { display: flex; align-items: center; gap: 8px; }
.dc-date { font-size: 1.05rem; font-weight: 700; }
.dc-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin-top: 2px;
  font-size: 0.82rem;
  color: var(--color-text-muted);
}
.dc-ganZhi { font-size: 1rem; font-weight: 700; color: var(--color-text-primary); }
.dc-tagline {
  margin-top: 12px;
  font-size: 0.98rem;
  font-weight: 700;
  color: var(--color-text-primary);
}
.dc-overview {
  margin-top: 6px;
  font-size: 0.88rem;
  line-height: 1.8;
  color: var(--color-text-secondary);
}

.dc-yiji {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: var(--color-bg-tertiary);
}
.yj-row { display: flex; align-items: flex-start; gap: 10px; }
.yj-label {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 0.76rem;
  font-weight: 700;
}
.yj-label.yi { background: var(--color-ji-soft); color: var(--color-ji); }
.yj-label.ji { background: var(--color-xiong-soft); color: var(--color-xiong); }
.yj-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.yj-tag {
  padding: 1px 8px;
  border-radius: var(--radius-full);
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  font-size: 0.76rem;
  line-height: 1.6;
}
.dc-foot { display: flex; justify-content: flex-end; margin-top: 8px; }
.dc-foot .btn { color: var(--color-accent); }

/* ── Mobile ── */
@media (max-width: 640px) {
  .month-card { padding: 8px; }
  .month-grid { gap: 3px; }
  .grid-cell { min-height: 58px; padding: 4px 4px 3px; border-radius: var(--radius-sm); }
  .cell-top { flex-direction: column; align-items: flex-start; }
  .cell-day { font-size: 0.82rem; }
  .cell-score { font-size: 0.68rem; }
  .cell-ganZhi { display: none; }
  .cell-lunar { font-size: 0.58rem; }
  .today-dot { width: 14px; height: 14px; font-size: 0.55rem; right: 3px; bottom: 3px; }
  .legend-hint { margin-left: 0; width: 100%; }
  .gen-head { flex-wrap: wrap; }
  .gen-head .btn { width: 100%; }
  .day-card { padding: var(--space-md); }
}
</style>
