<script setup lang="ts">
import { computed, ref, reactive } from 'vue';
import { Loader2 } from 'lucide-vue-next';
import type { BaziChart } from '../../../shared/types/bazi.types';
import { apiGenerateShenshaExplanation, type ShenshaExplanation } from '../../api/profile.api';
import AppModal from '../common/AppModal.vue';
import { wuxingOf } from '../../utils/fortune';
import { useFeedback, errorMessage } from '../../composables/useFeedback';

const props = defineProps<{ chart: BaziChart; profileId?: string }>();
const { toast } = useFeedback();

const pillarLabels = ['年柱', '月柱', '日柱', '时柱'];
const pillarKeys = ['year', 'month', 'day', 'hour'] as const;

// ── Shensha explanation state ──
const loadingSet = reactive(new Set<string>());
const cacheMap = reactive(new Map<string, ShenshaExplanation>());
const activeExplanation = ref<ShenshaExplanation | null>(null);
const showModal = ref(false);
const lastClicked = ref('');

async function handleShenshaClick(name: string) {
  if (!props.profileId) return;
  lastClicked.value = name;

  // If cached, show immediately
  if (cacheMap.has(name)) {
    activeExplanation.value = cacheMap.get(name)!;
    showModal.value = true;
    return;
  }

  loadingSet.add(name);
  try {
    const result = await apiGenerateShenshaExplanation(props.profileId, name);
    cacheMap.set(name, result);
    // Only pop up if this is still the last clicked one
    if (lastClicked.value === name) {
      activeExplanation.value = result;
      showModal.value = true;
    }
  } catch (err) {
    toast.error(errorMessage(err, `「${name}」解析失败`));
  } finally {
    loadingSet.delete(name);
  }
}

// ── Da Yun click (reuse same modal) ──
const dayunLoadingSet = reactive(new Set<number>());

async function handleDayunClick(dy: BaziChart['daYun'][number], index: number) {
  if (!props.profileId) return;
  const key = `大运_${dy.gan}${dy.zhi}_${dy.startAge}-${dy.endAge}`;
  lastClicked.value = key;

  if (cacheMap.has(key)) {
    activeExplanation.value = cacheMap.get(key)!;
    showModal.value = true;
    return;
  }

  dayunLoadingSet.add(index);
  try {
    const result = await apiGenerateShenshaExplanation(props.profileId, key);
    cacheMap.set(key, result);
    if (lastClicked.value === key) {
      activeExplanation.value = result;
      showModal.value = true;
    }
  } catch (err) {
    toast.error(errorMessage(err, '大运解析失败'));
  } finally {
    dayunLoadingSet.delete(index);
  }
}

const isDayunExplanation = computed(() => !!activeExplanation.value?.name.startsWith('大运_'));
const modalTitle = computed(() => {
  const n = activeExplanation.value?.name || '';
  return `「${n.replace(/^大运_(.{2})_(\d+-\d+)$/, '$1大运（$2岁）')}」解析`;
});

function wx(ch: string | undefined): string {
  const k = wuxingOf(ch);
  return k ? `wx-${k}` : '';
}

function wxPair(pair: string): string {
  for (const el of ['木', '火', '土', '金', '水']) if (pair.includes(el)) return wx(el);
  return '';
}

// Max hideGan length across all pillars for uniform row count
const maxHideGan = computed(() => Math.max(...pillarKeys.map((k) => props.chart.pillars[k].hideGan.length)));

const hasPillarShensha = computed(() => pillarKeys.some((k) => props.chart.pillars[k].shenSha.length > 0));

const wxMax = computed(() => Math.max(1, ...(props.chart.wuXingAnalysis?.counts.map((c) => c.count) || [1])));
</script>

<template>
  <div class="bazi-card card">
    <div class="bz-head">
      <h3 class="bz-title">八字排盘</h3>
      <div class="bz-birth" v-if="props.chart.birthInfo">
        <span>{{ props.chart.birthInfo.lunarDate }}</span>
        <span v-if="props.chart.birthInfo.shengXiao" class="badge">{{ props.chart.birthInfo.shengXiao }}年</span>
        <span v-if="props.chart.birthInfo.jieQiInfo" class="bz-jieqi">{{ props.chart.birthInfo.jieQiInfo }}</span>
      </div>
    </div>

    <!-- ── Four pillars table ── -->
    <div class="bazi-scroll">
      <table class="bazi-table">
        <thead>
          <tr>
            <th class="row-label"></th>
            <th v-for="(key, i) in pillarKeys" :key="key" :class="{ 'day-col': key === 'day' }">
              {{ pillarLabels[i] }}
              <span v-if="key === 'day'" class="dm-tag">日主</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="row-label">干神</td>
            <td v-for="key in pillarKeys" :key="key" class="ten-god-cell" :class="{ 'day-col': key === 'day' }">
              {{ props.chart.pillars[key].ganTenGod }}
            </td>
          </tr>
          <tr class="char-row">
            <td class="row-label">天干</td>
            <td v-for="key in pillarKeys" :key="key" :class="{ 'day-col': key === 'day' }">
              <span class="big-char" :class="wx(props.chart.pillars[key].gan)">{{ props.chart.pillars[key].gan }}</span>
            </td>
          </tr>
          <tr class="char-row">
            <td class="row-label">地支</td>
            <td v-for="key in pillarKeys" :key="key" :class="{ 'day-col': key === 'day' }">
              <span class="big-char" :class="wx(props.chart.pillars[key].zhi)">{{ props.chart.pillars[key].zhi }}</span>
            </td>
          </tr>
          <tr v-for="row in maxHideGan" :key="'hg-' + row" :class="{ 'group-start': row === 1 }">
            <td class="row-label">{{ row === 1 ? '藏干' : '' }}</td>
            <td v-for="key in pillarKeys" :key="key" class="hide-gan-cell" :class="{ 'day-col': key === 'day' }">
              <template v-if="props.chart.pillars[key].hideGanDetail?.[row - 1]">
                <span :class="wx(props.chart.pillars[key].hideGanDetail[row - 1].gan)">
                  {{ props.chart.pillars[key].hideGanDetail[row - 1].gan }}
                </span>
                <small class="hg-wx" :class="wx(props.chart.pillars[key].hideGanDetail[row - 1].wuXing)">
                  {{ props.chart.pillars[key].hideGanDetail[row - 1].wuXing }}
                </small>
              </template>
              <span v-else-if="props.chart.pillars[key].hideGan[row - 1]" :class="wx(props.chart.pillars[key].hideGan[row - 1])">
                {{ props.chart.pillars[key].hideGan[row - 1] }}
              </span>
            </td>
          </tr>
          <tr v-for="row in maxHideGan" :key="'zs-' + row" :class="{ 'group-start': row === 1 }">
            <td class="row-label">{{ row === 1 ? '支神' : '' }}</td>
            <td v-for="key in pillarKeys" :key="key" class="zhi-shen-cell" :class="{ 'day-col': key === 'day' }">
              {{ props.chart.pillars[key].zhiTenGods[row - 1] || '' }}
            </td>
          </tr>
          <tr class="group-start">
            <td class="row-label">纳音</td>
            <td v-for="key in pillarKeys" :key="key" class="nayin-cell" :class="[wx(props.chart.pillars[key].naYinWuXing || ''), { 'day-col': key === 'day' }]">
              {{ props.chart.pillars[key].naYin }}
            </td>
          </tr>
          <tr>
            <td class="row-label">空亡</td>
            <td v-for="key in pillarKeys" :key="key" class="strong-cell" :class="{ 'day-col': key === 'day' }">
              {{ props.chart.pillars[key].xunKong }}
            </td>
          </tr>
          <tr>
            <td class="row-label">地势</td>
            <td v-for="key in pillarKeys" :key="key" class="strong-cell" :class="{ 'day-col': key === 'day' }">
              {{ props.chart.pillars[key].diShi }}
            </td>
          </tr>
          <tr>
            <td class="row-label">自坐</td>
            <td v-for="key in pillarKeys" :key="key" class="zizuo-cell" :class="{ 'day-col': key === 'day' }">
              {{ props.chart.pillars[key].ziZuo || props.chart.pillars[key].zhiTenGods?.[0] || '-' }}
            </td>
          </tr>
          <tr v-if="hasPillarShensha" class="group-start">
            <td class="row-label">神煞</td>
            <td v-for="key in pillarKeys" :key="key" class="ss-cell" :class="{ 'day-col': key === 'day' }">
              <div class="shensha-tags">
                <button
                  v-for="s in props.chart.pillars[key].shenSha"
                  :key="s"
                  type="button"
                  class="ss-tag"
                  :class="{ loading: loadingSet.has(s), clickable: !!props.profileId }"
                  :disabled="!props.profileId"
                  :title="props.profileId ? `点击查看「${s}」解析` : s"
                  @click.stop="handleShenshaClick(s)"
                >
                  <Loader2 v-if="loadingSet.has(s)" :size="10" class="spin" />
                  {{ s }}
                </button>
                <span v-if="props.chart.pillars[key].shenSha.length === 0" class="ss-empty">—</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── 胎元 / 命宫 ── -->
    <div class="palace-strip">
      <div class="ps-item"><span class="ps-label">胎元</span><strong class="serif">{{ props.chart.taiYuan }}</strong><small>{{ props.chart.taiYuanNaYin }}</small></div>
      <div class="ps-item"><span class="ps-label">胎息</span><strong class="serif">{{ props.chart.taiXi }}</strong><small>{{ props.chart.taiXiNaYin }}</small></div>
      <div class="ps-item"><span class="ps-label">命宫</span><strong class="serif">{{ props.chart.mingGong }}</strong><small>{{ props.chart.mingGongNaYin }}</small></div>
      <div class="ps-item"><span class="ps-label">身宫</span><strong class="serif">{{ props.chart.shenGong }}</strong><small>{{ props.chart.shenGongNaYin }}</small></div>
    </div>

    <!-- ── 五行 ── -->
    <section v-if="props.chart.wuXingAnalysis || props.chart.wuXingPairs.length" class="bz-section">
      <div class="bz-section-title">五行</div>
      <div v-if="props.chart.wuXingPairs.length" class="wuxing-pairs">
        <span v-for="(pair, i) in props.chart.wuXingPairs" :key="i" class="wx-pair" :class="wxPair(pair)">{{ pair }}</span>
      </div>
      <div v-if="props.chart.wuXingAnalysis" class="wx-analysis">
        <div class="wx-bars">
          <div v-for="w in props.chart.wuXingAnalysis.counts" :key="w.element" class="wx-bar-item">
            <span class="wx-bar-label serif" :class="wx(w.element)">{{ w.element }}</span>
            <div class="wx-bar-track">
              <div
                class="wx-bar-fill"
                :style="{ width: `${(w.count / wxMax) * 100}%`, background: `var(--wx-${wuxingOf(w.element)}-bar)` }"
              ></div>
            </div>
            <span class="wx-bar-count tabular">{{ w.count }}</span>
            <span class="wx-bar-status" :class="{ wang: w.status === '旺', si: w.status === '死' }">{{ w.status }}</span>
          </div>
        </div>
        <div class="wx-summary">
          <span class="badge badge-solid">{{ props.chart.wuXingAnalysis.dayMasterStrength }}</span>
          <span v-if="props.chart.wuXingAnalysis.missing.length > 0" class="badge badge-error">
            缺
            <strong v-for="m in props.chart.wuXingAnalysis.missing" :key="m">{{ m }}</strong>
          </span>
          <span v-if="props.chart.pillars.day.ziZuo" class="badge badge-accent">
            自坐 <strong>{{ props.chart.pillars.day.ziZuo }}</strong>
          </span>
        </div>
      </div>
    </section>

    <!-- ── 吉神 / 凶煞 ── -->
    <section v-if="props.chart.jiShen.length > 0 || props.chart.xiongSha.length > 0" class="bz-section">
      <div class="bz-section-title">
        日神煞
        <small v-if="props.profileId" class="text-muted">点击查看解析</small>
      </div>
      <div v-if="props.chart.jiShen.length > 0" class="shensha-group">
        <span class="group-label ji">吉神</span>
        <button
          v-for="s in props.chart.jiShen"
          :key="s"
          type="button"
          class="tag ji"
          :class="{ loading: loadingSet.has(s), clickable: !!props.profileId }"
          :disabled="!props.profileId"
          @click.stop="handleShenshaClick(s)"
        >
          <Loader2 v-if="loadingSet.has(s)" :size="10" class="spin" />
          {{ s }}
        </button>
      </div>
      <div v-if="props.chart.xiongSha.length > 0" class="shensha-group">
        <span class="group-label xiong">凶煞</span>
        <button
          v-for="s in props.chart.xiongSha"
          :key="s"
          type="button"
          class="tag xiong"
          :class="{ loading: loadingSet.has(s), clickable: !!props.profileId }"
          :disabled="!props.profileId"
          @click.stop="handleShenshaClick(s)"
        >
          <Loader2 v-if="loadingSet.has(s)" :size="10" class="spin" />
          {{ s }}
        </button>
      </div>
    </section>

    <!-- ── 详情 ── -->
    <section class="bz-section">
      <div class="bz-section-title">日时信息</div>
      <dl class="detail-grid">
        <div class="detail-item"><dt>执星</dt><dd><strong>{{ props.chart.zhiXing }}</strong></dd></div>
        <div class="detail-item"><dt>日天神</dt><dd><strong>{{ props.chart.tianShen }}</strong> {{ props.chart.tianShenType }}（{{ props.chart.tianShenLuck }}）</dd></div>
        <div class="detail-item"><dt>时天神</dt><dd><strong>{{ props.chart.timeTianShen }}</strong> {{ props.chart.timeTianShenType }}（{{ props.chart.timeTianShenLuck }}）</dd></div>
        <div class="detail-item"><dt>日禄</dt><dd>{{ props.chart.dayLu }}</dd></div>
        <div class="detail-item"><dt>日冲</dt><dd>{{ props.chart.dayChongDesc }} · 煞{{ props.chart.daySha }}</dd></div>
        <div class="detail-item"><dt>时冲</dt><dd>{{ props.chart.timeChongDesc }} · 煞{{ props.chart.timeSha }}</dd></div>
        <div class="detail-item wide"><dt>彭祖</dt><dd>{{ props.chart.pengZuGan }}　{{ props.chart.pengZuZhi }}</dd></div>
        <div class="detail-item" v-if="props.chart.dayPositionTai"><dt>胎神</dt><dd>{{ props.chart.dayPositionTai }}</dd></div>
        <div class="detail-item"><dt>喜神</dt><dd>{{ props.chart.dayPosition.xiDesc }}（{{ props.chart.dayPosition.xi }}）</dd></div>
        <div class="detail-item"><dt>福神</dt><dd>{{ props.chart.dayPosition.fuDesc }}（{{ props.chart.dayPosition.fu }}）</dd></div>
        <div class="detail-item"><dt>财神</dt><dd>{{ props.chart.dayPosition.caiDesc }}（{{ props.chart.dayPosition.cai }}）</dd></div>
        <div class="detail-item"><dt>阳贵</dt><dd>{{ props.chart.dayPosition.yangGuiDesc }}（{{ props.chart.dayPosition.yangGui }}）</dd></div>
        <div class="detail-item"><dt>阴贵</dt><dd>{{ props.chart.dayPosition.yinGuiDesc }}（{{ props.chart.dayPosition.yinGui }}）</dd></div>
        <div class="detail-item"><dt>年九星</dt><dd>{{ props.chart.nineStar.year }}</dd></div>
        <div class="detail-item"><dt>月九星</dt><dd>{{ props.chart.nineStar.month }}</dd></div>
        <div class="detail-item"><dt>日九星</dt><dd>{{ props.chart.nineStar.day }}</dd></div>
        <div class="detail-item"><dt>时九星</dt><dd>{{ props.chart.nineStar.time }}</dd></div>
        <div class="detail-item wide"><dt>二十八宿</dt><dd>{{ props.chart.xiu }}宿（{{ props.chart.xiuLuck }}）· {{ props.chart.zheng }}{{ props.chart.animal }} · {{ props.chart.gong }}方{{ props.chart.shou }}</dd></div>
      </dl>
    </section>

    <!-- ── 宜忌 ── -->
    <section v-if="props.chart.dayYi.length > 0 || props.chart.dayJi.length > 0" class="bz-section">
      <div class="bz-section-title">宜忌</div>
      <div class="yi-ji">
        <div v-if="props.chart.dayYi.length > 0" class="yi-ji-row">
          <span class="yj-label yi">日宜</span>
          <span v-for="y in props.chart.dayYi" :key="y" class="yj-tag">{{ y }}</span>
        </div>
        <div v-if="props.chart.dayJi.length > 0" class="yi-ji-row">
          <span class="yj-label ji">日忌</span>
          <span v-for="j in props.chart.dayJi" :key="j" class="yj-tag">{{ j }}</span>
        </div>
        <div v-if="props.chart.timeYi.length > 0 && props.chart.timeYi[0] !== '无'" class="yi-ji-row">
          <span class="yj-label yi">时宜</span>
          <span v-for="y in props.chart.timeYi" :key="y" class="yj-tag">{{ y }}</span>
        </div>
        <div v-if="props.chart.timeJi.length > 0" class="yi-ji-row">
          <span class="yj-label ji">时忌</span>
          <span v-for="j in props.chart.timeJi" :key="j" class="yj-tag">{{ j }}</span>
        </div>
      </div>
    </section>

    <!-- ── 大运 ── -->
    <section v-if="props.chart.daYun.length > 0" class="bz-section">
      <div class="bz-section-title">
        大运
        <small v-if="props.profileId" class="text-muted">点击查看解析</small>
      </div>
      <div class="dayun-track">
        <button
          v-for="(dy, i) in props.chart.daYun"
          :key="i"
          type="button"
          class="dayun-step"
          :class="{ current: dy === props.chart.currentDaYun, loading: dayunLoadingSet.has(i) }"
          :disabled="!props.profileId"
          @click.stop="handleDayunClick(dy, i)"
        >
          <Loader2 v-if="dayunLoadingSet.has(i)" :size="11" class="spin dy-spin" />
          <span class="dy-now" v-if="dy === props.chart.currentDaYun">当前</span>
          <span class="dy-gz serif">
            <span :class="dy === props.chart.currentDaYun ? '' : wx(dy.gan)">{{ dy.gan }}</span><span :class="dy === props.chart.currentDaYun ? '' : wx(dy.zhi)">{{ dy.zhi }}</span>
          </span>
          <small class="tabular">{{ dy.startAge }}–{{ dy.endAge }}岁</small>
        </button>
      </div>
    </section>

    <!-- Shensha / Dayun explanation -->
    <AppModal v-model:open="showModal" :title="modalTitle">
      <div v-if="activeExplanation" class="ss-modal-body">
        <div class="ss-section">
          <div class="ss-section-label">{{ isDayunExplanation ? '大运总述' : '神煞总述' }}</div>
          <p class="ss-overview">{{ activeExplanation.overview }}</p>
        </div>
        <div v-if="activeExplanation.pillarDetails.length > 0" class="ss-section">
          <div class="ss-section-label">具体作用</div>
          <div v-for="pd in activeExplanation.pillarDetails" :key="pd.pillar" class="ss-pillar-row">
            <span class="ss-pillar-label">{{ pd.pillar }}</span>
            <span class="ss-pillar-detail">{{ pd.detail }}</span>
          </div>
        </div>
      </div>
    </AppModal>
  </div>
</template>

<style scoped>
.bz-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-sm) var(--space-md);
  flex-wrap: wrap;
  margin-bottom: var(--space-md);
}
.bz-title { font-size: 1.1rem; color: var(--color-text-primary); }
.bz-birth {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 0.82rem;
  color: var(--color-text-muted);
}
.bz-jieqi { font-size: 0.78rem; }

/* ── Table ── */
.bazi-scroll {
  overflow-x: auto;
  margin: 0 calc(-1 * var(--space-xs)) var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
.bazi-table { width: 100%; min-width: 420px; border-collapse: collapse; font-size: 0.85rem; }
.bazi-table th,
.bazi-table td {
  padding: 5px 8px;
  text-align: center;
  vertical-align: middle;
}
.bazi-table thead th {
  padding: 9px 8px;
  font-weight: 600;
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
}
.bazi-table tr.group-start td { border-top: 1px dashed var(--color-border); }
.row-label {
  width: 52px;
  text-align: left !important;
  padding-left: 12px !important;
  font-size: 0.76rem;
  font-weight: 500;
  color: var(--color-text-muted);
  white-space: nowrap;
}
.day-col { background: var(--color-accent-soft); }
thead .day-col { background: var(--color-accent-soft-strong); color: var(--color-accent); }
.dm-tag {
  display: inline-block;
  margin-left: 4px;
  padding: 0 5px;
  border-radius: var(--radius-full);
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font-size: 0.62rem;
  letter-spacing: 0;
  vertical-align: 1px;
}

.char-row td { padding-top: 2px; padding-bottom: 2px; }
.big-char {
  display: inline-block;
  font-family: var(--font-serif);
  font-size: 1.9rem;
  font-weight: 700;
  line-height: 1.25;
}
.ten-god-cell { color: var(--color-accent); font-weight: 600; font-size: 0.82rem; padding-top: 8px !important; }
.hide-gan-cell { font-size: 0.9rem; }
.hide-gan-cell span { font-weight: 600; }
.hg-wx { font-size: 0.66rem; margin-left: 1px; opacity: 0.85; }
.zhi-shen-cell { font-size: 0.78rem; color: var(--color-text-secondary); }
.nayin-cell { font-size: 0.8rem; font-weight: 500; }
.strong-cell { font-weight: 600; font-size: 0.84rem; }
.zizuo-cell { font-size: 0.82rem; font-weight: 500; color: var(--color-accent); }

.ss-cell { padding-bottom: 10px !important; vertical-align: top !important; }
.shensha-tags { display: flex; flex-direction: column; align-items: center; gap: 3px; }
.ss-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 7px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  font-size: 0.7rem;
  line-height: 1.6;
  white-space: nowrap;
}
.ss-tag.clickable { cursor: pointer; transition: all var(--transition-fast); }
.ss-tag.clickable:hover { border-color: var(--color-accent); color: var(--color-accent); }
.ss-tag:disabled { cursor: default; }
.loading { opacity: 0.65; pointer-events: none; }
.ss-empty { color: var(--color-text-muted); font-size: 0.75rem; }

/* ── Palace strip ── */
.palace-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: var(--space-md);
}
.ps-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 8px 4px;
  border-radius: var(--radius-md);
  background: var(--color-bg-tertiary);
}
.ps-label { font-size: 0.7rem; color: var(--color-text-muted); letter-spacing: 0.1em; }
.ps-item strong { font-size: 1.05rem; }
.ps-item small { font-size: 0.7rem; color: var(--color-text-secondary); }

/* ── Sections ── */
.bz-section {
  padding-top: var(--space-md);
  margin-top: var(--space-md);
  border-top: 1px solid var(--color-border);
}
.bz-section-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 10px;
  font-family: var(--font-serif);
  font-size: 0.95rem;
  font-weight: 700;
}
.bz-section-title small { font-family: var(--font-sans); font-size: 0.72rem; font-weight: 400; }

/* ── Wu xing ── */
.wuxing-pairs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.wx-pair {
  padding: 2px 10px;
  border-radius: var(--radius-full);
  background: var(--color-bg-tertiary);
  font-family: var(--font-serif);
  font-size: 0.88rem;
  font-weight: 700;
}
.wx-analysis {
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: var(--color-bg-tertiary);
}
.wx-bars { display: flex; flex-direction: column; gap: 6px; }
.wx-bar-item { display: flex; align-items: center; gap: 8px; font-size: 0.8rem; }
.wx-bar-label { width: 1.4em; font-size: 0.95rem; font-weight: 700; text-align: center; }
.wx-bar-track {
  flex: 1;
  height: 8px;
  border-radius: var(--radius-full);
  background: var(--color-bg-secondary);
  overflow: hidden;
}
.wx-bar-fill { height: 100%; border-radius: var(--radius-full); transition: width 0.5s ease; }
.wx-bar-count { width: 1.4em; text-align: right; color: var(--color-text-secondary); }
.wx-bar-status { width: 1.4em; font-size: 0.72rem; color: var(--color-text-muted); }
.wx-bar-status.wang { color: var(--color-xiong); font-weight: 700; }
.wx-bar-status.si { opacity: 0.5; }
.wx-summary { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.wx-summary strong { margin: 0 1px; }

/* ── Shensha groups ── */
.shensha-group { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 8px; }
.group-label {
  font-size: 0.74rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  margin-right: 2px;
}
.group-label.ji { background: var(--color-ji-soft); color: var(--color-ji); }
.group-label.xiong { background: var(--color-xiong-soft); color: var(--color-xiong); }
.tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-full);
  font-size: 0.76rem;
  white-space: nowrap;
}
.tag.ji { background: var(--color-ji-soft); color: var(--color-ji); }
.tag.xiong { background: var(--color-xiong-soft); color: var(--color-xiong); }
.tag.clickable { cursor: pointer; transition: border-color var(--transition-fast); }
.tag.clickable:hover { border-color: currentColor; }
.tag:disabled { cursor: default; }

/* ── Detail grid ── */
.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1px;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--color-border);
  border: 1px solid var(--color-border);
}
.detail-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 8px 12px;
  background: var(--color-bg-secondary);
  font-size: 0.82rem;
}
.detail-item.wide { grid-column: 1 / -1; }
.detail-item dt { flex-shrink: 0; min-width: 4em; color: var(--color-text-muted); font-size: 0.76rem; }
.detail-item dd { color: var(--color-text-secondary); line-height: 1.5; }
.detail-item dd strong { color: var(--color-text-primary); }

/* ── Yi / Ji ── */
.yi-ji { display: flex; flex-direction: column; gap: 6px; }
.yi-ji-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.yj-label {
  flex-shrink: 0;
  margin-right: 4px;
  padding: 1px 8px;
  border-radius: var(--radius-sm);
  font-size: 0.76rem;
  font-weight: 700;
}
.yj-label.yi { background: var(--color-ji-soft); color: var(--color-ji); }
.yj-label.ji { background: var(--color-xiong-soft); color: var(--color-xiong); }
.yj-tag {
  padding: 1px 7px;
  border-radius: var(--radius-sm);
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  font-size: 0.74rem;
}

/* ── Da Yun timeline ── */
.dayun-track {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 10px 2px 6px;
  scroll-snap-type: x proximity;
}
.dayun-step {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 66px;
  padding: 8px 8px 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  cursor: pointer;
  scroll-snap-align: start;
  transition: border-color var(--transition-fast), transform var(--transition-fast), box-shadow var(--transition-fast);
}
.dayun-step:hover:not(:disabled) { border-color: var(--color-accent); transform: translateY(-1px); box-shadow: var(--shadow-sm); }
.dayun-step:disabled { cursor: default; }
.dayun-step.current {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: var(--color-accent-contrast);
  box-shadow: 0 4px 12px var(--color-accent-soft-strong);
}
.dy-gz { font-size: 1.1rem; font-weight: 700; letter-spacing: 0.05em; }
.dayun-step small { font-size: 0.68rem; opacity: 0.75; }
.dy-now {
  position: absolute;
  top: -9px;
  left: 50%;
  transform: translateX(-50%);
  padding: 0 6px;
  border-radius: var(--radius-full);
  background: var(--color-seal);
  color: #fff;
  font-size: 0.6rem;
  line-height: 16px;
  white-space: nowrap;
}
.dy-spin { position: absolute; top: 4px; right: 4px; }

/* ── Explanation modal ── */
.ss-modal-body { display: flex; flex-direction: column; gap: 12px; }
.ss-section {
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: var(--color-bg-tertiary);
}
.ss-section-label {
  margin-bottom: 6px;
  font-size: 0.74rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
}
.ss-overview { font-size: 0.9rem; line-height: 1.75; color: var(--color-text-primary); }
.ss-pillar-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 7px 0;
  border-bottom: 1px dashed var(--color-border-strong);
}
.ss-pillar-row:last-child { border-bottom: none; }
.ss-pillar-label { flex-shrink: 0; min-width: 3em; font-size: 0.78rem; font-weight: 700; color: var(--color-accent); }
.ss-pillar-detail { font-size: 0.86rem; line-height: 1.65; color: var(--color-text-primary); }

@media (max-width: 640px) {
  .big-char { font-size: 1.55rem; }
  .palace-strip { grid-template-columns: repeat(2, 1fr); }
  .detail-grid { grid-template-columns: 1fr; }
  .bazi-table th, .bazi-table td { padding: 4px 5px; }
}
</style>
