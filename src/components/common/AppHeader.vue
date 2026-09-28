<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/use-auth-store';
import { useProfileStore } from '../../stores/use-profile-store';
import { useTheme } from '../../composables/useTheme';
import { Sun, Moon, LogOut, Menu, Settings, ChevronDown, Check, Users } from 'lucide-vue-next';

const emit = defineEmits<{ 'toggle-sidebar': [] }>();

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const profileStore = useProfileStore();
const { theme, toggleTheme } = useTheme();

const pageTitle = computed(() => (route.meta.title as string) || '');
const userInitial = computed(() => (authStore.user?.username || '?').slice(0, 1).toUpperCase());

// ── Dropdowns ──
const openMenu = ref<'profile' | 'user' | null>(null);
function toggleMenu(m: 'profile' | 'user') {
  openMenu.value = openMenu.value === m ? null : m;
}
function onDocClick(e: MouseEvent) {
  if (!(e.target as HTMLElement).closest('.hd-menu-wrap')) openMenu.value = null;
}
document.addEventListener('click', onDocClick);
onBeforeUnmount(() => document.removeEventListener('click', onDocClick));

onMounted(() => {
  if (!profileStore.profiles.length) profileStore.loadProfiles().catch(() => {});
});

function pickProfile(id: string) {
  profileStore.switchProfile(id);
  openMenu.value = null;
}

async function handleLogout() {
  openMenu.value = null;
  await authStore.logout();
  window.location.href = '/login';
}

function goSettings() {
  openMenu.value = null;
  router.push('/settings');
}
</script>

<template>
  <header class="app-header">
    <div class="header-left">
      <button class="btn-icon mobile-menu-btn" @click="emit('toggle-sidebar')" aria-label="打开菜单">
        <Menu :size="20" />
      </button>
      <span class="hd-title">{{ pageTitle }}</span>
    </div>

    <div class="header-actions">
      <!-- Profile switcher -->
      <div v-if="profileStore.profiles.length > 0" class="hd-menu-wrap">
        <button
          class="profile-pill"
          :class="{ open: openMenu === 'profile' }"
          @click="toggleMenu('profile')"
          :aria-expanded="openMenu === 'profile'"
          title="切换命主"
        >
          <Users :size="15" class="pp-icon" />
          <span class="pp-label">命主</span>
          <span class="pp-name">{{ profileStore.currentProfile?.name || '未选择' }}</span>
          <ChevronDown :size="14" class="pp-chevron" />
        </button>
        <Transition name="dropdown">
          <div v-if="openMenu === 'profile'" class="hd-dropdown profile-dropdown">
            <div class="dd-label">切换命主档案</div>
            <button
              v-for="p in profileStore.profiles"
              :key="p.profileId"
              class="dd-item"
              :class="{ active: p.profileId === profileStore.currentProfileId }"
              @click="pickProfile(p.profileId)"
            >
              <span class="dd-avatar" :class="p.gender">{{ p.name.slice(0, 1) }}</span>
              <span class="dd-text">
                <span class="dd-name">{{ p.name }}<span v-if="p.isPrimary" class="badge badge-accent">主</span></span>
                <span class="dd-meta">{{ p.relation }} · {{ p.birthDate }}</span>
              </span>
              <Check v-if="p.profileId === profileStore.currentProfileId" :size="15" class="dd-check" />
            </button>
          </div>
        </Transition>
      </div>

      <button class="btn-icon" @click="toggleTheme" :aria-label="theme === 'dark' ? '切换浅色' : '切换深色'" :title="theme === 'dark' ? '切换浅色' : '切换深色'">
        <Sun v-if="theme === 'dark'" :size="18" />
        <Moon v-else :size="18" />
      </button>

      <!-- User menu -->
      <div class="hd-menu-wrap">
        <button class="user-btn" @click="toggleMenu('user')" :aria-expanded="openMenu === 'user'" aria-label="用户菜单">
          <span class="user-avatar">{{ userInitial }}</span>
          <span class="user-name">{{ authStore.user?.username }}</span>
        </button>
        <Transition name="dropdown">
          <div v-if="openMenu === 'user'" class="hd-dropdown user-dropdown">
            <div class="dd-user">
              <span class="user-avatar lg">{{ userInitial }}</span>
              <div class="dd-text">
                <span class="dd-name">{{ authStore.user?.username }}</span>
                <span class="dd-meta">{{ authStore.user?.email }}</span>
              </div>
            </div>
            <button class="dd-item" @click="goSettings"><Settings :size="16" /> 个人设置</button>
            <button class="dd-item danger" @click="handleLogout"><LogOut :size="16" /> 退出登录</button>
          </div>
        </Transition>
      </div>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  height: var(--header-height);
  padding: 0 var(--space-xl);
  border-bottom: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg-primary) 82%, transparent);
  backdrop-filter: saturate(1.4) blur(10px);
}

.header-left { display: flex; align-items: center; gap: var(--space-sm); min-width: 0; }
.mobile-menu-btn { display: none; }
.hd-title {
  font-family: var(--font-serif);
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.header-actions { display: flex; align-items: center; gap: 6px; }

/* Profile pill */
.hd-menu-wrap { position: relative; }
.profile-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  max-width: 240px;
  padding: 0 10px 0 12px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-full);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  font-size: 0.85rem;
  cursor: pointer;
  transition: border-color var(--transition-fast), background var(--transition-fast);
}
.profile-pill:hover, .profile-pill.open { border-color: var(--color-accent); }
.pp-icon { color: var(--color-accent); flex-shrink: 0; }
.pp-label { color: var(--color-text-muted); font-size: 0.78rem; }
.pp-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pp-chevron { color: var(--color-text-muted); flex-shrink: 0; transition: transform var(--transition-fast); }
.profile-pill.open .pp-chevron { transform: rotate(180deg); }

/* User button */
.user-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 10px 0 4px;
  border: none;
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 0.88rem;
  cursor: pointer;
}
.user-btn:hover { background: var(--color-bg-tertiary); color: var(--color-text-primary); }
.user-avatar {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font-family: var(--font-serif);
  font-size: 0.85rem;
  font-weight: 700;
  flex-shrink: 0;
}
.user-avatar.lg { width: 38px; height: 38px; font-size: 1.05rem; }
.user-name { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Dropdowns */
.hd-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 60;
  min-width: 220px;
  padding: 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-elevated);
  box-shadow: var(--shadow-lg);
}
.profile-dropdown { width: 280px; max-height: 60vh; overflow-y: auto; }
.dd-label { padding: 6px 10px 6px; font-size: 0.72rem; letter-spacing: 0.08em; color: var(--color-text-muted); }
.dd-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text-primary);
  font-size: 0.88rem;
  text-align: left;
  cursor: pointer;
}
.dd-item:hover { background: var(--color-bg-tertiary); }
.dd-item.active { background: var(--color-accent-soft); }
.dd-item.danger { color: var(--color-error); }
.dd-item.danger:hover { background: var(--color-error-soft); }
.dd-avatar {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  flex-shrink: 0;
  font-family: var(--font-serif);
  font-weight: 700;
  font-size: 0.85rem;
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}
.dd-avatar.male { background: var(--color-info-soft); color: var(--color-info); }
.dd-avatar.female { background: var(--color-error-soft); color: var(--color-error); }
.dd-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.dd-name { display: flex; align-items: center; gap: 6px; font-weight: 600; font-size: 0.88rem; }
.dd-meta { font-size: 0.74rem; color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dd-check { color: var(--color-accent); flex-shrink: 0; }
.dd-user {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px 12px;
  margin-bottom: 4px;
  border-bottom: 1px solid var(--color-border);
}

.dropdown-enter-active, .dropdown-leave-active { transition: opacity 140ms ease, transform 160ms ease; }
.dropdown-enter-from, .dropdown-leave-to { opacity: 0; transform: translateY(-4px); }

@media (max-width: 768px) {
  .app-header { padding: 0 var(--space-sm) 0 var(--space-xs); }
  .mobile-menu-btn { display: inline-flex; }
  .pp-label { display: none; }
  .profile-pill { max-width: 150px; }
  .user-name { display: none; }
  .user-btn { padding: 0 4px; }
}
@media (max-width: 420px) {
  .hd-title { display: none; }
}
</style>
