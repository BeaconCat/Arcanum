<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue';
import { X } from 'lucide-vue-next';

/*
 * <AppModal v-model:open="show" title="编辑档案" size="lg">
 *   …body…
 *   <template #footer> <button class="btn btn-primary">保存</button> </template>
 * </AppModal>
 */
const props = withDefaults(defineProps<{
  open: boolean;
  title?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  closeOnOverlay?: boolean;
  hideClose?: boolean;
}>(), { size: 'md', closeOnOverlay: true, hideClose: false });

const emit = defineEmits<{ 'update:open': [boolean]; close: [] }>();

function close() {
  emit('update:open', false);
  emit('close');
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && !props.hideClose) close();
}

watch(() => props.open, (v) => {
  if (v) {
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
  } else {
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = '';
  }
}, { immediate: true });

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey);
  document.body.style.overflow = '';
});
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" class="modal-overlay" @click.self="closeOnOverlay && !hideClose && close()">
        <div class="modal-card" :class="size !== 'md' ? size : ''" role="dialog" aria-modal="true" :aria-label="title">
          <div v-if="title || $slots.header || !hideClose" class="modal-header">
            <slot name="header">
              <h3 class="modal-title">{{ title }}</h3>
            </slot>
            <button v-if="!hideClose" class="btn-icon sm" type="button" aria-label="关闭" @click="close">
              <X :size="18" />
            </button>
          </div>
          <div class="modal-body">
            <slot />
          </div>
          <div v-if="$slots.footer" class="modal-footer">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
