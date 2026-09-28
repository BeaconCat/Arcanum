<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  Loader2, Sparkles, Compass, Palette, Hash, ChevronLeft, ChevronRight,
  Briefcase, Wallet, Users, Heart, Activity, BarChart3, Stars, CalendarClock,
  ThumbsUp, ThumbsDown, Clock, Tags, RefreshCw, FileQuestion,
} from 'lucide-vue-next';
import { useProfileStore } from '../stores/use-profile-store';
import { apiGetDailyDetail, apiGenerateDailyDetail } from '../api/fortune.api';
import type { DailyDetail } from '../../shared/types/fortune.types';
import PageHeader from '../components/common/PageHeader.vue';
import EmptyState from '../components/common/EmptyState.vue';
import ScoreRing from '../components/common/ScoreRing.vue';
import { useFeedback, errorMessage } from '../composables/useFeedback';
import { ratingToLevel, localDateStr, formatDateCn } from '../utils/fortune';

const props = defineProps<{ date: string }>();
const router = useRouter();
const profileStore = useProfileStore();
const { toast } = useFeedback();

const detail = ref<DailyDetail | null>(null);
const loading = ref(false);
const generating = ref(false);

const profileId = computed(() => profileStore.currentProfileId);
const isToday = computed(() => props.date === localDateStr());

const eventSections = [
  { key: 'career', label: '事业', icon: Briefcase },
  { key: 'wealth', label: '财运', icon: Wallet },
  { key: 'relationship', label: '人际', icon: Users },
  { key: 'emotion', label: '感情', icon: Heart },
  { key: 'health', label: '健康', icon: Activity },
];

const dimensionLabels: Record<string, string> = {
  career: '事业', wealth: '财运', relationship: '感情', health: '健康', study: '学业',
};

const metaTags = computed(() => {
  const m = detail.value?.dayMetadata;
  if (!m) return [];
  const tags: { label: string; value: string; tone?: 'warn' | 'muted' }[] = [];
  const add = (label: string, value: string | undefined, tone?: 'warn' | 'muted') => {
    if (value) tags.push({ label, value, tone });
  };
  add('纳音', m.naYin);
  add('值星', m.zhiXing);
  add('六曜', m.liuYao);
  add('月相', m.yueXiang);
  add('九星', m.dayNineStar);
  add('元运', m.yuanYun);
  add('节候', m.hou);
  add('物候', m.wuHou);
  add('季节', m.season);
  add('太岁', m.taiSuiPos);
  add('日冲', m.dayChong, 'warn');
  add('煞方', m.daySha, 'warn');
  add('彭祖', m.pengZuGan, 'muted');
  add('彭祖', m.pengZuZhi, 'muted');
  return tags;
});

const hasPalaces = computed(() => !!detail.value?.flowContext && Object.keys(detail.value.flowContext.dailyPalaces || {}).length > 0);

// 当前时辰：子时 23-1, 丑时 1-3 …
// Match by 地支 character rather than array index so backend ordering doesn't matter
const ZHI_ORDER = '子丑寅卯辰巳午未申酉戌亥';
const currentZhi = computed(() => {
  if (!isToday.value) return '';
  const h = new Date().getHours();
  return ZHI_ORDER[Math.floor(((h + 1) % 24) / 2)];
});
function isCurrentHour(hour: string): boolean {
  return !!currentZhi.value && hourName(hour).startsWith(currentZhi.value);
}

function hourName(h: string) {
  return h.split(' ')[0];
}
function hourRange(h: string) {
  return h.match(/\((.*)\)/)?.[1] || '';
}

function shiftDate(delta: number) {
  const [y, m, d] = props.date.split('-').map(Number);
  const next = new Date(y, m - 1, d + delta);
  router.push({ name: 'DailyDetail', params: { date: localDateStr(next) } });
}

async function loadDetail() {
  if (!profileId.value) return;
  loading.value = true;
  try {
    detail.value = await apiGetDailyDetail(profileId.value, props.date);
  } catch {
    detail.value = null;
  } finally {
    loading.value = false;
  }
}

async function generate() {
  if (!profileId.value) return;
  generating.value = true;
  try {
    detail.value = await apiGenerateDailyDetail(profileId.value, props.date);
    toast.success('每日详解已生成');
  } catch (err) {
    toast.error(errorMessage(err, '生成失败，请稍后重试'));
  } finally {
    generating.value = false;
  }
}

onMounted(async () => {
  if (!profileStore.profiles.length) await profileStore.loadProfiles();
  await loadDetail();
});
</script>

<template>
  <div class="page page-narrow daily-page">
    <PageHeader
      :title="formatDateCn(date)"
      :subtitle="`${date}${isToday ? ' · 今天' : ''} · 每日详解`"
      :back="{ name: 'Calendar' }"
      back-label="返回月历"
    >
      <template #actions>
        <div class="day-nav">
          <button class="btn btn-secondary btn-sm" @click="shiftDate(-1)" aria-label="前一天">
            <ChevronLeft :size="14" /> 前一天
          </button>
          <button class="btn btn-secondary btn-sm" @click="shiftDate(1)" aria-label="后一天">
            后一天 <ChevronRight :size="14" />
          </button>
        </div>
      </template>
    </PageHeader>

    <!-- Loading -->
    <div v-if="loading" class="card loading-state">
      <Loader2 :size="26" class="spin" />
      <span>加载中…</span>
    </div>

    <!-- Not generated -->
    <div v-else-if="!detail" class="card">
      <EmptyState
        :icon="FileQuestion"
        title="该日详解尚未生成"
        description="天枢将结合命盘与流日信息，推演当日的事业、财运、感情、时辰吉凶等内容。"
      >
        <template #actions>
          <button class="btn btn-primary" :disabled="generating || !profileId" @click="generate">
            <Loader2 v-if="generating" :size="16" class="spin" />
            <Sparkles v-else :size="16" />
            {{ generating ? '推演中…' : '生成详解' }}
          </button>
        </template>
      </EmptyState>
    </div>

    <!-- Detail content -->
    <div v-else class="daily-content">
      <!-- ── Hero ── -->
      <section class="hero card" :class="`level-${ratingToLevel(detail.rating)}`">
        <div class="hero-main">
          <div class="hero-kicker">
            <span>{{ detail.lunarDate }}</span>
            <span v-if="detail.tenGod" class="hero-badge">{{ detail.tenGod }}</span>
          </div>
          <div class="hero-ganZhi serif">{{ detail.dayGanZhi }}<small>日</small></div>
          <p v-if="detail.tagline" class="hero-tagline serif">{{ detail.tagline }}</p>
        </div>
        <ScoreRing :score="detail.overallScore" :size="84" :stroke="3" :label="detail.rating" />
      </section>

      <p v-if="detail.overview" class="overview card">{{ detail.overview }}</p>

      <!-- ── Dimensions ── -->
      <section class="card section">
        <h3 class="section-title"><BarChart3 :size="17" class="icon" /> 五维评分</h3>
        <div class="dim-bars">
          <div v-for="(label, key) in dimensionLabels" :key="key" class="dim-row">
            <span class="dim-label">{{ label }}</span>
            <div class="dim-track">
              <div class="dim-fill" :style="{ width: `${(detail.dimensions as any)[key] || 0}%` }" />
            </div>
            <span class="dim-score tabular">{{ (detail.dimensions as any)[key] || 0 }}</span>
          </div>
        </div>
      </section>

      <!-- ── Metadata tags ── -->
      <section v-if="metaTags.length" class="card section">
        <h3 class="section-title"><Tags :size="17" class="icon" /> 日期信息</h3>
        <div class="meta-tags">
          <span v-for="(t, i) in metaTags" :key="i" class="meta-tag" :class="t.tone">
            <span class="mt-label">{{ t.label }}</span>
            <span class="mt-value">{{ t.value }}</span>
          </span>
        </div>
      </section>

      <!-- ── Event predictions ── -->
      <section class="card section">
        <h3 class="section-title"><CalendarClock :size="17" class="icon" /> 事件预测</h3>
        <div class="event-list">
          <div v-for="sec in eventSections" :key="sec.key" class="event-item">
            <div class="event-icon"><component :is="sec.icon" :size="16" /></div>
            <div class="event-body">
              <div class="event-header">
                <span class="event-label">{{ sec.label }}</span>
                <span v-if="detail.events[sec.key]?.summary" class="event-summary">{{ detail.events[sec.key]?.summary }}</span>
              </div>
              <p v-if="detail.events[sec.key]?.details" class="event-details">{{ detail.events[sec.key]?.details }}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- ── Hourly fortune ── -->
      <section v-if="detail.hourlyFortune?.length" class="card section">
        <h3 class="section-title"><Clock :size="17" class="icon" /> 十二时辰吉凶</h3>
        <div class="hourly-grid">
          <div
            v-for="h in detail.hourlyFortune"
            :key="h.hour"
            class="hourly-cell"
            :class="[`level-${h.level}`, { current: isCurrentHour(h.hour) }]"
          >
            <div class="hourly-top">
              <span class="hourly-name serif">{{ hourName(h.hour) }}</span>
              <span v-if="h.ganZhi" class="hourly-ganzhi serif">{{ h.ganZhi }}</span>
              <span v-if="isCurrentHour(h.hour)" class="now-badge">当前</span>
            </div>
            <span class="hourly-time tabular">{{ hourRange(h.hour) }}</span>
            <div v-if="h.tianShen" class="hourly-meta">
              <span class="hourly-tianshen" :class="{ huangdao: h.tianShenType === '黄道' }">{{ h.tianShen }}</span>
              <span v-if="h.nineStar">{{ h.nineStar.slice(0, 3) }}</span>
            </div>
            <span class="hourly-tip">{{ h.tip }}</span>
            <span v-if="h.chong" class="hourly-chong">冲{{ h.chong }} · 煞{{ h.sha }}</span>
          </div>
        </div>
      </section>

      <!-- ── Palace summary ── -->
      <section v-if="hasPalaces" class="card section">
        <h3 class="section-title"><Stars :size="17" class="icon" /> 流日命盘概要</h3>
        <div v-if="detail.flowContext.flowMutagen.daily.length" class="flow-mutagen">
          <span class="mutagen-label">流日四化</span>
          <span class="mutagen-text">{{ detail.flowContext.flowMutagen.daily.join('、') }}</span>
        </div>
        <div class="palace-grid">
          <div v-for="(info, name) in detail.flowContext.dailyPalaces" :key="name" class="palace-chip">
            <div class="palace-head">
              <span class="palace-name serif">{{ name }}</span>
              <span v-if="info.changsheng12" class="palace-cs12">{{ info.changsheng12 }}</span>
            </div>
            <div v-if="info.natalStars.length" class="palace-row">
              <span class="palace-tag natal">本命</span>
              <span class="palace-stars">{{ info.natalStars.join('、') }}</span>
            </div>
            <div v-if="info.flowStars.length" class="palace-row">
              <span class="palace-tag flow">流运</span>
              <span class="palace-stars">{{ info.flowStars.join('、') }}</span>
            </div>
            <span v-if="info.siHua.length" class="palace-sihua">{{ info.siHua.join('、') }}</span>
          </div>
        </div>
      </section>

      <!-- ── Directions + Lucky ── -->
      <div
        v-if="detail.directions.favorable.length || detail.directions.unfavorable.length || detail.luckyColor || detail.luckyNumber"
        class="row-cards"
      >
        <section v-if="detail.directions.favorable.length || detail.directions.unfavorable.length" class="card section mini-card">
          <h3 class="section-title"><Compass :size="17" class="icon" /> 方位</h3>
          <p v-if="detail.directions.favorable.length" class="mini-row">
            <span class="badge badge-success">吉</span> {{ detail.directions.favorable.join('、') }}
          </p>
          <p v-if="detail.directions.unfavorable.length" class="mini-row">
            <span class="badge badge-error">凶</span> {{ detail.directions.unfavorable.join('、') }}
          </p>
        </section>
        <section v-if="detail.luckyColor || detail.luckyNumber" class="card section mini-card">
          <h3 class="section-title"><Sparkles :size="17" class="icon" /> 开运</h3>
          <p v-if="detail.luckyColor" class="mini-row"><Palette :size="15" class="text-muted" /> 幸运色：{{ detail.luckyColor }}</p>
          <p v-if="detail.luckyNumber" class="mini-row"><Hash :size="15" class="text-muted" /> 幸运数：{{ detail.luckyNumber }}</p>
        </section>
      </div>

      <!-- ── Detailed favorable / unfavorable ── -->
      <section v-if="detail.detailedFavorable.length || detail.detailedUnfavorable.length" class="card section">
        <h3 class="section-title">宜忌详解</h3>
        <div class="yiji-detailed">
          <div v-if="detail.detailedFavorable.length" class="yiji-col">
            <div class="yiji-header yi"><ThumbsUp :size="14" /> 宜</div>
            <div v-for="(f, i) in detail.detailedFavorable" :key="i" class="yiji-item yi">
              <span class="yiji-action">{{ f.action }}</span>
              <span v-if="f.reason" class="yiji-reason">{{ f.reason }}</span>
            </div>
          </div>
          <div v-if="detail.detailedUnfavorable.length" class="yiji-col">
            <div class="yiji-header ji"><ThumbsDown :size="14" /> 忌</div>
            <div v-for="(u, i) in detail.detailedUnfavorable" :key="i" class="yiji-item ji">
              <span class="yiji-action">{{ u.action }}</span>
              <span v-if="u.reason" class="yiji-reason">{{ u.reason }}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Regenerate -->
      <div class="regen-bar">
        <button class="btn btn-secondary" :disabled="generating" @click="generate">
          <Loader2 v-if="generating" :size="16" class="spin" />
          <RefreshCw v-else :size="16" />
          {{ generating ? '重新推演中…' : '重新生成' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.day-nav { display: flex; gap: 6px; }

.daily-content { display: flex; flex-direction: column; gap: var(--space-md); }
.section { padding: var(--space-md) var(--space-lg); }
.section .section-title { font-size: 1rem; margin-bottom: 12px; }

/* ── Hero ── */
.hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  padding: var(--space-lg);
  border: 1px solid transparent;
  box-shadow: var(--shadow-sm);
}
.hero-main { min-width: 0; }
.hero-kicker {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 0.85rem;
  opacity: 0.85;
}
.hero-badge {
  padding: 1px 8px;
  border-radius: var(--radius-full);
  border: 1px solid color-mix(in srgb, currentColor 35%, transparent);
  font-size: 0.72rem;
  font-weight: 600;
}
.hero-ganZhi {
  margin-top: 4px;
  font-size: 2.1rem;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: 0.08em;
}
.hero-ganZhi small { font-size: 0.9rem; margin-left: 4px; opacity: 0.7; letter-spacing: 0; }
.hero-tagline { margin-top: 6px; font-size: 1.02rem; font-weight: 700; }

.overview {
  padding: var(--space-md) var(--space-lg);
  font-size: 0.92rem;
  line-height: 1.9;
  color: var(--color-text-secondary);
  border-left: 3px solid var(--color-accent);
}

/* ── Dimension bars ── */
.dim-bars { display: flex; flex-direction: column; gap: 10px; }
.dim-row { display: flex; align-items: center; gap: 10px; }
.dim-label { width: 2.6em; font-size: 0.84rem; font-weight: 600; color: var(--color-text-secondary); }
.dim-track {
  flex: 1;
  height: 8px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-full);
  overflow: hidden;
}
.dim-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, color-mix(in srgb, var(--color-accent) 55%, transparent), var(--color-accent));
  transition: width 0.6s ease;
}
.dim-score { width: 2em; font-family: var(--font-serif); font-size: 0.88rem; font-weight: 700; text-align: right; }

/* ── Metadata ── */
.meta-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.meta-tag {
  display: inline-flex;
  align-items: stretch;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: 0.78rem;
  line-height: 1.6;
}
.mt-label {
  padding: 1px 7px;
  background: var(--color-bg-tertiary);
  color: var(--color-text-muted);
}
.mt-value { padding: 1px 8px; color: var(--color-text-primary); }
.meta-tag.warn { border-color: color-mix(in srgb, var(--color-warning) 30%, var(--color-border)); }
.meta-tag.warn .mt-label { background: var(--color-warning-soft); color: var(--color-warning); }
.meta-tag.muted .mt-value { color: var(--color-text-secondary); }

/* ── Events ── */
.event-list { display: flex; flex-direction: column; }
.event-item {
  display: flex;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--color-border);
}
.event-item:first-child { padding-top: 0; }
.event-item:last-child { border-bottom: none; padding-bottom: 0; }
.event-icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: var(--radius-md);
  background: var(--color-accent-soft);
  color: var(--color-accent);
}
.event-body { min-width: 0; flex: 1; }
.event-header { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 10px; }
.event-label { font-weight: 700; font-size: 0.92rem; }
.event-summary { font-size: 0.86rem; color: var(--color-text-secondary); }
.event-details {
  margin-top: 4px;
  font-size: 0.86rem;
  line-height: 1.8;
  color: var(--color-text-secondary);
  white-space: pre-line;
}

/* ── Hourly ── */
.hourly-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 6px;
}
.hourly-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
}
.hourly-cell.current { box-shadow: 0 0 0 2px var(--color-accent); }
.hourly-top { display: flex; align-items: baseline; gap: 6px; }
.hourly-name { font-size: 0.92rem; font-weight: 700; }
.hourly-ganzhi { font-size: 0.8rem; font-weight: 600; opacity: 0.85; }
.now-badge {
  margin-left: auto;
  padding: 0 6px;
  border-radius: var(--radius-full);
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font-size: 0.64rem;
  font-weight: 700;
  line-height: 1.6;
}
.hourly-time { font-size: 0.7rem; opacity: 0.7; }
.hourly-meta { display: flex; align-items: center; gap: 6px; font-size: 0.72rem; opacity: 0.85; }
.hourly-tianshen { font-weight: 600; }
.hourly-tianshen.huangdao { text-decoration: underline; text-underline-offset: 2px; }
.hourly-tip { font-size: 0.76rem; line-height: 1.45; margin-top: 2px; }
.hourly-chong { font-size: 0.66rem; opacity: 0.65; }

/* ── Palace ── */
.flow-mutagen {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  background: var(--color-accent-soft);
  font-size: 0.84rem;
}
.mutagen-label { font-weight: 700; color: var(--color-text-secondary); }
.mutagen-text { color: var(--color-accent); font-weight: 600; }
.palace-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
}
.palace-chip {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-bg-tertiary) 50%, var(--color-bg-secondary));
  font-size: 0.8rem;
}
.palace-head { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; }
.palace-name { font-weight: 700; font-size: 0.9rem; color: var(--color-accent); }
.palace-cs12 { font-size: 0.7rem; color: var(--color-text-muted); }
.palace-row { display: flex; align-items: flex-start; gap: 6px; }
.palace-tag {
  flex-shrink: 0;
  padding: 0 5px;
  border-radius: 4px;
  font-size: 0.64rem;
  font-weight: 600;
  line-height: 1.7;
}
.palace-tag.natal { background: var(--color-bg-tertiary); color: var(--color-text-secondary); }
.palace-tag.flow { background: var(--color-accent-soft-strong); color: var(--color-accent); }
.palace-stars { color: var(--color-text-secondary); font-family: var(--font-serif); font-size: 0.78rem; line-height: 1.5; }
.palace-sihua { color: var(--color-accent); font-weight: 600; font-size: 0.76rem; }

/* ── Mini cards ── */
.row-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-md); }
.mini-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  font-size: 0.88rem;
  color: var(--color-text-primary);
}
.mini-row:first-of-type { margin-top: 0; }

/* ── Yiji ── */
.yiji-detailed { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--space-md); }
.yiji-col { display: flex; flex-direction: column; gap: 6px; }
.yiji-header {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: fit-content;
  padding: 2px 10px;
  border-radius: var(--radius-sm);
  font-size: 0.82rem;
  font-weight: 700;
}
.yiji-header.yi { background: var(--color-ji-soft); color: var(--color-ji); }
.yiji-header.ji { background: var(--color-xiong-soft); color: var(--color-xiong); }
.yiji-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  border-left: 3px solid transparent;
  background: var(--color-bg-tertiary);
}
.yiji-item.yi { border-left-color: var(--color-ji); }
.yiji-item.ji { border-left-color: var(--color-xiong); }
.yiji-action { font-size: 0.88rem; font-weight: 600; }
.yiji-reason { font-size: 0.78rem; line-height: 1.6; color: var(--color-text-secondary); }

.regen-bar { display: flex; justify-content: center; padding-top: var(--space-sm); }

/* ── Mobile ── */
@media (max-width: 640px) {
  .day-nav { width: 100%; }
  .day-nav .btn { flex: 1; }
  .section { padding: var(--space-md); }
  .hero { padding: var(--space-md); }
  .hero-ganZhi { font-size: 1.7rem; }
  .overview { padding: var(--space-md); }
  .hourly-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .palace-grid { grid-template-columns: 1fr; }
}
</style>
