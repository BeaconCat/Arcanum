<script setup lang="ts">
import { ref } from 'vue';
import { Eye, EyeOff } from 'lucide-vue-next';

defineOptions({ inheritAttrs: false });
const model = defineModel<string>({ default: '' });
const visible = ref(false);
</script>

<template>
  <div class="pwd-wrap">
    <input v-model="model" :type="visible ? 'text' : 'password'" class="input" v-bind="$attrs" />
    <button
      type="button"
      class="pwd-toggle"
      tabindex="-1"
      :aria-label="visible ? '隐藏密码' : '显示密码'"
      @click="visible = !visible"
    >
      <EyeOff v-if="visible" :size="16" />
      <Eye v-else :size="16" />
    </button>
  </div>
</template>

<style scoped>
.pwd-wrap { position: relative; }
.pwd-wrap .input { padding-right: 40px; }
.pwd-toggle {
  position: absolute;
  top: 50%;
  right: 4px;
  transform: translateY(-50%);
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}
.pwd-toggle:hover { color: var(--color-text-primary); background: var(--color-bg-tertiary); }
</style>
