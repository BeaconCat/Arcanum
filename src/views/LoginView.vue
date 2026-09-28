<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { Loader2 } from 'lucide-vue-next';
import { useAuthStore } from '../stores/use-auth-store';
import AuthShell from '../components/auth/AuthShell.vue';
import PasswordInput from '../components/auth/PasswordInput.vue';

const router = useRouter();
const authStore = useAuthStore();

const username = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

async function handleLogin() {
  error.value = '';
  loading.value = true;
  try {
    await authStore.login(username.value, password.value);
    router.push('/');
  } catch (err: any) {
    error.value = err.response?.data?.error || '登录失败';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AuthShell subtitle="观星问命，知时而行">
    <form @submit.prevent="handleLogin" class="auth-form">
      <div class="form-group">
        <label for="login-username">用户名</label>
        <input
          id="login-username"
          v-model="username"
          class="input"
          placeholder="请输入用户名"
          autocomplete="username"
          required
          autofocus
        />
      </div>

      <div class="form-group">
        <label for="login-password">密码</label>
        <PasswordInput
          id="login-password"
          v-model="password"
          placeholder="请输入密码"
          autocomplete="current-password"
          required
        />
      </div>

      <div class="auth-row">
        <span />
        <router-link to="/forgot-password">忘记密码？</router-link>
      </div>

      <div v-if="error" class="alert alert-error">{{ error }}</div>

      <button type="submit" class="btn btn-primary btn-lg btn-block" :disabled="loading">
        <Loader2 v-if="loading" :size="18" class="spin" />
        {{ loading ? '登录中…' : '登录' }}
      </button>
    </form>

    <template #footer>
      还没有账号？<router-link to="/register">凭注册码注册</router-link>
    </template>
  </AuthShell>
</template>
