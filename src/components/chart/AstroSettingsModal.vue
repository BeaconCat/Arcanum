<script setup lang="ts">
import { ref, watch } from 'vue';
import { RotateCcw } from 'lucide-vue-next';
import AppModal from '../common/AppModal.vue';
import type { AstroAspectType, AstroExtraBodyKey } from '../../../shared/types/astro.types';
import {
  ASPECTS, EXTRA_BODIES, HOUSE_SYSTEMS, defaultSettings, type AstroViewSettings, type AstroWorkbenchKind,
} from '../../utils/astro';

/** Per-chart-kind settings: house system, enabled aspects, orbs, luminary bonus, dignity marks. */
const props = defineProps<{ open: boolean; kind: AstroWorkbenchKind; kindName: string; settings: AstroViewSettings }>();
const emit = defineEmits<{ 'update:open': [boolean]; apply: [AstroViewSettings] }>();

const draft = ref<AstroViewSettings>(clone(props.settings));
watch(() => props.open, (v) => { if (v) draft.value = clone(props.settings); });

function clone(s: AstroViewSettings): AstroViewSettings {
  return { ...s, aspects: [...s.aspects], orbs: { ...s.orbs }, extraBodies: [...(s.extraBodies || [])] };
}

function toggleBody(k: AstroExtraBodyKey) {
  const set = new Set(draft.value.extraBodies);
  if (set.has(k)) set.delete(k); else set.add(k);
  draft.value.extraBodies = EXTRA_BODIES.map((b) => b.key).filter((x) => set.has(x));
}

function toggle(t: AstroAspectType) {
  const set = new Set(draft.value.aspects);
  if (set.has(t)) set.delete(t); else set.add(t);
  draft.value.aspects = ASPECTS.map((a) => a.type).filter((x) => set.has(x));
}

function selectGroup(cls: 'major' | 'minor', on: boolean) {
  const set = new Set(draft.value.aspects);
  for (const a of ASPECTS) if (a.cls === cls) (on ? set.add(a.type) : set.delete(a.type));
  draft.value.aspects = ASPECTS.map((a) => a.type).filter((x) => set.has(x));
}

function reset() { draft.value = clone(defaultSettings(props.kind)); }

function apply() {
  // Clamp orbs to a sane range
  for (const a of ASPECTS) {
    const v = Number(draft.value.orbs[a.type]);
    draft.value.orbs[a.type] = Number.isFinite(v) ? Math.min(15, Math.max(0.1, v)) : defaultSettings(props.kind).orbs[a.type];
  }
  draft.value.luminaryBonus = Math.min(5, Math.max(0, Number(draft.value.luminaryBonus) || 0));
  const mo = Number(draft.value.minorBodyOrb);
  draft.value.minorBodyOrb = Number.isFinite(mo) ? Math.min(10, Math.max(0.1, mo)) : defaultSettings(props.kind).minorBodyOrb;
  emit('apply', clone(draft.value));
  emit('update:open', false);
}
</script>

<template>
  <AppModal :open="open" :title="`${kindName} · 盘面设置`" size="lg" @update:open="(v) => emit('update:open', v)">
    <div class="st">
      <div class="st-row">
        <div class="form-group">
          <label for="st-house">宫制</label>
          <select id="st-house" v-model="draft.houseSystem" class="input">
            <option v-for="h in HOUSE_SYSTEMS" :key="h.value" :value="h.value">{{ h.label }}</option>
          </select>
        </div>
        <div class="form-group">
          <label for="st-lum">日月容许度加成（°）</label>
          <input id="st-lum" v-model.number="draft.luminaryBonus" type="number" min="0" max="5" step="0.5" class="input" />
        </div>
      </div>

      <label class="switch">
        <input v-model="draft.showDignity" type="checkbox" />
        <span class="switch-track" />
        在盘面上显示庙旺陷落
      </label>

      <div v-for="cls in (['major', 'minor'] as const)" :key="cls" class="st-group">
        <div class="st-group-head">
          <b>{{ cls === 'major' ? '主相位' : '次相位' }}</b>
          <button class="btn btn-ghost btn-sm" type="button" @click="selectGroup(cls, true)">全选</button>
          <button class="btn btn-ghost btn-sm" type="button" @click="selectGroup(cls, false)">全不选</button>
        </div>
        <div class="st-aspects">
          <div v-for="a in ASPECTS.filter((x) => x.cls === cls)" :key="a.type" class="st-asp" :class="{ off: !draft.aspects.includes(a.type) }">
            <label class="st-check">
              <input type="checkbox" :checked="draft.aspects.includes(a.type)" @change="toggle(a.type)" />
              <svg width="22" height="8" aria-hidden="true"><line x1="1" y1="4" x2="21" y2="4" :stroke="a.color" :stroke-width="Math.max(1.5, a.width)" :stroke-dasharray="a.dash" /></svg>
              <span>{{ a.name }} <small>{{ a.angle }}°</small></span>
            </label>
            <span class="st-orb">
              <input v-model.number="draft.orbs[a.type]" type="number" min="0.1" max="15" step="0.5" class="input input-sm" :aria-label="`${a.name}容许度`" :disabled="!draft.aspects.includes(a.type)" />
              <small>°</small>
            </span>
          </div>
        </div>
      </div>
      <div class="st-group">
        <div class="st-group-head">
          <b>小行星与虚点</b>
          <span class="st-orb">
            <label for="st-minor" class="st-minor-label">容许度</label>
            <input id="st-minor" v-model.number="draft.minorBodyOrb" type="number" min="0.1" max="10" step="0.5" class="input input-sm" />
            <small>°</small>
          </span>
        </div>
        <div class="st-bodies">
          <label v-for="b in EXTRA_BODIES" :key="b.key" class="st-body" :class="{ off: !draft.extraBodies.includes(b.key) }">
            <input type="checkbox" :checked="draft.extraBodies.includes(b.key)" @change="toggleBody(b.key)" />
            <span class="st-glyph">{{ b.glyph }}</span>
            <span>{{ b.name }}<small>{{ b.hint }}</small></span>
          </label>
        </div>
        <p class="form-hint">小行星与虚点只取主相位（合、六合、刑、拱、冲），不计入元素分布与格局；小行星星历覆盖 1850–2200 年。</p>
      </div>
      <p class="form-hint">设置按盘型分别保存在本机浏览器中；行运、推运默认使用更紧的容许度。</p>
    </div>
    <template #footer>
      <button class="btn btn-ghost" type="button" @click="reset"><RotateCcw :size="15" />恢复默认</button>
      <span class="spacer" />
      <button class="btn btn-secondary" type="button" @click="emit('update:open', false)">取消</button>
      <button class="btn btn-primary" type="button" @click="apply">应用</button>
    </template>
  </AppModal>
</template>

<style scoped>
.st { display: flex; flex-direction: column; gap: var(--space-md); }
.st-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md); }
.st-group-head { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.st-group-head b { font-family: var(--font-serif); margin-right: auto; }
.st-aspects { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.st-asp { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 10px; border: 1px solid var(--color-border); border-radius: var(--radius-md); transition: opacity var(--transition-fast); }
.st-asp.off { opacity: 0.55; }
.st-check { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.88rem; }
.st-check small { color: var(--color-text-muted); }
.st-orb { display: inline-flex; align-items: center; gap: 3px; }
.st-orb .input { width: 64px; text-align: right; }
.st-orb small { color: var(--color-text-muted); }
.spacer { flex: 1; }
.st-minor-label { font-size: 0.82rem; color: var(--color-text-secondary); margin-right: 4px; }
.st-bodies { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; }
.st-body { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border: 1px solid var(--color-border); border-radius: var(--radius-md); cursor: pointer; font-size: 0.88rem; transition: opacity var(--transition-fast); }
.st-body.off { opacity: 0.55; }
.st-body small { display: block; font-size: 0.72rem; color: var(--color-text-muted); }
.st-glyph { width: 18px; text-align: center; font-size: 1.05rem; color: var(--color-text-secondary); font-family: 'Segoe UI Symbol', 'Noto Sans Symbols', 'Noto Sans Symbols 2', 'DejaVu Sans', sans-serif; }
@media (max-width: 560px) {
  .st-row, .st-aspects { grid-template-columns: 1fr; }
}
</style>
