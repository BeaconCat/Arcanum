<script setup lang="ts">
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-vue-next';
import AppModal from './AppModal.vue';
import { feedbackState, dismissToast, settleConfirm } from '../../composables/useFeedback';

const icons = { success: CheckCircle2, error: XCircle, info: Info, warning: AlertTriangle };
</script>

<template>
  <!-- Toasts -->
  <Teleport to="body">
    <div class="toast-stack" aria-live="polite">
      <TransitionGroup name="toast">
        <div v-for="t in feedbackState.toasts" :key="t.id" class="toast" :class="t.type" role="status">
          <component :is="icons[t.type]" :size="18" class="toast-icon" />
          <span class="toast-msg">{{ t.message }}</span>
          <button class="toast-close" aria-label="关闭" @click="dismissToast(t.id)"><X :size="14" /></button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>

  <!-- Confirm -->
  <AppModal
    :open="feedbackState.confirm.open"
    :title="feedbackState.confirm.title || '请确认'"
    size="sm"
    @update:open="(v) => !v && settleConfirm(false)"
  >
    <p class="confirm-msg">{{ feedbackState.confirm.message }}</p>
    <template #footer>
      <button class="btn btn-secondary" @click="settleConfirm(false)">
        {{ feedbackState.confirm.cancelText || '取消' }}
      </button>
      <button
        class="btn"
        :class="feedbackState.confirm.danger ? 'btn-danger' : 'btn-primary'"
        @click="settleConfirm(true)"
      >
        {{ feedbackState.confirm.confirmText || '确认' }}
      </button>
    </template>
  </AppModal>
</template>

<style scoped>
.toast-stack {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  pointer-events: none;
  width: max-content;
  max-width: calc(100vw - 32px);
}
.toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 220px;
  max-width: 440px;
  padding: 10px 10px 10px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-elevated);
  box-shadow: var(--shadow-lg);
  font-size: 0.88rem;
  color: var(--color-text-primary);
}
.toast-icon { flex-shrink: 0; }
.toast.success .toast-icon { color: var(--color-success); }
.toast.error .toast-icon { color: var(--color-error); }
.toast.info .toast-icon { color: var(--color-info); }
.toast.warning .toast-icon { color: var(--color-warning); }
.toast-msg { flex: 1; line-height: 1.45; word-break: break-word; }
.toast-close {
  display: grid; place-items: center; width: 24px; height: 24px; flex-shrink: 0;
  border: none; border-radius: 6px; background: transparent; color: var(--color-text-muted); cursor: pointer;
}
.toast-close:hover { background: var(--color-bg-tertiary); color: var(--color-text-primary); }

.toast-enter-active, .toast-leave-active { transition: all 220ms ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(-10px) scale(0.97); }

.confirm-msg { font-size: 0.92rem; line-height: 1.7; color: var(--color-text-secondary); white-space: pre-line; }
</style>
