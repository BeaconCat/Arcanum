<script setup lang="ts">
import { ref } from 'vue';
import { Loader2, MailCheck } from 'lucide-vue-next';
import { apiForgotPassword } from '../api/auth.api';
import AuthShell from '../components/auth/AuthShell.vue';

const email = ref('');
const sent = ref(false);
const error = ref('');
const loading = ref(false);

async function handleSubmit() {
  error.value = '';
  loading.value = true;
  try {
    await apiForgotPassword(email.value);
    sent.value = true;
  } catch (err: any) {
    error.value = err.response?.data?.error || '发送失败';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AuthShell subtitle="找回密码">
    <div v-if="sent" class="sent-state">
      <div class="sent-icon"><MailCheck :size="26" /></div>
      <h3>请查收邮件</h3>
      <p>如果 <strong>{{ email }}</strong> 已注册，重置链接已发送到该邮箱。</p>
      <p class="text-muted">没收到？请检查垃圾邮件箱，或稍后重试。</p>
      <router-link to="/login" class="btn btn-secondary btn-block">返回登录</router-link>
    </div>

    <form v-else @submit.prevent="handleSubmit" class="auth-form">
      <p class="lead">输入注册时使用的邮箱，我们会发送一封重置密码的邮件。</p>
      <div class="form-group">
        <label for="fp-email">注册邮箱</label>
        <input id="fp-email" v-model="email" type="email" class="input" placeholder="you@example.com" autocomplete="email" required autofocus />
      </div>

      <div v-if="error" class="alert alert-error">{{ error }}</div>

      <button type="submit" class="btn btn-primary btn-lg btn-block" :disabled="loading">
        <Loader2 v-if="loading" :size="18" class="spin" />
        {{ loading ? '发送中…' : '发送重置链接' }}
      </button>
    </form>

    <template #footer>
      想起来了？<router-link to="/login">返回登录</router-link>
    </template>
  </AuthShell>
</template>

<style scoped>
.lead { font-size: 0.86rem; line-height: 1.7; color: var(--color-text-secondary); }
.sent-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
  text-align: center;
  font-size: 0.88rem;
  line-height: 1.7;
  color: var(--color-text-secondary);
}
.sent-state h3 { font-size: 1.1rem; color: var(--color-text-primary); }
.sent-state strong { color: var(--color-text-primary); word-break: break-all; }
.sent-state .btn { margin-top: var(--space-sm); }
.sent-icon {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--color-success-soft);
  color: var(--color-success);
}
</style>
