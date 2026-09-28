<script setup lang="ts">
// get_ziwei_chart → the existing 12-palace grid, with its outer card chrome stripped for the chat card.
import ZiweiChartCard from '../../chart/ZiweiChartCard.vue';
import type { ZiweiChart } from '../../../../shared/types/ziwei.types';

defineProps<{ data: Record<string, any> }>();
</script>

<template>
  <div class="tv zw-embed">
    <ZiweiChartCard :chart="data as unknown as ZiweiChart" />
  </div>
</template>

<style scoped>
.zw-embed :deep(.card) { padding: 0; border: none; box-shadow: none; background: transparent; }
.zw-embed :deep(h3) { display: none; }
</style>
