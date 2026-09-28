import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/use-auth-store';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: () => import('../views/LoginView.vue'),
      meta: { title: '登录', guest: true },
    },
    {
      path: '/register',
      name: 'Register',
      component: () => import('../views/RegisterView.vue'),
      meta: { title: '注册', guest: true },
    },
    {
      path: '/forgot-password',
      name: 'ForgotPassword',
      component: () => import('../views/ForgotPasswordView.vue'),
      meta: { title: '找回密码', guest: true },
    },
    {
      path: '/reset-password',
      name: 'ResetPassword',
      component: () => import('../views/ResetPasswordView.vue'),
      meta: { title: '重置密码', guest: true },
    },
    {
      path: '/',
      name: 'Dashboard',
      component: () => import('../views/DashboardView.vue'),
      meta: { title: '仪表盘', auth: true },
    },
    {
      path: '/profile',
      name: 'Profile',
      component: () => import('../views/ProfileView.vue'),
      meta: { title: '命盘档案', auth: true },
    },
    {
      path: '/profile/:profileId/natal',
      name: 'NatalDetail',
      component: () => import('../views/NatalDetailView.vue'),
      meta: { title: '本命详解', auth: true },
      props: true,
    },
    {
      path: '/astro',
      name: 'Astro',
      component: () => import('../views/AstroView.vue'),
      meta: { title: '星盘', auth: true },
    },
    {
      path: '/astro/map',
      name: 'AstroMap',
      component: () => import('../views/AstroMapView.vue'),
      meta: { title: '地理占星', auth: true },
    },
    {
      path: '/tarot',
      name: 'Tarot',
      component: () => import('../views/TarotView.vue'),
      meta: { title: '塔罗', auth: true },
    },
    {
      path: '/calendar',
      name: 'Calendar',
      component: () => import('../views/CalendarView.vue'),
      meta: { title: '运势月历', auth: true },
    },
    {
      path: '/calendar/:date',
      name: 'DailyDetail',
      component: () => import('../views/DailyDetailView.vue'),
      meta: { title: '每日详解', auth: true },
      props: true,
    },
    {
      path: '/charts',
      name: 'Charts',
      component: () => import('../views/ChartView.vue'),
      meta: { title: '趋势图', auth: true },
    },
    {
      path: '/chat',
      name: 'Chat',
      component: () => import('../views/ChatView.vue'),
      meta: { title: 'AI 对话', fullHeight: true, auth: true },
    },
    {
      path: '/settings',
      name: 'Settings',
      component: () => import('../views/SettingsView.vue'),
      meta: { title: '个人设置', auth: true },
    },
    {
      path: '/admin',
      name: 'Admin',
      component: () => import('../views/AdminView.vue'),
      meta: { title: '管理后台', auth: true, admin: true },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior(_to, _from, saved) {
    return saved || { top: 0 };
  },
});

router.beforeEach(async (to) => {
  const authStore = useAuthStore();

  // Wait for the initial token refresh to settle before making auth decisions
  await authStore.ready;

  if (to.meta.auth && !authStore.isLoggedIn) {
    return { name: 'Login' };
  }

  if (to.meta.guest && authStore.isLoggedIn) {
    return { name: 'Dashboard' };
  }

  if (to.meta.admin && authStore.user?.role !== 'admin') {
    return { name: 'Dashboard' };
  }

  // Force password change for admin — only allow Dashboard (which shows modal)
  if (
    authStore.user?.forcePasswordChange &&
    to.name !== 'Dashboard'
  ) {
    return { name: 'Dashboard' };
  }
});

router.afterEach((to) => {
  const title = to.meta.title as string | undefined;
  document.title = title ? `${title} · 天枢 Arcanum` : '天枢 Arcanum';
});

export default router;
