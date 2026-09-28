<script setup lang="ts">
// Tightest aspects first, coloured by harmony. For cross aspects, prefixes name the two charts.
import { computed } from 'vue';
import type { AstroAspect } from '../../../../shared/types/astro.types';
import { aspectMeta } from '../../../utils/astro';

const props = withDefaults(defineProps<{
  aspects: AstroAspect[];
  limit?: number;
  majorOnly?: boolean;
  prefixA?: string;
  prefixB?: string;
}>(), { limit: 6, majorOnly: true, prefixA: '', prefixB: '' });

const rows = computed(() => props.aspects
  .filter((a) => !props.majorOnly || a.class === 'major')
  .slice()
  .sort((a, b) => a.orb - b.orb)
  .slice(0, props.limit)
  .map((a) => ({ a, m: aspectMeta(a.type) })));

const toneClass = (t: string) => (t === 'harmonious' ? 'good' : t === 'challenging' ? 'bad' : 'neutral');
</script>

<template>
  <div class="tv-list">
    <div v-for="({ a, m }, i) in rows" :key="i" class="tv-li">
      <span class="tv-dot" :class="toneClass(a.harmony)" />
      <span class="tv-li-main">
        {{ prefixA }}{{ a.aName }} <b :style="{ color: m.color }">{{ a.typeName }}</b> {{ prefixB }}{{ a.bName }}
      </span>
      <span class="tv-muted tabular">{{ a.orb.toFixed(1) }}° {{ a.applying ? '入' : '出' }}</span>
    </div>
    <div v-if="!rows.length" class="tv-muted">无紧密相位</div>
  </div>
</template>
