<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  score: number;
  size?: number;
  stroke?: number;
  label?: string;
}>(), { size: 56, stroke: 3.2 });

// r chosen so circumference == 100 → dasharray maps directly to score
const R = 15.9155;
const pct = computed(() => Math.max(0, Math.min(100, Number(props.score) || 0)));
</script>

<template>
  <div class="score-ring" :style="{ width: `${size}px`, height: `${size}px` }">
    <svg viewBox="0 0 36 36" aria-hidden="true">
      <circle class="ring-bg" cx="18" cy="18" :r="R" :stroke-width="stroke" />
      <circle
        class="ring-fg"
        cx="18" cy="18" :r="R"
        :stroke-width="stroke"
        :stroke-dasharray="`${pct} 100`"
      />
    </svg>
    <div class="score-text" :style="{ fontSize: `${Math.round(size * 0.3)}px` }">
      <span class="tabular">{{ Math.round(pct) }}</span>
      <small v-if="label" :style="{ fontSize: `${Math.max(9, Math.round(size * 0.14))}px` }">{{ label }}</small>
    </div>
  </div>
</template>

<style scoped>
.score-ring { position: relative; flex-shrink: 0; color: inherit; }
.score-ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.ring-bg { fill: none; stroke: currentColor; opacity: 0.16; }
.ring-fg { fill: none; stroke: currentColor; stroke-linecap: round; transition: stroke-dasharray 0.6s ease; }
.score-text {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-family: var(--font-serif);
  font-weight: 700;
  line-height: 1;
}
.score-text small { font-family: var(--font-sans); font-weight: 500; opacity: 0.75; margin-top: 2px; }
</style>
