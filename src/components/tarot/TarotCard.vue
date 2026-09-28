<script setup lang="ts">
import { computed } from 'vue';
import type { TarotCard, TarotDeckId } from '../../../shared/types/tarot.types';
import TarotCardFace from './TarotCardFace.vue';
import TarotCardBack from './TarotCardBack.vue';
import { useTarotDeck, DECK_RATIO } from '../../composables/useTarotDeck';

/*
 * A card that can flip between back and face. Reversed cards show the face rotated 180°.
 * Width is set by the parent; height follows the deck's aspect ratio (RWS 11:19, SVG art 3:5).
 */
const props = withDefaults(defineProps<{
  card?: TarotCard | null;
  reversed?: boolean;
  faceUp?: boolean;
  interactive?: boolean;
  selected?: boolean;
  label?: string;
  /** Defaults to the viewer's preferred deck */
  deck?: TarotDeckId;
  size?: 'sm' | 'lg';
}>(), { card: null, reversed: false, faceUp: false, interactive: false, selected: false, size: 'sm' });

const { deck: preferred } = useTarotDeck();
const deckId = computed<TarotDeckId>(() => props.deck ?? preferred.value);

defineEmits<{ click: [] }>();
</script>

<template>
  <component
    :is="interactive ? 'button' : 'div'"
    class="tcard"
    :class="{ up: faceUp && card, interactive, selected }"
    :style="{ aspectRatio: DECK_RATIO[deckId] }"
    :type="interactive ? 'button' : undefined"
    :aria-label="label || (faceUp && card ? `${card.nameZh}${reversed ? '（逆位）' : ''}` : '塔罗牌')"
    @click="$emit('click')"
  >
    <div class="tcard-inner">
      <div class="tcard-side back"><TarotCardBack /></div>
      <div class="tcard-side front">
        <div v-if="card" class="front-rot" :class="{ reversed }"><TarotCardFace :card="card" :deck="deckId" :size="size" /></div>
      </div>
    </div>
  </component>
</template>

<style scoped>
.tcard {
  position: relative;
  display: block;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  perspective: 900px;
  border-radius: 7%;
}
.tcard.interactive { cursor: pointer; }
.tcard.interactive:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.tcard-inner {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
  transition: transform 0.7s cubic-bezier(0.2, 0.7, 0.2, 1);
}
.tcard.up .tcard-inner { transform: rotateY(180deg); }
.tcard-side {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  border-radius: 7%;
  box-shadow: 0 4px 14px rgba(10, 12, 20, 0.25);
}
.front { transform: rotateY(180deg); }
.front-rot { width: 100%; height: 100%; transition: transform 0.4s ease; }
.front-rot.reversed { transform: rotate(180deg); }
.tcard.interactive:hover .tcard-side { box-shadow: 0 8px 22px rgba(10, 12, 20, 0.35); }
.tcard.selected .tcard-side { box-shadow: 0 0 0 2px var(--color-accent), 0 10px 24px rgba(10, 12, 20, 0.35); }

@media (prefers-reduced-motion: reduce) {
  .tcard-inner, .front-rot { transition: none; }
}
</style>
