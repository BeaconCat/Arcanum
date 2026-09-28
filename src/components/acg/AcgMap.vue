<script setup lang="ts">
/**
 * Offline world map (Natural Earth land via world-atlas, public domain) with astrocartography lines.
 * Land outlines only — no political borders are drawn.
 * Pan: drag · Zoom: wheel / pinch · Click (without dragging): pick a location.
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import { geoNaturalEarth1, geoPath, geoGraticule10 } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryObject } from 'topojson-specification';
import type { FeatureCollection, Feature, Geometry, MultiLineString } from 'geojson';
import type { AcgAngle, AcgBodyKey, AcgResult } from '../../../shared/types/acg.types';
import { ACG_ANGLE_STROKE, ACG_BODY_META, acgColorVar } from '../../utils/acg';
import land110Url from 'world-atlas/land-110m.json?url';
import land50Url from 'world-atlas/land-50m.json?url';

export interface AcgMarker {
  key: string;
  lat: number;
  lon: number;
  label?: string;
  kind: 'home' | 'pick' | 'rank';
  index?: number;
}

const props = defineProps<{
  result: AcgResult | null;
  bodies: AcgBodyKey[];
  angles: AcgAngle[];
  markers: AcgMarker[];
  view: 'world' | 'china';
  /** Highlight a single line, e.g. while hovering its explanation */
  highlight?: { body: AcgBodyKey; angle: AcgAngle } | null;
}>();

const emit = defineEmits<{ pick: [lat: number, lon: number]; 'update:view': ['world' | 'china'] }>();

const W = 1000;
const H = 520;
const projection = geoNaturalEarth1().fitExtent([[6, 6], [W - 6, H - 6]], { type: 'Sphere' });
const path = geoPath(projection);

// ── Base map (lazy, low-res first; high-res once zoomed in) ──
const landPath = ref('');
const hiRes = ref(false);
let hiResLoading = false;

// Served as static assets (fetched on demand) rather than bundled JS modules
const LAND_URLS = { '110m': land110Url, '50m': land50Url };

async function loadLand(res: '110m' | '50m') {
  const resp = await fetch(LAND_URLS[res]);
  const topo = (await resp.json()) as Topology<{ land: GeometryObject }>;
  const land = feature(topo, topo.objects.land) as unknown as FeatureCollection | Feature;
  landPath.value = path(land as never) || '';
}

const spherePath = path({ type: 'Sphere' }) || '';
const graticulePath = path(geoGraticule10()) || '';

// ── Zoom / pan transform ──
const t = reactive({ k: 1, x: 0, y: 0 });
const MIN_K = 1;
const MAX_K = 24;

function clampTransform() {
  t.k = Math.min(MAX_K, Math.max(MIN_K, t.k));
  // Keep the map at least partly on screen
  const minX = W - W * t.k - W * 0.25;
  const minY = H - H * t.k - H * 0.25;
  t.x = Math.min(W * 0.25, Math.max(minX, t.x));
  t.y = Math.min(H * 0.25, Math.max(minY, t.y));
}

function zoomAt(px: number, py: number, factor: number) {
  const k = Math.min(MAX_K, Math.max(MIN_K, t.k * factor));
  const f = k / t.k;
  t.x = px - (px - t.x) * f;
  t.y = py - (py - t.y) * f;
  t.k = k;
  clampTransform();
}

/** Fit a lon/lat bounding box. */
function fitBounds(lon0: number, lat0: number, lon1: number, lat1: number, pad = 0.9) {
  const a = projection([lon0, lat1])!;
  const b = projection([lon1, lat0])!;
  const k = Math.min(MAX_K, pad * Math.min(W / Math.abs(b[0] - a[0]), H / Math.abs(b[1] - a[1])));
  const cx = (a[0] + b[0]) / 2;
  const cy = (a[1] + b[1]) / 2;
  t.k = k;
  t.x = W / 2 - cx * k;
  t.y = H / 2 - cy * k;
  clampTransform();
}

function applyView(v: 'world' | 'china') {
  if (v === 'china') fitBounds(73, 17, 136, 54);
  else { t.k = 1; t.x = 0; t.y = 0; }
}

function flyTo(lat: number, lon: number, k = Math.max(t.k, 4)) {
  const p = projection([lon, lat]);
  if (!p) return;
  t.k = Math.min(MAX_K, k);
  t.x = W / 2 - p[0] * t.k;
  t.y = H / 2 - p[1] * t.k;
  clampTransform();
}

function reset() {
  applyView(props.view);
}

defineExpose({ flyTo, reset, zoomIn: () => zoomAt(W / 2, H / 2, 1.6), zoomOut: () => zoomAt(W / 2, H / 2, 1 / 1.6) });

watch(() => props.view, (v) => applyView(v));

watch(() => t.k, (k) => {
  if (k > 2.5 && !hiRes.value && !hiResLoading) {
    hiResLoading = true;
    loadLand('50m').then(() => { hiRes.value = true; }).catch(() => { /* keep low-res */ });
  }
});

// ── Pointer interaction ──
const svgRef = ref<SVGSVGElement | null>(null);
const pointers = new Map<number, { x: number; y: number }>();
let dragStart: { x: number; y: number; tx: number; ty: number } | null = null;
let moved = 0;
let pinchStart: { dist: number; k: number; cx: number; cy: number; tx: number; ty: number } | null = null;
const dragging = ref(false);

function toSvg(e: { clientX: number; clientY: number }) {
  const svg = svgRef.value!;
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const r = pt.matrixTransform(svg.getScreenCTM()!.inverse());
  return { x: r.x, y: r.y };
}

function onPointerDown(e: PointerEvent) {
  (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  const p = toSvg(e);
  pointers.set(e.pointerId, p);
  moved = 0;
  if (pointers.size === 1) {
    dragStart = { x: p.x, y: p.y, tx: t.x, ty: t.y };
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchStart = {
      dist: Math.hypot(a.x - b.x, a.y - b.y), k: t.k,
      cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, tx: t.x, ty: t.y,
    };
    dragStart = null;
  }
}

function onPointerMove(e: PointerEvent) {
  if (!pointers.has(e.pointerId)) return;
  const p = toSvg(e);
  pointers.set(e.pointerId, p);
  if (pinchStart && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const k = Math.min(MAX_K, Math.max(MIN_K, pinchStart.k * dist / pinchStart.dist));
    const f = k / pinchStart.k;
    t.k = k;
    t.x = pinchStart.cx - (pinchStart.cx - pinchStart.tx) * f;
    t.y = pinchStart.cy - (pinchStart.cy - pinchStart.ty) * f;
    clampTransform();
    moved = 99;
    return;
  }
  if (dragStart) {
    const dx = p.x - dragStart.x;
    const dy = p.y - dragStart.y;
    moved = Math.max(moved, Math.hypot(dx, dy));
    if (moved > 4) dragging.value = true;
    t.x = dragStart.tx + dx;
    t.y = dragStart.ty + dy;
    clampTransform();
  }
}

function onPointerUp(e: PointerEvent) {
  const wasSingle = pointers.size === 1 && !pinchStart;
  const p = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchStart = null;
  if (pointers.size === 0) {
    dragging.value = false;
    dragStart = null;
    if (wasSingle && p && moved <= 4) {
      const ll = projection.invert!([(p.x - t.x) / t.k, (p.y - t.y) / t.k]);
      if (ll && Number.isFinite(ll[0]) && Number.isFinite(ll[1]) && Math.abs(ll[1]) <= 85) emit('pick', ll[1], ll[0]);
    }
  }
}

function onWheel(e: WheelEvent) {
  e.preventDefault();
  const p = toSvg(e);
  zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
}

// ── Lines ──
interface LinePath { id: string; body: AcgBodyKey; angle: AcgAngle; d: string; title: string }

const linePaths = shallowRef<LinePath[]>([]);
watch(() => props.result, (r) => {
  if (!r) { linePaths.value = []; return; }
  linePaths.value = r.lines.map((l) => {
    const geom: MultiLineString = { type: 'MultiLineString', coordinates: l.segments };
    return {
      id: `${l.body}.${l.angle}`,
      body: l.body,
      angle: l.angle,
      d: path(geom as Geometry) || '',
      title: `${l.bodyName}${l.angleName}`,
    };
  });
}, { immediate: true });

const visibleLines = computed(() => {
  const bs = new Set(props.bodies);
  const as = new Set(props.angles);
  return linePaths.value.filter((l) => bs.has(l.body) && as.has(l.angle));
});

// Planet symbols along lines: MC/IC near the top, AC/DC at the equator
const lineLabels = computed(() => {
  if (!props.result) return [];
  const bs = new Set(props.bodies);
  const as = new Set(props.angles);
  const sym = Object.fromEntries(ACG_BODY_META.map((b) => [b.key, b.symbol]));
  const out: { id: string; body: AcgBodyKey; x: number; y: number; text: string }[] = [];
  for (const l of props.result.lines) {
    if (!bs.has(l.body) || !as.has(l.angle)) continue;
    let pt: [number, number] | undefined;
    if (l.longitude !== undefined) pt = [l.longitude, l.angle === 'MC' ? 58 : -52];
    else {
      const flat = l.segments.flat();
      pt = flat.find((p) => Math.abs(p[1] - (l.angle === 'AC' ? 8 : -8)) < 0.26) || flat[Math.floor(flat.length / 2)];
    }
    const xy = pt && projection(pt);
    if (xy) out.push({ id: `${l.body}.${l.angle}`, body: l.body, x: xy[0], y: xy[1], text: `${sym[l.body]}${l.angle}` });
  }
  return out;
});

const markerPts = computed(() => props.markers
  .map((m) => ({ ...m, xy: projection([m.lon, m.lat]) }))
  .filter((m) => m.xy));

const isHighlighted = (l: LinePath) => props.highlight && props.highlight.body === l.body && props.highlight.angle === l.angle;

onMounted(() => {
  loadLand('110m').catch(() => { /* map stays blank */ });
  applyView(props.view);
  svgRef.value?.addEventListener('wheel', onWheel, { passive: false });
});
onBeforeUnmount(() => svgRef.value?.removeEventListener('wheel', onWheel));
</script>

<template>
  <div class="acg-map" :class="{ dragging }">
    <svg
      ref="svgRef"
      :viewBox="`0 0 ${W} ${H}`"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="地理占星地图"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <g :transform="`translate(${t.x} ${t.y}) scale(${t.k})`">
        <path class="ocean" :d="spherePath" />
        <path class="graticule" :d="graticulePath" vector-effect="non-scaling-stroke" />
        <path class="land" :d="landPath" vector-effect="non-scaling-stroke" />
        <path class="sphere-edge" :d="spherePath" vector-effect="non-scaling-stroke" />

        <g class="lines">
          <path
            v-for="l in visibleLines"
            :key="l.id"
            :d="l.d"
            :stroke="acgColorVar(l.body)"
            :stroke-width="ACG_ANGLE_STROKE[l.angle].width * (isHighlighted(l) ? 2 : 1)"
            :stroke-dasharray="ACG_ANGLE_STROKE[l.angle].dash"
            :class="{ dim: highlight && !isHighlighted(l) }"
            fill="none"
            vector-effect="non-scaling-stroke"
          >
            <title>{{ l.title }}</title>
          </path>
        </g>

        <g class="labels">
          <g v-for="lb in lineLabels" :key="lb.id" :transform="`translate(${lb.x} ${lb.y}) scale(${1 / t.k})`">
            <text class="line-label" :fill="acgColorVar(lb.body)" text-anchor="middle" dy="-4">{{ lb.text }}</text>
          </g>
        </g>

        <g class="markers">
          <g v-for="m in markerPts" :key="m.key" :transform="`translate(${m.xy![0]} ${m.xy![1]}) scale(${1 / t.k})`" :class="`mk mk-${m.kind}`">
            <template v-if="m.kind === 'home'">
              <circle r="9" class="mk-halo" />
              <path d="M-5 1 L0 -4.5 L5 1 V5.5 H-5 Z" class="mk-home" />
            </template>
            <template v-else-if="m.kind === 'pick'">
              <circle r="11" class="mk-halo" />
              <circle r="5" class="mk-dot" />
            </template>
            <template v-else>
              <circle r="9" class="mk-rank" />
              <text class="mk-num" text-anchor="middle" dy="3.6">{{ m.index }}</text>
            </template>
            <text v-if="m.label" class="mk-label" x="12" dy="4">{{ m.label }}</text>
          </g>
        </g>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.acg-map {
  position: relative;
  width: 100%;
  aspect-ratio: 1000 / 520;
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: var(--acg-bg);
  touch-action: none;
  user-select: none;
  cursor: crosshair;
}
.acg-map.dragging { cursor: grabbing; }
svg { display: block; width: 100%; height: 100%; }
.ocean { fill: var(--acg-ocean); }
.graticule { fill: none; stroke: var(--acg-grid); stroke-width: 0.6; }
.land { fill: var(--acg-land); stroke: var(--acg-coast); stroke-width: 0.6; }
.sphere-edge { fill: none; stroke: var(--acg-coast); stroke-width: 1; }
.lines path { stroke-linecap: round; transition: opacity 150ms ease; }
.lines path.dim { opacity: 0.18; }
.line-label {
  font-size: 11px;
  font-weight: 700;
  paint-order: stroke;
  stroke: var(--acg-ocean);
  stroke-width: 3px;
  pointer-events: none;
}
.mk { pointer-events: none; }
.mk-halo { fill: color-mix(in srgb, var(--color-accent) 22%, transparent); }
.mk-home { fill: var(--color-accent); stroke: var(--color-bg-secondary); stroke-width: 1.2; }
.mk-dot { fill: var(--color-seal); stroke: var(--color-bg-secondary); stroke-width: 2; }
.mk-rank { fill: var(--color-accent); stroke: var(--color-bg-secondary); stroke-width: 1.5; }
.mk-num { fill: var(--color-accent-contrast); font-size: 9.5px; font-weight: 700; }
.mk-label {
  font-size: 11.5px;
  font-weight: 600;
  fill: var(--color-text-primary);
  paint-order: stroke;
  stroke: var(--acg-ocean);
  stroke-width: 3px;
}
</style>
