<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { RefreshCw, Sparkles, User, Briefcase, Coins, Heart, Activity, Clock, ChevronDown, CalendarDays, MapPin, AlertCircle } from 'lucide-vue-next';
import { apiGetNatalChart, apiGenerateNatalChart, apiGenerateSection, type NatalAnalysis, type AnalysisSection } from '../api/profile.api';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { apiGetProfile } from '../api/profile.api';
import BaziChartCard from '../components/chart/BaziChartCard.vue';
import ZiweiChartCard from '../components/chart/ZiweiChartCard.vue';
import AstroChartCard from '../components/chart/AstroChartCard.vue';
import { useRouter } from 'vue-router';
import PageHeader from '../components/common/PageHeader.vue';
import EmptyState from '../components/common/EmptyState.vue';
import LoadingSpinner from '../components/common/LoadingSpinner.vue';
import type { Profile } from '../../shared/types/profile.types';
import type { BaziChart } from '../../shared/types/bazi.types';
import type { ZiweiChart } from '../../shared/types/ziwei.types';
import { errorMessage, useFeedback } from '../composables/useFeedback';

const props = defineProps<{ profileId: string }>();
const { toast } = useFeedback();

const profile = ref<Profile | null>(null);
const baziChart = ref<BaziChart | null>(null);
const ziweiChart = ref<ZiweiChart | null>(null);
const analysis = ref<NatalAnalysis | null>(null);
const loading = ref(true);
const generating = ref(false);
const regeneratingTab = ref('');
const error = ref('');
const activeTab = ref('overview');
const openChart = ref<'bazi' | 'ziwei' | 'astro' | null>(null);
const router = useRouter();

const tabs = [
  { id: 'overview', label: '总览', icon: Sparkles },
  { id: 'personality', label: '性格', icon: User },
  { id: 'career', label: '事业', icon: Briefcase },
  { id: 'wealth', label: '财运', icon: Coins },
  { id: 'relationship', label: '感情', icon: Heart },
  { id: 'health', label: '健康', icon: Activity },
  { id: 'dayun', label: '大运', icon: Clock },
];

const activeTabLabel = computed(() => tabs.find((t) => t.id === activeTab.value)?.label || '');

const currentSection = computed<AnalysisSection | null>(() => {
  if (!analysis.value?.sections) return null;
  return analysis.value.sections[activeTab.value] || null;
});

const hasAnySection = computed(() => {
  if (!analysis.value?.sections) return false;
  return Object.keys(analysis.value.sections).length > 0;
});

const readyCount = computed(() => tabs.filter((t) => analysis.value?.sections?.[t.id]).length);

const renderedMarkdown = computed(() => {
  if (!currentSection.value?.paragraphs?.length) return '';
  // paragraphs[0] now contains full Markdown content
  const md = currentSection.value.paragraphs.join('\n\n');
  return DOMPurify.sanitize(marked.parse(md, { async: false }) as string);
});

// Rotating hints while the long "generate all" request runs
const genHints = [
  '正在推演八字四柱与五行旺衰…',
  '正在研读紫微十二宫与四化…',
  '正在综合性格与事业格局…',
  '正在推算财运与感情走向…',
  '正在梳理大运流转…',
];
const genHintIdx = ref(0);
const genElapsed = ref(0);
let genTimer: ReturnType<typeof setInterval> | null = null;
watch(generating, (v) => {
  if (genTimer) clearInterval(genTimer);
  genTimer = null;
  if (v) {
    genHintIdx.value = 0;
    genElapsed.value = 0;
    genTimer = setInterval(() => {
      genElapsed.value++;
      if (genElapsed.value % 6 === 0) genHintIdx.value = (genHintIdx.value + 1) % genHints.length;
    }, 1000);
  }
});
onBeforeUnmount(() => { if (genTimer) clearInterval(genTimer); });

onMounted(async () => {
  try {
    const [profileData, natalData] = await Promise.all([
      apiGetProfile(props.profileId),
      apiGetNatalChart(props.profileId),
    ]);
    profile.value = profileData;
    baziChart.value = natalData.bazi;
    ziweiChart.value = natalData.ziwei;
    analysis.value = natalData.analysis;
  } catch (err) {
    error.value = errorMessage(err, '加载失败');
  } finally {
    loading.value = false;
  }
});

async function handleGenerateAll() {
  generating.value = true;
  error.value = '';
  try {
    const data = await apiGenerateNatalChart(props.profileId);
    baziChart.value = data.bazi;
    ziweiChart.value = data.ziwei;
    analysis.value = data.analysis;
    toast.success('深度解析已生成');
  } catch (err) {
    error.value = errorMessage(err, '生成失败，请检查 LLM 连接');
  } finally {
    generating.value = false;
  }
}

async function handleRegenerateTab(tabId: string) {
  regeneratingTab.value = tabId;
  error.value = '';
  try {
    const data = await apiGenerateSection(props.profileId, tabId);
    analysis.value = data.analysis;
  } catch (err) {
    error.value = errorMessage(err, '重新生成失败');
  } finally {
    regeneratingTab.value = '';
  }
}

function toggleChart(which: 'bazi' | 'ziwei' | 'astro') {
  openChart.value = openChart.value === which ? null : which;
}
</script>

<template>
  <div class="page page-medium natal-page">
    <PageHeader :title="profile ? `${profile.name} · 本命详解` : '本命详解'" :back="'/profile'" back-label="返回档案">
      <template v-if="profile" #subtitle>
        <div class="header-meta">
          <span class="badge badge-accent">{{ profile.relation }}</span>
          <span><CalendarDays :size="13" /> {{ profile.birthDate }} {{ profile.birthTime }}</span>
          <span>{{ profile.gender === 'male' ? '男' : '女' }}</span>
          <span v-if="profile.birthPlace"><MapPin :size="13" /> {{ profile.birthPlace }}</span>
        </div>
      </template>
    </PageHeader>

    <!-- Loading -->
    <div v-if="loading" class="card"><LoadingSpinner>加载命盘数据…</LoadingSpinner></div>

    <!-- Error -->
    <div v-else-if="error && !baziChart" class="card">
      <EmptyState :icon="AlertCircle" title="加载失败" :description="error">
        <template #actions>
          <router-link to="/profile" class="btn btn-primary">返回档案</router-link>
        </template>
      </EmptyState>
    </div>

    <!-- Content -->
    <template v-else>
      <!-- Charts (collapsible) -->
      <div class="charts-row">
        <div class="chart-fold card" :class="{ open: openChart === 'bazi' }">
          <button class="fold-head" type="button" :aria-expanded="openChart === 'bazi'" @click="toggleChart('bazi')">
            <span class="fold-seal">八</span>
            <span class="fold-text">
              <strong>八字命盘</strong>
              <small v-if="baziChart">
                {{ baziChart.pillars.year.gan }}{{ baziChart.pillars.year.zhi }}
                {{ baziChart.pillars.month.gan }}{{ baziChart.pillars.month.zhi }}
                {{ baziChart.pillars.day.gan }}{{ baziChart.pillars.day.zhi }}
                {{ baziChart.pillars.hour.gan }}{{ baziChart.pillars.hour.zhi }}
              </small>
            </span>
            <ChevronDown :size="18" class="fold-chevron" />
          </button>
          <div v-if="openChart === 'bazi' && baziChart" class="fold-body">
            <BaziChartCard :chart="baziChart" :profile-id="props.profileId" />
          </div>
        </div>
        <div class="chart-fold card" :class="{ open: openChart === 'ziwei' }">
          <button class="fold-head" type="button" :aria-expanded="openChart === 'ziwei'" @click="toggleChart('ziwei')">
            <span class="fold-seal">紫</span>
            <span class="fold-text">
              <strong>紫微命盘</strong>
              <small v-if="ziweiChart">{{ ziweiChart.fiveElementsClass }} · 命主{{ ziweiChart.soul }} · 身主{{ ziweiChart.body }}</small>
            </span>
            <ChevronDown :size="18" class="fold-chevron" />
          </button>
          <div v-if="openChart === 'ziwei' && ziweiChart" class="fold-body">
            <ZiweiChartCard :chart="ziweiChart" />
          </div>
        </div>
        <div class="chart-fold card" :class="{ open: openChart === 'astro' }">
          <button class="fold-head" type="button" :aria-expanded="openChart === 'astro'" @click="toggleChart('astro')">
            <span class="fold-seal">星</span>
            <span class="fold-text">
              <strong>西洋星盘</strong>
              <small>行星落座 · 宫位 · 相位</small>
            </span>
            <ChevronDown :size="18" class="fold-chevron" />
          </button>
          <div v-if="openChart === 'astro'" class="fold-body">
            <AstroChartCard :profile-id="props.profileId" @edit-place="router.push('/profile')" />
          </div>
        </div>
      </div>

      <!-- LLM Analysis -->
      <section class="analysis-section">
        <div class="analysis-header">
          <h2 class="section-title"><Sparkles :size="18" class="icon" /> 深度解析</h2>
          <button
            v-if="hasAnySection"
            class="btn btn-secondary btn-sm"
            :disabled="generating"
            @click="handleGenerateAll"
          >
            <RefreshCw :size="14" :class="{ spin: generating }" />
            {{ generating ? '全部生成中…' : '全部重新生成' }}
          </button>
        </div>

        <div v-if="error" class="alert alert-error analysis-error">{{ error }}</div>

        <!-- Generating all (first time or regenerate) -->
        <div v-if="generating" class="card gen-card">
          <div class="gen-orbit"><Sparkles :size="22" /></div>
          <p class="gen-hint">{{ genHints[genHintIdx] }}</p>
          <p class="text-muted gen-sub">天枢正并行分析 7 个维度，通常需要 30–90 秒 · 已用时 {{ genElapsed }} 秒</p>
          <div class="gen-skeleton">
            <div class="skeleton" style="width: 92%"></div>
            <div class="skeleton" style="width: 78%"></div>
            <div class="skeleton" style="width: 85%"></div>
          </div>
        </div>

        <!-- No analysis yet -->
        <div v-else-if="!hasAnySection" class="card">
          <EmptyState
            :icon="Sparkles"
            title="尚未生成深度解析"
            description="天枢将结合八字与紫微命盘，从总览、性格、事业、财运、感情、健康、大运 7 个维度逐项解读。"
          >
            <template #actions>
              <button class="btn btn-primary" @click="handleGenerateAll">
                <Sparkles :size="16" />
                生成全部解析
              </button>
            </template>
          </EmptyState>
        </div>

        <!-- Analysis tabs -->
        <template v-else>
          <div class="tabs analysis-tabs">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              class="tab"
              :class="{ active: activeTab === tab.id, empty: !analysis?.sections?.[tab.id] }"
              @click="activeTab = tab.id"
            >
              <component :is="tab.icon" :size="14" />
              {{ tab.label }}
            </button>
          </div>

          <div class="tab-content card">
            <div class="tab-content-header">
              <h3>{{ currentSection?.title || activeTabLabel }}</h3>
              <button
                class="btn btn-ghost btn-sm"
                :disabled="regeneratingTab === activeTab"
                @click="handleRegenerateTab(activeTab)"
              >
                <RefreshCw :size="13" :class="{ spin: regeneratingTab === activeTab }" />
                {{ regeneratingTab === activeTab ? '生成中' : currentSection ? '重新生成' : '生成此项' }}
              </button>
            </div>

            <!-- Section loading -->
            <div v-if="regeneratingTab === activeTab" class="section-loading">
              <p class="text-muted"><Sparkles :size="14" class="spin-slow" /> 正在生成「{{ activeTabLabel }}」…</p>
              <div class="skeleton" style="width: 60%; height: 14px"></div>
              <div class="skeleton" style="width: 95%"></div>
              <div class="skeleton" style="width: 88%"></div>
              <div class="skeleton" style="width: 72%"></div>
            </div>

            <!-- Section not generated yet -->
            <EmptyState
              v-else-if="!currentSection"
              compact
              :icon="Sparkles"
              :description="`「${activeTabLabel}」维度尚未生成，点击右上角单独生成`"
            />

            <!-- Section content -->
            <template v-else>
              <div class="key-points" v-if="currentSection.keyPoints.length > 0">
                <div v-for="(kp, i) in currentSection.keyPoints" :key="i" class="kp-card">
                  <span class="kp-label">{{ kp.label }}</span>
                  <span class="kp-value">{{ kp.value }}</span>
                </div>
              </div>
              <div class="md-content markdown-body" v-html="renderedMarkdown"></div>
            </template>
          </div>

          <div v-if="analysis" class="generated-info">
            已生成 {{ readyCount }}/{{ tabs.length }} 项 · 生成于 {{ new Date(analysis.generatedAt).toLocaleString('zh-CN') }}
          </div>
        </template>
      </section>
    </template>
  </div>
</template>

<style scoped>
.header-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 14px;
  margin-top: 4px;
}
.header-meta span { display: inline-flex; align-items: center; gap: 4px; }

/* ── Charts fold ── */
.charts-row {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-sm);
  margin-bottom: var(--space-xl);
}
.chart-fold { padding: 0; overflow: hidden; }
.fold-head {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px var(--space-md);
  border: none;
  background: transparent;
  color: var(--color-text-primary);
  text-align: left;
  cursor: pointer;
  transition: background var(--transition-fast);
}
.fold-head:hover { background: var(--color-bg-tertiary); }
.fold-seal {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 8px;
  background: var(--color-accent-soft);
  color: var(--color-accent);
  font-family: var(--font-serif);
  font-size: 1rem;
  font-weight: 700;
}
.fold-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.fold-text strong { font-family: var(--font-serif); font-size: 0.98rem; }
.fold-text small {
  font-family: var(--font-serif);
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fold-chevron { color: var(--color-text-muted); flex-shrink: 0; transition: transform var(--transition-fast); }
.chart-fold.open .fold-chevron { transform: rotate(180deg); }
.chart-fold.open .fold-head { border-bottom: 1px solid var(--color-border); }
.fold-body { padding: var(--space-md); animation: fadeIn 0.25s ease; }
/* The embedded chart card sits inside this card — drop its own frame */
.fold-body > .card { border: none; box-shadow: none; padding: 0; background: transparent; }

/* ── Analysis ── */
.analysis-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  margin-bottom: var(--space-md);
}
.analysis-header .section-title { margin-bottom: 0; }
.analysis-error { margin-bottom: var(--space-md); }

.gen-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: var(--space-2xl) var(--space-lg);
  text-align: center;
}
.gen-orbit {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  margin-bottom: 6px;
  border-radius: 50%;
  background: var(--color-accent-soft);
  color: var(--color-accent);
  animation: pulse 1.8s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 var(--color-accent-soft-strong); }
  50% { box-shadow: 0 0 0 12px transparent; }
}
.gen-hint { font-family: var(--font-serif); font-size: 1rem; font-weight: 600; }
.gen-sub { font-size: 0.8rem; }
.gen-skeleton { display: flex; flex-direction: column; gap: 8px; width: min(420px, 100%); margin-top: var(--space-md); }
.gen-skeleton .skeleton, .section-loading .skeleton { height: 10px; }

.analysis-tabs { margin-bottom: var(--space-md); }
.tab.empty:not(.active) { color: var(--color-text-muted); opacity: 0.75; }

.tab-content { min-height: 220px; }
.tab-content-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  margin-bottom: var(--space-md);
  padding-bottom: 10px;
  border-bottom: 1px solid var(--color-border);
}
.tab-content-header h3 { font-size: 1.1rem; color: var(--color-text-primary); }

.section-loading { display: flex; flex-direction: column; gap: 10px; padding: var(--space-md) 0; }
.section-loading p { display: inline-flex; align-items: center; gap: 6px; font-size: 0.86rem; }
.spin-slow { animation: spin 2.4s linear infinite; }

/* ── Key points ── */
.key-points {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-sm);
  margin-bottom: var(--space-lg);
}
.kp-card {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  background: var(--color-bg-tertiary);
  border-left: 3px solid var(--color-accent);
}
.kp-label { font-size: 0.72rem; font-weight: 600; letter-spacing: 0.06em; color: var(--color-accent); }
.kp-value { font-size: 0.86rem; line-height: 1.55; color: var(--color-text-primary); }

/* ── Markdown ── */
.md-content {
  font-size: 0.93rem;
  line-height: 1.9;
  color: var(--color-text-secondary);
}
.md-content :deep(h2) {
  font-size: 1.02rem;
  color: var(--color-accent);
  margin: var(--space-lg) 0 var(--space-sm);
  padding-bottom: 4px;
  border-bottom: 1px solid var(--color-border);
}
.md-content :deep(h2:first-child) { margin-top: 0; }
.md-content :deep(h3) { font-size: 0.95rem; color: var(--color-text-primary); margin: var(--space-md) 0 4px; }
.md-content :deep(p) { margin: var(--space-sm) 0; text-indent: 2em; }
.md-content :deep(li p) { text-indent: 0; margin: 2px 0; }
.md-content :deep(blockquote p) { text-indent: 0; }
.md-content :deep(th) { color: var(--color-accent); }

.generated-info {
  margin-top: var(--space-sm);
  font-size: 0.74rem;
  color: var(--color-text-muted);
  text-align: right;
}

@media (max-width: 640px) {
  .key-points { grid-template-columns: 1fr; }
  .md-content { font-size: 0.9rem; }
  .fold-body { padding: var(--space-sm); }
}
</style>
