import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { DailyFortune } from '../../shared/types/fortune.types';

export const useFortuneStore = defineStore('fortune', () => {
  const todayFortune = ref<DailyFortune | null>(null);
  const monthlyData = ref<DailyFortune[]>([]);
  const loading = ref(false);

  // Placeholder - will be populated in Phase 2
  async function loadToday() {
    loading.value = true;
    try {
      // TODO: API call
    } finally {
      loading.value = false;
    }
  }

  async function loadMonth(_year: number, _month: number) {
    loading.value = true;
    try {
      // TODO: API call
    } finally {
      loading.value = false;
    }
  }

  return { todayFortune, monthlyData, loading, loadToday, loadMonth };
});
