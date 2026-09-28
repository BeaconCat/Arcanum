<script setup lang="ts">
import { useId } from 'vue';

// 牌背：夜墨底 + 璇玑刻度环（与品牌标识呼应），上下对称，逆位时看起来一致。
const gid = `tb-${useId()}`;
const ticks = Array.from({ length: 24 }, (_, i) => {
  const a = (Math.PI * 2 * i) / 24;
  const major = i % 2 === 0;
  const r1 = major ? 17 : 18.5;
  const r2 = 21;
  return { x1: 60 + Math.sin(a) * r1, y1: 100 - Math.cos(a) * r1, x2: 60 + Math.sin(a) * r2, y2: 100 - Math.cos(a) * r2, w: major ? 1.3 : 0.8 };
});
function star(cx: number, cy: number, R: number, r: number, n = 4): string {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = ((-90 + (180 / n) * i) * Math.PI) / 180;
    const d = i % 2 ? r : R;
    pts.push(`${(cx + Math.cos(a) * d).toFixed(2)},${(cy + Math.sin(a) * d).toFixed(2)}`);
  }
  return pts.join(' ');
}
const dots = [[30, 40], [90, 40], [60, 30], [22, 70], [98, 70], [22, 130], [98, 130], [30, 160], [90, 160], [60, 170]];
</script>

<template>
  <svg class="tb" viewBox="0 0 120 200" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient :id="`${gid}-bg`" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#252b3f" />
        <stop offset="1" stop-color="#0f1119" />
      </linearGradient>
      <pattern :id="`${gid}-grid`" width="12" height="12" patternUnits="userSpaceOnUse">
        <path d="M6 0 L12 6 L6 12 L0 6 Z" fill="none" stroke="#e6c27a" stroke-opacity="0.08" stroke-width="0.6" />
      </pattern>
    </defs>
    <rect x="1" y="1" width="118" height="198" rx="9" :fill="`url(#${gid}-bg)`" stroke="#e6c27a" stroke-opacity="0.5" />
    <rect x="6" y="6" width="108" height="188" rx="6" :fill="`url(#${gid}-grid)`" stroke="#e6c27a" stroke-opacity="0.8" stroke-width="1" />
    <rect x="10" y="10" width="100" height="180" rx="4" fill="none" stroke="#e6c27a" stroke-opacity="0.35" stroke-width="0.5" />

    <polygon v-for="(d, i) in dots" :key="i" :points="star(d[0], d[1], 2.4, 0.8)" fill="#f3cf7a" fill-opacity="0.7" />

    <g fill="none" stroke="#e6c27a" stroke-linecap="round">
      <circle cx="60" cy="100" r="27" stroke-width="0.6" stroke-opacity="0.5" />
      <circle cx="60" cy="100" r="22.5" stroke-width="1.4" />
      <line v-for="(t, i) in ticks" :key="i" :x1="t.x1" :y1="t.y1" :x2="t.x2" :y2="t.y2" :stroke-width="t.w" />
      <circle cx="60" cy="100" r="12" stroke-width="0.7" stroke-opacity="0.55" />
    </g>
    <polygon :points="star(60, 100, 10, 2.7)" fill="#f3cf7a" />
    <circle cx="60" cy="74.5" r="2.2" fill="#cf4a2c" />
    <circle cx="60" cy="125.5" r="2.2" fill="#cf4a2c" />
  </svg>
</template>

<style scoped>
.tb { display: block; width: 100%; height: 100%; }
</style>
