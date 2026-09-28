<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useAuthStore } from '../stores/use-auth-store';
import { User, Mail, Lock, Check, Loader2, Palette, Sun, Moon, IdCard } from 'lucide-vue-next';
import { useFeedback } from '../composables/useFeedback';
import { useTheme } from '../composables/useTheme';
import PageHeader from '../components/common/PageHeader.vue';
import PasswordInput from '../components/auth/PasswordInput.vue';

const authStore = useAuthStore();
const { toast } = useFeedback();
const { theme, setTheme } = useTheme();

const username = ref('');
const email = ref('');
const oldPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');

const savingName = ref(false);
const savingEmail = ref(false);
const savingPwd = ref(false);
const pwdError = ref('');

onMounted(() => {
  username.value = authStore.user?.username || '';
  email.value = authStore.user?.email || '';
});

async function handleUpdateUsername() {
  savingName.value = true;
  try {
    await authStore.updateUsername(username.value);
    toast.success('用户名已保存');
  } catch (err: any) {
    toast.error(err.response?.data?.error || '修改失败');
  } finally {
    savingName.value = false;
  }
}

async function handleUpdateEmail() {
  savingEmail.value = true;
  try {
    await authStore.updateEmail(email.value);
    toast.success('邮箱已保存');
  } catch (err: any) {
    toast.error(err.response?.data?.error || '修改失败');
  } finally {
    savingEmail.value = false;
  }
}

async function handleChangePassword() {
  pwdError.value = '';
  if (newPassword.value !== confirmPassword.value) {
    pwdError.value = '两次密码不一致';
    return;
  }
  if ([...newPassword.value].length < 6) {
    pwdError.value = '新密码至少6个字符';
    return;
  }
  savingPwd.value = true;
  try {
    await authStore.changePassword(oldPassword.value, newPassword.value);
    toast.success('密码已修改');
    oldPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
  } catch (err: any) {
    pwdError.value = err.response?.data?.error || '修改失败';
  } finally {
    savingPwd.value = false;
  }
}
</script>

<template>
  <div class="page page-narrow settings-page">
    <PageHeader title="个人设置" subtitle="管理账号资料、安全与外观偏好" />

    <!-- Profile -->
    <section class="card section">
      <div class="section-head">
        <div class="section-icon"><User :size="18" /></div>
        <div>
          <h2 class="section-name">账号资料</h2>
          <p class="section-desc">用户名会显示在对话与页面顶部</p>
        </div>
      </div>

      <form @submit.prevent="handleUpdateUsername" class="row-form">
        <div class="form-group grow">
          <label for="st-username">用户名</label>
          <input id="st-username" v-model="username" class="input" placeholder="用户名" required />
        </div>
        <button type="submit" class="btn btn-secondary" :disabled="savingName">
          <Loader2 v-if="savingName" :size="15" class="spin" />
          <Check v-else :size="15" />
          保存
        </button>
      </form>

      <form @submit.prevent="handleUpdateEmail" class="row-form">
        <div class="form-group grow">
          <label for="st-email"><Mail :size="13" class="lbl-icon" /> 邮箱</label>
          <input id="st-email" v-model="email" type="email" class="input" placeholder="邮箱" required />
        </div>
        <button type="submit" class="btn btn-secondary" :disabled="savingEmail">
          <Loader2 v-if="savingEmail" :size="15" class="spin" />
          <Check v-else :size="15" />
          保存
        </button>
      </form>
    </section>

    <!-- Password -->
    <section class="card section">
      <div class="section-head">
        <div class="section-icon"><Lock :size="18" /></div>
        <div>
          <h2 class="section-name">修改密码</h2>
          <p class="section-desc">建议定期更换，密码至少 6 个字符</p>
        </div>
      </div>

      <form @submit.prevent="handleChangePassword" class="pwd-form">
        <div class="form-group full">
          <label for="st-old">原密码</label>
          <PasswordInput id="st-old" v-model="oldPassword" autocomplete="current-password" required />
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label for="st-new">新密码</label>
            <PasswordInput id="st-new" v-model="newPassword" placeholder="至少6个字符" autocomplete="new-password" required />
          </div>
          <div class="form-group">
            <label for="st-confirm">确认新密码</label>
            <PasswordInput id="st-confirm" v-model="confirmPassword" autocomplete="new-password" required />
          </div>
        </div>
        <div v-if="pwdError" class="alert alert-error">{{ pwdError }}</div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary" :disabled="savingPwd">
            <Loader2 v-if="savingPwd" :size="15" class="spin" />
            修改密码
          </button>
        </div>
      </form>
    </section>

    <!-- Appearance -->
    <section class="card section">
      <div class="section-head">
        <div class="section-icon"><Palette :size="18" /></div>
        <div>
          <h2 class="section-name">外观</h2>
          <p class="section-desc">选择界面主题，仅保存在当前浏览器</p>
        </div>
      </div>

      <div class="theme-options" role="radiogroup" aria-label="主题">
        <button
          type="button"
          class="theme-opt"
          :class="{ active: theme === 'light' }"
          role="radio"
          :aria-checked="theme === 'light'"
          @click="setTheme('light')"
        >
          <span class="theme-preview light"><span /><span /><span /></span>
          <span class="theme-label"><Sun :size="15" /> 宣纸 · 浅色</span>
        </button>
        <button
          type="button"
          class="theme-opt"
          :class="{ active: theme === 'dark' }"
          role="radio"
          :aria-checked="theme === 'dark'"
          @click="setTheme('dark')"
        >
          <span class="theme-preview dark"><span /><span /><span /></span>
          <span class="theme-label"><Moon :size="15" /> 夜墨 · 深色</span>
        </button>
      </div>
    </section>

    <!-- Account info -->
    <section class="card section">
      <div class="section-head">
        <div class="section-icon muted"><IdCard :size="18" /></div>
        <div>
          <h2 class="section-name">账号信息</h2>
        </div>
      </div>
      <dl class="info-grid">
        <dt>用户 ID</dt>
        <dd class="mono">{{ authStore.user?.userId }}</dd>
        <dt>角色</dt>
        <dd>
          <span class="badge" :class="authStore.user?.role === 'admin' ? 'badge-accent' : ''">
            {{ authStore.user?.role === 'admin' ? '管理员' : '用户' }}
          </span>
        </dd>
        <dt>注册时间</dt>
        <dd class="tabular">{{ authStore.user?.createdAt?.slice(0, 10) }}</dd>
        <dt>上次登录</dt>
        <dd class="tabular">{{ authStore.user?.lastLoginAt?.slice(0, 16).replace('T', ' ') }}</dd>
      </dl>
    </section>
  </div>
</template>

<style scoped>
.section { margin-bottom: var(--space-md); }
.section-head { display: flex; align-items: flex-start; gap: 12px; margin-bottom: var(--space-md); }
.section-icon {
  display: grid; place-items: center; flex-shrink: 0;
  width: 36px; height: 36px; border-radius: 10px;
  background: var(--color-accent-soft); color: var(--color-accent);
}
.section-icon.muted { background: var(--color-bg-tertiary); color: var(--color-text-secondary); }
.section-name { font-family: var(--font-serif); font-size: 1.05rem; font-weight: 700; line-height: 1.4; }
.section-desc { font-size: 0.8rem; color: var(--color-text-muted); }

.row-form { display: flex; align-items: flex-end; gap: var(--space-sm); }
.row-form + .row-form { margin-top: var(--space-md); }
.grow { flex: 1; min-width: 0; }
.lbl-icon { display: inline; vertical-align: -2px; }

.pwd-form { display: flex; flex-direction: column; gap: var(--space-md); }

/* Theme picker */
.theme-options { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md); }
.theme-opt {
  display: flex; flex-direction: column; gap: 10px;
  padding: 10px; border: 1.5px solid var(--color-border); border-radius: var(--radius-lg);
  background: var(--color-bg-secondary); color: var(--color-text-secondary);
  cursor: pointer; text-align: left;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}
.theme-opt:hover { border-color: var(--color-border-strong); }
.theme-opt.active { border-color: var(--color-accent); box-shadow: var(--focus-ring); color: var(--color-text-primary); }
.theme-preview {
  display: grid; grid-template-columns: 1fr 2fr; grid-template-rows: 1fr 1fr; gap: 5px;
  height: 64px; padding: 6px; border-radius: var(--radius-md);
}
.theme-preview span { border-radius: 4px; }
.theme-preview span:first-child { grid-row: span 2; }
/* Fixed palettes: previews must show the *other* theme regardless of the active one */
.theme-preview.light { background: #f6f3ee; border: 1px solid #e3ddd3; }
.theme-preview.light span { background: #fffdf9; border: 1px solid #e3ddd3; }
.theme-preview.light span:nth-child(2) { background: #8b5e3c; border: none; }
.theme-preview.dark { background: #101217; border: 1px solid #2b303a; }
.theme-preview.dark span { background: #171a21; border: 1px solid #2b303a; }
.theme-preview.dark span:nth-child(2) { background: #d2a86a; border: none; }
.theme-label { display: flex; align-items: center; gap: 6px; font-size: 0.86rem; font-weight: 500; }

/* Info */
.info-grid {
  display: grid; grid-template-columns: auto 1fr; gap: 10px var(--space-lg);
  font-size: 0.86rem; align-items: center;
}
.info-grid dt { color: var(--color-text-muted); }
.info-grid dd { color: var(--color-text-primary); min-width: 0; overflow-wrap: anywhere; }
.mono { font-family: var(--font-mono); font-size: 0.82rem; }

@media (max-width: 640px) {
  .row-form { flex-direction: column; align-items: stretch; }
  .form-actions .btn { width: 100%; }
  .theme-options { gap: var(--space-sm); }
}
</style>
