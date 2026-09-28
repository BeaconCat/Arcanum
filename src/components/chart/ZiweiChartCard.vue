<script setup lang="ts">
import type { ZiweiChart, ZiweiPalace, ZiweiStar } from '../../../shared/types/ziwei.types';

const props = defineProps<{ chart: ZiweiChart }>();

// Map earthly branch → CSS grid-area name
const EB_AREA: Record<string, string> = {
  '巳': 'si', '午': 'wu', '未': 'wei', '申': 'shen',
  '辰': 'chen',                          '酉': 'you',
  '卯': 'mao',                                       '戌': 'xu',
  '寅': 'yin', '丑': 'chou', '子': 'zi', '亥': 'hai',
};

function palaceArea(p: ZiweiPalace): string {
  return EB_AREA[p.earthlyBranch] || '';
}

function isSoulPalace(p: ZiweiPalace): boolean {
  return p.name === '命宫' || p.earthlyBranch === props.chart.earthlyBranchOfSoulPalace;
}

const HUA_CLASS: Record<string, string> = { 禄: 'lu', 权: 'quan', 科: 'ke', 忌: 'ji' };
function huaClass(s: ZiweiStar): string {
  return s.mutagen ? HUA_CLASS[s.mutagen] || '' : '';
}

const siHuaList = [
  { key: 'lu', label: '禄' },
  { key: 'quan', label: '权' },
  { key: 'ke', label: '科' },
  { key: 'ji', label: '忌' },
] as const;
</script>

<template>
  <div class="ziwei-card card">
    <div class="zw-head">
      <h3 class="zw-title">紫微斗数命盘</h3>
      <div class="zw-meta">
        <span>{{ props.chart.lunarDate }}</span>
        <span>{{ props.chart.time }}（{{ props.chart.timeRange }}）</span>
        <span>{{ props.chart.sign }} · {{ props.chart.zodiac }}</span>
      </div>
    </div>

    <!-- Si Hua summary -->
    <div class="sihua-row">
      <span v-for="h in siHuaList" :key="h.key" class="sihua-tag" :class="h.key">
        <b>化{{ h.label }}</b>
        {{ props.chart.siHua[h.key].star }}
        <small>{{ props.chart.siHua[h.key].palace }}</small>
      </span>
    </div>

    <!-- 4x4 Grid with merged center -->
    <div class="ziwei-scroll">
      <div class="ziwei-grid">
        <div class="grid-cell center-cell">
          <div class="center-info">
            <div class="center-title">{{ props.chart.chineseDate }}</div>
            <div class="center-class">{{ props.chart.fiveElementsClass }}</div>
            <div class="center-soul">
              <span>命主 <strong>{{ props.chart.soul }}</strong></span>
              <span>身主 <strong>{{ props.chart.body }}</strong></span>
            </div>
            <div class="center-sihua">
              <span v-for="h in siHuaList" :key="h.key" :class="`hua-${h.key}`">
                {{ h.label }}·{{ props.chart.siHua[h.key].star }}
              </span>
            </div>
            <div class="center-legend">
              <span><i class="lg-soul"></i>命宫</span>
              <span><i class="lg-body"></i>身宫</span>
            </div>
          </div>
        </div>

        <div
          v-for="p in props.chart.palaces"
          :key="p.earthlyBranch"
          class="grid-cell palace-cell"
          :class="{ 'is-body': p.isBodyPalace, 'is-soul': isSoulPalace(p) }"
          :style="{ gridArea: palaceArea(p) }"
        >
          <div class="cell-header">
            <span class="palace-name">{{ p.name }}</span>
            <span v-if="p.isBodyPalace" class="body-tag">身</span>
            <span class="cell-stem serif">{{ p.heavenlyStem }}{{ p.earthlyBranch }}</span>
          </div>

          <div class="star-row" v-if="p.majorStars.length">
            <span v-for="s in p.majorStars" :key="s.name" class="star major" :class="huaClass(s)">
              {{ s.name }}<sup v-if="s.brightness" class="bright">{{ s.brightness }}</sup><em v-if="s.mutagen" class="hua-badge">{{ s.mutagen }}</em>
            </span>
          </div>
          <div class="star-row" v-if="p.minorStars.length > 0">
            <span v-for="s in p.minorStars" :key="s.name" class="star minor" :class="huaClass(s)">
              {{ s.name }}<sup v-if="s.brightness" class="bright">{{ s.brightness }}</sup><em v-if="s.mutagen" class="hua-badge">{{ s.mutagen }}</em>
            </span>
          </div>
          <div class="star-row" v-if="p.adjectiveStars.length > 0">
            <span v-for="s in p.adjectiveStars" :key="s.name" class="star adj">{{ s.name }}</span>
          </div>

          <div class="cell-foot">
            <div class="twelve-row">
              <span v-if="p.changsheng12">{{ p.changsheng12 }}</span>
              <span v-if="p.boshi12">{{ p.boshi12 }}</span>
              <span v-if="p.jiangqian12">{{ p.jiangqian12 }}</span>
              <span v-if="p.suiqian12">{{ p.suiqian12 }}</span>
            </div>
            <div class="decadal-row tabular" v-if="p.decadal.range[0] || p.decadal.range[1]">
              {{ p.decadal.range[0] }}–{{ p.decadal.range[1] }}
            </div>
          </div>
        </div>
      </div>
    </div>
    <p class="scroll-hint show-mobile">← 左右滑动查看完整命盘 →</p>
  </div>
</template>

<style scoped>
.zw-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-sm) var(--space-md);
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.zw-title { font-size: 1.1rem; color: var(--color-text-primary); }
.zw-meta { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 0.8rem; color: var(--color-text-muted); }

.sihua-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: var(--space-md); }
.sihua-tag {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  font-size: 0.78rem;
  background: var(--color-bg-tertiary);
}
.sihua-tag b { font-weight: 700; }
.sihua-tag small { font-size: 0.7rem; color: var(--color-text-muted); }
.sihua-tag.lu { color: var(--hua-lu); background: color-mix(in srgb, var(--hua-lu) 11%, transparent); }
.sihua-tag.quan { color: var(--hua-quan); background: color-mix(in srgb, var(--hua-quan) 11%, transparent); }
.sihua-tag.ke { color: var(--hua-ke); background: color-mix(in srgb, var(--hua-ke) 11%, transparent); }
.sihua-tag.ji { color: var(--hua-ji); background: color-mix(in srgb, var(--hua-ji) 11%, transparent); }

/* ── Grid ── */
.ziwei-scroll { overflow-x: auto; }
.ziwei-grid {
  display: grid;
  min-width: 600px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-template-rows: repeat(4, auto);
  grid-template-areas:
    "si   wu   wei  shen"
    "chen cntr cntr you"
    "mao  cntr cntr xu"
    "yin  chou zi   hai";
  gap: 1px;
  background: var(--color-border-strong);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.grid-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-height: 118px;
  padding: 7px 8px 6px;
  background: var(--color-bg-secondary);
  overflow: hidden;
}

.center-cell {
  grid-area: cntr;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(circle at 50% 45%, var(--color-accent-soft), transparent 70%),
    var(--color-bg-secondary);
}
.center-info { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; }
.center-title {
  font-family: var(--font-serif);
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--color-text-primary);
}
.center-class {
  padding: 2px 12px;
  border-radius: var(--radius-full);
  background: var(--color-accent-soft);
  color: var(--color-accent);
  font-size: 0.8rem;
  font-weight: 600;
}
.center-soul { display: flex; gap: 14px; font-size: 0.8rem; color: var(--color-text-secondary); }
.center-soul strong { font-family: var(--font-serif); color: var(--color-text-primary); }
.center-sihua { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 10px; font-size: 0.76rem; font-weight: 600; }
.hua-lu { color: var(--hua-lu); }
.hua-quan { color: var(--hua-quan); }
.hua-ke { color: var(--hua-ke); }
.hua-ji { color: var(--hua-ji); }
.center-legend { display: flex; gap: 12px; font-size: 0.7rem; color: var(--color-text-muted); }
.center-legend span { display: inline-flex; align-items: center; gap: 4px; }
.center-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; }
.lg-soul { background: var(--color-seal); }
.lg-body { background: var(--color-accent); }

.palace-cell.is-soul { background: color-mix(in srgb, var(--color-seal) 6%, var(--color-bg-secondary)); }
.palace-cell.is-soul::before,
.palace-cell.is-body::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 3px;
}
.palace-cell.is-soul::before { left: 0; background: var(--color-seal); }
.palace-cell.is-body::after { right: 0; background: var(--color-accent); }

.cell-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-bottom: 3px;
  margin-bottom: 1px;
  border-bottom: 1px dashed var(--color-border);
}
.palace-name {
  font-family: var(--font-serif);
  font-size: 0.84rem;
  font-weight: 700;
  color: var(--color-accent);
}
.is-soul .palace-name { color: var(--color-seal); }
.body-tag {
  padding: 0 4px;
  border-radius: 3px;
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font-size: 0.6rem;
  line-height: 1.5;
}
.cell-stem { margin-left: auto; font-size: 0.72rem; color: var(--color-text-muted); }

/* ── Stars ── */
.star-row { display: flex; flex-wrap: wrap; gap: 1px 5px; }
.star { position: relative; font-size: 0.7rem; white-space: nowrap; line-height: 1.5; }
.star.major {
  font-family: var(--font-serif);
  font-size: 0.86rem;
  font-weight: 700;
  color: var(--color-text-primary);
}
.star.minor { color: var(--color-text-secondary); font-size: 0.72rem; }
.star.adj { color: var(--color-text-muted); font-size: 0.64rem; }
.bright { margin-left: 1px; font-family: var(--font-sans); font-size: 0.56rem; font-weight: 400; color: var(--color-text-muted); }
.hua-badge {
  display: inline-block;
  margin-left: 2px;
  padding: 0 3px;
  border-radius: 3px;
  font-family: var(--font-sans);
  font-size: 0.6rem;
  font-style: normal;
  font-weight: 700;
  line-height: 1.45;
  color: var(--color-bg-secondary);
  vertical-align: 1px;
}
.star.lu { color: var(--hua-lu); }
.star.quan { color: var(--hua-quan); }
.star.ke { color: var(--hua-ke); }
.star.ji { color: var(--hua-ji); }
.star.lu .hua-badge { background: var(--hua-lu); }
.star.quan .hua-badge { background: var(--hua-quan); }
.star.ke .hua-badge { background: var(--hua-ke); }
.star.ji .hua-badge { background: var(--hua-ji); }

.cell-foot {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 4px;
  margin-top: auto;
  padding-top: 3px;
}
.twelve-row { display: flex; flex-wrap: wrap; gap: 0 4px; font-size: 0.6rem; color: var(--color-text-muted); }
.decadal-row {
  flex-shrink: 0;
  padding: 0 5px;
  border-radius: 3px;
  background: var(--color-bg-tertiary);
  font-size: 0.64rem;
  color: var(--color-text-secondary);
}

.scroll-hint { margin-top: 6px; text-align: center; font-size: 0.72rem; color: var(--color-text-muted); }

@media (max-width: 640px) {
  .ziwei-scroll { margin: 0 calc(-1 * var(--space-md)); padding: 0 var(--space-md); }
  .ziwei-grid { min-width: 560px; }
  .grid-cell { min-height: 104px; padding: 5px 6px; }
}
</style>
