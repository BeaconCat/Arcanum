import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import type { UserInfo } from '../../shared/types/auth.types';
import { apiLogin, apiRegister, apiLogout, apiRefresh, apiChangePassword, apiUpdateEmail, apiUpdateUsername } from '../api/auth.api';

const STORAGE_KEY = 'arcanum_user';

function loadCachedUser(): UserInfo | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const useAuthStore = defineStore('auth', () => {
  // Hydrate from localStorage immediately so router guard sees cached user
  const user = ref<UserInfo | null>(loadCachedUser());

  const isLoggedIn = computed(() => !!user.value);
  const isAdmin = computed(() => user.value?.role === 'admin');

  // Keep localStorage in sync
  watch(user, (val) => {
    if (val) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(val));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, { deep: true });

  // Ready promise: resolved after the first tryRefresh attempt
  let resolveReady: () => void;
  const ready = new Promise<void>((r) => { resolveReady = r; });

  async function login(username: string, password: string) {
    user.value = await apiLogin(username, password);
  }

  async function register(username: string, email: string, password: string, regCode?: string) {
    user.value = await apiRegister(username, email, password, regCode);
  }

  async function logout() {
    await apiLogout();
    user.value = null;
  }

  async function tryRefresh() {
    try {
      user.value = await apiRefresh();
    } catch {
      user.value = null;
    } finally {
      resolveReady!();
    }
  }

  async function changePassword(oldPassword: string, newPassword: string, newUsername?: string) {
    user.value = await apiChangePassword(oldPassword, newPassword, newUsername);
  }

  async function updateEmailAction(email: string) {
    user.value = await apiUpdateEmail(email);
  }

  async function updateUsernameAction(username: string) {
    user.value = await apiUpdateUsername(username);
  }

  return { user, isLoggedIn, isAdmin, ready, login, register, logout, tryRefresh, changePassword, updateEmail: updateEmailAction, updateUsername: updateUsernameAction };
});
