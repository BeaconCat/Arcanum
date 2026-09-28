<script setup lang="ts">
// Transit / progressed / solar return / synastry bi-wheel with the tightest cross aspects.
import { computed } from 'vue';
import type { AstroBiWheel } from '../../../../shared/types/astro.types';
import AstroWheel from '../../chart/AstroWheel.vue';
import AstroCompatibilityPanel from '../../chart/AstroCompatibilityPanel.vue';
import AspectList from './AspectList.vue';

const props = defineProps<{ wheel: AstroBiWheel }>();

const isSyn = computed(() => props.wheel.kind === 'synastry');
const OUTER_PREFIX: Record<string, string> = { transit: '行运', progressed: '推运', 'solar-return': '返照' };
const outerPrefix = computed(() => (isSyn.value ? `${props.wheel.outerLabel}的` : OUTER_PREFIX[props.wheel.kind] || ''));
const innerPrefix = computed(() => (isSyn.value ? `${props.wheel.innerLabel}的` : '本命'));
</script>

<template>
  <div class="tv">
    <div class="tv-muted">{{ wheel.kindName }} · {{ wheel.outerMoment }}</div>
    <div class="tv-wheel">
      <AstroWheel
        :chart="wheel.inner" :outer="wheel.outer" :cross-aspects="wheel.crossAspects"
        :inner-label="wheel.innerLabel" :outer-label="wheel.outerLabel" :show-dignity="false"
      />
    </div>

    <div v-if="wheel.compatibility" class="bw-compat">
      <AstroCompatibilityPanel :data="wheel.compatibility" :label-a="wheel.innerLabel" :label-b="wheel.outerLabel" />
    </div>

    <div class="tv-section-label">{{ isSyn ? '双方主要相位' : '主要交互相位' }}</div>
    <AspectList :aspects="wheel.crossAspects" :limit="8" :prefix-a="innerPrefix" :prefix-b="outerPrefix" />

    <template v-if="wheel.outerInInnerHouses?.length">
      <div class="tv-section-label">{{ wheel.outerLabel }}落入{{ wheel.innerLabel }}的宫位</div>
      <div class="tv-row">
        <span v-for="h in wheel.outerInInnerHouses" :key="h.key" class="tv-chip">{{ h.name }} <b>{{ h.house }}</b>宫</span>
      </div>
    </template>
    <p v-if="wheel.note" class="tv-muted">{{ wheel.note }}</p>
  </div>
</template>

<style scoped>
.bw-compat :deep(.card) { box-shadow: none; }
</style>
