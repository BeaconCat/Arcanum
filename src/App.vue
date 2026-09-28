<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from './stores/use-auth-store';
import { useTheme } from './composables/useTheme';
import AppHeader from './components/common/AppHeader.vue';
import AppSidebar from './components/common/AppSidebar.vue';
import AppFeedback from './components/common/AppFeedback.vue';

const authStore = useAuthStore();
const route = useRoute();
const sidebarOpen = ref(false);
useTheme();

// Guest routes (login/register/forgot/reset) always use fullscreen auth layout
const showAppLayout = computed(() => authStore.isLoggedIn && !route.meta.guest);
const fullHeight = computed(() => !!route.meta.fullHeight);

// Close sidebar on route change (mobile)
watch(() => route.path, () => {
  sidebarOpen.value = false;
});

onMounted(() => {
  authStore.tryRefresh();
});
</script>

<template>
  <div class="app-layout" v-if="showAppLayout">
    <div
      class="sidebar-overlay"
      :class="{ visible: sidebarOpen }"
      @click="sidebarOpen = false"
    />
    <AppSidebar class="app-sidebar" :class="{ open: sidebarOpen }" @navigate="sidebarOpen = false" />
    <div class="app-main">
      <AppHeader @toggle-sidebar="sidebarOpen = !sidebarOpen" />
      <main class="app-content" :class="{ 'full-height': fullHeight }">
        <router-view v-slot="{ Component, route: r }">
          <Transition name="page" appear>
            <component :is="Component" :key="r.path" />
          </Transition>
        </router-view>
      </main>
    </div>
  </div>
  <div v-else class="auth-layout">
    <router-view />
  </div>
  <AppFeedback />
</template>

<style scoped>
.app-layout {
  display: flex;
  min-height: 100vh;
  min-height: 100dvh;
}

.app-sidebar {
  width: var(--sidebar-width);
  flex-shrink: 0;
}

.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.app-content {
  flex: 1;
  padding: var(--space-lg) var(--space-xl) var(--space-2xl);
  min-width: 0;
}

/* Pages like chat fill the viewport below the header and manage their own scrolling */
.app-content.full-height {
  /* flex:none — with flex:1 the basis (0) wins over height and the column grows to fit content */
  flex: none;
  height: calc(100dvh - var(--header-height));
  padding-bottom: var(--space-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.app-content.full-height > * { flex: 1; min-height: 0; }

.auth-layout {
  min-height: 100vh;
  min-height: 100dvh;
}

.sidebar-overlay { display: none; }

@media (max-width: 1024px) {
  .app-content { padding: var(--space-lg); }
}

@media (max-width: 768px) {
  .app-sidebar {
    position: fixed;
    top: 0;
    left: 0;
    z-index: var(--z-drawer);
    transform: translateX(-100%);
    transition: transform var(--transition-normal);
    box-shadow: none;
  }
  .app-sidebar.open {
    transform: translateX(0);
    box-shadow: var(--shadow-lg);
  }

  .sidebar-overlay {
    display: block;
    position: fixed;
    inset: 0;
    background: var(--color-overlay);
    z-index: calc(var(--z-drawer) - 1);
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--transition-normal);
  }
  .sidebar-overlay.visible {
    opacity: 1;
    pointer-events: auto;
  }

  .app-content { padding: var(--space-md) var(--space-md) var(--space-xl); }
  .app-content.full-height { padding: var(--space-sm) var(--space-sm) var(--space-sm); }
}
</style>
