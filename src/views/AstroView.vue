<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  Settings2, RefreshCw, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, MapPin, AlertTriangle, Orbit, Users, Clock,
} from 'lucide-vue-next';
import PageHeader from '../components/common/PageHeader.vue';
import EmptyState from '../components/common/EmptyState.vue';
import LoadingSpinner from '../components/common/LoadingSpinner.vue';
import AstroWheel from '../components/chart/AstroWheel.vue';
import AstroChartDetails from '../components/chart/AstroChartDetails.vue';
import AstroCrossDetails from '../components/chart/AstroCrossDetails.vue';
import AstroCompatibilityPanel from '../components/chart/AstroCompatibilityPanel.vue';
import AstroSettingsModal from '../components/chart/AstroSettingsModal.vue';
import AstroInterpretationPanel from '../components/chart/AstroInterpretationPanel.vue';
import type { AstroInterpretRequest } from '../api/astro-interpret.api';
import { useProfileStore } from '../stores/use-profile-store';
import { useFeedback, errorMessage } from '../composables/useFeedback';
import { localDateStr } from '../utils/fortune';
import {
  apiGetAstroChart, apiGetAstroTransit, apiGetAstroProgressed, apiGetAstroSolarReturn,
  apiGetAstroSynastry, apiGetAstroComposite, type AstroCompositeApiResponse,
} from '../api/chart.api';
import type { AstroBiWheelResponse, AstroChart, BirthPlaceResolution } from '../../shared/types/astro.types';
import {
  PRECISION_LABEL, loadSettings, saveSettings, toServerSettings, type AstroViewSettings, type AstroWorkbenchKind,
} from '../utils/astro';

const route = useRoute();
const router = useRouter();
const profileStore = useProfileStore();
const { toast } = useFeedback();

const TABS: { key: AstroWorkbenchKind; label: string; hint: string }[] = [
  { key: 'natal', label: '本命盘', hint: '出生时刻的行星与宫位' },
  { key: 'transit', label: '行运', hint: '当下（或任意时刻）的天象与本命盘的互动' },
  { key: 'progressed', label: '次限推运', hint: '出生后一天象征一年的推运盘' },
  { key: 'solar-return', label: '太阳返照', hint: '太阳回到本命位置的时刻，看一年主题' },
  { key: 'synastry', label: '比较盘', hint: '两人星盘叠加，看彼此的互动与匹配度' },
  { key: 'composite', label: '组合盘', hint: '两人行星中点构成的「关系本身」的星盘' },
];
const isTab = (v: unknown): v is AstroWorkbenchKind => TABS.some((t) => t.key === v);

const tab = ref<AstroWorkbenchKind>(isTab(route.query.tab) ? route.query.tab : 'natal');
const tabMeta = computed(() => TABS.find((t) => t.key === tab.value)!);
const isPair = computed(() => tab.value === 'synastry' || tab.value === 'composite');

// ── Settings per kind ──
const settingsMap = ref<Record<AstroWorkbenchKind, AstroViewSettings>>(
  Object.fromEntries(TABS.map((t) => [t.key, loadSettings(t.key)])) as Record<AstroWorkbenchKind, AstroViewSettings>,
);
const settings = computed(() => settingsMap.value[tab.value]);
const showSettings = ref(false);
function applySettings(s: AstroViewSettings) {
  settingsMap.value[tab.value] = s;
  saveSettings(tab.value, s);
  load();
}

// ── Subjects ──
const profiles = computed(() => profileStore.profiles);
const personA = ref<string>('');
const personB = ref<string>('');

function initPeople() {
  if (!personA.value || !profiles.value.some((p) => p.profileId === personA.value)) {
    personA.value = profileStore.currentProfileId || profiles.value[0]?.profileId || '';
  }
  if (!personB.value || personB.value === personA.value || !profiles.value.some((p) => p.profileId === personB.value)) {
    personB.value = profiles.value.find((p) => p.profileId !== personA.value)?.profileId || '';
  }
}
const nameOf = (id: string) => profiles.value.find((p) => p.profileId === id)?.name || '';

// ── Time inputs ──
const now = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const transitDate = ref(localDateStr(now));
const transitTime = ref(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
const progressedDate = ref(localDateStr(now));
const returnYear = ref(now.getFullYear());

function shiftTransit(days: number, months = 0) {
  const [y, m, d] = transitDate.value.split('-').map(Number);
  const dt = new Date(y, m - 1 + months, d + days);
  transitDate.value = localDateStr(dt);
}
function transitNow() {
  const n = new Date();
  transitDate.value = localDateStr(n);
  transitTime.value = `${pad(n.getHours())}:${pad(n.getMinutes())}`;
}

// ── Data ──
const loading = ref(false);
const error = ref('');
const natal = ref<{ chart: AstroChart; place: BirthPlaceResolution } | null>(null);
const bi = ref<AstroBiWheelResponse | null>(null);
const composite = ref<AstroCompositeApiResponse | null>(null);
let seq = 0;

const hasEnoughPeople = computed(() => !isPair.value || (personA.value && personB.value && personA.value !== personB.value));

// ── Interpretation (original text library) ──
const interpretRequest = computed<AstroInterpretRequest | null>(() => {
  if (!personA.value || !hasEnoughPeople.value) return null;
  const k = tab.value;
  return {
    kind: k,
    a: personA.value,
    b: isPair.value ? personB.value : undefined,
    date: k === 'transit' ? transitDate.value : k === 'progressed' ? progressedDate.value : undefined,
    time: k === 'transit' ? transitTime.value : undefined,
    year: k === 'solar-return' ? returnYear.value : undefined,
    settings: toServerSettings(settings.value),
  };
});

async function load() {
  initPeople();
  if (!personA.value) return;
  if (!hasEnoughPeople.value) { natal.value = null; bi.value = null; composite.value = null; return; }
  const id = ++seq;
  const kind = tab.value;
  const s = toServerSettings(settings.value);
  loading.value = true;
  error.value = '';
  try {
    if (kind === 'natal') {
      const r = await apiGetAstroChart(personA.value, s.houseSystem, s);
      if (id !== seq) return;
      natal.value = r; bi.value = null; composite.value = null;
    } else if (kind === 'composite') {
      const r = await apiGetAstroComposite(personA.value, personB.value, s);
      if (id !== seq) return;
      composite.value = r; natal.value = null; bi.value = null;
    } else {
      let r: AstroBiWheelResponse;
      if (kind === 'transit') r = await apiGetAstroTransit(personA.value, transitDate.value, transitTime.value, s);
      else if (kind === 'progressed') r = await apiGetAstroProgressed(personA.value, progressedDate.value, s);
      else if (kind === 'solar-return') r = await apiGetAstroSolarReturn(personA.value, returnYear.value, s);
      else r = await apiGetAstroSynastry(personA.value, personB.value, s);
      if (id !== seq) return;
      bi.value = r; natal.value = null; composite.value = null;
    }
  } catch (err) {
    if (id !== seq) return;
    const msg = (err as any)?.response?.status === 404 ? '该星盘接口暂不可用，请稍后再试' : errorMessage(err, '星盘计算失败');
    error.value = msg;
    toast.error(msg);
    natal.value = null; bi.value = null; composite.value = null;
  } finally {
    if (id === seq) loading.value = false;
  }
}

// Debounce reloads triggered by rapid input changes (date pickers, arrows)
let timer: ReturnType<typeof setTimeout> | null = null;
function scheduleLoad() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(load, 250);
}

watch(tab, (t) => {
  router.replace({ query: { ...route.query, tab: t } });
  natal.value = null; bi.value = null; composite.value = null;
  load();
});
watch([personA, personB], scheduleLoad);
watch([transitDate, transitTime], () => { if (tab.value === 'transit') scheduleLoad(); });
watch(progressedDate, () => { if (tab.value === 'progressed') scheduleLoad(); });
watch(returnYear, () => { if (tab.value === 'solar-return') scheduleLoad(); });

onMounted(async () => {
  if (!profileStore.profiles.length) {
    try { await profileStore.loadProfiles(); } catch { /* handled by empty state */ }
  }
  initPeople();
  load();
});

// ── Derived view data ──
const places = computed<{ label: string; place: BirthPlaceResolution }[]>(() => {
  if (natal.value) return [{ label: nameOf(personA.value), place: natal.value.place }];
  if (bi.value?.places) {
    const res = [{ label: bi.value.innerLabel, place: bi.value.places.inner }];
    if (bi.value.places.outer && tab.value === 'synastry') res.push({ label: bi.value.outerLabel, place: bi.value.places.outer });
    return res;
  }
  if (composite.value?.places) {
    return [
      { label: composite.value.labelA, place: composite.value.places.a },
      { label: composite.value.labelB, place: composite.value.places.b },
    ];
  }
  return [];
});
const isLow = (p: BirthPlaceResolution) => p.precision === 'province' || p.precision === 'default';
const anyLow = computed(() => places.value.some((p) => isLow(p.place)));

const detailTab = ref<'cross' | 'inner' | 'outer'>('cross');
watch(tab, () => { detailTab.value = 'cross'; });

// ── Interpretation → wheel spotlight ──
const focusRefs = ref<string[]>([]);
const wheelAnchor = ref<HTMLElement | null>(null);
function onInterpFocus(refs: string[]) {
  const same = refs.length === focusRefs.value.length && refs.every((r, i) => r === focusRefs.value[i]);
  focusRefs.value = same ? [] : refs;
  if (!same) wheelAnchor.value?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
watch(tab, () => { focusRefs.value = []; });

const yearOptions = computed(() => {
  const y = new Date().getFullYear();
  return Array.from({ length: 21 }, (_, i) => y - 10 + i);
});

function fmtMoment(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
</script>

<template>
  <div class="page astro-page">
    <PageHeader title="星盘工作台" :subtitle="tabMeta.hint">
      <template #actions>
        <router-link to="/astro/map" class="btn btn-ghost">
          <MapPin :size="16" />地理占星
        </router-link>
        <button class="btn btn-secondary" type="button" @click="showSettings = true">
          <Settings2 :size="16" />盘面设置
        </button>
        <button class="btn-icon" type="button" :disabled="loading" title="重新计算" aria-label="重新计算" @click="load">
          <RefreshCw :size="17" :class="{ spin: loading }" />
        </button>
      </template>
    </PageHeader>

    <div class="tabs astro-tabs" role="tablist">
      <button v-for="t in TABS" :key="t.key" class="tab" role="tab" :aria-selected="tab === t.key" :class="{ active: tab === t.key }" @click="tab = t.key">
        {{ t.label }}
      </button>
    </div>

    <EmptyState
      v-if="!profiles.length"
      :icon="Orbit"
      title="还没有命主档案"
      description="星盘需要出生日期、时间与出生地，请先创建档案。"
    >
      <template #actions><router-link to="/profile" class="btn btn-primary">去创建档案</router-link></template>
    </EmptyState>

    <template v-else>
      <!-- Controls -->
      <div class="card card-compact controls">
        <div class="ctl">
          <label class="form-label" for="astro-a">{{ isPair ? '甲方' : '命主' }}</label>
          <select id="astro-a" v-model="personA" class="input input-sm">
            <option v-for="p in profiles" :key="p.profileId" :value="p.profileId">{{ p.name }}（{{ p.relation }}）</option>
          </select>
        </div>
        <div v-if="isPair" class="ctl">
          <label class="form-label" for="astro-b">乙方</label>
          <select id="astro-b" v-model="personB" class="input input-sm">
            <option value="" disabled>请选择</option>
            <option v-for="p in profiles.filter((x) => x.profileId !== personA)" :key="p.profileId" :value="p.profileId">{{ p.name }}（{{ p.relation }}）</option>
          </select>
        </div>

        <template v-if="tab === 'transit'">
          <div class="ctl">
            <label class="form-label" for="astro-td">行运日期</label>
            <input id="astro-td" v-model="transitDate" type="date" class="input input-sm" />
          </div>
          <div class="ctl ctl-time">
            <label class="form-label" for="astro-tt">时间</label>
            <input id="astro-tt" v-model="transitTime" type="time" class="input input-sm" />
          </div>
          <div class="ctl ctl-nav">
            <span class="form-label">快速跳转</span>
            <div class="nav-btns">
              <button class="btn-icon sm" title="前一月" aria-label="前一月" @click="shiftTransit(0, -1)"><ChevronsLeft :size="16" /></button>
              <button class="btn-icon sm" title="前一天" aria-label="前一天" @click="shiftTransit(-1)"><ChevronLeft :size="16" /></button>
              <button class="btn btn-ghost btn-sm" @click="transitNow"><Clock :size="13" />现在</button>
              <button class="btn-icon sm" title="后一天" aria-label="后一天" @click="shiftTransit(1)"><ChevronRight :size="16" /></button>
              <button class="btn-icon sm" title="后一月" aria-label="后一月" @click="shiftTransit(0, 1)"><ChevronsRight :size="16" /></button>
            </div>
          </div>
        </template>
        <div v-else-if="tab === 'progressed'" class="ctl">
          <label class="form-label" for="astro-pd">推运到</label>
          <input id="astro-pd" v-model="progressedDate" type="date" class="input input-sm" />
        </div>
        <div v-else-if="tab === 'solar-return'" class="ctl">
          <label class="form-label" for="astro-ry">返照年份</label>
          <select id="astro-ry" v-model.number="returnYear" class="input input-sm">
            <option v-for="y in yearOptions" :key="y" :value="y">{{ y }} 年</option>
          </select>
        </div>
      </div>

      <!-- Place precision -->
      <div v-if="places.length" class="places">
        <span v-for="p in places" :key="p.label" class="place-chip" :class="{ warn: isLow(p.place) }">
          <MapPin :size="13" />
          <b>{{ p.label }}</b>{{ p.place.matched }}
          <span class="badge" :class="isLow(p.place) ? 'badge-warning' : p.place.precision === 'manual' ? 'badge-accent' : 'badge-success'">{{ PRECISION_LABEL[p.place.precision] }}</span>
        </span>
      </div>
      <div v-if="anyLow" class="alert alert-warning">
        <AlertTriangle :size="16" />
        <span>出生地精度不足：行星星座不受影响，但上升点、天顶与宫位可能偏差较大。可在「命盘档案」中编辑档案，填写出生地经纬度。</span>
      </div>

      <EmptyState
        v-if="isPair && !hasEnoughPeople"
        :icon="Users"
        title="需要两个档案"
        description="比较盘与组合盘需要选择两位不同的命主，请先在档案中添加另一位。"
      >
        <template #actions><router-link to="/profile" class="btn btn-primary">管理档案</router-link></template>
      </EmptyState>

      <LoadingSpinner v-else-if="loading && !natal && !bi && !composite">星盘计算中…</LoadingSpinner>

      <div v-else-if="error && !natal && !bi && !composite" class="card">
        <EmptyState :icon="AlertTriangle" title="计算失败" :description="error">
          <template #actions><button class="btn btn-secondary" @click="load"><RefreshCw :size="15" />重试</button></template>
        </EmptyState>
      </div>

      <!-- Natal -->
      <template v-else-if="natal">
        <section class="card result" :class="{ busy: loading }">
          <div class="result-head">
            <h3 class="result-title">{{ nameOf(personA) }} · 本命盘</h3>
            <span class="muted">{{ natal.chart.input.birthDate }} {{ natal.chart.input.birthTime }} · UTC{{ natal.chart.utcOffset }} · 命主星 {{ natal.chart.chartRuler.name }}</span>
          </div>
          <div v-if="natal.chart.houseSystemNote" class="alert alert-info">{{ natal.chart.houseSystemNote }}</div>
          <div ref="wheelAnchor"><AstroWheel :chart="natal.chart" :show-dignity="settings.showDignity" :highlight="focusRefs" /></div>
        </section>
        <section class="card"><AstroChartDetails :chart="natal.chart" :show-dignity="settings.showDignity" /></section>
      </template>

      <!-- Composite -->
      <template v-else-if="composite">
        <section class="card result" :class="{ busy: loading }">
          <div class="result-head">
            <h3 class="result-title">{{ composite.labelA }} × {{ composite.labelB }} · 组合中点盘</h3>
            <span class="muted">两人各行星、宫头取中点合成，描述这段关系本身的性格</span>
          </div>
          <div v-if="composite.note" class="alert alert-info">{{ composite.note }}</div>
          <div ref="wheelAnchor"><AstroWheel :chart="composite.chart" :show-dignity="settings.showDignity" :highlight="focusRefs" /></div>
        </section>
        <section class="card"><AstroChartDetails :chart="composite.chart" :show-dignity="settings.showDignity" /></section>
      </template>

      <!-- Bi-wheel kinds -->
      <template v-else-if="bi">
        <AstroCompatibilityPanel v-if="bi.compatibility" :data="bi.compatibility" :label-a="bi.innerLabel" :label-b="bi.outerLabel" />

        <section class="card result" :class="{ busy: loading }">
          <div class="result-head">
            <h3 class="result-title">
              <template v-if="tab === 'synastry'">{{ bi.innerLabel }} × {{ bi.outerLabel }} · {{ bi.kindName }}</template>
              <template v-else>{{ nameOf(personA) }} · {{ bi.outerLabel }}</template>
            </h3>
            <span v-if="bi.outerMoment" class="muted">{{ tab === 'synastry' ? `${bi.outerLabel}出生` : '外圈时刻' }}：{{ fmtMoment(bi.outerMoment) }}</span>
          </div>
          <div v-if="bi.note" class="alert alert-info">{{ bi.note }}</div>
          <div ref="wheelAnchor"><AstroWheel
            :chart="bi.inner"
            :outer="bi.outer"
            :cross-aspects="bi.crossAspects"
            :inner-label="bi.innerLabel"
            :outer-label="bi.outerLabel"
            :highlight="focusRefs"
            :show-dignity="settings.showDignity"
          /></div>
        </section>

        <section class="card">
          <div class="tabs detail-tabs">
            <button class="tab" :class="{ active: detailTab === 'cross' }" @click="detailTab = 'cross'">交互与宫位</button>
            <button class="tab" :class="{ active: detailTab === 'inner' }" @click="detailTab = 'inner'">{{ bi.innerLabel }}（内圈）</button>
            <button class="tab" :class="{ active: detailTab === 'outer' }" @click="detailTab = 'outer'">{{ bi.outerLabel }}（外圈）</button>
          </div>
          <AstroCrossDetails v-if="detailTab === 'cross'" :data="bi" />
          <AstroChartDetails v-else-if="detailTab === 'inner'" :chart="bi.inner" :show-dignity="settings.showDignity" />
          <AstroChartDetails v-else :chart="bi.outer" :show-dignity="settings.showDignity" />
        </section>
      </template>

      <!-- Interpretation -->
      <section v-if="interpretRequest && (natal || bi || composite)" class="card">
        <AstroInterpretationPanel :request="interpretRequest" @focus="onInterpFocus" />
      </section>
    </template>

    <AstroSettingsModal
      v-model:open="showSettings"
      :kind="tab"
      :kind-name="tabMeta.label"
      :settings="settings"
      @apply="applySettings"
    />
  </div>
</template>

<style scoped>
.astro-page { display: flex; flex-direction: column; gap: var(--space-md); }
.astro-page :deep(.page-header) { margin-bottom: 0; }
.astro-tabs { align-self: flex-start; }
.muted { color: var(--color-text-muted); }

.controls { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--space-md); }
.ctl { display: flex; flex-direction: column; gap: 5px; min-width: 150px; }
.ctl .input { min-width: 150px; }
.ctl-time { min-width: 110px; }
.ctl-time .input { min-width: 110px; }
.ctl-nav { min-width: 0; }
.nav-btns { display: flex; align-items: center; gap: 2px; }

.places { display: flex; flex-wrap: wrap; gap: 8px; }
.place-chip {
  display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px;
  border-radius: var(--radius-full); background: var(--color-bg-tertiary);
  font-size: 0.8rem; color: var(--color-text-secondary);
}
.place-chip > svg { color: var(--color-accent); }
.place-chip.warn > svg { color: var(--color-warning); }
.place-chip b { color: var(--color-text-primary); margin-right: 2px; }

.result { display: flex; flex-direction: column; align-items: center; gap: var(--space-sm); transition: opacity var(--transition-fast); }
.result.busy { opacity: 0.55; }
.result-head { align-self: stretch; display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 4px 12px; font-size: 0.82rem; }
.result-title { font-family: var(--font-serif); font-size: 1.08rem; }
.result .alert { align-self: stretch; font-size: 0.82rem; }
.detail-tabs { margin-bottom: var(--space-md); }

@media (max-width: 640px) {
  .ctl, .ctl .input { min-width: 0; width: 100%; }
  .controls { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-sm); }
  .ctl-nav { grid-column: 1 / -1; }
  .nav-btns { justify-content: space-between; }
  .astro-tabs { align-self: stretch; }
}
</style>
