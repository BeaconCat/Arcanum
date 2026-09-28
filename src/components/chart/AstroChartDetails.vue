<script setup lang="ts">
import { computed, ref } from 'vue';
import { Sparkles } from 'lucide-vue-next';
import type { AstroChart, AstroElement, AstroModality, AstroPointKey } from '../../../shared/types/astro.types';
import {
  SIGN_ELEMENT, ELEMENT_LABEL, MODALITY_LABEL, HOUSE_SYSTEMS, aspectMeta, dignityTone, fmtDeg, isMinorBody,
} from '../../utils/astro';
import AstroGlyph from './AstroGlyph.vue';

/** Tables and summaries under a single chart: planets, aspects, cusps, patterns, distribution. */
const props = withDefaults(defineProps<{
  chart: AstroChart;
  showDignity?: boolean;
  /** Hide the aspect table (e.g. when a bi-wheel shows cross aspects instead) */
  hideAspects?: boolean;
  title?: string;
}>(), { showDignity: true, hideAspects: false, title: '' });

const clsFilter = ref<'all' | 'major' | 'minor'>('all');
const toneFilter = ref<'all' | 'harmonious' | 'challenging'>('all');

const nameOf = (key: AstroPointKey) =>
  props.chart.planets.find((p) => p.key === key)?.name || (key === 'asc' ? '上升' : key === 'mc' ? '天顶' : String(key));

const aspects = computed(() => (props.chart.aspects || []).filter((x) => {
  const m = aspectMeta(x.type);
  const cls = x.class || m.cls;
  if (clsFilter.value !== 'all' && cls !== clsFilter.value) return false;
  if (toneFilter.value !== 'all' && (x.harmony || m.tone) !== toneFilter.value) return false;
  return true;
}));

const patterns = computed(() => props.chart.patterns || []);

/** Planet table groups: 行星 / 交点 / 小行星与虚点 */
const planetGroups = computed(() => {
  const ps = props.chart.planets;
  const cat = (p: (typeof ps)[number]) => p.category ?? (isMinorBody(p) ? 'asteroid' : p.key.endsWith('Node') ? 'node' : 'planet');
  return [
    { key: 'planet', label: '行星', rows: ps.filter((p) => cat(p) === 'planet') },
    { key: 'node', label: '交点', rows: ps.filter((p) => cat(p) === 'node') },
    { key: 'minor', label: '小行星与虚点', rows: ps.filter((p) => cat(p) === 'asteroid' || cat(p) === 'point') },
  ].filter((g) => g.rows.length);
});

const elementRows = computed(() => {
  const d = props.chart.distribution; if (!d) return [];
  return (Object.keys(d.elements) as AstroElement[]).map((k) => ({ key: k, label: ELEMENT_LABEL[k], n: d.elements[k] }));
});
const modalityRows = computed(() => {
  const d = props.chart.distribution; if (!d) return [];
  return (Object.keys(d.modalities) as AstroModality[]).map((k) => ({ key: k, label: MODALITY_LABEL[k], n: d.modalities[k] }));
});
const total = computed(() => Math.max(1, props.chart.distribution?.counted?.length || 10));
const polarity = computed(() => props.chart.distribution?.polarity);
const hemi = computed(() => props.chart.distribution?.hemispheres);
</script>

<template>
  <div class="acd">
    <h3 v-if="title" class="acd-title">{{ title }}</h3>

    <!-- Patterns -->
    <section v-if="patterns.length" class="acd-patterns">
      <div v-for="(p, i) in patterns" :key="i" class="pattern">
        <span class="pattern-icon"><Sparkles :size="15" /></span>
        <div class="pattern-body">
          <b>{{ p.name }}</b>
          <span class="pattern-detail">{{ p.detail }}</span>
          <span class="pattern-bodies">{{ p.bodyNames.join(' · ') }}<template v-if="p.apex">（焦点：{{ nameOf(p.apex) }}）</template></span>
        </div>
      </div>
    </section>

    <div class="acd-grid">
      <section class="blk">
        <h4>行星</h4>
        <p v-if="chart.extraBodiesNote" class="extra-note">{{ chart.extraBodiesNote }}</p>
        <div class="tbl-scroll">
          <table class="table compact">
            <thead><tr><th>行星</th><th>星座</th><th>度数</th><th>宫</th><th v-if="showDignity">尊贵</th><th></th></tr></thead>
            <tbody v-for="g in planetGroups" :key="g.key" :class="{ minor: g.key === 'minor' }">
              <tr v-if="planetGroups.length > 1" class="group-row"><td :colspan="showDignity ? 6 : 5">{{ g.label }}</td></tr>
              <tr v-for="p in g.rows" :key="p.key">
                <td><AstroGlyph class="sym" :body-key="p.key" :symbol="p.symbol" :size="14" /> {{ p.name }}</td>
                <td><span class="sym" :class="SIGN_ELEMENT[p.signIndex]">{{ p.signSymbol }}</span> {{ p.sign }}</td>
                <td class="tabular">{{ fmtDeg(p) }}</td>
                <td class="tabular">{{ p.house }}</td>
                <td v-if="showDignity"><span v-if="p.dignityName" class="dig" :class="dignityTone(p.dignity)">{{ p.dignityName }}</span></td>
                <td><span v-if="p.retrograde" class="badge badge-warning">逆行</span></td>
              </tr>
            </tbody>
            <tbody>
              <tr v-for="k in (['asc', 'mc'] as const)" :key="k" class="angle-row">
                <td>{{ chart.angles[k].name }}</td>
                <td><span class="sym" :class="SIGN_ELEMENT[chart.angles[k].signIndex]">{{ chart.angles[k].signSymbol }}</span> {{ chart.angles[k].sign }}</td>
                <td class="tabular">{{ fmtDeg(chart.angles[k]) }}</td>
                <td>—</td><td v-if="showDignity"></td><td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="!hideAspects" class="blk">
        <h4>
          相位 <small class="muted">{{ aspects.length }} / {{ chart.aspects.length }}</small>
          <span class="filters">
            <select v-model="clsFilter" class="input input-sm" aria-label="相位类别">
              <option value="all">全部</option><option value="major">主相位</option><option value="minor">次相位</option>
            </select>
            <select v-model="toneFilter" class="input input-sm" aria-label="相位性质">
              <option value="all">吉凶</option><option value="harmonious">和谐</option><option value="challenging">紧张</option>
            </select>
          </span>
        </h4>
        <div class="tbl-scroll aspects-scroll">
          <table class="table compact">
            <thead><tr><th>相位</th><th>容许度</th><th>状态</th></tr></thead>
            <tbody>
              <tr v-for="(x, i) in aspects" :key="i">
                <td>
                  {{ nameOf(x.a) }}
                  <span class="asp-name" :class="[x.harmony || aspectMeta(x.type).tone, (x.class || aspectMeta(x.type).cls)]">{{ x.typeName || aspectMeta(x.type).name }}</span>
                  {{ nameOf(x.b) }}
                </td>
                <td class="tabular">{{ x.orb.toFixed(1) }}°</td>
                <td class="muted">{{ x.applying ? '入相' : '出相' }}</td>
              </tr>
              <tr v-if="!aspects.length"><td colspan="3" class="muted empty-row">没有符合条件的相位</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="blk">
        <h4>宫头 <small class="muted">{{ HOUSE_SYSTEMS.find((h) => h.value === chart.houseSystemUsed)?.label }}</small></h4>
        <div class="cusp-grid">
          <div v-for="h in chart.houses" :key="h.house" class="cusp">
            <span class="cusp-n">{{ h.house }}</span>
            <span><span class="sym" :class="SIGN_ELEMENT[h.signIndex]">{{ h.signSymbol }}</span> {{ h.sign }}</span>
            <span class="tabular muted">{{ fmtDeg(h) }}</span>
          </div>
        </div>
      </section>

      <section class="blk">
        <h4>分布 <small class="muted">十大行星</small></h4>
        <div class="dist">
          <div v-for="r in elementRows" :key="r.key" class="dist-row">
            <span class="dist-label" :class="r.key">{{ r.label }}</span>
            <div class="dist-track"><div class="dist-fill" :class="r.key" :style="{ width: `${(r.n / total) * 100}%` }" /></div>
            <span class="tabular">{{ r.n }}</span>
          </div>
          <div class="dist-sep" />
          <div v-for="r in modalityRows" :key="r.key" class="dist-row">
            <span class="dist-label">{{ r.label }}</span>
            <div class="dist-track"><div class="dist-fill mod" :style="{ width: `${(r.n / total) * 100}%` }" /></div>
            <span class="tabular">{{ r.n }}</span>
          </div>
          <template v-if="polarity || hemi">
            <div class="dist-sep" />
            <div class="pairs">
              <span v-if="polarity">阳性 <b class="tabular">{{ polarity.yang }}</b> · 阴性 <b class="tabular">{{ polarity.yin }}</b></span>
              <span v-if="hemi">东 <b>{{ hemi.east }}</b> · 西 <b>{{ hemi.west }}</b> · 南 <b>{{ hemi.south }}</b> · 北 <b>{{ hemi.north }}</b></span>
            </div>
          </template>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.acd {
  --el-fire: var(--wx-fire);
  --el-earth: var(--wx-wood);
  --el-air: var(--wx-earth);
  --el-water: var(--wx-water);
  display: flex; flex-direction: column; gap: var(--space-md);
}
.acd-title { font-family: var(--font-serif); font-size: 1.02rem; }
.muted { color: var(--color-text-muted); }

.acd-patterns { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px; }
.pattern {
  display: flex; gap: 10px; padding: 10px 12px; border-radius: var(--radius-md);
  border: 1px solid color-mix(in srgb, var(--color-gold) 40%, var(--color-border));
  background: color-mix(in srgb, var(--color-gold) 8%, var(--color-bg-secondary));
}
.pattern-icon { display: grid; place-items: center; width: 30px; height: 30px; flex-shrink: 0; border-radius: 50%; background: color-mix(in srgb, var(--color-gold) 18%, transparent); color: var(--color-gold); }
.pattern-body { display: flex; flex-direction: column; min-width: 0; line-height: 1.45; }
.pattern-body b { font-family: var(--font-serif); font-size: 0.95rem; }
.pattern-detail { font-size: 0.8rem; color: var(--color-text-secondary); }
.pattern-bodies { font-size: 0.76rem; color: var(--color-text-muted); }

.acd-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-md); }
.blk { min-width: 0; }
.blk h4 { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; font-family: var(--font-serif); font-size: 0.95rem; margin-bottom: 8px; }
.blk h4 small { font-family: var(--font-sans); font-weight: 400; font-size: 0.74rem; }
.filters { display: inline-flex; gap: 4px; margin-left: auto; font-family: var(--font-sans); font-weight: 400; }
.filters .input { width: auto; min-height: 28px; padding: 2px 26px 2px 8px; font-size: 0.76rem; background-position: right 8px center; }
.tbl-scroll { overflow-x: auto; border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.aspects-scroll { max-height: 380px; overflow-y: auto; }
.table.compact th { padding: 7px 10px; }
.table.compact td { padding: 7px 10px; font-size: 0.83rem; white-space: nowrap; }
.empty-row { text-align: center; }
.angle-row td { color: var(--color-accent); font-weight: 600; }
.group-row td { padding: 5px 10px !important; background: var(--color-bg-tertiary); font-size: 0.74rem !important; font-weight: 600; letter-spacing: 0.08em; color: var(--color-text-muted); }
tbody.minor td { color: var(--color-text-secondary); }
.extra-note { margin-bottom: 6px; font-size: 0.76rem; color: var(--color-warning); }
.sym { font-variant-emoji: text; }
.sym.fire { color: var(--el-fire); }
.sym.earth { color: var(--el-earth); }
.sym.air { color: var(--el-air); }
.sym.water { color: var(--el-water); }
.dig { display: inline-block; padding: 0 6px; border-radius: 999px; font-size: 0.74rem; font-weight: 700; background: var(--color-bg-tertiary); color: var(--color-text-secondary); font-family: var(--font-serif); }
.dig.good { background: var(--color-ji-soft); color: var(--color-ji); }
.dig.bad { background: var(--color-xiong-soft); color: var(--color-xiong); }
.asp-name { display: inline-block; margin: 0 3px; padding: 0 6px; border-radius: 999px; font-size: 0.74rem; font-weight: 600; }
.asp-name.harmonious { background: var(--color-ji-soft); color: var(--color-ji); }
.asp-name.challenging { background: var(--color-xiong-soft); color: var(--color-xiong); }
.asp-name.neutral { background: color-mix(in srgb, var(--color-gold) 16%, transparent); color: var(--color-gold); }
.asp-name.minor { font-weight: 500; outline: 1px dashed currentColor; outline-offset: -1px; background: transparent; }

.cusp-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; }
.cusp { display: grid; grid-template-columns: 26px 1fr auto; align-items: center; gap: 6px; padding: 6px 10px; border-radius: var(--radius-sm); background: var(--color-bg-tertiary); font-size: 0.83rem; font-variant-emoji: text; }
.cusp-n { font-weight: 700; color: var(--color-accent); font-variant-numeric: tabular-nums; }

.dist { display: flex; flex-direction: column; gap: 7px; padding: 10px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.dist-row { display: grid; grid-template-columns: 34px 1fr 20px; align-items: center; gap: 8px; font-size: 0.82rem; }
.dist-label { font-weight: 600; }
.dist-label.fire { color: var(--el-fire); }
.dist-label.earth { color: var(--el-earth); }
.dist-label.air { color: var(--el-air); }
.dist-label.water { color: var(--el-water); }
.dist-track { height: 8px; border-radius: 999px; background: var(--color-bg-tertiary); overflow: hidden; }
.dist-fill { height: 100%; border-radius: 999px; transition: width 0.4s ease; }
.dist-fill.fire { background: var(--el-fire); }
.dist-fill.earth { background: var(--el-earth); }
.dist-fill.air { background: var(--el-air); }
.dist-fill.water { background: var(--el-water); }
.dist-fill.mod { background: var(--color-accent); }
.dist-sep { height: 1px; background: var(--color-border); margin: 3px 0; }
.pairs { display: flex; flex-direction: column; gap: 4px; font-size: 0.8rem; color: var(--color-text-secondary); }
.pairs b { color: var(--color-text-primary); }

@media (max-width: 760px) {
  .acd-grid { grid-template-columns: 1fr; }
}
@media (max-width: 420px) {
  .cusp-grid { grid-template-columns: 1fr; }
}
</style>
