<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AstroBiWheel, AstroChart, AstroPointKey } from '../../../shared/types/astro.types';
import { aspectMeta, isMinorBody } from '../../utils/astro';

/** Cross aspects and house overlays for a bi-wheel. */
const props = defineProps<{ data: AstroBiWheel }>();

const clsFilter = ref<'all' | 'major' | 'minor'>('all');
const toneFilter = ref<'all' | 'harmonious' | 'challenging'>('all');

const nameIn = (chart: AstroChart, key: AstroPointKey) =>
  chart.planets.find((p) => p.key === key)?.name || (key === 'asc' ? '上升' : key === 'mc' ? '天顶' : String(key));

const minor = (key: string) => isMinorBody({ key });
const notes = computed(() => [...new Set([props.data.inner.extraBodiesNote, props.data.outer.extraBodiesNote].filter(Boolean))]);

const rows = computed(() => (props.data.crossAspects || []).filter((x) => {
  const m = aspectMeta(x.type);
  if (clsFilter.value !== 'all' && (x.class || m.cls) !== clsFilter.value) return false;
  if (toneFilter.value !== 'all' && (x.harmony || m.tone) !== toneFilter.value) return false;
  return true;
}));
</script>

<template>
  <div class="acx">
    <section class="blk">
      <h4>
        交互相位 <small class="muted">{{ data.innerLabel }} × {{ data.outerLabel }} · {{ rows.length }} 个</small>
        <span class="filters">
          <select v-model="clsFilter" class="input input-sm" aria-label="相位类别">
            <option value="all">全部</option><option value="major">主相位</option><option value="minor">次相位</option>
          </select>
          <select v-model="toneFilter" class="input input-sm" aria-label="相位性质">
            <option value="all">吉凶</option><option value="harmonious">和谐</option><option value="challenging">紧张</option>
          </select>
        </span>
      </h4>
      <p v-for="n in notes" :key="n" class="extra-note">{{ n }}</p>
      <div class="tbl-scroll aspects-scroll">
        <table class="table compact">
          <thead><tr><th>{{ data.outerLabel }}</th><th>相位</th><th>{{ data.innerLabel }}</th><th>容许度</th><th>状态</th></tr></thead>
          <tbody>
            <tr v-for="(x, i) in rows" :key="i">
              <td class="outer-name">{{ nameIn(data.outer, x.b) }}<small v-if="minor(x.b)" class="mtag">小</small></td>
              <td><span class="asp-name" :class="[x.harmony || aspectMeta(x.type).tone, x.class || aspectMeta(x.type).cls]">{{ x.typeName || aspectMeta(x.type).name }}</span></td>
              <td>{{ nameIn(data.inner, x.a) }}<small v-if="minor(x.a)" class="mtag">小</small></td>
              <td class="tabular">{{ x.orb.toFixed(1) }}°</td>
              <td class="muted">{{ x.applying ? '入相' : '出相' }}</td>
            </tr>
            <tr v-if="!rows.length"><td colspan="5" class="muted empty-row">没有符合条件的交互相位</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="blk">
      <h4>{{ data.outerLabel }}行星落入{{ data.innerLabel }}宫位</h4>
      <div class="house-grid">
        <div v-for="h in data.outerInInnerHouses" :key="h.key" class="hcell" :class="{ minor: minor(h.key) }">
          <span class="outer-name">{{ h.name }}</span><span class="tabular">第 {{ h.house }} 宫</span>
        </div>
      </div>
      <template v-if="data.innerInOuterHouses?.length">
        <h4 class="mt">{{ data.innerLabel }}行星落入{{ data.outerLabel }}宫位</h4>
        <div class="house-grid">
          <div v-for="h in data.innerInOuterHouses" :key="h.key" class="hcell" :class="{ minor: minor(h.key) }">
            <span>{{ h.name }}</span><span class="tabular">第 {{ h.house }} 宫</span>
          </div>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.mtag { margin-left: 4px; padding: 0 4px; border-radius: 4px; font-size: 0.66rem; background: var(--color-bg-tertiary); color: var(--color-text-muted); }
.hcell.minor { opacity: 0.75; border-style: dashed; }
.extra-note { margin-bottom: 6px; font-size: 0.76rem; color: var(--color-warning); }
.acx { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: var(--space-md); }
.blk { min-width: 0; }
.blk h4 { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; font-family: var(--font-serif); font-size: 0.95rem; margin-bottom: 8px; }
.blk h4.mt { margin-top: var(--space-md); }
.blk h4 small { font-family: var(--font-sans); font-weight: 400; font-size: 0.74rem; }
.muted { color: var(--color-text-muted); }
.filters { display: inline-flex; gap: 4px; margin-left: auto; font-family: var(--font-sans); font-weight: 400; }
.filters .input { width: auto; min-height: 28px; padding: 2px 26px 2px 8px; font-size: 0.76rem; background-position: right 8px center; }
.tbl-scroll { overflow-x: auto; border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.aspects-scroll { max-height: 420px; overflow-y: auto; }
.table.compact th { padding: 7px 10px; }
.table.compact td { padding: 7px 10px; font-size: 0.83rem; white-space: nowrap; }
.empty-row { text-align: center; }
.outer-name { color: var(--color-info); font-weight: 600; }
.asp-name { display: inline-block; padding: 0 7px; border-radius: 999px; font-size: 0.74rem; font-weight: 600; }
.asp-name.harmonious { background: var(--color-ji-soft); color: var(--color-ji); }
.asp-name.challenging { background: var(--color-xiong-soft); color: var(--color-xiong); }
.asp-name.neutral { background: color-mix(in srgb, var(--color-gold) 16%, transparent); color: var(--color-gold); }
.asp-name.minor { font-weight: 500; outline: 1px dashed currentColor; outline-offset: -1px; background: transparent; }
.house-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; }
.hcell { display: flex; justify-content: space-between; gap: 6px; padding: 6px 10px; border-radius: var(--radius-sm); background: var(--color-bg-tertiary); font-size: 0.83rem; }

@media (max-width: 860px) {
  .acx { grid-template-columns: 1fr; }
}
</style>
