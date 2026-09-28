<script setup lang="ts">
import type { Component } from 'vue';

defineProps<{
  icon?: Component;
  title?: string;
  description?: string;
  compact?: boolean;
}>();
</script>

<template>
  <div class="empty-state" :class="{ compact }">
    <div v-if="icon" class="es-icon"><component :is="icon" :size="compact ? 22 : 28" /></div>
    <h3 v-if="title">{{ title }}</h3>
    <p v-if="description || $slots.default"><slot>{{ description }}</slot></p>
    <div v-if="$slots.actions" class="es-actions"><slot name="actions" /></div>
  </div>
</template>

<style scoped>
.es-icon {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  margin-bottom: 4px;
  border-radius: 50%;
  background: var(--color-accent-soft);
  color: var(--color-accent);
}
.es-actions { display: flex; gap: var(--space-sm); flex-wrap: wrap; justify-content: center; margin-top: var(--space-sm); }
.compact { padding: var(--space-lg) var(--space-md); }
.compact .es-icon { width: 44px; height: 44px; }
</style>
