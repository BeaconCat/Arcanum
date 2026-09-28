<script setup lang="ts">
/**
 * Generic "headline facts" view for flow / 大运 / 五行 tools: the scalar fields become tiles
 * (干支 and 十神 enlarged), string lists become chip rows. Nested objects stay in the data tab.
 */
import { computed } from 'vue';
import { labelFor, scalar } from './labels';

const props = defineProps<{ data: Record<string, any> }>();

const SKIP = new Set(['分析对象']);
const BIG = /GanZhi|TenGod|dayMaster$/;

const tiles = computed(() => Object.entries(props.data)
  .filter(([k, v]) => !SKIP.has(k) && (v === null || typeof v !== 'object'))
  .map(([k, v]) => ({ k, label: labelFor(k), value: scalar(v), big: BIG.test(k) }))
  .sort((a, b) => Number(b.big) - Number(a.big)));

const chipRows = computed(() => Object.entries(props.data)
  .filter(([, v]) => Array.isArray(v) && v.length && v.every((x) => typeof x !== 'object'))
  .map(([k, v]) => ({ k, label: labelFor(k), items: (v as unknown[]).map(scalar) })));

// 当前大运 is common and worth surfacing
const daYun = computed(() => props.data.currentDaYun as { gan: string; zhi: string; startAge: number; endAge: number } | undefined);
</script>

<template>
  <div class="tv">
    <div class="tv-tiles">
      <div v-for="t in tiles" :key="t.k" class="tv-tile" :class="{ big: t.big }">
        <small>{{ t.label }}</small><strong>{{ t.value }}</strong>
      </div>
      <div v-if="daYun" class="tv-tile big">
        <small>当前大运</small><strong>{{ daYun.gan }}{{ daYun.zhi }}</strong>
        <small>{{ daYun.startAge }}–{{ daYun.endAge }} 岁</small>
      </div>
    </div>
    <div v-for="r in chipRows" :key="r.k" class="tv-row">
      <span class="tv-muted">{{ r.label }}</span>
      <span v-for="(it, i) in r.items" :key="i" class="tv-chip">{{ it }}</span>
    </div>
  </div>
</template>
