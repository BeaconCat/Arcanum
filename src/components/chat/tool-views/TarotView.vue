<script setup lang="ts">
// A tarot reading drawn by the AI: spread layout with card art; tap a card for its meaning.
import { computed, onMounted, ref } from 'vue';
import type { TarotReading } from '../../../../shared/types/tarot.types';
import TarotSpreadBoard from '../../tarot/TarotSpreadBoard.vue';
import { tarotCards, tarotSpreads, loadTarotRefs } from './tarotRefs';

const props = defineProps<{ reading: TarotReading }>();

const failed = ref(false);
onMounted(() => loadTarotRefs().catch(() => { failed.value = true; }));

const spread = computed(() => tarotSpreads.value?.get(props.reading.spreadId) || null);
const revealed = computed(() => new Set(props.reading.cards.map((c) => c.positionId)));
const active = ref<number | null>(props.reading.cards[0]?.positionId ?? null);

const detail = computed(() => {
  const drawn = props.reading.cards.find((c) => c.positionId === active.value);
  if (!drawn) return null;
  return {
    drawn,
    pos: spread.value?.positions.find((p) => p.id === drawn.positionId),
    card: tarotCards.value?.get(drawn.cardId),
  };
});
</script>

<template>
  <div class="tv">
    <div v-if="reading.question" class="tr-q"><span class="tv-muted">所问</span>{{ reading.question }}</div>

    <div v-if="spread && tarotCards" class="tr-board">
      <TarotSpreadBoard
        :spread="spread" :cards="reading.cards" :deck="tarotCards" :card-deck="reading.deck"
        :revealed="revealed" :active="active" @focus="(p) => (active = p)" @flip="(p) => (active = p)"
      />
    </div>
    <div v-else-if="failed" class="tv-muted">牌面资料加载失败，可在「数据」页查看文字结果。</div>
    <div v-else class="tr-skeleton skeleton" />

    <div v-if="detail?.card" class="tr-detail">
      <div class="tv-row">
        <span class="tv-chip accent">{{ detail.drawn.positionId }} · {{ detail.pos?.name }}</span>
        <b class="serif tr-name">{{ detail.card.nameZh }}</b>
        <span class="tv-chip" :class="detail.drawn.reversed ? 'bad' : 'good'">{{ detail.drawn.reversed ? '逆位' : '正位' }}</span>
      </div>
      <p v-if="detail.pos?.meaning" class="tv-muted">{{ detail.pos.meaning }}</p>
      <div class="tv-row">
        <span v-for="k in (detail.drawn.reversed ? detail.card.keywordsReversed : detail.card.keywordsUpright)" :key="k" class="tv-chip">{{ k }}</span>
      </div>
      <p class="tr-text">{{ detail.drawn.reversed ? detail.card.reversed : detail.card.upright }}</p>
      <p class="tr-advice">建议：{{ detail.card.advice }}</p>
    </div>
    <p class="tv-muted">点击牌面查看每个位置的牌义</p>
  </div>
</template>

<style scoped>
.tr-q { display: flex; gap: 8px; align-items: baseline; font-family: var(--font-serif); font-size: 0.95rem; }
.tr-board { max-width: 560px; width: 100%; margin: 0 auto; }
.tr-skeleton { height: 220px; border-radius: var(--radius-md); }
.tr-detail { display: flex; flex-direction: column; gap: 6px; padding: 12px; border-radius: var(--radius-md); background: color-mix(in srgb, var(--color-bg-tertiary) 55%, transparent); }
.tr-name { font-size: 1.05rem; }
.tr-text { font-size: 0.84rem; line-height: 1.75; color: var(--color-text-secondary); }
.tr-advice { font-size: 0.82rem; color: var(--color-accent); }
</style>
