import { reactive } from 'vue';

/*
 * App-wide toast + confirm dialog, replacing window.alert / window.confirm.
 * Rendered once by <AppFeedback /> in App.vue.
 *
 *   const { toast, confirm } = useFeedback();
 *   toast.success('已保存');
 *   if (await confirm({ title: '删除档案', message: '…', danger: true })) { … }
 */

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
  resolve: ((ok: boolean) => void) | null;
}

export const feedbackState = reactive({
  toasts: [] as ToastItem[],
  confirm: { open: false, message: '', resolve: null } as ConfirmState,
});

let seq = 0;

function push(type: ToastType, message: string, duration = type === 'error' ? 4200 : 2600) {
  const id = ++seq;
  feedbackState.toasts.push({ id, type, message });
  if (feedbackState.toasts.length > 4) feedbackState.toasts.shift();
  setTimeout(() => dismissToast(id), duration);
}

export function dismissToast(id: number) {
  const i = feedbackState.toasts.findIndex((t) => t.id === id);
  if (i >= 0) feedbackState.toasts.splice(i, 1);
}

const toast = {
  success: (m: string) => push('success', m),
  error: (m: string) => push('error', m),
  info: (m: string) => push('info', m),
  warning: (m: string) => push('warning', m),
};

function confirm(opts: ConfirmOptions | string): Promise<boolean> {
  const o = typeof opts === 'string' ? { message: opts } : opts;
  // Resolve any dialog still pending so its caller doesn't hang
  feedbackState.confirm.resolve?.(false);
  return new Promise((resolve) => {
    Object.assign(feedbackState.confirm, {
      title: o.title,
      message: o.message,
      confirmText: o.confirmText,
      cancelText: o.cancelText,
      danger: o.danger,
      open: true,
      resolve,
    });
  });
}

export function settleConfirm(ok: boolean) {
  const r = feedbackState.confirm.resolve;
  feedbackState.confirm.open = false;
  feedbackState.confirm.resolve = null;
  r?.(ok);
}

/** Extract a user-facing message from an axios / fetch error. */
export function errorMessage(err: unknown, fallback = '操作失败'): string {
  const e = err as { response?: { data?: { error?: string } }; message?: string };
  return e?.response?.data?.error || e?.message || fallback;
}

export function useFeedback() {
  return { toast, confirm };
}
