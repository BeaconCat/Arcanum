import { ref } from 'vue';
import type { TarotDeckId } from '../../shared/types/tarot.types';

/*
 * Viewer's preferred tarot card art (per browser). 'rws' is the default:
 * the 1909 Rider–Waite–Smith deck by Pamela Colman Smith (public domain).
 */

export const TAROT_DECKS: { id: TarotDeckId; name: string; description: string }[] = [
  { id: 'rws', name: '经典 RWS', description: 'Pamela Colman Smith 1909 年原版绘制（公有领域）' },
  { id: 'arcanum', name: '天枢自绘', description: '夜墨与鎏金线条的象征性牌面' },
];

const KEY = 'tarot.deck';

function read(): TarotDeckId {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'arcanum' || v === 'rws' ? v : 'rws';
  } catch {
    return 'rws';
  }
}

const deck = ref<TarotDeckId>(read());

export function useTarotDeck() {
  function setDeck(id: TarotDeckId) {
    deck.value = id;
    try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
  }
  return { deck, setDeck };
}

/** Width : height of a card for each deck (RWS scans are ~11:19, the SVG art is 3:5). */
export const DECK_RATIO: Record<TarotDeckId, string> = { rws: '11 / 19', arcanum: '3 / 5' };

export function rwsImage(cardId: string, size: 'sm' | 'lg'): string {
  return `/tarot/rws/${cardId}${size === 'sm' ? '-sm' : ''}.webp`;
}
