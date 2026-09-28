<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { Loader2, KeyRound } from 'lucide-vue-next';
import { useAuthStore } from '../stores/use-auth-store';
import AuthShell from '../components/auth/AuthShell.vue';
import PasswordInput from '../components/auth/PasswordInput.vue';

const router = useRouter();
const authStore = useAuthStore();

const username = ref('');
const email = ref('');
const password = ref('');
const confirmPassword = ref('');
const regCode = ref('');
const error = ref('');
const loading = ref(false);

async function handleRegister() {
  error.value = '';

  if (password.value !== confirmPassword.value) {
    error.value = '两次密码不一致';
    return;
  }

  loading.value = true;
  try {
    await authStore.register(username.value, email.value, password.value, regCode.value);
    router.push('/');
  } catch (err: any) {
    error.value = err.response?.data?.error || '注册失败';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AuthShell subtitle="创建账号 · 邀请制注册">
    <form @submit.prevent="handleRegister" class="auth-form">
      <div class="form-group">
        <label for="reg-code">注册码</label>
        <div class="code-wrap">
          <KeyRound :size="16" class="code-icon" />
          <input id="reg-code" v-model="regCode" class="input code-input" placeholder="ARC-XXXXXXXX" autocomplete="off" required />
        </div>
      </div>

      <div class="form-group">
        <label for="reg-username">用户名</label>
        <input id="reg-username" v-model="username" class="input" placeholder="支持中文，2-20 字符" autocomplete="username" required />
      </div>

      <div class="form-group">
        <label for="reg-email">邮箱</label>
        <input id="reg-email" v-model="email" type="email" class="input" placeholder="用于找回密码" autocomplete="email" required />
      </div>

      <div class="form-group">
        <label for="reg-password">密码</label>
        <PasswordInput id="reg-password" v-model="password" placeholder="至少 6 个字符" autocomplete="new-password" required />
      </div>

      <div class="form-group">
        <label for="reg-confirm">确认密码</label>
        <PasswordInput id="reg-confirm" v-model="confirmPassword" placeholder="再次输入密码" autocomplete="new-password" required />
      </div>

      <div v-if="error" class="alert alert-error">{{ error }}</div>

      <button type="submit" class="btn btn-primary btn-lg btn-block" :disabled="loading">
        <Loader2 v-if="loading" :size="18" class="spin" />
        {{ loading ? '注册中…' : '注册' }}
      </button>
    </form>

    <template #footer>
      已有账号？<router-link to="/login">去登录</router-link>
    </template>
  </AuthShell>
</template>

<style scoped>
.code-wrap { position: relative; }
.code-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-accent);
  pointer-events: none;
}
.code-input {
  padding-left: 36px;
  font-family: var(--font-mono);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.code-input::placeholder { text-transform: none; letter-spacing: 0.04em; }
</style>
