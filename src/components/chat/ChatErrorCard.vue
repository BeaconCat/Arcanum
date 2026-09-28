<script setup lang="ts">
import { computed, ref } from 'vue';
import { Wallet, KeyRound, Timer, FileWarning, ServerCrash, WifiOff, Settings2, AlertTriangle, RotateCcw, ChevronDown } from 'lucide-vue-next';
import type { ChatErrorInfo } from '../../../shared/types/chat-error.types';

const props = defineProps<{ error: ChatErrorInfo; isAdmin?: boolean; canRetry?: boolean }>();
const emit = defineEmits<{ retry: [] }>();

const ICONS = {
  balance: Wallet, auth: KeyRound, rate: Timer, context: FileWarning,
  server: ServerCrash, network: WifiOff, config: Settings2, unknown: AlertTriangle,
} as const;
const icon = computed(() => ICONS[props.error.kind] || AlertTriangle);
const showDetail = ref(false);
const hasDetail = computed(() => !!(props.error.detail || props.error.status || props.error.code));
</script>

<template>
  <div class="err-card" :class="error.kind" role="alert">
    <div class="err-head">
      <span class="err-icon"><component :is="icon" :size="18" /></span>
      <div class="err-text">
        <strong>{{ error.title }}</strong>
        <p>{{ error.message }}</p>
        <p v-if="error.hint" class="err-hint">
          {{ error.adminAction && !isAdmin ? `${error.hint.replace(/请在管理后台/, '请联系管理员在后台')}` : error.hint }}
        </p>
      </div>
    </div>
    <div class="err-actions">
      <button v-if="canRetry" class="btn btn-sm" :class="error.retryable ? 'btn-primary' : 'btn-secondary'" @click="emit('retry')">
        <RotateCcw :size="14" />重试
      </button>
      <router-link v-if="error.adminAction && isAdmin" to="/admin" class="btn btn-sm btn-secondary">
        <Settings2 :size="14" />前往管理后台
      </router-link>
      <button v-if="hasDetail" class="err-detail-toggle" :aria-expanded="showDetail" @click="showDetail = !showDetail">
        详情 <ChevronDown :size="13" :class="{ flip: showDetail }" />
      </button>
    </div>
    <div v-if="showDetail && hasDetail" class="err-detail">
      <span v-if="error.status">HTTP {{ error.status }}</span>
      <span v-if="error.code">代码 {{ error.code }}</span>
      <code v-if="error.detail">{{ error.detail }}</code>
    </div>
  </div>
</template>

<style scoped>
.err-card {
  --tone: var(--color-error);
  max-width: 560px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--tone) 28%, var(--color-border));
  border-left: 3px solid var(--tone);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--tone) 6%, var(--color-bg-secondary));
}
.err-card.rate, .err-card.server, .err-card.network { --tone: var(--color-warning); }
.err-card.context { --tone: var(--color-info); }
.err-head { display: flex; gap: 10px; align-items: flex-start; }
.err-icon {
  display: grid; place-items: center; flex-shrink: 0;
  width: 32px; height: 32px; border-radius: 9px;
  color: var(--tone); background: color-mix(in srgb, var(--tone) 12%, transparent);
}
.err-text { min-width: 0; }
.err-text strong { display: block; font-size: 0.92rem; color: var(--color-text-primary); }
.err-text p { margin: 3px 0 0; font-size: 0.84rem; line-height: 1.6; color: var(--color-text-secondary); }
.err-text .err-hint { color: var(--color-text-muted); font-size: 0.8rem; }
.err-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 10px 0 0 42px; }
.err-detail-toggle {
  display: inline-flex; align-items: center; gap: 2px; margin-left: auto;
  border: none; background: transparent; color: var(--color-text-muted); font-size: 0.76rem; cursor: pointer;
}
.err-detail-toggle:hover { color: var(--color-text-secondary); }
.err-detail-toggle .flip { transform: rotate(180deg); }
.err-detail {
  display: flex; flex-wrap: wrap; gap: 6px 12px; margin: 8px 0 0 42px; padding: 8px 10px;
  border-radius: var(--radius-md); background: var(--color-bg-tertiary);
  font-size: 0.74rem; color: var(--color-text-muted);
}
.err-detail code { flex-basis: 100%; font-family: var(--font-mono); white-space: pre-wrap; word-break: break-word; color: var(--color-text-secondary); }
@media (max-width: 640px) {
  .err-actions, .err-detail { margin-left: 0; }
}
</style>
