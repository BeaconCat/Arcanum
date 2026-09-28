<script setup lang="ts">
// Astrocartography result in chat: the offline map with lines + focus/ranked markers, then lists.
import { computed, ref } from 'vue';
import AcgMap, { type AcgMarker } from '../../acg/AcgMap.vue';
import type { AcgAngle, AcgBodyKey, AcgNearHit, AcgRankedPlace, AcgResult, AcgThemeDef } from '../../../../shared/types/acg.types';
import { formatKm } from '../../../utils/acg';

const props = defineProps<{
  result: AcgResult;
  focus?: { lat: number; lon: number; label?: string; near: AcgNearHit[] };
  theme?: AcgThemeDef;
  ranked?: AcgRankedPlace[];
}>();

const ANGLES: AcgAngle[] = ['MC', 'IC', 'AC', 'DC'];
const bodies = computed<AcgBodyKey[]>(() => [...new Set(props.result.lines.map((l) => l.body))]);

const inChina = (lat: number, lon: number) => lat > 17 && lat < 54 && lon > 73 && lon < 136;
const view = ref<'world' | 'china'>(
  props.focus ? (inChina(props.focus.lat, props.focus.lon) ? 'china' : 'world')
    : props.ranked?.length && props.ranked.filter((r) => inChina(r.lat, r.lon)).length > props.ranked.length / 2 ? 'china' : 'world',
);

const markers = computed<AcgMarker[]>(() => {
  const m: AcgMarker[] = [{ key: 'home', lat: props.result.input.lat, lon: props.result.input.lon, kind: 'home', label: '出生地' }];
  if (props.focus) m.push({ key: 'pick', lat: props.focus.lat, lon: props.focus.lon, kind: 'pick', label: props.focus.label });
  (props.ranked || []).slice(0, 10).forEach((r, i) => m.push({ key: `rank-${i}`, lat: r.lat, lon: r.lon, kind: 'rank', index: i + 1, label: r.name }));
  return m;
});

const highlight = ref<{ body: AcgBodyKey; angle: AcgAngle } | null>(null);
</script>

<template>
  <div class="tv acg-tv">
    <div class="acg-map"><AcgMap v-model:view="view" :result="result" :bodies="bodies" :angles="ANGLES" :markers="markers" :highlight="highlight" /></div>

    <template v-if="focus">
      <div class="tv-section-label">{{ focus.label || '所选地点' }} · 附近的行星线</div>
      <div class="tv-list">
        <div
          v-for="h in focus.near" :key="`${h.body}-${h.angle}`" class="tv-li acg-hit"
          @mouseenter="highlight = { body: h.body, angle: h.angle }" @mouseleave="highlight = null"
        >
          <span class="acg-sw" :style="{ background: `var(--acg-${h.body})` }" />
          <span class="tv-li-main">
            <b>{{ h.text?.title || `${h.bodyName}${h.angleName}` }}</b>
            <span v-if="h.text?.subtitle" class="tv-muted"> · {{ h.text.subtitle }}</span>
            <p v-if="h.text?.text">{{ h.text.text }}</p>
          </span>
          <span class="acg-dist">
            <b class="tabular">{{ formatKm(h.distanceKm) }}</b>
            <span class="tv-bar"><i :style="{ width: `${Math.round(h.strength * 100)}%`, background: `var(--acg-${h.body})` }" /></span>
          </span>
        </div>
        <div v-if="!focus.near.length" class="tv-muted">附近没有行星线经过，这里的影响较为平淡。</div>
      </div>
    </template>

    <template v-if="ranked?.length">
      <div class="tv-section-label">{{ theme?.name || '主题' }}推荐城市</div>
      <div class="tv-list">
        <div v-for="(r, i) in ranked.slice(0, 10)" :key="`${r.name}-${i}`" class="tv-li">
          <span class="acg-rank">{{ i + 1 }}</span>
          <span class="tv-li-main">
            <b>{{ r.name }}</b><span class="tv-muted"> · {{ r.region || r.country }}</span>
            <p>{{ r.hits.slice(0, 3).map((h) => `${h.bodyName}${h.angleName} ${formatKm(h.distanceKm)}`).join('、') }}</p>
          </span>
          <span class="tv-muted tabular">{{ r.score.toFixed(1) }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Same planet palette as the 地理占星 page */
.acg-tv {
  --acg-sun: #d08a0e; --acg-moon: #6f7fa8; --acg-mercury: #2a9d8f; --acg-venus: #d4508a; --acg-mars: #d64533;
  --acg-jupiter: #7b52c7; --acg-saturn: #6b5a45; --acg-uranus: #1c8fd6; --acg-neptune: #3a5fcd; --acg-pluto: #8b2f4f;
  --acg-northNode: #4f8a3a;
  --acg-bg: var(--color-bg-tertiary);
  --acg-ocean: color-mix(in srgb, var(--color-info) 7%, var(--color-bg-secondary));
  --acg-land: color-mix(in srgb, var(--color-accent) 9%, var(--color-bg-tertiary));
  --acg-coast: color-mix(in srgb, var(--color-text-muted) 45%, transparent);
  --acg-grid: color-mix(in srgb, var(--color-border-strong) 60%, transparent);
}
:global([data-theme='dark']) .acg-tv {
  --acg-sun: #f2b84b; --acg-moon: #b7c2e0; --acg-mercury: #5fd0c2; --acg-venus: #f28dbb; --acg-mars: #ff7a66;
  --acg-jupiter: #b59af0; --acg-saturn: #c9b394; --acg-uranus: #62c0ff; --acg-neptune: #8aa3ff; --acg-pluto: #e07aa0;
  --acg-northNode: #8fcf73;
  --acg-ocean: #0f1522; --acg-land: #222838; --acg-coast: rgba(210, 168, 106, 0.35); --acg-grid: rgba(255, 255, 255, 0.06);
}
.acg-map { border-radius: var(--radius-md); overflow: hidden; }
.acg-sw { width: 4px; align-self: stretch; border-radius: 2px; }
.acg-hit { grid-template-columns: 4px 1fr auto; cursor: default; }
.acg-dist { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; min-width: 64px; font-size: 0.78rem; }
.acg-dist .tv-bar { width: 64px; }
.acg-rank {
  display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%;
  background: var(--color-accent-soft); color: var(--color-accent); font-size: 0.72rem; font-weight: 700;
}
</style>
