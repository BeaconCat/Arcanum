<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Search, Plus, Minus, LocateFixed, MapPin, Loader2, X, ChevronUp, Info, Sparkles, Globe2 } from 'lucide-vue-next';
import PageHeader from '../components/common/PageHeader.vue';
import EmptyState from '../components/common/EmptyState.vue';
import AcgMap, { type AcgMarker } from '../components/acg/AcgMap.vue';
import { useProfileStore } from '../stores/use-profile-store';
import { useFeedback, errorMessage } from '../composables/useFeedback';
import { apiGetAcg, apiAcgNear, apiAcgRank, apiAcgThemes, apiAcgSearch } from '../api/acg.api';
import { ACG_BODY_META, ACG_ANGLE_META, ACG_ANGLE_STROKE, ACG_THEME_ICONS, acgColorVar, formatKm, formatLatLon } from '../utils/acg';
import type {
  AcgAngle, AcgBodyKey, AcgNearResponse, AcgPlace, AcgRankResponse, AcgResult, AcgTheme, AcgThemeDef,
} from '../../shared/types/acg.types';

const profileStore = useProfileStore();
const { toast } = useFeedback();

// ── Persisted layer toggles ──
const PREF_KEY = 'arcanum.acg.prefs';
function readPrefs(): { bodies?: AcgBodyKey[]; angles?: AcgAngle[]; view?: 'world' | 'china' } {
  try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch { return {}; }
}
const prefs = readPrefs();
const bodies = ref<AcgBodyKey[]>(prefs.bodies?.length ? prefs.bodies : ACG_BODY_META.filter((b) => b.key !== 'northNode').map((b) => b.key));
const angles = ref<AcgAngle[]>(prefs.angles?.length ? prefs.angles : ['MC', 'IC', 'AC', 'DC']);
const view = ref<'world' | 'china'>(prefs.view || 'world');
watch([bodies, angles, view], () => {
  try { localStorage.setItem(PREF_KEY, JSON.stringify({ bodies: bodies.value, angles: angles.value, view: view.value })); } catch { /* ignore */ }
}, { deep: true });

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

// ── Subject & lines ──
const profileId = ref('');
const result = ref<AcgResult | null>(null);
const loading = ref(false);
const loadError = ref('');

const profile = computed(() => profileStore.profiles.find((p) => p.profileId === profileId.value) || null);

async function loadLines() {
  if (!profileId.value) return;
  loading.value = true;
  loadError.value = '';
  try {
    result.value = await apiGetAcg(profileId.value);
    if (pick.value) await loadNear(pick.value.lat, pick.value.lon, pick.value.label);
    if (theme.value) await loadRank(theme.value);
  } catch (err) {
    result.value = null;
    loadError.value = errorMessage(err, '地理占星计算失败');
    toast.error(loadError.value);
  } finally {
    loading.value = false;
  }
}

watch(profileId, () => { loadLines(); });

// ── Picked location ──
const pick = ref<{ lat: number; lon: number; label?: string } | null>(null);
const near = ref<AcgNearResponse | null>(null);
const nearLoading = ref(false);
const highlight = ref<{ body: AcgBodyKey; angle: AcgAngle } | null>(null);

async function loadNear(lat: number, lon: number, label?: string) {
  if (!profileId.value) return;
  pick.value = { lat, lon, label };
  panel.value = 'place';
  sheetOpen.value = true;
  nearLoading.value = true;
  try {
    near.value = await apiAcgNear(profileId.value, lat, lon, 600);
  } catch (err) {
    near.value = null;
    toast.error(errorMessage(err, '查询失败'));
  } finally {
    nearLoading.value = false;
  }
}

const pickTitle = computed(() => {
  if (!pick.value) return '';
  if (pick.value.label) return pick.value.label;
  const np = near.value?.nearestPlace;
  if (np) return `${np.name}${np.distanceKm > 20 ? ` 附近（${np.distanceKm} 公里）` : ''}`;
  return formatLatLon(pick.value.lat, pick.value.lon);
});
const pickSub = computed(() => {
  const np = near.value?.nearestPlace;
  const parts = [np?.region && np.country === '中国' ? np.region : '', np?.country && np.country !== '中国' ? np.country : '', pick.value ? formatLatLon(pick.value.lat, pick.value.lon) : ''];
  return parts.filter(Boolean).join(' · ');
});

// ── Search ──
const query = ref('');
const searchResults = ref<AcgPlace[]>([]);
const searchOpen = ref(false);
let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(query, (q) => {
  clearTimeout(searchTimer);
  if (!q.trim()) { searchResults.value = []; return; }
  searchTimer = setTimeout(async () => {
    try { searchResults.value = await apiAcgSearch(q.trim()); searchOpen.value = true; } catch { searchResults.value = []; }
  }, 220);
});
function choosePlace(p: AcgPlace) {
  searchOpen.value = false;
  query.value = '';
  mapRef.value?.flyTo(p.lat, p.lon, 5);
  loadNear(p.lat, p.lon, p.name);
}
function placeSub(p: AcgPlace) {
  return p.country === '中国' ? (p.region || '中国') : `${p.country}${p.region ? ` · ${p.region}` : ''}`;
}

// ── Themes ──
const themes = ref<AcgThemeDef[]>([]);
const theme = ref<AcgTheme | null>(null);
const ranked = ref<AcgRankResponse | null>(null);
const rankLoading = ref(false);

async function loadRank(key: AcgTheme) {
  if (!profileId.value) return;
  theme.value = key;
  panel.value = 'theme';
  sheetOpen.value = true;
  rankLoading.value = true;
  try {
    ranked.value = await apiAcgRank(profileId.value, key);
  } catch (err) {
    ranked.value = null;
    toast.error(errorMessage(err, '推荐计算失败'));
  } finally {
    rankLoading.value = false;
  }
}
function clearTheme() {
  theme.value = null;
  ranked.value = null;
}
function openRanked(p: AcgPlace) {
  mapRef.value?.flyTo(p.lat, p.lon, 5);
  loadNear(p.lat, p.lon, p.name);
}

// ── Markers ──
const markers = computed<AcgMarker[]>(() => {
  const out: AcgMarker[] = [];
  const r = result.value;
  if (r) out.push({ key: 'home', kind: 'home', lat: r.input.lat, lon: r.input.lon, label: '出生地' });
  ranked.value?.places.forEach((p, i) => out.push({ key: `rank-${i}`, kind: 'rank', lat: p.lat, lon: p.lon, index: i + 1 }));
  if (pick.value) out.push({ key: 'pick', kind: 'pick', lat: pick.value.lat, lon: pick.value.lon });
  return out;
});

// ── Panel ──
const panel = ref<'place' | 'theme' | 'about'>('place');
const sheetOpen = ref(false);
const mapRef = ref<InstanceType<typeof AcgMap> | null>(null);

onMounted(async () => {
  if (!profileStore.profiles.length) {
    try { await profileStore.loadProfiles(); } catch { /* empty state */ }
  }
  profileId.value = profileStore.currentProfileId || profileStore.profiles[0]?.profileId || '';
  try { themes.value = await apiAcgThemes(); } catch { /* themes optional */ }
});
</script>

<template>
  <div class="page acg-page">
    <PageHeader
      title="地理占星"
      subtitle="出生那一刻，每颗行星在地球上的「升起、中天、落下」之处"
      :back="{ path: '/astro' }"
      back-label="星盘工作台"
    >
      <template #actions>
        <label class="subject">
          <span>命主</span>
          <select v-model="profileId" class="input input-sm" :disabled="!profileStore.profiles.length">
            <option v-for="p in profileStore.profiles" :key="p.profileId" :value="p.profileId">
              {{ p.name }}（{{ p.relation }}）
            </option>
          </select>
        </label>
      </template>
    </PageHeader>

    <EmptyState
      v-if="!profileStore.profiles.length"
      :icon="Globe2"
      title="还没有命盘档案"
      description="先在「命盘档案」中录入出生日期、时间与出生地，再来查看你的行星线。"
    >
      <template #actions><router-link to="/profile" class="btn btn-primary">去录入档案</router-link></template>
    </EmptyState>

    <template v-else>
      <!-- Toolbar -->
      <div class="toolbar card card-compact">
        <div class="tabs view-tabs">
          <button class="tab" :class="{ active: view === 'world' }" @click="view = 'world'">世界</button>
          <button class="tab" :class="{ active: view === 'china' }" @click="view = 'china'">中国</button>
        </div>

        <div class="search" @focusout="(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) searchOpen = false }">
          <Search :size="15" class="search-icon" />
          <input
            v-model="query"
            class="input input-sm"
            placeholder="搜索城市，如 成都、东京、Paris"
            @focus="searchOpen = !!searchResults.length"
            @keydown.enter.prevent="searchResults[0] && choosePlace(searchResults[0])"
            @keydown.esc="searchOpen = false"
          />
          <div v-if="searchOpen && searchResults.length" class="search-pop">
            <button v-for="p in searchResults" :key="`${p.name}-${p.lat}-${p.lon}`" class="search-item" @click="choosePlace(p)">
              <MapPin :size="14" />
              <span class="si-name">{{ p.name }}</span>
              <span class="si-sub">{{ placeSub(p) }}</span>
            </button>
          </div>
        </div>

        <div class="zoom">
          <button class="btn-icon sm" title="放大" aria-label="放大" @click="mapRef?.zoomIn()"><Plus :size="16" /></button>
          <button class="btn-icon sm" title="缩小" aria-label="缩小" @click="mapRef?.zoomOut()"><Minus :size="16" /></button>
          <button class="btn-icon sm" title="复位" aria-label="复位" @click="mapRef?.reset()"><LocateFixed :size="16" /></button>
        </div>
      </div>

      <!-- Layers -->
      <div class="layers">
        <div class="layer-row">
          <button
            v-for="b in ACG_BODY_META"
            :key="b.key"
            class="chip body-chip"
            :class="{ off: !bodies.includes(b.key) }"
            :style="{ '--c': acgColorVar(b.key) }"
            :aria-pressed="bodies.includes(b.key)"
            @click="bodies = toggle(bodies, b.key)"
          >
            <span class="dot" />{{ b.symbol }} {{ b.name }}
          </button>
          <button class="chip ghost" @click="bodies = ACG_BODY_META.map((b) => b.key)">全选</button>
          <button class="chip ghost" @click="bodies = ['sun', 'moon', 'venus', 'jupiter']">只看吉星</button>
        </div>
        <div class="layer-row">
          <button
            v-for="a in ACG_ANGLE_META"
            :key="a.key"
            class="chip angle-chip"
            :class="{ off: !angles.includes(a.key) }"
            :aria-pressed="angles.includes(a.key)"
            :title="a.hint"
            @click="angles = toggle(angles, a.key)"
          >
            <svg width="26" height="8" aria-hidden="true">
              <line x1="1" y1="4" x2="25" y2="4" stroke="currentColor" :stroke-width="ACG_ANGLE_STROKE[a.key].width" :stroke-dasharray="ACG_ANGLE_STROKE[a.key].dash" stroke-linecap="round" />
            </svg>
            {{ a.name }}<small>{{ a.hint }}</small>
          </button>
        </div>
      </div>

      <!-- Map + panel -->
      <div class="stage">
        <div class="map-wrap card card-flat">
          <AcgMap
            ref="mapRef"
            :result="result"
            :bodies="bodies"
            :angles="angles"
            :markers="markers"
            :view="view"
            :highlight="highlight"
            @pick="(lat, lon) => loadNear(lat, lon)"
          />
          <div v-if="loading" class="map-loading"><Loader2 :size="22" class="spin" /> 计算行星线…</div>
          <div v-else-if="loadError" class="map-loading error">{{ loadError }}
            <button class="btn btn-sm btn-secondary" @click="loadLines">重试</button>
          </div>
          <div v-if="result?.place && (result.place.precision === 'province' || result.place.precision === 'default')" class="place-warn">
            出生地仅识别为「{{ result.place.matched }}」，出生地标记可能不准；行星线位置只取决于出生时刻，不受影响。
          </div>
          <p class="map-hint">拖动平移 · 滚轮或双指缩放 · 点击任意位置查看当地行星线</p>
        </div>

        <aside class="panel card" :class="{ open: sheetOpen }">
          <button class="sheet-handle" :aria-expanded="sheetOpen" @click="sheetOpen = !sheetOpen">
            <ChevronUp :size="18" :class="{ flip: sheetOpen }" />
            <span>{{ panel === 'theme' ? '主题推荐' : panel === 'about' ? '说明' : (pick ? pickTitle : '地点解读') }}</span>
          </button>

          <div class="tabs panel-tabs">
            <button class="tab" :class="{ active: panel === 'place' }" @click="panel = 'place'"><MapPin :size="14" /> 地点解读</button>
            <button class="tab" :class="{ active: panel === 'theme' }" @click="panel = 'theme'"><Sparkles :size="14" /> 主题推荐</button>
            <button class="tab" :class="{ active: panel === 'about' }" @click="panel = 'about'"><Info :size="14" /> 说明</button>
          </div>

          <!-- Place -->
          <div v-show="panel === 'place'" class="panel-body">
            <EmptyState
              v-if="!pick"
              compact
              :icon="MapPin"
              title="选一个地方看看"
              description="点击地图任意位置，或在上方搜索城市，查看附近经过的行星线及其含义。"
            />
            <template v-else>
              <div class="pick-head">
                <div>
                  <h3>{{ pickTitle }}</h3>
                  <p class="text-muted">{{ pickSub }}</p>
                </div>
                <button class="btn-icon sm" aria-label="清除" @click="pick = null; near = null"><X :size="16" /></button>
              </div>
              <div v-if="nearLoading" class="loading-state"><Loader2 :size="20" class="spin" /></div>
              <template v-else-if="near">
                <p v-if="!near.hits.length" class="calm">
                  方圆 {{ near.radiusKm }} 公里内没有行星线经过。对你来说这里是相对「中性」的地方——不会特别放大某种主题，也少有强烈的冲击。
                </p>
                <article
                  v-for="h in near.hits"
                  :key="`${h.body}.${h.angle}`"
                  class="hit"
                  :style="{ '--c': acgColorVar(h.body) }"
                  @mouseenter="highlight = { body: h.body, angle: h.angle }"
                  @mouseleave="highlight = null"
                >
                  <header>
                    <strong>{{ h.text?.title || `${h.bodyName}${h.angleName}` }}</strong>
                    <span class="dist">{{ formatKm(h.distanceKm) }}</span>
                  </header>
                  <div class="strength"><span :style="{ width: `${Math.round(h.strength * 100)}%` }" /></div>
                  <template v-if="h.text">
                    <p class="subtitle">{{ h.text.subtitle }}</p>
                    <p class="text">{{ h.text.text }}</p>
                    <p class="kv"><span class="badge badge-success">适合</span>{{ h.text.good }}</p>
                    <p class="kv"><span class="badge badge-warning">注意</span>{{ h.text.caution }}</p>
                  </template>
                </article>
                <p v-if="near.hits.length" class="footnote">距离越近影响越明显，约 300 公里内最强，800 公里外基本可以忽略。</p>
              </template>
            </template>
          </div>

          <!-- Theme -->
          <div v-show="panel === 'theme'" class="panel-body">
            <div class="theme-grid">
              <button
                v-for="th in themes"
                :key="th.key"
                class="theme-btn"
                :class="{ active: theme === th.key }"
                :title="th.description"
                @click="loadRank(th.key)"
              >
                <span class="ti">{{ ACG_THEME_ICONS[th.key] }}</span>{{ th.name }}
              </button>
            </div>
            <div v-if="rankLoading" class="loading-state"><Loader2 :size="20" class="spin" /></div>
            <template v-else-if="ranked">
              <div class="rank-head">
                <span>{{ ranked.theme.name }} · {{ ranked.theme.description }}</span>
                <button class="btn btn-sm btn-ghost" @click="clearTheme">清除标记</button>
              </div>
              <p v-if="!ranked.places.length" class="calm">没有找到明显有利的城市，可以试试其他主题。</p>
              <button v-for="(p, i) in ranked.places" :key="`${p.name}-${i}`" class="rank-item" @click="openRanked(p)">
                <span class="ri-idx">{{ i + 1 }}</span>
                <span class="ri-main">
                  <span class="ri-name">{{ p.name }}<small>{{ placeSub(p) }}</small></span>
                  <span class="ri-hits">
                    <span v-for="h in p.hits.slice(0, 3)" :key="`${h.body}${h.angle}`" class="ri-hit" :class="{ neg: h.weight < 0 }" :style="{ '--c': acgColorVar(h.body) }">
                      {{ h.bodyName }}{{ h.angleName }} {{ h.distanceKm }}km
                    </span>
                  </span>
                </span>
                <span class="ri-score tabular">{{ p.score.toFixed(1) }}</span>
              </button>
              <p class="footnote">推荐分数来自天枢自拟的「行星 × 四轴」权重模型，仅供参考；实际选择还需结合现实条件。</p>
            </template>
            <EmptyState v-else compact :icon="Sparkles" title="选择一个主题" description="根据你的行星线，从中国地级市与世界主要城市中找出更契合该主题的地方。" />
          </div>

          <!-- About -->
          <div v-show="panel === 'about'" class="panel-body about">
            <p>地理占星（Astrocartography）把出生星盘「投影」到地球上：每条线表示出生那一刻，某颗行星恰好位于当地的四个轴点之一。</p>
            <ul>
              <li v-for="a in ACG_ANGLE_META" :key="a.key">
                <svg width="26" height="8" aria-hidden="true"><line x1="1" y1="4" x2="25" y2="4" stroke="currentColor" :stroke-width="ACG_ANGLE_STROKE[a.key].width" :stroke-dasharray="ACG_ANGLE_STROKE[a.key].dash" stroke-linecap="round" /></svg>
                <b>{{ a.name }}（{{ a.short }}）</b>{{ a.hint }}
              </li>
            </ul>
            <p>线条颜色代表行星。离线越近，该行星的主题在当地越突出；同一地点可能同时受几条线影响。</p>
            <p v-if="profile" class="text-muted">当前命主：{{ profile.name }}，{{ profile.birthDate }} {{ profile.birthTime }}，出生地 {{ result?.place?.matched || profile.birthPlace || '未填写' }}。</p>
            <p class="credits">
              底图：Natural Earth（公有领域，经 world-atlas）；世界城市坐标：GeoNames（CC BY 4.0）；
              行星位置：astronomy-engine（MIT）。解读文案与推荐权重为天枢原创，仅供参考。
            </p>
          </div>
        </aside>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Planet & map palette (light) */
.acg-page {
  --acg-sun: #d08a0e;
  --acg-moon: #6f7fa8;
  --acg-mercury: #2a9d8f;
  --acg-venus: #d4508a;
  --acg-mars: #d64533;
  --acg-jupiter: #7b52c7;
  --acg-saturn: #6b5a45;
  --acg-uranus: #1c8fd6;
  --acg-neptune: #3a5fcd;
  --acg-pluto: #8b2f4f;
  --acg-northNode: #4f8a3a;
  --acg-bg: var(--color-bg-tertiary);
  --acg-ocean: color-mix(in srgb, var(--color-info) 7%, var(--color-bg-secondary));
  --acg-land: color-mix(in srgb, var(--color-accent) 9%, var(--color-bg-tertiary));
  --acg-coast: color-mix(in srgb, var(--color-text-muted) 45%, transparent);
  --acg-grid: color-mix(in srgb, var(--color-border-strong) 60%, transparent);
}
:global([data-theme='dark']) .acg-page {
  --acg-sun: #f2b84b;
  --acg-moon: #b7c2e0;
  --acg-mercury: #5fd0c2;
  --acg-venus: #f28dbb;
  --acg-mars: #ff7a66;
  --acg-jupiter: #b59af0;
  --acg-saturn: #c9b394;
  --acg-uranus: #62c0ff;
  --acg-neptune: #8aa3ff;
  --acg-pluto: #e07aa0;
  --acg-northNode: #8fcf73;
  --acg-ocean: #0f1522;
  --acg-land: #222838;
  --acg-coast: rgba(210, 168, 106, 0.35);
  --acg-grid: rgba(255, 255, 255, 0.06);
}

.subject { display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: var(--color-text-secondary); white-space: nowrap; }
.subject select { min-width: 160px; }

/* Toolbar */
.toolbar { display: flex; align-items: center; gap: var(--space-md); margin-bottom: var(--space-sm); flex-wrap: wrap; }
.search { position: relative; flex: 1; min-width: 220px; }
.search .input { padding-left: 32px; }
.search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--color-text-muted); }
.search-pop {
  position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 20;
  max-height: 320px; overflow-y: auto; padding: 4px;
  background: var(--color-bg-elevated); border: 1px solid var(--color-border); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg);
}
.search-item {
  display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 10px; border: none; border-radius: var(--radius-md);
  background: transparent; color: var(--color-text-primary); text-align: left; cursor: pointer; font-size: 0.88rem;
}
.search-item:hover { background: var(--color-bg-tertiary); }
.search-item svg { color: var(--color-accent); flex-shrink: 0; }
.si-name { font-weight: 600; }
.si-sub { margin-left: auto; color: var(--color-text-muted); font-size: 0.76rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.zoom { display: flex; gap: 2px; }

/* Layers */
.layers { display: flex; flex-direction: column; gap: 6px; margin-bottom: var(--space-md); }
.layer-row { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding-bottom: 2px; }
.layer-row::-webkit-scrollbar { display: none; }
.chip { flex-shrink: 0; height: 28px; font-size: 0.78rem; }
.body-chip { border-color: color-mix(in srgb, var(--c) 45%, var(--color-border)); color: var(--color-text-primary); }
.body-chip .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--c); }
.body-chip:hover:not(:disabled) { border-color: var(--c); color: var(--color-text-primary); }
.chip.off { opacity: 0.45; }
.chip.off .dot { background: transparent; box-shadow: inset 0 0 0 1.5px var(--c); }
.chip.ghost { border-style: dashed; }
.angle-chip { color: var(--color-text-secondary); }
.angle-chip small { color: var(--color-text-muted); font-size: 0.7rem; margin-left: 2px; }

/* Stage */
.stage { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: var(--space-md); align-items: start; }
.map-wrap { position: relative; padding: 8px; }
.map-loading {
  position: absolute; inset: 8px; display: flex; align-items: center; justify-content: center; gap: 8px;
  border-radius: var(--radius-lg); background: color-mix(in srgb, var(--color-bg-secondary) 70%, transparent);
  color: var(--color-text-secondary); font-size: 0.9rem;
}
.map-loading.error { color: var(--color-error); flex-direction: column; }
.place-warn { margin: 8px 4px 0; font-size: 0.78rem; color: var(--color-warning); }
.map-hint { margin: 6px 4px 0; font-size: 0.74rem; color: var(--color-text-muted); }

/* Panel */
.panel { padding: var(--space-md); max-height: calc(100dvh - var(--header-height) - 48px); overflow-y: auto; position: sticky; top: calc(var(--header-height) + 16px); }
.sheet-handle { display: none; }
.panel-tabs { width: 100%; margin-bottom: var(--space-md); }
.panel-tabs .tab { flex: 1; justify-content: center; padding: 0 8px; font-size: 0.82rem; }
.panel-body { display: flex; flex-direction: column; gap: 10px; }
.pick-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.pick-head h3 { font-family: var(--font-serif); font-size: 1.1rem; }
.pick-head p { font-size: 0.78rem; }
.calm { font-size: 0.86rem; line-height: 1.7; color: var(--color-text-secondary); background: var(--color-bg-tertiary); padding: 10px 12px; border-radius: var(--radius-md); }
.hit {
  padding: 10px 12px 12px; border: 1px solid var(--color-border); border-left: 3px solid var(--c);
  border-radius: var(--radius-md); background: var(--color-bg-secondary); transition: box-shadow var(--transition-fast);
}
.hit:hover { box-shadow: var(--shadow-md); }
.hit header { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.hit strong { font-family: var(--font-serif); font-size: 0.98rem; color: var(--c); }
.dist { font-size: 0.75rem; color: var(--color-text-muted); white-space: nowrap; }
.strength { height: 3px; margin: 6px 0 8px; border-radius: 3px; background: var(--color-bg-tertiary); overflow: hidden; }
.strength span { display: block; height: 100%; background: var(--c); }
.subtitle { font-size: 0.84rem; font-weight: 600; color: var(--color-text-primary); margin-bottom: 4px; }
.text { font-size: 0.84rem; line-height: 1.7; color: var(--color-text-secondary); }
.kv { display: flex; gap: 6px; align-items: baseline; margin-top: 6px; font-size: 0.8rem; color: var(--color-text-secondary); line-height: 1.5; }
.kv .badge { flex-shrink: 0; }
.footnote { font-size: 0.74rem; color: var(--color-text-muted); line-height: 1.6; }

.theme-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.theme-btn {
  display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 4px;
  border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg-secondary);
  color: var(--color-text-secondary); font-size: 0.76rem; cursor: pointer; transition: all var(--transition-fast);
}
.theme-btn:hover { border-color: var(--color-accent); color: var(--color-text-primary); }
.theme-btn.active { border-color: var(--color-accent); background: var(--color-accent-soft); color: var(--color-accent); font-weight: 600; }
.ti { font-size: 1.1rem; }
.rank-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.8rem; color: var(--color-text-muted); }
.rank-item {
  display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px; text-align: left;
  border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg-secondary);
  color: var(--color-text-primary); cursor: pointer; transition: border-color var(--transition-fast), background var(--transition-fast);
}
.rank-item:hover { border-color: var(--color-accent); background: var(--color-accent-soft); }
.ri-idx {
  display: grid; place-items: center; width: 24px; height: 24px; flex-shrink: 0; border-radius: 50%;
  background: var(--color-accent); color: var(--color-accent-contrast); font-size: 0.75rem; font-weight: 700;
}
.ri-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.ri-name { font-weight: 600; font-size: 0.9rem; }
.ri-name small { margin-left: 6px; font-weight: 400; color: var(--color-text-muted); font-size: 0.74rem; }
.ri-hits { display: flex; flex-wrap: wrap; gap: 4px; }
.ri-hit { font-size: 0.7rem; padding: 0 6px; border-radius: 999px; color: var(--c); background: color-mix(in srgb, var(--c) 12%, transparent); }
.ri-hit.neg { text-decoration: line-through; opacity: 0.7; }
.ri-score { font-family: var(--font-serif); font-weight: 700; color: var(--color-accent); }

.about p, .about li { font-size: 0.85rem; line-height: 1.75; color: var(--color-text-secondary); }
.about ul { display: flex; flex-direction: column; gap: 4px; }
.about li { display: flex; align-items: center; gap: 8px; }
.about li b { color: var(--color-text-primary); font-weight: 600; }
.credits { font-size: 0.74rem !important; color: var(--color-text-muted) !important; border-top: 1px dashed var(--color-border); padding-top: 8px; }

@media (max-width: 1024px) {
  .stage { grid-template-columns: 1fr; }
  .panel { position: static; max-height: none; }
}

@media (max-width: 640px) {
  .subject select { min-width: 0; max-width: 150px; }
  .toolbar { gap: 8px; }
  .view-tabs { order: 1; }
  .zoom { order: 2; margin-left: auto; }
  .search { order: 3; flex-basis: 100%; }
  .map-wrap { padding: 4px; }
  .theme-grid { grid-template-columns: repeat(4, 1fr); }

  /* Panel becomes a bottom sheet */
  .panel {
    /* top: auto — the desktop sticky `top` would otherwise pin the sheet near the top instead of the bottom */
    position: fixed; top: auto; left: 0; right: 0; bottom: 0; z-index: var(--z-drawer);
    max-height: 72dvh; border-radius: var(--radius-xl) var(--radius-xl) 0 0; border-bottom: none;
    box-shadow: var(--shadow-lg); transform: translateY(calc(100% - 52px)); transition: transform var(--transition-normal);
    padding-bottom: calc(var(--space-md) + env(safe-area-inset-bottom));
  }
  .panel.open { transform: translateY(0); }
  .sheet-handle {
    display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; height: 36px; margin: -6px 0 8px;
    border: none; background: transparent; color: var(--color-text-secondary); font-size: 0.86rem; font-weight: 600; cursor: pointer;
  }
  .sheet-handle svg { transition: transform var(--transition-fast); }
  .sheet-handle svg.flip { transform: rotate(180deg); }
  /* leave room so the sheet handle never covers page content */
  .acg-page { padding-bottom: 64px; }
}
</style>
