<script setup lang="ts">
// Data-only rendering of an AstroInterpretation (the workbench panel fetches its own data).
import { ref } from 'vue';
import { ChevronRight } from 'lucide-vue-next';
import type { AstroInterpretation } from '../../../../shared/types/astro-interpret.types';

const props = defineProps<{ interpretation: AstroInterpretation }>();
// First section open by default
const open = ref(new Set<string>(props.interpretation.sections[0] ? [props.interpretation.sections[0].key] : []));
function toggle(key: string) {
  const s = new Set(open.value);
  if (s.has(key)) s.delete(key); else s.add(key);
  open.value = s;
}
</script>

<template>
  <div class="tv">
    <div v-if="interpretation.subtitle" class="tv-muted">{{ interpretation.subtitle }}</div>
    <section v-for="sec in interpretation.sections" :key="sec.key" class="ai-sec">
      <button type="button" class="ai-head" :aria-expanded="open.has(sec.key)" @click="toggle(sec.key)">
        <ChevronRight :size="15" class="ai-chev" :class="{ open: open.has(sec.key) }" />
        <span class="tv-title">{{ sec.title }}</span>
        <span class="tv-muted">{{ sec.items.length }}</span>
      </button>
      <div v-if="open.has(sec.key)" class="ai-items">
        <article v-for="it in sec.items" :key="it.key" class="ai-item">
          <div class="ai-item-head">
            <b>{{ it.title }}</b>
            <span v-if="it.note" class="tv-chip">{{ it.note }}</span>
          </div>
          <div v-if="it.keywords?.length" class="tv-row">
            <span v-for="k in it.keywords" :key="k" class="tv-chip accent">{{ k }}</span>
          </div>
          <p>{{ it.text }}</p>
          <p v-if="it.advice" class="ai-advice">建议：{{ it.advice }}</p>
        </article>
      </div>
    </section>
    <p v-if="interpretation.disclaimer" class="tv-muted">{{ interpretation.disclaimer }}</p>
  </div>
</template>

<style scoped>
.ai-sec { border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; }
.ai-head { display: flex; align-items: center; gap: 6px; width: 100%; padding: 9px 11px; border: none; background: color-mix(in srgb, var(--color-bg-tertiary) 55%, transparent); color: inherit; cursor: pointer; text-align: left; }
.ai-head .tv-muted { margin-left: auto; }
.ai-chev { color: var(--color-text-muted); transition: transform var(--transition-fast); }
.ai-chev.open { transform: rotate(90deg); }
.ai-items { display: flex; flex-direction: column; }
.ai-item { display: flex; flex-direction: column; gap: 5px; padding: 10px 12px; border-top: 1px solid var(--color-border); }
.ai-item-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.ai-item p { font-size: 0.83rem; line-height: 1.7; color: var(--color-text-secondary); }
.ai-advice { color: var(--color-accent) !important; }
</style>
