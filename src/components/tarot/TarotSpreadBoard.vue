<script setup lang="ts">
import { computed } from 'vue';
import type { TarotCard, TarotSpread, TarotDrawnCard, TarotDeckId } from '../../../shared/types/tarot.types';
import TarotCard_ from './TarotCard.vue';

/*
 * Lays out drawn cards by the spread's percentage coordinates.
 * ≤640px falls back to a simple grid (see styles) so small screens stay readable.
 */
const props = defineProps<{
  spread: TarotSpread;
  cards: TarotDrawnCard[];
  deck: Map<string, TarotCard>;
  /** Card art for this reading (defaults to the viewer's preferred deck) */
  cardDeck?: TarotDeckId;
  revealed: Set<number>;
  active?: number | null;
}>();

const emit = defineEmits<{ flip: [positionId: number]; focus: [positionId: number] }>();

// Card width as a % of the board width, by how crowded the spread is
const cardWidth = computed(() => {
  const n = props.spread.positions.length;
  if (n <= 1) return 24;
  if (n <= 3) return 19;
  if (n <= 4) return 17;
  if (n <= 6) return 14;
  if (n <= 7) return 12;
  if (n <= 10) return 11;
  return 10.5;
});

// Card height / width per deck (RWS scans 11:19, drawn SVG faces 3:5)
const CARD_RATIO: Record<string, number> = { rws: 19 / 11, arcanum: 5 / 3 };

/**
 * Board sized to its content instead of the spread's nominal aspect ratio — a 1:1 board
 * for a single card left ~400px of empty space above and below it.
 *
 * In board-width units: half a card (+ label) of margin at the top and bottom, and the
 * positions' y values mapped onto the span in between. The span keeps the spread's designed
 * vertical spacing, grown where needed so cards sharing a column don't overlap.
 */
const layout = computed(() => {
  const ps = props.spread.positions;
  const w = cardWidth.value / 100;
  const h = w * (CARD_RATIO[props.cardDeck || 'rws'] ?? CARD_RATIO.rws);
  const LABEL = 0.034; // label row ≈ 26px at the 820px max width
  const PAD = 0.01;
  const ys = ps.map((p) => p.y / 100);
  const yMin = Math.min(...ys);
  const yRange = Math.max(...ys) - yMin;
  const norm = (y: number) => (yRange > 0 ? (y / 100 - yMin) / yRange : 0);

  let span = yRange / props.spread.aspect;
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const dx = Math.abs(ps[i].x - ps[j].x) / 100;
      const dy = Math.abs(norm(ps[i].y) - norm(ps[j].y));
      if (dy > 0 && dx < w * 0.95) span = Math.max(span, (h + LABEL + 0.01) / dy);
    }
  }
  const top = PAD + h / 2;
  const H = top + span + h / 2 + LABEL + PAD;
  return {
    aspect: 1 / H,
    topPct: (y: number) => ((top + norm(y) * span) / H) * 100,
  };
});

const slots = computed(() => props.spread.positions.map((pos) => {
  const drawn = props.cards.find((c) => c.positionId === pos.id);
  return { pos, drawn, card: drawn ? props.deck.get(drawn.cardId) || null : null };
}));

function onClick(positionId: number) {
  if (!props.revealed.has(positionId)) emit('flip', positionId);
  else emit('focus', positionId);
}
</script>

<template>
  <div class="board" :style="{ aspectRatio: String(layout.aspect) }">
    <div
      v-for="s in slots"
      :key="s.pos.id"
      class="slot"
      :class="{ crossed: s.pos.rotation, active: active === s.pos.id }"
      :style="{
        left: `${s.pos.x}%`,
        top: `${layout.topPct(s.pos.y)}%`,
        width: `${cardWidth}%`,
        '--rot': `${s.pos.rotation || 0}deg`,
        zIndex: s.pos.rotation ? 2 : 1,
      }"
    >
      <div class="slot-card">
        <TarotCard_
          :card="s.card"
          :deck="cardDeck"
          :reversed="s.drawn?.reversed"
          :face-up="revealed.has(s.pos.id)"
          interactive
          :label="`${s.pos.name}：${revealed.has(s.pos.id) && s.card ? s.card.nameZh : '点击翻牌'}`"
          @click="onClick(s.pos.id)"
        />
      </div>
      <div class="slot-label">
        <span class="slot-no">{{ s.pos.id }}</span>{{ s.pos.name }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.board {
  position: relative;
  width: 100%;
  max-width: 820px;
  margin: 0 auto;
}
.slot {
  position: absolute;
  transform: translate(-50%, -50%);
}
.slot-card { transform: rotate(var(--rot)); transition: transform var(--transition-normal); }
.slot.active .slot-card { filter: drop-shadow(0 0 6px rgba(var(--color-accent-rgb), 0.55)); }
.slot-label {
  position: absolute;
  left: 50%;
  top: 100%;
  transform: translateX(-50%);
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.72rem;
  color: var(--color-text-secondary);
  white-space: nowrap;
}
.slot.crossed .slot-label { display: none; }
.slot-no {
  display: inline-grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--color-accent-soft);
  color: var(--color-accent);
  font-size: 0.64rem;
  font-weight: 700;
}

/* Small screens: plain grid in position order; crossed card shown upright with its label */
@media (max-width: 640px) {
  .board {
    aspect-ratio: auto !important;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 26px 12px;
    padding-bottom: 18px;
  }
  .slot {
    position: relative;
    left: auto !important;
    top: auto !important;
    width: auto !important;
    transform: none;
  }
  .slot-card { transform: none; }
  .slot.crossed .slot-label { display: flex; }
}
</style>
