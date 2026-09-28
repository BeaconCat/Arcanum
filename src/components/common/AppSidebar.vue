<script setup lang="ts">
import { useRoute } from 'vue-router';
import { useAuthStore } from '../../stores/use-auth-store';
import { useChatStore } from '../../stores/use-chat-store';
import { LayoutDashboard, CalendarDays, UserCircle, LineChart, MessageSquare, Shield, Settings, Orbit, Layers, Map as MapIcon } from 'lucide-vue-next';
import BrandMark from './BrandMark.vue';

const emit = defineEmits<{ navigate: [] }>();

const route = useRoute();
const authStore = useAuthStore();
const chatStore = useChatStore();

const mainNav = [
  { path: '/', label: '仪表盘', icon: LayoutDashboard },
  { path: '/chat', label: 'AI 对话', icon: MessageSquare },
  { path: '/profile', label: '命盘档案', icon: UserCircle },
  { path: '/astro', label: '星盘', icon: Orbit },
  { path: '/astro/map', label: '地理占星', icon: MapIcon },
  { path: '/tarot', label: '塔罗', icon: Layers },
  { path: '/calendar', label: '运势月历', icon: CalendarDays },
  { path: '/charts', label: '趋势图', icon: LineChart },
];

function matches(path: string) {
  if (path === '/') return route.path === '/';
  return route.path === path || route.path.startsWith(`${path}/`);
}

// Only the most specific matching entry is active (/astro/map shouldn't also light up /astro)
function isActive(path: string) {
  if (!matches(path)) return false;
  return !mainNav.some((n) => n.path.length > path.length && n.path.startsWith(path) && matches(n.path));
}
</script>

<template>
  <nav class="sidebar" aria-label="主导航">
    <router-link to="/" class="sidebar-brand" @click="emit('navigate')">
      <BrandMark :size="38" />
      <div class="brand-text">
        <span class="brand-name">天枢</span>
        <span class="brand-sub">Arcanum</span>
      </div>
    </router-link>

    <div class="nav-group">
      <div class="nav-group-label">导航</div>
      <router-link
        v-for="item in mainNav"
        :key="item.path"
        :to="item.path"
        class="nav-item"
        :class="{ active: isActive(item.path) }"
        @click="emit('navigate')"
      >
        <component :is="item.icon" :size="18" />
        <span>{{ item.label }}</span>
        <span
          v-if="item.path === '/chat' && chatStore.runningCount"
          class="nav-live"
          :title="`${chatStore.runningCount} 个对话正在回复`"
          aria-label="有对话正在回复"
        />
      </router-link>
    </div>

    <div class="nav-group nav-bottom">
      <div class="nav-group-label">账户</div>
      <router-link to="/settings" class="nav-item" :class="{ active: isActive('/settings') }" @click="emit('navigate')">
        <Settings :size="18" />
        <span>个人设置</span>
      </router-link>
      <router-link
        v-if="authStore.isAdmin"
        to="/admin"
        class="nav-item"
        :class="{ active: isActive('/admin') }"
        @click="emit('navigate')"
      >
        <Shield :size="18" />
        <span>管理后台</span>
      </router-link>
    </div>

    <div class="sidebar-foot">
      <span class="foot-star">✦</span> 观星问命，知时而行
    </div>
  </nav>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  position: sticky;
  top: 0;
  padding: 18px 12px 14px;
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border);
  overflow-y: auto;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 8px 20px;
  margin-bottom: 6px;
  border-bottom: 1px solid var(--color-border);
}
.brand-text { display: flex; flex-direction: column; line-height: 1.1; }
.brand-name {
  font-family: var(--font-serif);
  font-size: 1.4rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--color-text-primary);
}
.brand-sub {
  margin-top: 3px;
  font-size: 0.66rem;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.nav-group { display: flex; flex-direction: column; gap: 2px; padding-top: 14px; }
.nav-bottom { margin-top: auto; }
.nav-group-label {
  padding: 0 12px 6px;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.16em;
  color: var(--color-text-muted);
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  height: 40px;
  padding: 0 12px;
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-size: 0.92rem;
  transition: background var(--transition-fast), color var(--transition-fast);
}
.nav-live {
  margin-left: auto;
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-accent-soft);
  animation: nav-live-pulse 1.6s ease-in-out infinite;
}
@keyframes nav-live-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
@media (prefers-reduced-motion: reduce) { .nav-live { animation: none; } }
.nav-item:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}
.nav-item.active {
  background: var(--color-accent-soft);
  color: var(--color-accent);
  font-weight: 600;
}
.nav-item.active::before {
  content: '';
  position: absolute;
  left: -12px;
  top: 9px;
  bottom: 9px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--color-accent);
}

.sidebar-foot {
  margin-top: 14px;
  padding: 12px 12px 0;
  border-top: 1px solid var(--color-border);
  font-family: var(--font-serif);
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  color: var(--color-text-muted);
}
.foot-star { color: var(--color-gold); }
</style>
