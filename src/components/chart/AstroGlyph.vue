<script setup lang="ts">
import { computed } from 'vue';
import { BODY_GLYPH_PATHS } from '../../utils/astro';

/**
 * A body glyph: hand-drawn SVG for asteroids / points (fonts often lack ⚷ ⚳ ⚴ ⚵ ⚶ ⚸),
 * the Unicode symbol otherwise. Works inline in HTML and nested inside the chart SVG
 * (pass x / y / width / height as attributes).
 */
const props = withDefaults(defineProps<{ bodyKey: string; symbol?: string; size?: number }>(), { symbol: '', size: 16 });
const path = computed(() => BODY_GLYPH_PATHS[props.bodyKey as keyof typeof BODY_GLYPH_PATHS]);
</script>

<template>
  <svg v-if="path" class="astro-glyph" :width="size" :height="size" viewBox="-10 -10 20 20" aria-hidden="true">
    <path :d="path.d" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
    <path v-if="path.fill" :d="path.fill" fill="currentColor" stroke="none" />
  </svg>
  <span v-else class="astro-glyph-text">{{ symbol }}</span>
</template>

<style scoped>
.astro-glyph { display: inline-block; vertical-align: -0.15em; overflow: visible; }
.astro-glyph-text { font-variant-emoji: text; }
</style>
