<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/use-auth-store';
import { useProfileStore } from '../stores/use-profile-store';
import {
  UserCircle, CalendarDays, LineChart, MessageSquare, ArrowRight, Sparkles,
  ThumbsUp, ThumbsDown, Loader2, ShieldAlert,
} from 'lucide-vue-next';
import { apiGetMonthlyCalendar } from '../api/fortune.api';
import type { DailyFortune } from '../../shared/types/fortune.types';
import { SCORE_DIMENSIONS } from '../../shared/constants/score-dimensions';
import { ratingToLevel, localDateStr } from '../utils/fortune';
import { useFeedback } from '../composables/useFeedback';
import ScoreRing from '../components/common/ScoreRing.vue';
import EmptyState from '../components/common/EmptyState.vue';
import AppModal from '../components/common/AppModal.vue';
import PasswordInput from '../components/auth/PasswordInput.vue';

const router = useRouter();
const authStore = useAuthStore();
const profileStore = useProfileStore();
const { toast } = useFeedback();

const showForceChange = ref(false);
const oldPassword = ref('');
const newPassword = ref('');
const newUsername = ref('');
const changeError = ref('');
const changing = ref(false);

const todayFortune = ref<DailyFortune | null>(null);
const fortuneLoading = ref(false);
const profilesLoaded = ref(false);

const now = new Date();
const todayStr = localDateStr(now);
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const dateLabel = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 · 星期${WEEKDAYS[now.getDay()]}`;

const greeting = computed(() => {
  const h = new Date().getHours();
  if (h < 5) return '夜深了';
  if (h < 9) return '早上好';
  if (h < 12) return '上午好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
});

const level = computed(() => ratingToLevel(todayFortune.value?.rating));

const dimensions = computed(() => {
  const d = todayFortune.value?.dimensions;
  if (!d) return [];
  return (Object.keys(SCORE_DIMENSIONS) as (keyof typeof SCORE_DIMENSIONS)[]).map((k) => ({
    key: k,
    label: SCORE_DIMENSIONS[k].replace('运', ''),
    value: Math.max(0, Math.min(100, Number(d[k]) || 0)),
  }));
});

const quickLinks = [
  { to: '/profile', icon: UserCircle, title: '命盘档案', desc: '八字 · 紫微排盘' },
  { to: '/calendar', icon: CalendarDays, title: '运势月历', desc: '逐日吉凶宜忌' },
  { to: '/charts', icon: LineChart, title: '趋势图', desc: '五维运势走势' },
];

async function loadTodayFortune() {
  const pid = profileStore.currentProfileId;
  if (!pid) return;
  fortuneLoading.value = true;
  try {
    const cal = await apiGetMonthlyCalendar(pid, now.getFullYear(), now.getMonth() + 1);
    todayFortune.value = cal?.days?.find((d) => d.date === todayStr) || null;
  } catch {
    todayFortune.value = null;
  } finally {
    fortuneLoading.value = false;
  }
}

watch(() => profileStore.currentProfileId, () => {
  todayFortune.value = null;
  loadTodayFortune();
});

onMounted(async () => {
  try {
    await profileStore.loadProfiles();
  } finally {
    profilesLoaded.value = true;
  }
  if (authStore.user?.forcePasswordChange) {
    showForceChange.value = true;
    return;
  }
  loadTodayFortune();
});

async function handleForceChange() {
  changeError.value = '';
  changing.value = true;
  try {
    await authStore.changePassword(oldPassword.value, newPassword.value, newUsername.value || undefined);
    showForceChange.value = false;
    toast.success('账号信息已更新');
    loadTodayFortune();
  } catch (err: any) {
    changeError.value = err.response?.data?.error || '修改失败';
  } finally {
    changing.value = false;
  }
}

function goToDaily() {
  router.push(`/calendar/${todayStr}`);
}
</script>

<template>
  <div class="page dashboard">
    <!-- Greeting -->
    <section class="hero">
      <div class="hero-text">
        <p class="hero-date">{{ dateLabel }}<template v-if="todayFortune"> · 农历{{ todayFortune.lunarDate }}</template></p>
        <h1 class="hero-title">{{ greeting }}，{{ authStore.user?.username }}</h1>
        <p class="hero-sub" v-if="profileStore.currentProfile">
          当前命主：<strong>{{ profileStore.currentProfile.name }}</strong>
          <span v-if="todayFortune" class="hero-gz serif">· 今日 {{ todayFortune.dayGanZhi }} 日</span>
        </p>
      </div>
    </section>

    <!-- No profile -->
    <div v-if="profilesLoaded && profileStore.profiles.length === 0" class="card">
      <EmptyState
        :icon="UserCircle"
        title="开始使用天枢"
        description="先录入出生信息生成个人命盘，之后即可查看每日运势、趋势，并与 AI 命理师对话。"
      >
        <template #actions>
          <router-link to="/profile" class="btn btn-primary"><Sparkles :size="16" /> 录入出生信息</router-link>
        </template>
      </EmptyState>
    </div>

    <template v-else>
      <div class="main-grid">
        <!-- Today's fortune -->
        <section class="today card" :class="todayFortune ? `lv-${level}` : ''">
          <div class="today-head">
            <h2 class="section-title"><Sparkles :size="18" class="icon" /> 今日运势</h2>
            <span v-if="todayFortune" class="badge rating-badge" :class="`level-${level}`">{{ todayFortune.rating }}</span>
          </div>

          <div v-if="fortuneLoading && !todayFortune" class="loading-state compact-state">
            <Loader2 :size="22" class="spin" />
            <span>正在读取今日运势…</span>
          </div>

          <template v-else-if="todayFortune">
            <div class="today-body">
              <div class="today-score" :class="`level-${level}`">
                <ScoreRing :score="todayFortune.overallScore" :size="92" label="综合" />
              </div>
              <div class="today-main">
                <p class="today-tagline serif">{{ todayFortune.tagline }}</p>
                <p class="today-overview">{{ todayFortune.overview }}</p>
                <div class="today-meta">
                  <span class="badge">{{ todayFortune.dayGanZhi }}日</span>
                  <span v-if="todayFortune.tenGod" class="badge badge-accent">{{ todayFortune.tenGod }}</span>
                </div>
              </div>
            </div>

            <div v-if="dimensions.length" class="dims">
              <div v-for="d in dimensions" :key="d.key" class="dim">
                <span class="dim-label">{{ d.label }}</span>
                <div class="dim-track"><div class="dim-fill" :style="{ width: `${d.value}%` }" /></div>
                <span class="dim-val tabular">{{ d.value }}</span>
              </div>
            </div>

            <div v-if="todayFortune.favorable.length || todayFortune.unfavorable.length" class="yiji">
              <div v-if="todayFortune.favorable.length" class="yiji-row">
                <span class="yiji-label yi"><ThumbsUp :size="13" /> 宜</span>
                <span v-for="(f, i) in todayFortune.favorable.slice(0, 6)" :key="i" class="yiji-tag">{{ f }}</span>
              </div>
              <div v-if="todayFortune.unfavorable.length" class="yiji-row">
                <span class="yiji-label ji"><ThumbsDown :size="13" /> 忌</span>
                <span v-for="(u, i) in todayFortune.unfavorable.slice(0, 6)" :key="i" class="yiji-tag">{{ u }}</span>
              </div>
            </div>

            <div class="today-foot">
              <button class="btn btn-secondary btn-sm" @click="goToDaily">
                查看今日详解 <ArrowRight :size="14" />
              </button>
            </div>
          </template>

          <EmptyState
            v-else-if="profileStore.currentProfileId"
            compact
            :icon="CalendarDays"
            title="今日运势尚未生成"
            description="前往运势月历，为本月生成逐日运势后即可在这里看到今日概览。"
          >
            <template #actions>
              <router-link to="/calendar" class="btn btn-primary btn-sm"><Sparkles :size="14" /> 去月历生成</router-link>
            </template>
          </EmptyState>
        </section>

        <!-- Side column -->
        <div class="side">
          <router-link to="/chat" class="chat-cta">
            <div class="cta-icon"><MessageSquare :size="22" /></div>
            <div class="cta-text">
              <span class="cta-title">问问天枢</span>
              <span class="cta-desc">AI 命理师结合你的命盘，解读流年、择日、合盘与起卦</span>
            </div>
            <ArrowRight :size="18" class="cta-arrow" />
          </router-link>

          <div class="quick-list">
            <router-link v-for="q in quickLinks" :key="q.to" :to="q.to" class="quick card card-interactive">
              <div class="quick-icon"><component :is="q.icon" :size="18" /></div>
              <div class="quick-text">
                <span class="quick-title">{{ q.title }}</span>
                <span class="quick-desc">
                  {{ q.to === '/profile' ? `${profileStore.profiles.length} 个档案` : q.desc }}
                </span>
              </div>
              <ArrowRight :size="16" class="quick-arrow" />
            </router-link>
          </div>
        </div>
      </div>
    </template>

    <!-- Force password change (admin first login) -->
    <AppModal :open="showForceChange" title="首次登录：请修改账号密码" hide-close>
      <div class="force-note alert alert-warning">
        <ShieldAlert :size="16" />
        <span>为确保安全，管理员首次登录必须修改默认的用户名和密码。</span>
      </div>
      <form id="force-change-form" @submit.prevent="handleForceChange" class="force-form">
        <div class="form-group">
          <label for="fc-username">新用户名（可选）</label>
          <input id="fc-username" v-model="newUsername" class="input" placeholder="留空则不修改" />
        </div>
        <div class="form-group">
          <label for="fc-old">原密码</label>
          <PasswordInput id="fc-old" v-model="oldPassword" autocomplete="current-password" required />
        </div>
        <div class="form-group">
          <label for="fc-new">新密码</label>
          <PasswordInput id="fc-new" v-model="newPassword" placeholder="至少 6 个字符" autocomplete="new-password" required />
        </div>
        <div v-if="changeError" class="alert alert-error">{{ changeError }}</div>
      </form>
      <template #footer>
        <button type="submit" form="force-change-form" class="btn btn-primary" :disabled="changing">
          <Loader2 v-if="changing" :size="16" class="spin" />
          确认修改
        </button>
      </template>
    </AppModal>
  </div>
</template>

<style scoped>
/* ── Hero ── */
.hero {
  position: relative;
  margin-bottom: var(--space-lg);
  padding: var(--space-lg) var(--space-lg) var(--space-lg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  overflow: hidden;
  background:
    radial-gradient(ellipse 60% 120% at 100% 0%, var(--color-accent-soft-strong), transparent 70%),
    radial-gradient(1.5px 1.5px at 78% 30%, var(--color-gold), transparent),
    radial-gradient(1px 1px at 86% 62%, var(--color-gold), transparent),
    radial-gradient(1.5px 1.5px at 92% 22%, var(--color-gold), transparent),
    radial-gradient(1px 1px at 70% 72%, var(--color-text-muted), transparent),
    var(--color-bg-secondary);
}
.hero-date { font-size: 0.82rem; color: var(--color-text-muted); letter-spacing: 0.04em; }
.hero-title {
  margin-top: 4px;
  font-family: var(--font-serif);
  font-size: 1.75rem;
  letter-spacing: 0.03em;
}
.hero-sub { margin-top: 6px; font-size: 0.9rem; color: var(--color-text-secondary); }
.hero-sub strong { color: var(--color-accent); }
.hero-gz { color: var(--color-text-muted); margin-left: 4px; }

/* ── Layout ── */
.main-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(260px, 1fr);
  gap: var(--space-lg);
  align-items: start;
}

/* ── Today card ── */
.today { position: relative; overflow: hidden; }
.today::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: var(--color-border-strong);
}
.today.lv-great::before { background: var(--color-level-great-text); }
.today.lv-good::before { background: var(--color-level-good-text); }
.today.lv-neutral::before { background: var(--color-level-neutral-text); }
.today.lv-bad::before { background: var(--color-level-bad-text); }
.today.lv-terrible::before { background: var(--color-level-terrible-text); }

.today-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-md); }
.today-head .section-title { margin-bottom: 0; }
.rating-badge { font-size: 0.8rem; padding: 3px 12px; }

.compact-state { padding: var(--space-xl) var(--space-md); flex-direction: row; }

.today-body { display: flex; gap: var(--space-lg); align-items: center; }
.today-score {
  flex-shrink: 0;
  padding: 8px;
  border-radius: 50%;
}
.today-main { min-width: 0; flex: 1; }
.today-tagline { font-size: 1.12rem; font-weight: 700; line-height: 1.5; color: var(--color-text-primary); }
.today-overview {
  margin-top: 6px;
  font-size: 0.88rem;
  line-height: 1.75;
  color: var(--color-text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.today-meta { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }

/* Dimensions */
.dims {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px 20px;
  margin-top: var(--space-lg);
  padding-top: var(--space-md);
  border-top: 1px dashed var(--color-border-strong);
}
.dim { display: flex; align-items: center; gap: 8px; }
.dim-label { width: 2.2em; flex-shrink: 0; font-size: 0.8rem; color: var(--color-text-secondary); }
.dim-track { flex: 1; height: 6px; border-radius: 999px; background: var(--color-bg-tertiary); overflow: hidden; }
.dim-fill { height: 100%; border-radius: 999px; background: var(--color-accent); transition: width 0.6s ease; }
.dim-val { width: 2em; text-align: right; font-size: 0.78rem; font-weight: 600; color: var(--color-text-primary); }

/* Yi / Ji */
.yiji { display: flex; flex-direction: column; gap: 8px; margin-top: var(--space-md); }
.yiji-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.yiji-label {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 2px 8px; border-radius: var(--radius-sm);
  font-size: 0.76rem; font-weight: 700;
}
.yiji-label.yi { background: var(--color-ji-soft); color: var(--color-ji); }
.yiji-label.ji { background: var(--color-xiong-soft); color: var(--color-xiong); }
.yiji-tag {
  padding: 2px 8px; border-radius: var(--radius-full);
  font-size: 0.76rem; color: var(--color-text-secondary);
  background: var(--color-bg-tertiary);
}

.today-foot { display: flex; justify-content: flex-end; margin-top: var(--space-md); }

/* ── Side ── */
.side { display: flex; flex-direction: column; gap: var(--space-md); }

.chat-cta {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px;
  border-radius: var(--radius-lg);
  background:
    radial-gradient(1.5px 1.5px at 85% 25%, rgba(255, 233, 168, 0.9), transparent),
    radial-gradient(1px 1px at 70% 70%, rgba(255, 233, 168, 0.7), transparent),
    linear-gradient(135deg, var(--color-accent), color-mix(in srgb, var(--color-accent) 60%, var(--color-seal)));
  color: var(--color-accent-contrast);
  box-shadow: var(--shadow-md);
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}
.chat-cta:hover { transform: translateY(-2px); box-shadow: var(--shadow-lg); }
.cta-icon {
  display: grid; place-items: center; flex-shrink: 0;
  width: 44px; height: 44px; border-radius: 12px;
  background: rgba(255, 255, 255, 0.18);
}
.cta-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
.cta-title { font-family: var(--font-serif); font-size: 1.1rem; font-weight: 700; letter-spacing: 0.05em; }
.cta-desc { font-size: 0.78rem; line-height: 1.5; opacity: 0.85; }
.cta-arrow { flex-shrink: 0; opacity: 0.8; }

.quick-list { display: flex; flex-direction: column; gap: 10px; }
.quick { display: flex; align-items: center; gap: 12px; padding: 14px 16px; }
.quick-icon {
  display: grid; place-items: center; flex-shrink: 0;
  width: 38px; height: 38px; border-radius: 10px;
  background: var(--color-accent-soft); color: var(--color-accent);
}
.quick-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.quick-title { font-size: 0.92rem; font-weight: 600; color: var(--color-text-primary); }
.quick-desc { font-size: 0.76rem; color: var(--color-text-muted); }
.quick-arrow { color: var(--color-text-muted); transition: transform var(--transition-fast), color var(--transition-fast); }
.quick:hover .quick-arrow { transform: translateX(3px); color: var(--color-accent); }

/* ── Force change modal ── */
.force-note { margin-bottom: var(--space-md); }
.force-form { display: flex; flex-direction: column; gap: var(--space-md); }

@media (max-width: 900px) {
  .main-grid { grid-template-columns: 1fr; }
  .side { order: -1; }
  .quick-list { display: grid; grid-template-columns: repeat(3, 1fr); }
  .quick { flex-direction: column; align-items: flex-start; gap: 8px; }
  .quick-arrow { display: none; }
}

@media (max-width: 640px) {
  .hero { padding: var(--space-md); margin-bottom: var(--space-md); }
  .hero-title { font-size: 1.35rem; }
  .main-grid { gap: var(--space-md); }
  .side { gap: 10px; }
  .chat-cta { padding: 14px; }
  .quick-list { gap: 8px; }
  .quick { padding: 12px; }
  .quick-desc { display: none; }
  .today-body { flex-direction: column; align-items: flex-start; gap: var(--space-sm); }
  .today-score { align-self: center; }
  .today-foot .btn { width: 100%; }
}
</style>
