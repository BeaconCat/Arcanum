<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue';
import { MapPin, Crosshair } from 'lucide-vue-next';
import type { ProfileRelation } from '../../../shared/types/profile.types';
import type { BirthPlaceResolution } from '../../../shared/types/astro.types';
import { apiResolvePlace } from '../../api/chart.api';

export interface ProfileFormModel {
  name: string;
  relation: ProfileRelation;
  birthDate: string;
  birthTime: string;
  gender: 'male' | 'female';
  birthPlace: string;
  /** Manual coordinates as typed (blank = auto from 出生地) */
  birthLat: string;
  birthLon: string;
}

const model = defineModel<ProfileFormModel>({ required: true });
const props = defineProps<{ advancedOpen?: boolean }>();

// Live preview of how 出生地 resolves (used by 星盘)
const resolved = ref<BirthPlaceResolution | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;
watch(() => model.value.birthPlace, (v) => {
  clearTimeout(timer);
  if (!v?.trim()) { resolved.value = null; return; }
  timer = setTimeout(async () => {
    try { resolved.value = await apiResolvePlace(v.trim()); } catch { resolved.value = null; }
  }, 350);
}, { immediate: true });
onBeforeUnmount(() => clearTimeout(timer));

const PRECISION: Record<BirthPlaceResolution['precision'], string> = {
  manual: '手动', county: '区县级', city: '市级', province: '仅省级，按省会估算', default: '未识别，按北京估算',
};

function useResolved() {
  if (!resolved.value) return;
  model.value.birthLat = String(resolved.value.lat);
  model.value.birthLon = String(resolved.value.lon);
}
function clearCoords() {
  model.value.birthLat = '';
  model.value.birthLon = '';
}

const relations: ProfileRelation[] = ['本人', '父亲', '母亲', '配偶', '子女', '朋友', '客户', '其他'];
</script>

<template>
  <div class="form-grid">
    <div class="form-group">
      <label>姓名<span class="required">*</span></label>
      <input v-model="model.name" class="input" placeholder="档案姓名" required />
    </div>
    <div class="form-group">
      <label>关系</label>
      <select v-model="model.relation" class="input">
        <option v-for="r in relations" :key="r" :value="r">{{ r }}</option>
      </select>
    </div>
    <div class="form-group">
      <label>出生日期（阳历）<span class="required">*</span></label>
      <input v-model="model.birthDate" type="date" class="input" required />
    </div>
    <div class="form-group">
      <label>出生时间<span class="required">*</span></label>
      <input v-model="model.birthTime" type="time" class="input" required />
    </div>
    <div class="form-group">
      <label>性别</label>
      <div class="gender-seg">
        <button type="button" class="seg" :class="{ active: model.gender === 'male', male: true }" @click="model.gender = 'male'">男</button>
        <button type="button" class="seg" :class="{ active: model.gender === 'female', female: true }" @click="model.gender = 'female'">女</button>
      </div>
    </div>
    <div class="form-group">
      <label>出生地<span class="required">*</span></label>
      <input v-model="model.birthPlace" class="input" placeholder="例：浙江省杭州市西湖区" required />
      <span v-if="resolved" class="place-hint" :class="{ warn: resolved.precision === 'province' || resolved.precision === 'default' }">
        <MapPin :size="12" /> 识别为 {{ resolved.matched }}（{{ PRECISION[resolved.precision] }}）
      </span>
    </div>

    <details class="advanced full" :open="props.advancedOpen || !!model.birthLat">
      <summary>高级：出生地经纬度（用于星盘）</summary>
      <p class="form-hint">
        星盘的上升点与宫位取决于出生地经纬度。默认按上方「出生地」自动识别；识别不到区县或需要更精确时，可在此手动填写（北纬、东经为正数）。
      </p>
      <div class="coord-row">
        <div class="form-group">
          <label for="pf-lat">纬度</label>
          <input id="pf-lat" v-model="model.birthLat" class="input" inputmode="decimal" placeholder="如 30.2741" />
        </div>
        <div class="form-group">
          <label for="pf-lon">经度</label>
          <input id="pf-lon" v-model="model.birthLon" class="input" inputmode="decimal" placeholder="如 120.1551" />
        </div>
      </div>
      <div class="coord-actions">
        <button type="button" class="btn btn-secondary btn-sm" :disabled="!resolved || resolved.precision === 'default'" @click="useResolved">
          <Crosshair :size="14" /> 填入自动识别的坐标
        </button>
        <button v-if="model.birthLat || model.birthLon" type="button" class="btn btn-ghost btn-sm" @click="clearCoords">清除，改用自动识别</button>
      </div>
    </details>
  </div>
</template>

<style scoped>
.place-hint { display: inline-flex; align-items: center; gap: 4px; font-size: 0.75rem; color: var(--color-text-muted); }
.place-hint.warn { color: var(--color-warning); }
.advanced { padding: 10px 12px; border: 1px dashed var(--color-border-strong); border-radius: var(--radius-md); }
.advanced summary { cursor: pointer; font-size: 0.85rem; font-weight: 500; color: var(--color-text-secondary); }
.advanced[open] summary { margin-bottom: 8px; }
.advanced .form-hint { display: block; margin-bottom: 10px; line-height: 1.6; }
.coord-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md); }
.coord-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.gender-seg {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 3px;
  border-radius: var(--radius-md);
  background: var(--color-bg-tertiary);
}
.seg {
  height: 32px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 0.88rem;
  cursor: pointer;
  transition: all var(--transition-fast);
}
.seg:hover { color: var(--color-text-primary); }
.seg.active { background: var(--color-bg-secondary); box-shadow: var(--shadow-sm); font-weight: 600; }
.seg.male.active { color: var(--color-info); }
.seg.female.active { color: var(--color-error); }
</style>
