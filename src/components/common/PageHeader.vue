<script setup lang="ts">
import { ArrowLeft } from 'lucide-vue-next';
import { useRouter, type RouteLocationRaw } from 'vue-router';

const props = defineProps<{
  title: string;
  subtitle?: string;
  back?: RouteLocationRaw;
  backLabel?: string;
}>();

const router = useRouter();
</script>

<template>
  <header class="page-header">
    <div class="ph-main">
      <button v-if="props.back" class="ph-back" type="button" @click="router.push(props.back)">
        <ArrowLeft :size="16" />
        <span>{{ backLabel || '返回' }}</span>
      </button>
      <h1 class="page-title">
        <slot name="title">{{ title }}</slot>
      </h1>
      <div v-if="subtitle || $slots.subtitle" class="page-subtitle">
        <slot name="subtitle">{{ subtitle }}</slot>
      </div>
    </div>
    <div v-if="$slots.actions" class="page-actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.ph-main { min-width: 0; }
.ph-back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 0 0 6px -6px;
  padding: 3px 8px 3px 6px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 0.82rem;
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}
.ph-back:hover { background: var(--color-bg-tertiary); color: var(--color-accent); }
</style>
