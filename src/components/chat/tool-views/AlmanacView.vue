<script setup lang="ts">
// get_today_huangli (mode 'day') and get_shichen_detail (mode 'hours').
import { computed, ref } from 'vue';

const props = defineProps<{ data: Record<string, any>; mode: 'day' | 'hours' }>();

const tone = (luck?: string) => (luck === '吉' ? 'good' : luck === '凶' ? 'bad' : '');
const ZHI = '子丑寅卯辰巳午未申酉戌亥';

const hours = computed<any[]>(() => (props.data.shichen || []).map((s: any, i: number) => ({
  ...s, zhi: String(s.ganZhi || '').slice(1) || ZHI[i % 12],
})));
const openIdx = ref<number | null>(null);
</script>

<template>
  <div class="tv">
    <template v-if="mode === 'day'">
      <div class="al-hero">
        <div>
          <strong class="serif al-gz">{{ data.dayGanZhi }}日</strong>
          <div class="tv-muted">{{ data.date }} · {{ data.lunarDate }}</div>
        </div>
        <div class="tv-row al-tags">
          <span class="tv-chip">{{ data.naYin }}</span>
          <span class="tv-chip">{{ data.zhiXing }}日</span>
          <span class="tv-chip" :class="tone(data.tianShenLuck)">{{ data.tianShen }} {{ data.tianShenLuck }}</span>
          <span class="tv-chip" :class="tone(data.xiuLuck)">{{ data.xiu }}宿 {{ data.xiuLuck }}</span>
        </div>
      </div>
      <div class="al-yiji">
        <div><span class="al-yj good">宜</span><span v-for="y in data.dayYi || []" :key="y" class="tv-chip">{{ y }}</span></div>
        <div><span class="al-yj bad">忌</span><span v-for="j in data.dayJi || []" :key="j" class="tv-chip">{{ j }}</span></div>
      </div>
      <div class="tv-tiles">
        <div class="tv-tile"><small>冲煞</small><strong>冲{{ data.dayChong }} 煞{{ data.daySha }}</strong></div>
        <div class="tv-tile"><small>彭祖百忌</small><strong class="al-small">{{ data.pengZu }}</strong></div>
        <div v-if="data.jiShen?.length" class="tv-tile"><small>吉神</small><strong class="al-small">{{ data.jiShen.join('、') }}</strong></div>
        <div v-if="data.xiongSha?.length" class="tv-tile"><small>凶煞</small><strong class="al-small">{{ data.xiongSha.join('、') }}</strong></div>
      </div>
    </template>

    <template v-else>
      <div class="tv-muted">{{ data.date }} · 点击时辰查看宜忌</div>
      <div class="al-hours">
        <button
          v-for="(h, i) in hours" :key="i" type="button"
          class="al-hour" :class="[tone(h.luck), { open: openIdx === i }]"
          @click="openIdx = openIdx === i ? null : i"
        >
          <strong class="serif">{{ h.zhi }}</strong>
          <small>{{ h.time }}</small>
          <span>{{ h.tianShen }}</span>
        </button>
      </div>
      <div v-if="openIdx !== null && hours[openIdx]" class="al-detail">
        <div class="tv-row">
          <b class="serif">{{ hours[openIdx].ganZhi }}时</b>
          <span class="tv-chip" :class="tone(hours[openIdx].luck)">{{ hours[openIdx].tianShen }} · {{ hours[openIdx].tianShenType }} · {{ hours[openIdx].luck }}</span>
          <span class="tv-muted">冲{{ hours[openIdx].chong }} 煞{{ hours[openIdx].sha }}</span>
        </div>
        <div class="al-yiji">
          <div><span class="al-yj good">宜</span><span v-for="y in hours[openIdx].yi || []" :key="y" class="tv-chip">{{ y }}</span></div>
          <div><span class="al-yj bad">忌</span><span v-for="j in hours[openIdx].ji || []" :key="j" class="tv-chip">{{ j }}</span></div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.al-hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.al-gz { font-size: 1.5rem; }
.al-tags { justify-content: flex-end; }
.al-yiji { display: flex; flex-direction: column; gap: 6px; }
.al-yiji > div { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
.al-yj { display: inline-grid; place-items: center; width: 24px; height: 24px; border-radius: 6px; font-family: var(--font-serif); font-weight: 700; font-size: 0.82rem; }
.al-yj.good { background: var(--color-ji-soft); color: var(--color-ji); }
.al-yj.bad { background: var(--color-xiong-soft); color: var(--color-xiong); }
.al-small { font-family: var(--font-sans) !important; font-size: 0.8rem !important; font-weight: 500; line-height: 1.5; }

.al-hours { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 4px; }
.al-hour {
  display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 7px 2px;
  border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg-secondary);
  color: var(--color-text-primary); cursor: pointer; transition: border-color var(--transition-fast), transform var(--transition-fast);
}
.al-hour strong { font-size: 1rem; }
.al-hour small { font-size: 0.6rem; color: var(--color-text-muted); white-space: nowrap; }
.al-hour span { font-size: 0.66rem; color: var(--color-text-secondary); }
.al-hour.good { background: var(--color-ji-soft); border-color: color-mix(in srgb, var(--color-ji) 25%, var(--color-border)); }
.al-hour.bad { background: var(--color-xiong-soft); border-color: color-mix(in srgb, var(--color-xiong) 20%, var(--color-border)); }
.al-hour.open { border-color: var(--color-accent); box-shadow: 0 0 0 2px var(--color-accent-soft); }
.al-detail { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border-radius: var(--radius-md); background: color-mix(in srgb, var(--color-bg-tertiary) 55%, transparent); }

@media (max-width: 640px) {
  .al-hours { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .al-tags { justify-content: flex-start; }
}
</style>
