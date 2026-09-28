<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Loader2, LinkIcon } from 'lucide-vue-next';
import { apiResetPassword } from '../api/auth.api';
import { useFeedback } from '../composables/useFeedback';
import AuthShell from '../components/auth/AuthShell.vue';
import PasswordInput from '../components/auth/PasswordInput.vue';

const route = useRoute();
const router = useRouter();
const { toast } = useFeedback();

const newPassword = ref('');
const confirmPassword = ref('');
const error = ref('');
const loading = ref(false);

const token = (route.query.token as string) || '';

async function handleSubmit() {
  error.value = '';
  if (newPassword.value !== confirmPassword.value) {
    error.value = '两次密码不一致';
    return;
  }
  loading.value = true;
  try {
    await apiResetPassword(token, newPassword.value);
    toast.success('密码已重置，请使用新密码登录');
    router.push('/login');
  } catch (err: any) {
    error.value = err.response?.data?.error || '重置失败';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AuthShell subtitle="设置新密码">
    <div v-if="!token" class="invalid-state">
      <div class="invalid-icon"><LinkIcon :size="24" /></div>
      <h3>链接无效</h3>
      <p>重置链接缺少凭证或已失效，请重新申请找回密码。</p>
      <router-link to="/forgot-password" class="btn btn-primary btn-block">重新发送重置邮件</router-link>
    </div>

    <form v-else @submit.prevent="handleSubmit" class="auth-form">
      <div class="form-group">
        <label for="rp-new">新密码</label>
        <PasswordInput id="rp-new" v-model="newPassword" placeholder="至少 6 个字符" autocomplete="new-password" required autofocus />
      </div>
      <div class="form-group">
        <label for="rp-confirm">确认新密码</label>
        <PasswordInput id="rp-confirm" v-model="confirmPassword" placeholder="再次输入新密码" autocomplete="new-password" required />
      </div>

      <div v-if="error" class="alert alert-error">{{ error }}</div>

      <button type="submit" class="btn btn-primary btn-lg btn-block" :disabled="loading">
        <Loader2 v-if="loading" :size="18" class="spin" />
        {{ loading ? '重置中…' : '重置密码' }}
      </button>
    </form>

    <template #footer>
      <router-link to="/login">返回登录</router-link>
    </template>
  </AuthShell>
</template>

<style scoped>
.invalid-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
  text-align: center;
  font-size: 0.88rem;
  line-height: 1.7;
  color: var(--color-text-secondary);
}
.invalid-state h3 { font-size: 1.1rem; color: var(--color-text-primary); }
.invalid-state .btn { margin-top: var(--space-sm); }
.invalid-icon {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--color-warning-soft);
  color: var(--color-warning);
}
</style>
