<script setup lang="ts">
import { computed, useId } from 'vue';

/*
 * 璇玑 — brand mark: 罗盘刻度环 + 中宫星芒 + 朱砂指北点.
 * Small sizes (≤ 40px) use a simplified 12-tick variant that stays legible;
 * public/favicon.svg is the same simplified artwork.
 */
const props = withDefaults(defineProps<{ size?: number }>(), { size: 36 });

// Per-instance id: a shared id breaks when the first instance is inside a display:none subtree
const gid = `bm-${useId()}`;
const simple = computed(() => props.size <= 40);

function sparkle(R: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i - Math.PI / 2;
    const d = i % 2 ? r : R;
    pts.push(`${(32 + Math.cos(a) * d).toFixed(2)},${(32 + Math.sin(a) * d).toFixed(2)}`);
  }
  return pts.join(' ');
}

interface Tick { x1: number; y1: number; x2: number; y2: number; w: number; o: number }

const ticks = computed<Tick[]>(() => {
  const n = simple.value ? 12 : 24;
  const out: Tick[] = [];
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n;
    const major = simple.value || i % 2 === 0;
    const r1 = simple.value ? 17.5 : major ? 19.5 : 21;
    const r2 = simple.value ? 22 : 23.5;
    out.push({
      x1: 32 + Math.sin(a) * r1, y1: 32 - Math.cos(a) * r1,
      x2: 32 + Math.sin(a) * r2, y2: 32 - Math.cos(a) * r2,
      w: simple.value ? 2.8 : major ? 1.6 : 1,
      o: major ? 1 : 0.6,
    });
  }
  return out;
});

const star = computed(() => (simple.value ? sparkle(13, 3.6) : sparkle(11, 2.9)));
</script>

<template>
  <svg class="brand-mark" :width="size" :height="size" viewBox="0 0 64 64" aria-hidden="true">
    <defs>
      <linearGradient :id="gid" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#1f2436" />
        <stop offset="1" stop-color="#0f1119" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="60" height="60" rx="14" :fill="`url(#${gid})`" />
    <rect x="2.6" y="2.6" width="58.8" height="58.8" rx="13.4" fill="none" stroke="#e6c27a" stroke-opacity=".28" stroke-width="1.2" />
    <g fill="none" stroke="#e6c27a" stroke-linecap="round">
      <circle cx="32" cy="32" :r="simple ? 25 : 25.5" :stroke-width="simple ? 2.6 : 1.6" />
      <line
        v-for="(t, i) in ticks"
        :key="i"
        :x1="t.x1" :y1="t.y1" :x2="t.x2" :y2="t.y2"
        :stroke-width="t.w" :opacity="t.o"
      />
      <circle v-if="!simple" cx="32" cy="32" r="14.5" stroke-width="1" opacity=".5" />
    </g>
    <polygon :points="star" fill="#f3cf7a" />
    <circle cx="32" :cy="simple ? 7 : 6.5" :r="simple ? 3.4 : 2.4" fill="#cf4a2c" />
  </svg>
</template>

<style scoped>
.brand-mark { display: block; flex-shrink: 0; filter: drop-shadow(0 2px 5px rgba(15, 17, 25, 0.28)); }
</style>
