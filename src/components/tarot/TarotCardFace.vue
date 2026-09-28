<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { TarotCard, TarotDeckId } from '../../../shared/types/tarot.types';
import TarotFaceSvg from './TarotFaceSvg.vue';
import { useTarotDeck, rwsImage } from '../../composables/useTarotDeck';

/*
 * Card face for the chosen deck.
 * - rws: Pamela Colman Smith's 1909 artwork (public domain scans), framed with a fine gold
 *   edge; in dark mode a warm veil sits on top (the image itself is untouched).
 * - arcanum: the original SVG art.
 * Images load lazily behind a skeleton and fall back to the SVG face if they fail.
 */
const props = withDefaults(defineProps<{
  card: TarotCard;
  /** Defaults to the viewer's preferred deck */
  deck?: TarotDeckId;
  /** 'sm' for grids / fans / thumbnails (uses the hi-res file on 2x screens), 'lg' for detail views */
  size?: 'sm' | 'lg';
}>(), { size: 'sm' });

const { deck: preferred } = useTarotDeck();
const deckId = computed<TarotDeckId>(() => props.deck ?? preferred.value);

const loaded = ref(false);
const failed = ref(false);
watch(() => [props.card.id, deckId.value], () => { loaded.value = false; failed.value = false; });

const src = computed(() => rwsImage(props.card.id, props.size));
const srcset = computed(() => (props.size === 'sm'
  ? `${rwsImage(props.card.id, 'sm')} 1x, ${rwsImage(props.card.id, 'lg')} 2x`
  : undefined));
const useImage = computed(() => deckId.value === 'rws' && !failed.value);
</script>

<template>
  <div v-if="useImage" class="tfi" :class="{ loaded }">
    <div v-if="!loaded" class="tfi-skeleton skeleton" aria-hidden="true" />
    <img
      :src="src"
      :srcset="srcset"
      :alt="`${card.nameZh}（${card.nameEn}）`"
      width="660"
      height="1140"
      loading="lazy"
      decoding="async"
      draggable="false"
      @load="loaded = true"
      @error="failed = true"
    />
  </div>
  <TarotFaceSvg v-else :card="card" />
</template>

<style scoped>
.tfi {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 6% / 3.5%;
  background: #efe2c6;
  /* fine gold edge + soft depth */
  box-shadow: inset 0 0 0 1px rgba(184, 138, 58, 0.55);
}
.tfi img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity 0.3s ease;
}
.tfi.loaded img { opacity: 1; }
.tfi-skeleton { position: absolute; inset: 0; border-radius: inherit; }
/* Gold hairline drawn above the image so it stays visible on the cream border of the scan */
.tfi::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: inset 0 0 0 1px rgba(184, 138, 58, 0.6), inset 0 0 0 3px rgba(255, 248, 232, 0.35);
  pointer-events: none;
}
/* Dark theme: a gentle dim with a warm tint, so bright paper doesn't glare on the night background */
:global(html[data-theme='dark'] .tfi) { background: #2a241b; }
:global(html[data-theme='dark'] .tfi::after) {
  background: linear-gradient(180deg, rgba(40, 28, 12, 0.14), rgba(24, 16, 6, 0.22));
  box-shadow: inset 0 0 0 1px rgba(224, 181, 106, 0.55);
}
@media (prefers-reduced-motion: reduce) {
  .tfi img { transition: none; }
}
</style>
