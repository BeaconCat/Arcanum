<script setup lang="ts">
import type { TarotCard } from '../../../shared/types/tarot.types';

withDefaults(defineProps<{
  card: TarotCard;
  reversed?: boolean;
  /** Show both orientations (reference view) instead of just the drawn one */
  both?: boolean;
}>(), { reversed: false, both: false });

const ASPECTS: { key: 'love' | 'career' | 'wealth' | 'growth'; label: string }[] = [
  { key: 'love', label: '感情' },
  { key: 'career', label: '事业' },
  { key: 'wealth', label: '财富' },
  { key: 'growth', label: '成长' },
];
</script>

<template>
  <div class="ci">
    <div class="ci-meta">
      <span class="badge">{{ card.arcana === 'major' ? '大阿卡纳' : `${card.suitName} · ${card.element}` }}</span>
      <span v-if="card.correspondence" class="badge">{{ card.correspondence }}</span>
      <span class="ci-en">{{ card.nameEn }}</span>
    </div>

    <section v-if="both || !reversed" class="ci-block">
      <h5><span class="orient up">正位</span></h5>
      <div class="kw"><span v-for="k in card.keywordsUpright" :key="k" class="kw-chip">{{ k }}</span></div>
      <p>{{ card.upright }}</p>
    </section>
    <section v-if="both || reversed" class="ci-block">
      <h5><span class="orient down">逆位</span></h5>
      <div class="kw"><span v-for="k in card.keywordsReversed" :key="k" class="kw-chip rev">{{ k }}</span></div>
      <p>{{ card.reversed }}</p>
    </section>

    <dl class="ci-aspects">
      <template v-for="a in ASPECTS" :key="a.key">
        <dt>{{ a.label }}</dt>
        <dd>{{ card.aspects[a.key] }}</dd>
      </template>
    </dl>
    <p class="ci-advice"><strong>建议</strong>{{ card.advice }}</p>
  </div>
</template>

<style scoped>
.ci { display: flex; flex-direction: column; gap: 10px; font-size: 0.88rem; line-height: 1.7; }
.ci-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.ci-en { font-size: 0.74rem; letter-spacing: 0.08em; color: var(--color-text-muted); text-transform: uppercase; }
.ci-block h5 { margin-bottom: 4px; }
.orient { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 0.72rem; font-weight: 600; }
.orient.up { background: var(--color-ji-soft); color: var(--color-ji); }
.orient.down { background: var(--color-xiong-soft); color: var(--color-xiong); }
.kw { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 4px; }
.kw-chip { padding: 1px 8px; border-radius: 999px; font-size: 0.74rem; background: var(--color-accent-soft); color: var(--color-accent); }
.kw-chip.rev { background: var(--color-bg-tertiary); color: var(--color-text-secondary); }
.ci-block p { color: var(--color-text-primary); }
.ci-aspects {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: var(--color-bg-tertiary);
  font-size: 0.84rem;
}
.ci-aspects dt { color: var(--color-accent); font-weight: 600; white-space: nowrap; }
.ci-aspects dd { color: var(--color-text-secondary); }
.ci-advice { display: flex; gap: 8px; color: var(--color-text-secondary); }
.ci-advice strong { flex-shrink: 0; color: var(--color-gold); }
</style>
