<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { X } from 'lucide-vue-next';
import type { AstroAspect, AstroChart, AstroPlanet, AstroPointKey } from '../../../shared/types/astro.types';
import {
  SIGN_GLYPHS, SIGN_NAMES, SIGN_ELEMENT, DIGNITY_LABEL, aspectMeta, dignityTone, fmtDeg, ASPECTS, isMinorBody, CATEGORY_LABEL,
} from '../../utils/astro';
import AstroGlyph from './AstroGlyph.vue';

/*
 * SVG chart wheel.
 *  - Single chart: `chart` only (natal / composite).
 *  - Bi-wheel: `chart` = inner (natal / person A), `outer` = transits / progressions / return / person B.
 *    Outer planets sit in a band between the zodiac and the inner planets, aligned to the inner houses;
 *    `crossAspects` (inner a × outer b) are drawn across the centre.
 */
const props = withDefaults(defineProps<{
  chart: AstroChart;
  outer?: AstroChart | null;
  crossAspects?: AstroAspect[];
  innerLabel?: string;
  outerLabel?: string;
  showDignity?: boolean;
  /** Point keys to spotlight (e.g. from the interpretation panel); others are dimmed while nothing is hovered */
  highlight?: string[];
}>(), { outer: null, crossAspects: () => [], innerLabel: '本命', outerLabel: '外圈', showDignity: true, highlight: () => [] });

const hl = computed(() => new Set(props.highlight));

type Layer = 'inner' | 'outer';
type Active =
  | { kind: 'planet'; layer: Layer; key: AstroPointKey }
  | { kind: 'aspect'; index: number };

const hover = ref<Active | null>(null);
const pinned = ref<Active | null>(null);
const active = computed(() => pinned.value || hover.value);

const isBi = computed(() => !!props.outer);
/** In a bi-wheel the user can flip between cross aspects and the inner chart's own aspects. */
const aspectMode = ref<'cross' | 'inner'>('cross');
watch(isBi, () => { aspectMode.value = 'cross'; pinned.value = null; });
watch(() => props.chart, () => { pinned.value = null; hover.value = null; });

const showingCross = computed(() => isBi.value && aspectMode.value === 'cross');
const aspectList = computed<AstroAspect[]>(() => (showingCross.value ? props.crossAspects : props.chart.aspects));

// ── Geometry (viewBox centred on 0,0) ──
const G = computed(() => isBi.value
  ? { out: 300, sign: 262, band: 214, outerP: 240, innerP: 186, house: 143, asp: 128 }
  // Aspect circle kept just inside the planets' degree labels (innerP − 21) so aspect lines get room
  : { out: 290, sign: 248, band: 0, outerP: 0, innerP: 206, house: 165, asp: 150 });
const VB = computed(() => (isBi.value ? 336 : 322));

const asc = computed(() => props.chart.angles.asc.longitude);

/** Screen point for an ecliptic longitude: ASC on the left, longitude increasing counter-clockwise. */
function pt(lon: number, r: number) {
  const a = ((lon - asc.value) * Math.PI) / 180;
  return { x: -r * Math.cos(a), y: r * Math.sin(a) };
}
const f = (n: number) => n.toFixed(2);

function arcPath(l1: number, l2: number, r1: number, r2: number) {
  const a = pt(l1, r2); const b = pt(l2, r2); const c = pt(l2, r1); const d = pt(l1, r1);
  return `M${f(a.x)} ${f(a.y)} A${r2} ${r2} 0 0 0 ${f(b.x)} ${f(b.y)} L${f(c.x)} ${f(c.y)} A${r1} ${r1} 0 0 1 ${f(d.x)} ${f(d.y)} Z`;
}

const signSegments = computed(() => SIGN_GLYPHS.map((g, i) => {
  const { out, sign } = G.value;
  return {
    i, glyph: g, name: SIGN_NAMES[i], el: SIGN_ELEMENT[i],
    path: arcPath(i * 30, i * 30 + 30, sign, out),
    mid: pt(i * 30 + 15, (out + sign) / 2 + 7),
    nameP: pt(i * 30 + 15, (out + sign) / 2 - 11),
  };
}));

const degreeTicks = computed(() => {
  const { out, sign } = G.value;
  const res: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = [];
  for (let d = 0; d < 360; d += 5) {
    const major = d % 30 === 0;
    const a = pt(d, sign); const b = pt(d, major ? out : sign + (d % 10 === 0 ? 8 : 5));
    res.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, major });
  }
  return res;
});

const houseLines = computed(() => {
  const c = props.chart; const { asp, sign, house } = G.value;
  return c.houses.map((h, i) => {
    const next = c.houses[(i + 1) % 12].longitude;
    const span = ((next - h.longitude) % 360 + 360) % 360;
    const a = pt(h.longitude, asp); const b = pt(h.longitude, isBi.value ? G.value.band : sign);
    const n = pt(h.longitude + span / 2, house);
    return { house: h.house, x1: a.x, y1: a.y, x2: b.x, y2: b.y, nx: n.x, ny: n.y, angular: [1, 4, 7, 10].includes(h.house) };
  });
});

/** Faint continuation of inner cusps through the outer band so outer planets read against inner houses. */
const bandCusps = computed(() => {
  if (!isBi.value) return [];
  const { band, sign } = G.value;
  return props.chart.houses.map((h) => {
    const a = pt(h.longitude, band); const b = pt(h.longitude, sign);
    return { house: h.house, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  });
});

const axes = computed(() => {
  const c = props.chart; const { asp, out } = G.value;
  return (['asc', 'mc', 'dsc', 'ic'] as const).map((k) => {
    const lon = c.angles[k].longitude;
    const a = pt(lon, asp); const b = pt(lon, out + 8); const l = pt(lon, out + 22);
    return { key: k, label: k.toUpperCase(), x1: a.x, y1: a.y, x2: b.x, y2: b.y, lx: l.x, ly: l.y };
  });
});

/** Outer chart's own ASC / MC as short ticks inside the outer band. */
const outerAxes = computed(() => {
  const o = props.outer; if (!o) return [];
  const { band, sign } = G.value;
  return (['asc', 'mc'] as const).map((k) => {
    const lon = o.angles[k].longitude;
    const a = pt(lon, band); const b = pt(lon, sign); const l = pt(lon, sign - 11);
    return { key: k, label: k === 'asc' ? 'AC' : 'MC', x1: a.x, y1: a.y, x2: b.x, y2: b.y, lx: l.x, ly: l.y };
  });
});

interface Mark {
  layer: Layer; key: AstroPointKey; planet: AstroPlanet;
  tickA: { x: number; y: number }; tickB: { x: number; y: number };
  g: { x: number; y: number }; lead: { x: number; y: number }; deg: { x: number; y: number };
  dig: { x: number; y: number }; luminary: boolean;
  /** Asteroid / computed point — drawn smaller and fainter */
  minor: boolean;
}

/** Spread glyphs so they don't overlap (min gap in degrees on the display ring). */
function layout(planets: AstroPlanet[], layer: Layer): Mark[] {
  const { sign, band, innerP, outerP } = G.value;
  const ringR = layer === 'outer' ? outerP : innerP;
  const tickFrom = layer === 'outer' ? sign : (isBi.value ? band : sign);
  const list = planets.filter((p) => p.key !== 'southNode').map((p) => ({ p, disp: p.longitude }));
  list.sort((a, b) => a.disp - b.disp);
  // Minor bodies make the ring busier: allow a slightly tighter spacing when many are shown
  const crowded = list.length > 14;
  const MIN = (layer === 'outer' ? 7 : isBi.value ? 9 : 8) - (crowded ? 1 : 0);
  for (let iter = 0; iter < 80; iter++) {
    let moved = false;
    for (let i = 0; i < list.length; i++) {
      const a = list[i]; const b = list[(i + 1) % list.length];
      let gap = b.disp - a.disp; if (i === list.length - 1) gap += 360;
      if (gap < MIN) { const push = (MIN - gap) / 2; a.disp -= push; b.disp += push; moved = true; }
    }
    if (!moved) break;
  }
  return list.map(({ p, disp }) => ({
    layer, key: p.key, planet: p,
    tickA: pt(p.longitude, tickFrom), tickB: pt(p.longitude, tickFrom - 8),
    g: pt(disp, ringR), lead: pt(disp, ringR + 14),
    deg: pt(disp, ringR - 21),
    dig: pt(disp + 5.2, ringR + 9),
    luminary: p.key === 'sun' || p.key === 'moon',
    minor: isMinorBody(p),
  }));
}

const innerMarks = computed(() => layout(props.chart.planets, 'inner'));
const outerMarks = computed(() => (props.outer ? layout(props.outer.planets, 'outer') : []));

function lonOf(chart: AstroChart | null | undefined, key: AstroPointKey): number | undefined {
  if (!chart) return undefined;
  if (key === 'asc') return chart.angles.asc.longitude;
  if (key === 'mc') return chart.angles.mc.longitude;
  return chart.planets.find((p) => p.key === key)?.longitude;
}

type AspectLine = AstroAspect & { index: number; x1: number; y1: number; x2: number; y2: number; opacity: number; color: string; dash?: string; width: number };

const aspectLines = computed<AspectLine[]>(() => {
  const res: AspectLine[] = [];
  const r = G.value.asp;
  aspectList.value.forEach((x, index) => {
    // Natal conjunctions share one point on the circle; cross conjunctions still get a short chord
    if (x.type === 'conjunction' && !showingCross.value) return;
    const la = lonOf(props.chart, x.a);
    const lb = lonOf(showingCross.value ? props.outer : props.chart, x.b);
    if (la === undefined || lb === undefined) return;
    const a = pt(la, r); const b = pt(lb, r);
    const m = aspectMeta(x.type);
    res.push({
      ...x, index, x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      opacity: Math.max(0.28, 1 - x.orb / 9), color: m.color, dash: m.dash, width: m.width,
    });
  });
  return res;
});

// ── Highlight logic ──
function aspectTouches(x: AstroAspect, layer: Layer, key: AstroPointKey) {
  if (showingCross.value) return layer === 'inner' ? x.a === key : x.b === key;
  return layer === 'inner' && (x.a === key || x.b === key);
}

function planetDim(layer: Layer, key: AstroPointKey) {
  const a = active.value;
  if (!a) return hl.value.size > 0 && !hl.value.has(key);
  if (a.kind === 'planet') {
    if (a.layer === layer && a.key === key) return false;
    // keep aspect partners lit
    return !aspectList.value.some((x) => aspectTouches(x, a.layer, a.key) && aspectTouches(x, layer, key));
  }
  const x = aspectList.value[a.index]; if (!x) return false;
  return !aspectTouches(x, layer, key);
}

function aspectDim(line: AspectLine) {
  const a = active.value;
  if (!a) {
    if (!hl.value.size) return false;
    // One spotlighted point: show all its aspects; several: only aspects among them
    return hl.value.size > 1 ? !(hl.value.has(line.a) && hl.value.has(line.b)) : !(hl.value.has(line.a) || hl.value.has(line.b));
  }
  if (a.kind === 'aspect') return a.index !== line.index;
  return !aspectTouches(line, a.layer, a.key);
}

function onPlanetClick(layer: Layer, key: AstroPointKey) {
  const p = pinned.value;
  pinned.value = p && p.kind === 'planet' && p.layer === layer && p.key === key ? null : { kind: 'planet', layer, key };
}
function onAspectClick(index: number) {
  const p = pinned.value;
  pinned.value = p && p.kind === 'aspect' && p.index === index ? null : { kind: 'aspect', index };
}

// ── Info popover ──
const nameIn = (chart: AstroChart | null | undefined, key: AstroPointKey) =>
  chart?.planets.find((p) => p.key === key)?.name || (key === 'asc' ? '上升' : key === 'mc' ? '天顶' : String(key));

const popover = computed(() => {
  const a = active.value; if (!a) return null;
  const vb = VB.value;
  const toPct = (p: { x: number; y: number }) => ({ left: ((p.x + vb) / (2 * vb)) * 100, top: ((p.y + vb) / (2 * vb)) * 100 });
  if (a.kind === 'planet') {
    const mark = (a.layer === 'outer' ? outerMarks.value : innerMarks.value).find((m) => m.key === a.key);
    const chart = a.layer === 'outer' ? props.outer : props.chart;
    if (!mark || !chart) return null;
    const p = mark.planet;
    const related = aspectList.value.filter((x) => aspectTouches(x, a.layer, a.key)).map((x) => {
      const other = showingCross.value
        ? (a.layer === 'inner' ? `${props.outerLabel}·${nameIn(props.outer, x.b)}` : `${props.innerLabel}·${nameIn(props.chart, x.a)}`)
        : nameIn(props.chart, x.a === a.key ? x.b : x.a);
      return { text: `${aspectMeta(x.type).name} ${other}`, orb: x.orb, tone: aspectMeta(x.type).tone, applying: x.applying };
    });
    // In a bi-wheel, report which inner house an outer planet falls in
    let house = p.house;
    if (a.layer === 'outer' && isBi.value) house = houseOf(props.chart, p.longitude);
    return {
      pos: toPct(mark.g),
      title: `${isBi.value ? (a.layer === 'outer' ? props.outerLabel : props.innerLabel) + ' · ' : ''}${p.name}${mark.minor ? `（${CATEGORY_LABEL[p.category] ?? '小天体'}）` : ''}`,
      lines: [
        `${p.signSymbol} ${p.sign} ${fmtDeg(p)}`,
        `${a.layer === 'outer' && isBi.value ? `落${props.innerLabel}` : '第'}${house}宫${p.retrograde ? ' · 逆行' : ''}${p.dignityName ? ` · ${p.dignityName}` : ''}`,
      ],
      related,
    };
  }
  const x = aspectList.value[a.index]; if (!x) return null;
  const line = aspectLines.value.find((l) => l.index === a.index);
  const mid = line ? { x: (line.x1 + line.x2) / 2, y: (line.y1 + line.y2) / 2 } : { x: 0, y: 0 };
  const m = aspectMeta(x.type);
  const an = showingCross.value ? `${props.innerLabel}·${nameIn(props.chart, x.a)}` : nameIn(props.chart, x.a);
  const bn = showingCross.value ? `${props.outerLabel}·${nameIn(props.outer, x.b)}` : nameIn(props.chart, x.b);
  return {
    pos: toPct(mid),
    title: `${an} ${m.name} ${bn}`,
    lines: [`${m.angle}° · ${m.cls === 'major' ? '主相位' : '次相位'}`, `容许度 ${x.orb.toFixed(1)}° · ${x.applying ? '入相' : '出相'}`],
    related: [] as { text: string; orb: number; tone: string; applying: boolean }[],
  };
});

/** House of a longitude within a chart's cusps. */
function houseOf(chart: AstroChart, lon: number): number {
  const cusps = chart.houses;
  for (let i = 0; i < 12; i++) {
    const a = cusps[i].longitude; const b = cusps[(i + 1) % 12].longitude;
    const span = ((b - a) % 360 + 360) % 360;
    const d = ((lon - a) % 360 + 360) % 360;
    if (d < span) return cusps[i].house;
  }
  return 1;
}

const legendTypes = computed(() => {
  const used = new Set(aspectList.value.map((x) => x.type));
  return ASPECTS.filter((a) => used.has(a.type));
});
</script>

<template>
  <div class="wheel-box">
    <div v-if="isBi" class="wb-toolbar">
      <span class="wb-layer inner"><i />{{ innerLabel }}（内圈）</span>
      <span class="wb-layer outer"><i />{{ outerLabel }}（外圈）</span>
      <div class="tabs wb-mode">
        <button class="tab" :class="{ active: aspectMode === 'cross' }" @click="aspectMode = 'cross'; pinned = null">交互相位</button>
        <button class="tab" :class="{ active: aspectMode === 'inner' }" @click="aspectMode = 'inner'; pinned = null">{{ innerLabel }}相位</button>
      </div>
    </div>

    <div class="wheel-stage" @click.self="pinned = null">
      <svg class="wheel" :viewBox="`${-VB} ${-VB} ${VB * 2} ${VB * 2}`" role="img" :aria-label="isBi ? '双盘星盘' : '星盘'">
        <!-- zodiac ring -->
        <g class="signs">
          <path v-for="s in signSegments" :key="s.i" :d="s.path" :class="['sign-seg', s.el]"><title>{{ s.name }}座</title></path>
          <text v-for="s in signSegments" :key="'g' + s.i" :x="s.mid.x" :y="s.mid.y" :class="['sign-glyph', s.el]" text-anchor="middle" dominant-baseline="central">{{ s.glyph }}</text>
          <text v-for="s in signSegments" :key="'n' + s.i" :x="s.nameP.x" :y="s.nameP.y" class="sign-name" text-anchor="middle" dominant-baseline="central">{{ s.name }}</text>
        </g>
        <circle :r="G.out" class="ring" />
        <circle :r="G.sign" class="ring" />
        <line v-for="(t, i) in degreeTicks" :key="'t' + i" :x1="t.x1" :y1="t.y1" :x2="t.x2" :y2="t.y2" :class="t.major ? 'tick major' : 'tick'" />

        <!-- outer band (bi-wheel) -->
        <template v-if="isBi">
          <circle :r="G.sign" class="band-fill" />
          <circle :r="G.band" class="ring band" />
          <line v-for="c in bandCusps" :key="'bc' + c.house" :x1="c.x1" :y1="c.y1" :x2="c.x2" :y2="c.y2" class="band-cusp" />
          <g v-for="a in outerAxes" :key="'oa' + a.key" class="outer-axis">
            <line :x1="a.x1" :y1="a.y1" :x2="a.x2" :y2="a.y2" />
            <text :x="a.lx" :y="a.ly" text-anchor="middle" dominant-baseline="central">{{ a.label }}</text>
          </g>
        </template>

        <!-- houses -->
        <circle :r="G.asp" class="ring inner" />
        <g class="houses">
          <line v-for="h in houseLines" :key="'h' + h.house" :x1="h.x1" :y1="h.y1" :x2="h.x2" :y2="h.y2" :class="h.angular ? 'house-line angular' : 'house-line'" />
          <text v-for="h in houseLines" :key="'hn' + h.house" :x="h.nx" :y="h.ny" class="house-num" text-anchor="middle" dominant-baseline="central">{{ h.house }}</text>
        </g>

        <!-- axes -->
        <g class="axes">
          <g v-for="a in axes" :key="a.key">
            <line :x1="a.x1" :y1="a.y1" :x2="a.x2" :y2="a.y2" class="axis-line" />
            <text :x="a.lx" :y="a.ly" class="axis-label" text-anchor="middle" dominant-baseline="central">{{ a.label }}</text>
          </g>
        </g>

        <!-- aspects -->
        <g class="aspects">
          <g
            v-for="x in aspectLines"
            :key="'a' + x.index"
            class="aspect"
            :style="{ opacity: aspectDim(x) ? 0.07 : x.opacity }"
            @mouseenter="hover = { kind: 'aspect', index: x.index }"
            @mouseleave="hover = null"
            @click.stop="onAspectClick(x.index)"
          >
            <line :x1="x.x1" :y1="x.y1" :x2="x.x2" :y2="x.y2" class="aspect-hit" />
            <line :x1="x.x1" :y1="x.y1" :x2="x.x2" :y2="x.y2" :stroke="x.color" :stroke-width="x.width" :stroke-dasharray="x.dash" stroke-linecap="round" />
          </g>
        </g>

        <!-- planets -->
        <g v-for="set in [innerMarks, outerMarks]" :key="set[0]?.layer || 'none'" class="planets">
          <g
            v-for="m in set"
            :key="m.layer + m.key"
            class="planet"
            :class="[m.layer, { dim: planetDim(m.layer, m.key), luminary: m.luminary, minor: m.minor }]"
            @mouseenter="hover = { kind: 'planet', layer: m.layer, key: m.key }"
            @mouseleave="hover = null"
            @click.stop="onPlanetClick(m.layer, m.key)"
          >
            <line :x1="m.tickA.x" :y1="m.tickA.y" :x2="m.tickB.x" :y2="m.tickB.y" class="p-tick" />
            <line :x1="m.tickB.x" :y1="m.tickB.y" :x2="m.lead.x" :y2="m.lead.y" class="p-lead" />
            <circle :cx="m.g.x" :cy="m.g.y" :r="(m.layer === 'outer' ? 13 : 15) - (m.minor ? 3 : 0)" class="p-bg" />
            <AstroGlyph
              v-if="m.minor"
              class="p-sym"
              :body-key="m.key"
              :symbol="m.planet.symbol"
              :x="m.g.x - (m.layer === 'outer' ? 6 : 7)" :y="m.g.y - (m.layer === 'outer' ? 6 : 7)"
              :width="m.layer === 'outer' ? 12 : 14" :height="m.layer === 'outer' ? 12 : 14"
            />
            <text v-else :x="m.g.x" :y="m.g.y" class="p-glyph" text-anchor="middle" dominant-baseline="central">{{ m.planet.symbol }}</text>
            <text :x="m.deg.x" :y="m.deg.y" class="p-deg" text-anchor="middle" dominant-baseline="central">{{ m.planet.degree }}°{{ m.planet.retrograde ? 'ʀ' : '' }}</text>
            <text
              v-if="showDignity && m.planet.dignityName"
              :x="m.dig.x" :y="m.dig.y"
              class="p-dig" :class="dignityTone(m.planet.dignity)"
              text-anchor="middle" dominant-baseline="central"
            >{{ m.planet.dignityName || DIGNITY_LABEL[m.planet.dignity!] }}</text>
          </g>
        </g>
      </svg>

      <!-- Info popover -->
      <div
        v-if="popover"
        class="wb-pop"
        :class="{ right: popover.pos.left < 50, below: popover.pos.top < 30 }"
        :style="{ left: `${popover.pos.left}%`, top: `${popover.pos.top}%` }"
      >
        <div class="wb-pop-head">
          <b>{{ popover.title }}</b>
          <button v-if="pinned" class="wb-pop-x" aria-label="关闭" @click="pinned = null"><X :size="13" /></button>
        </div>
        <div v-for="(l, i) in popover.lines" :key="i" class="wb-pop-line">{{ l }}</div>
        <ul v-if="popover.related.length" class="wb-pop-list">
          <li v-for="(r, i) in popover.related.slice(0, 8)" :key="i" :class="r.tone">
            <span>{{ r.text }}</span><small>{{ r.orb.toFixed(1) }}° {{ r.applying ? '入' : '出' }}</small>
          </li>
        </ul>
      </div>
    </div>

    <div class="legend">
      <span v-for="a in legendTypes" :key="a.type">
        <svg width="20" height="6" aria-hidden="true"><line x1="1" y1="3" x2="19" y2="3" :stroke="a.color" :stroke-width="Math.max(1.4, a.width)" :stroke-dasharray="a.dash" /></svg>
        {{ a.name }}
      </span>
      <span v-if="!legendTypes.length" class="muted">当前设置下没有相位</span>
      <span class="muted hint">悬停或点击行星、相位线查看详情</span>
    </div>
  </div>
</template>

<style scoped>
.wheel-box {
  --el-fire: var(--wx-fire);
  --el-earth: var(--wx-wood);
  --el-air: var(--wx-earth);
  --el-water: var(--wx-water);
  --outer-ink: var(--color-info);
  display: flex; flex-direction: column; align-items: center; gap: 8px; width: 100%;
}
.wb-toolbar { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 8px 14px; font-size: 0.8rem; color: var(--color-text-secondary); }
.wb-layer { display: inline-flex; align-items: center; gap: 6px; }
.wb-layer i { width: 10px; height: 10px; border-radius: 50%; }
.wb-layer.inner i { background: var(--color-text-primary); }
.wb-layer.outer i { background: var(--outer-ink); }
.wb-mode .tab { height: 28px; padding: 0 10px; font-size: 0.78rem; }

.wheel-stage { position: relative; width: 100%; max-width: 600px; }
.wheel { display: block; width: 100%; height: auto; font-variant-emoji: text; user-select: none; }
.muted { color: var(--color-text-muted); }

.ring { fill: none; stroke: var(--color-border-strong); stroke-width: 1.2; }
.ring.inner { fill: var(--color-bg-secondary); }
.ring.band { stroke-width: 1; fill: var(--color-bg-secondary); }
.band-fill { fill: color-mix(in srgb, var(--outer-ink) 5%, var(--color-bg-secondary)); stroke: var(--color-border-strong); stroke-width: 1.2; }
.band-cusp { stroke: var(--color-border); stroke-width: 0.7; stroke-dasharray: 2 3; }
.outer-axis line { stroke: var(--outer-ink); stroke-width: 1.4; }
.outer-axis text { font-size: 9px; font-weight: 700; fill: var(--outer-ink); }
.tick { stroke: var(--color-border-strong); stroke-width: 0.8; }
.tick.major { stroke: var(--color-text-muted); stroke-width: 1.2; }
.sign-seg { stroke: none; }
.sign-seg.fire { fill: color-mix(in srgb, var(--el-fire) 11%, var(--color-bg-secondary)); }
.sign-seg.earth { fill: color-mix(in srgb, var(--el-earth) 11%, var(--color-bg-secondary)); }
.sign-seg.air { fill: color-mix(in srgb, var(--el-air) 13%, var(--color-bg-secondary)); }
.sign-seg.water { fill: color-mix(in srgb, var(--el-water) 11%, var(--color-bg-secondary)); }
.sign-glyph { font-size: 19px; }
.sign-glyph.fire { fill: var(--el-fire); }
.sign-glyph.earth { fill: var(--el-earth); }
.sign-glyph.air { fill: var(--el-air); }
.sign-glyph.water { fill: var(--el-water); }
.sign-name { font-size: 10px; fill: var(--color-text-muted); font-family: var(--font-serif); }

.house-line { stroke: var(--color-border-strong); stroke-width: 0.9; }
.house-line.angular { stroke: transparent; }
.house-num { font-size: 11px; fill: var(--color-text-muted); font-family: var(--font-sans); }
.axis-line { stroke: var(--color-accent); stroke-width: 1.8; }
.axis-label { font-size: 12px; font-weight: 700; fill: var(--color-accent); letter-spacing: 0.04em; }

.aspect { cursor: pointer; transition: opacity var(--transition-fast); }
.aspect-hit { stroke: transparent; stroke-width: 9; }

.planet { cursor: pointer; transition: opacity var(--transition-fast); }
.planet.dim { opacity: 0.25; }
.p-tick { stroke: var(--color-text-primary); stroke-width: 1.6; }
.planet.outer .p-tick { stroke: var(--outer-ink); }
.p-lead { stroke: var(--color-border-strong); stroke-width: 0.8; }
.p-bg { fill: var(--color-bg-secondary); stroke: var(--color-border); stroke-width: 1; }
.planet.outer .p-bg { fill: color-mix(in srgb, var(--outer-ink) 9%, var(--color-bg-secondary)); stroke: color-mix(in srgb, var(--outer-ink) 45%, var(--color-border)); }
.planet:hover .p-bg { stroke: var(--color-accent); }
.p-glyph { font-size: 18px; fill: var(--color-text-primary); }
.planet.outer .p-glyph { font-size: 16px; fill: var(--outer-ink); }
.planet.luminary.inner .p-glyph { fill: var(--color-accent); font-weight: 700; }
.p-deg { font-size: 10px; fill: var(--color-text-muted); font-family: var(--font-sans); }
.planet.outer .p-deg { font-size: 9px; }
.p-sym { color: var(--color-text-secondary); }
.planet.outer .p-sym { color: var(--outer-ink); }
.planet.minor .p-bg { fill: var(--color-bg-tertiary); stroke-dasharray: 2 2; }
.planet.minor .p-deg { opacity: 0.8; }
.planet.minor .p-tick { stroke-width: 1.1; opacity: 0.7; }
.p-dig { font-size: 9px; font-weight: 700; fill: var(--color-text-muted); font-family: var(--font-serif); }
.p-dig.good { fill: var(--color-ji); }
.p-dig.bad { fill: var(--color-xiong); }

/* popover */
.wb-pop {
  position: absolute; z-index: 5; min-width: 150px; max-width: 230px;
  transform: translate(calc(-100% - 12px), -50%);
  padding: 9px 11px; border: 1px solid var(--color-border); border-radius: var(--radius-md);
  background: var(--color-bg-elevated); box-shadow: var(--shadow-lg);
  font-size: 0.78rem; line-height: 1.5; color: var(--color-text-secondary);
  pointer-events: auto; font-variant-emoji: text;
}
.wb-pop.right { transform: translate(12px, -50%); }
.wb-pop-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 2px; }
.wb-pop-head b { color: var(--color-text-primary); font-family: var(--font-serif); font-size: 0.86rem; }
.wb-pop-x { display: grid; place-items: center; width: 20px; height: 20px; border: none; border-radius: 5px; background: transparent; color: var(--color-text-muted); cursor: pointer; }
.wb-pop-x:hover { background: var(--color-bg-tertiary); }
.wb-pop-list { margin-top: 5px; padding-top: 5px; border-top: 1px dashed var(--color-border); }
.wb-pop-list li { display: flex; justify-content: space-between; gap: 8px; }
.wb-pop-list li small { color: var(--color-text-muted); white-space: nowrap; }
.wb-pop-list li.harmonious span { color: var(--color-ji); }
.wb-pop-list li.challenging span { color: var(--color-xiong); }

.legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 14px; font-size: 0.76rem; color: var(--color-text-secondary); }
.legend span { display: inline-flex; align-items: center; gap: 5px; }
.legend svg { display: inline-block; }

@media (max-width: 640px) {
  .wb-pop { min-width: 140px; max-width: 190px; font-size: 0.74rem; }
  .legend .hint { display: none; }
}
</style>
