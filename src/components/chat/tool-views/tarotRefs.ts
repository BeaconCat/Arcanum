// Card + spread reference data for tarot views, fetched once per page load and shared.
import { shallowRef } from 'vue';
import { apiGetTarotCards, apiGetTarotSpreads } from '../../../api/tarot.api';
import type { TarotCard, TarotSpread } from '../../../../shared/types/tarot.types';

export const tarotCards = shallowRef<Map<string, TarotCard> | null>(null);
export const tarotSpreads = shallowRef<Map<string, TarotSpread> | null>(null);

let pending: Promise<void> | null = null;

export function loadTarotRefs(): Promise<void> {
  if (tarotCards.value && tarotSpreads.value) return Promise.resolve();
  pending ??= Promise.all([apiGetTarotCards(), apiGetTarotSpreads()])
    .then(([cards, spreads]) => {
      tarotCards.value = new Map(cards.map((c) => [c.id, c]));
      tarotSpreads.value = new Map(spreads.map((s) => [s.id, s]));
    })
    .catch((err) => { pending = null; throw err; });
  return pending;
}
