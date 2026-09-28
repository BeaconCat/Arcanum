<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Marked } from 'marked';
import DOMPurify from 'dompurify';
import {
  Sparkles, Shuffle, Wand2, History, BookOpen, Star, Trash2, RotateCcw, Settings2, Loader2, ArrowLeft, Eye, Square,
} from 'lucide-vue-next';
import PageHeader from '../components/common/PageHeader.vue';
import EmptyState from '../components/common/EmptyState.vue';
import AppModal from '../components/common/AppModal.vue';
import TarotCard_ from '../components/tarot/TarotCard.vue';
import TarotCardInfo from '../components/tarot/TarotCardInfo.vue';
import TarotSpreadBoard from '../components/tarot/TarotSpreadBoard.vue';
import { useTarotDeck, TAROT_DECKS } from '../composables/useTarotDeck';
import { useProfileStore } from '../stores/use-profile-store';
import { useFeedback, errorMessage } from '../composables/useFeedback';
import {
  apiGetTarotCards, apiGetTarotSpreads, apiDrawTarot, apiListTarotReadings, apiGetTarotReading,
  apiUpdateTarotReading, apiDeleteTarotReading, apiInterpretTarot,
} from '../api/tarot.api';
import type {
  TarotCard, TarotSpread, TarotReading, TarotReadingMeta, TarotSpreadCategory, TarotDeckId,
} from '../../shared/types/tarot.types';

const route = useRoute();
const router = useRouter();
const profileStore = useProfileStore();
const { toast, confirm } = useFeedback();
const { deck: deckPref, setDeck } = useTarotDeck();
/** Deck used to show the current reading: the one it was drawn with, else the viewer's choice */
const readingDeck = computed<TarotDeckId>(() => reading.value?.deck ?? deckPref.value);

// ── Tabs ──
type Tab = 'reading' | 'history' | 'deck';
const TABS: { id: Tab; label: string; icon: unknown }[] = [
  { id: 'reading', label: '占卜', icon: Sparkles },
  { id: 'history', label: '历史', icon: History },
  { id: 'deck', label: '牌义图鉴', icon: BookOpen },
];
const tab = ref<Tab>((['reading', 'history', 'deck'] as Tab[]).includes(route.query.tab as Tab) ? route.query.tab as Tab : 'reading');
watch(tab, (t) => {
  router.replace({ query: { ...route.query, tab: t === 'reading' ? undefined : t } });
  if (t === 'history') loadHistory();
});

// ── Static data ──
const deck = ref<TarotCard[]>([]);
const spreads = ref<TarotSpread[]>([]);
const deckMap = computed(() => new Map(deck.value.map((c) => [c.id, c])));
const loadingBase = ref(true);

const CATEGORY_ORDER: TarotSpreadCategory[] = ['quick', 'timeline', 'relationship', 'decision', 'holistic'];
const spreadGroups = computed(() => CATEGORY_ORDER
  .map((cat) => ({ cat, name: spreads.value.find((s) => s.category === cat)?.categoryName || '', items: spreads.value.filter((s) => s.category === cat) }))
  .filter((g) => g.items.length));

// ── Settings (per viewer, localStorage) ──
const SETTINGS_KEY = 'tarot.settings';
const settings = reactive({ allowReversed: true, majorOnly: false });
try {
  const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
  if (saved) Object.assign(settings, { allowReversed: saved.allowReversed !== false, majorOnly: !!saved.majorOnly });
} catch { /* ignore */ }
watch(settings, () => {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
});
const showSettings = ref(false);

// ── Reading flow ──
type Step = 'spread' | 'question' | 'shuffle' | 'pick' | 'reveal';
const step = ref<Step>('spread');
const spread = ref<TarotSpread | null>(null);
const question = ref('');
const profileId = ref<string>('');
const picks = ref<number[]>([]);
const drawing = ref(false);
const reading = ref<TarotReading | null>(null);
const revealed = ref(new Set<number>());
const activePos = ref<number | null>(null);

const QUICK_QUESTIONS: Record<TarotSpreadCategory, string[]> = {
  quick: ['今天我需要注意什么？', '这件事我该怎么做？', '目前最大的课题是什么？'],
  timeline: ['这件事接下来会如何发展？', '我这段时间的运势如何？', '这个项目的走向怎样？'],
  relationship: ['对方现在怎么看我？', '我们的关系会如何发展？', '我该如何经营这段感情？'],
  decision: ['我该选择 A 还是 B？', '要不要换工作？', '这个决定对我有利吗？'],
  holistic: ['我现在的整体状态如何？', '我该如何度过这个阶段？', '新的一年我需要关注什么？'],
};

const poolSize = computed(() => (settings.majorOnly ? 22 : 78));
const needCount = computed(() => spread.value?.positions.length || 0);

function chooseSpread(s: TarotSpread) {
  spread.value = s;
  step.value = 'question';
  if (!profileId.value && profileStore.currentProfileId) profileId.value = profileStore.currentProfileId;
}

let shuffleTimer: ReturnType<typeof setTimeout> | undefined;
function startShuffle() {
  picks.value = [];
  step.value = 'shuffle';
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  shuffleTimer = setTimeout(() => { step.value = 'pick'; }, reduced ? 200 : 1700);
}

function togglePick(i: number) {
  const idx = picks.value.indexOf(i);
  if (idx >= 0) picks.value.splice(idx, 1);
  else if (picks.value.length < needCount.value) picks.value.push(i);
}

async function draw(auto = false) {
  if (!spread.value || drawing.value) return;
  drawing.value = true;
  try {
    reading.value = await apiDrawTarot({
      spreadId: spread.value.id,
      question: question.value.trim(),
      allowReversed: settings.allowReversed,
      majorOnly: settings.majorOnly,
      deck: deckPref.value,
      profileId: profileId.value || undefined,
      picks: auto ? undefined : [...picks.value],
    });
    revealed.value = new Set();
    activePos.value = null;
    interpretation.value = '';
    note.value = '';
    step.value = 'reveal';
  } catch (err) {
    toast.error(errorMessage(err, '抽牌失败'));
  } finally {
    drawing.value = false;
  }
}

function flip(pos: number) {
  revealed.value = new Set([...revealed.value, pos]);
  activePos.value = pos;
}
function revealAll() {
  revealed.value = new Set(spread.value?.positions.map((p) => p.id) || []);
}
const allRevealed = computed(() => !!spread.value && revealed.value.size >= spread.value.positions.length);

function restart() {
  stopInterpret();
  step.value = 'spread';
  spread.value = null;
  reading.value = null;
  question.value = '';
  picks.value = [];
  revealed.value = new Set();
}

// Fan geometry for the pick step
const fan = computed(() => Array.from({ length: poolSize.value }, (_, i) => {
  const t = poolSize.value > 1 ? i / (poolSize.value - 1) - 0.5 : 0;
  return { i, left: 50 + t * 86, top: 18 + t * t * 120, rot: t * 64 };
}));

// Revealed card details (in position order)
const revealedDetails = computed(() => {
  if (!reading.value || !spread.value) return [];
  return spread.value.positions
    .filter((p) => revealed.value.has(p.id))
    .map((p) => {
      const drawn = reading.value!.cards.find((c) => c.positionId === p.id)!;
      return { pos: p, drawn, card: deckMap.value.get(drawn.cardId)! };
    })
    .filter((d) => d.card);
});

const stats = computed(() => {
  if (!reading.value) return null;
  const cards = reading.value.cards.map((c) => ({ ...c, card: deckMap.value.get(c.cardId) }));
  const majors = cards.filter((c) => c.card?.arcana === 'major').length;
  const rev = cards.filter((c) => c.reversed).length;
  const el: Record<string, number> = {};
  cards.forEach((c) => { if (c.card?.element) el[c.card.element] = (el[c.card.element] || 0) + 1; });
  return { majors, rev, total: cards.length, el };
});

// ── AI interpretation ──
const md = new Marked({ gfm: true, breaks: true });
const interpretation = ref('');
const interpreting = ref(false);
let interpretCtl: AbortController | null = null;
const interpretationHtml = computed(() => DOMPurify.sanitize(md.parse(interpretation.value || '') as string));

async function interpret() {
  if (!reading.value || interpreting.value) return;
  if (!allRevealed.value) revealAll();
  interpreting.value = true;
  interpretation.value = '';
  interpretCtl = new AbortController();
  const id = reading.value.readingId;
  await apiInterpretTarot(id, {
    onContent: (t) => { interpretation.value += t; },
    onError: (e) => toast.error(e),
    onDone: () => {
      interpreting.value = false;
      if (reading.value?.readingId === id && interpretation.value) reading.value.interpretation = interpretation.value;
    },
  }, interpretCtl.signal);
  interpreting.value = false;
}
function stopInterpret() {
  interpretCtl?.abort();
  interpretCtl = null;
  interpreting.value = false;
}
onBeforeUnmount(() => {
  stopInterpret();
  clearTimeout(shuffleTimer);
});

// ── Note & favorite ──
const note = ref('');
const savingNote = ref(false);
async function saveNote() {
  if (!reading.value) return;
  savingNote.value = true;
  try {
    reading.value = { ...reading.value, ...(await apiUpdateTarotReading(reading.value.readingId, { note: note.value })) };
    toast.success('备注已保存');
  } catch (err) {
    toast.error(errorMessage(err, '保存失败'));
  } finally {
    savingNote.value = false;
  }
}
async function toggleFavorite(id: string, current?: boolean) {
  try {
    const r = await apiUpdateTarotReading(id, { favorite: !current });
    if (reading.value?.readingId === id) reading.value.favorite = r.favorite;
    const m = history.value.find((h) => h.readingId === id);
    if (m) m.favorite = r.favorite;
  } catch (err) {
    toast.error(errorMessage(err, '操作失败'));
  }
}

// ── History ──
const history = ref<TarotReadingMeta[]>([]);
const historyLoading = ref(false);
const historyFilter = ref<'all' | 'fav'>('all');
const shownHistory = computed(() => history.value.filter((h) => historyFilter.value === 'all' || h.favorite));

const HISTORY_PAGE = 20;
const historyTotal = ref(0);
const historyMoreLoading = ref(false);

/** First page (reset) or the next page appended ("加载更多"). */
async function loadHistory(more = false) {
  if (more) historyMoreLoading.value = true;
  else historyLoading.value = true;
  try {
    const page = await apiListTarotReadings({
      offset: more ? history.value.length : 0,
      limit: HISTORY_PAGE,
      favorite: historyFilter.value === 'fav',
    });
    history.value = more ? [...history.value, ...page.items] : page.items;
    historyTotal.value = page.total;
  } catch (err) {
    toast.error(errorMessage(err, '加载历史失败'));
  } finally {
    historyLoading.value = false;
    historyMoreLoading.value = false;
  }
}
watch(historyFilter, () => loadHistory());

async function openReading(id: string) {
  try {
    const r = await apiGetTarotReading(id);
    const s = spreads.value.find((x) => x.id === r.spreadId);
    if (!s) { toast.error('该记录使用的牌阵已不存在'); return; }
    stopInterpret();
    spread.value = s;
    reading.value = r;
    question.value = r.question;
    interpretation.value = r.interpretation || '';
    note.value = r.note || '';
    revealed.value = new Set(s.positions.map((p) => p.id));
    activePos.value = null;
    step.value = 'reveal';
    tab.value = 'reading';
  } catch (err) {
    toast.error(errorMessage(err, '打开记录失败'));
  }
}

async function removeReading(id: string) {
  const ok = await confirm({ title: '删除占卜记录', message: '删除后无法恢复，确定删除这条记录吗？', confirmText: '删除', danger: true });
  if (!ok) return;
  try {
    await apiDeleteTarotReading(id);
    history.value = history.value.filter((h) => h.readingId !== id);
    historyTotal.value = Math.max(0, historyTotal.value - 1);
    if (reading.value?.readingId === id) restart();
    toast.success('已删除');
  } catch (err) {
    toast.error(errorMessage(err, '删除失败'));
  }
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ── Deck reference ──
type DeckFilter = 'all' | 'major' | 'wands' | 'cups' | 'swords' | 'pentacles';
const DECK_FILTERS: { id: DeckFilter; label: string }[] = [
  { id: 'all', label: '全部' }, { id: 'major', label: '大阿卡纳' }, { id: 'wands', label: '权杖' },
  { id: 'cups', label: '圣杯' }, { id: 'swords', label: '宝剑' }, { id: 'pentacles', label: '星币' },
];
const deckFilter = ref<DeckFilter>('all');
const deckQuery = ref('');
const shownDeck = computed(() => deck.value.filter((c) => {
  if (deckFilter.value === 'major' && c.arcana !== 'major') return false;
  if (deckFilter.value !== 'all' && deckFilter.value !== 'major' && c.suit !== deckFilter.value) return false;
  const q = deckQuery.value.trim();
  if (!q) return true;
  return c.nameZh.includes(q) || c.nameEn.toLowerCase().includes(q.toLowerCase())
    || [...c.keywordsUpright, ...c.keywordsReversed].some((k) => k.includes(q));
}));

const detailCard = ref<TarotCard | null>(null);
const detailReversed = ref(false);
const detailBoth = ref(true);
const detailDeck = ref<TarotDeckId | undefined>(undefined);
function openDetail(card: TarotCard, reversed = false, both = true, deckId?: TarotDeckId) {
  detailCard.value = card;
  detailReversed.value = reversed;
  detailBoth.value = both;
  detailDeck.value = deckId;
}

onMounted(async () => {
  try {
    [deck.value, spreads.value] = await Promise.all([apiGetTarotCards(), apiGetTarotSpreads()]);
  } catch (err) {
    toast.error(errorMessage(err, '加载塔罗数据失败'));
  } finally {
    loadingBase.value = false;
  }
  if (!profileStore.profiles.length) profileStore.loadProfiles().catch(() => {});
  if (tab.value === 'history') loadHistory();
});
</script>

<template>
  <div class="page tarot-page">
    <PageHeader title="塔罗" subtitle="静心提问，让牌面映照当下的处境与可能">
      <template #actions>
        <button class="btn btn-secondary btn-sm" @click="showSettings = true"><Settings2 :size="15" /> 抽牌设置</button>
      </template>
    </PageHeader>

    <div class="tabs tarot-tabs" role="tablist">
      <button
        v-for="t in TABS" :key="t.id" class="tab" :class="{ active: tab === t.id }"
        role="tab" :aria-selected="tab === t.id" @click="tab = t.id"
      >
        <component :is="t.icon" :size="15" />{{ t.label }}
      </button>
    </div>

    <div v-if="loadingBase" class="loading-state"><Loader2 :size="24" class="spin" />加载中…</div>

    <!-- ═══ 占卜 ═══ -->
    <section v-else-if="tab === 'reading'" class="flow">
      <!-- Step 1: spread -->
      <div v-if="step === 'spread'" class="step">
        <h2 class="section-title"><Sparkles :size="18" class="icon" />选择牌阵</h2>
        <div v-for="g in spreadGroups" :key="g.cat" class="spread-group">
          <div class="group-name">{{ g.name }}</div>
          <div class="spread-grid">
            <button v-for="s in g.items" :key="s.id" class="card card-interactive spread-card" @click="chooseSpread(s)">
              <div class="spread-head">
                <strong>{{ s.name }}</strong>
                <span class="badge badge-accent">{{ s.positions.length }} 张</span>
              </div>
              <p>{{ s.description }}</p>
              <div class="spread-tags"><span v-for="t in s.suitableFor" :key="t" class="badge">{{ t }}</span></div>
            </button>
          </div>
        </div>
      </div>

      <!-- Step 2: question -->
      <div v-else-if="step === 'question' && spread" class="step narrow">
        <button class="link-back" @click="step = 'spread'"><ArrowLeft :size="15" />重选牌阵</button>
        <div class="card q-card">
          <div class="q-spread">
            <strong>{{ spread.name }}</strong><span class="badge badge-accent">{{ spread.positions.length }} 张</span>
          </div>
          <p class="text-muted q-desc">{{ spread.description }}</p>
          <div class="form-group">
            <label for="tarot-q">你想问什么？</label>
            <textarea id="tarot-q" v-model="question" class="input" rows="3" maxlength="500" placeholder="把问题写得具体一些，例如：接下来三个月我在工作上该注意什么？" />
          </div>
          <div class="quick-q">
            <button v-for="q in QUICK_QUESTIONS[spread.category]" :key="q" class="chip" @click="question = q">{{ q }}</button>
          </div>
          <div class="form-grid q-opts">
            <div class="form-group">
              <label for="tarot-profile">关联命主（可选）</label>
              <select id="tarot-profile" v-model="profileId" class="input">
                <option value="">不关联</option>
                <option v-for="p in profileStore.profiles" :key="p.profileId" :value="p.profileId">{{ p.name }}（{{ p.relation }}）</option>
              </select>
              <span class="form-hint">AI 解读时会把命主的星座与日主作为性格参考</span>
            </div>
            <div class="form-group switches">
              <label class="switch"><input v-model="settings.allowReversed" type="checkbox" /><span class="switch-track" />启用逆位</label>
              <label class="switch"><input v-model="settings.majorOnly" type="checkbox" /><span class="switch-track" />只用大阿卡纳</label>
            </div>
          </div>
          <div class="form-actions">
            <button class="btn btn-primary btn-lg" @click="startShuffle"><Shuffle :size="17" />开始洗牌</button>
          </div>
        </div>
      </div>

      <!-- Step 3: shuffle animation -->
      <div v-else-if="step === 'shuffle'" class="step shuffle-step" aria-live="polite">
        <div class="shuffle-stack">
          <div v-for="i in 5" :key="i" class="shuffle-card" :style="{ '--i': i }"><TarotCard_ /></div>
        </div>
        <p class="text-muted">正在洗牌… 请在心中默念你的问题</p>
      </div>

      <!-- Step 4: pick from fan -->
      <div v-else-if="step === 'pick' && spread" class="step pick-step">
        <div class="pick-head">
          <div>
            <strong>凭直觉抽取 {{ needCount }} 张</strong>
            <span class="text-muted">已选 {{ picks.length }} / {{ needCount }}</span>
          </div>
          <div class="page-actions">
            <button class="btn btn-ghost btn-sm" @click="startShuffle"><RotateCcw :size="14" />重新洗牌</button>
            <button class="btn btn-secondary btn-sm" :disabled="drawing" @click="draw(true)"><Wand2 :size="14" />自动抽取</button>
            <button class="btn btn-primary btn-sm" :disabled="picks.length < needCount || drawing" @click="draw(false)">
              <Loader2 v-if="drawing" :size="14" class="spin" /><Eye v-else :size="14" />翻开牌阵
            </button>
          </div>
        </div>
        <div class="fan" role="group" aria-label="牌堆">
          <button
            v-for="f in fan" :key="f.i" class="fan-card" :class="{ picked: picks.includes(f.i) }"
            :style="{ left: `${f.left}%`, top: `${f.top}px`, '--rot': `${f.rot}deg` }"
            :aria-label="`第 ${f.i + 1} 张${picks.includes(f.i) ? '（已选）' : ''}`"
            :aria-pressed="picks.includes(f.i)"
            @click="togglePick(f.i)"
          >
            <TarotCard_ />
            <span v-if="picks.includes(f.i)" class="pick-no">{{ picks.indexOf(f.i) + 1 }}</span>
          </button>
        </div>
        <p class="form-hint center">点击牌背选择，再次点击可取消；选满后点「翻开牌阵」。</p>
      </div>

      <!-- Step 5: reveal & results -->
      <div v-else-if="step === 'reveal' && spread && reading" class="step reveal-step">
        <div class="reveal-head card card-compact">
          <div class="rh-main">
            <div class="rh-title">
              <strong>{{ reading.spreadName }}</strong>
              <span class="text-muted">{{ fmtTime(reading.createdAt) }}</span>
              <span v-if="reading.profileName" class="badge">命主 · {{ reading.profileName }}</span>
            </div>
            <p class="rh-q">{{ reading.question || '（未提问 · 一般性指引）' }}</p>
          </div>
          <div class="page-actions">
            <button class="btn-icon" :title="reading.favorite ? '取消收藏' : '收藏'" :aria-label="reading.favorite ? '取消收藏' : '收藏'" @click="toggleFavorite(reading.readingId, reading.favorite)">
              <Star :size="18" :class="{ fav: reading.favorite }" />
            </button>
            <button v-if="!allRevealed" class="btn btn-secondary btn-sm" @click="revealAll"><Eye :size="14" />全部翻开</button>
            <button class="btn btn-ghost btn-sm" @click="restart"><RotateCcw :size="14" />再占一次</button>
          </div>
        </div>

        <div class="board-wrap">
          <TarotSpreadBoard
            :card-deck="readingDeck"
            :spread="spread" :cards="reading.cards" :deck="deckMap" :revealed="revealed" :active="activePos"
            @flip="flip" @focus="(p) => (activePos = p)"
          />
          <p v-if="!allRevealed" class="form-hint center">点击牌背逐张翻开</p>
        </div>

        <div v-if="stats && allRevealed" class="stats">
          <span class="badge badge-accent">大阿卡纳 {{ stats.majors }} / {{ stats.total }}</span>
          <span v-if="reading.allowReversed" class="badge">逆位 {{ stats.rev }} 张</span>
          <span v-for="(n, el) in stats.el" :key="el" class="badge">{{ el }}元素 {{ n }}</span>
        </div>

        <div v-if="revealedDetails.length" class="details">
          <article
            v-for="d in revealedDetails" :key="d.pos.id" class="card card-compact detail"
            :class="{ active: activePos === d.pos.id }" @click="activePos = d.pos.id"
          >
            <div class="detail-card">
              <TarotCard_ :card="d.card" :deck="readingDeck" :reversed="d.drawn.reversed" face-up interactive @click="openDetail(d.card, d.drawn.reversed, false, readingDeck)" />
            </div>
            <div class="detail-body">
              <div class="detail-pos"><span class="pos-no">{{ d.pos.id }}</span>{{ d.pos.name }}<span class="text-muted">· {{ d.pos.meaning }}</span></div>
              <h4 class="detail-name">
                {{ d.card.nameZh }}
                <span class="orient" :class="d.drawn.reversed ? 'down' : 'up'">{{ d.drawn.reversed ? '逆位' : '正位' }}</span>
              </h4>
              <div class="kw">
                <span v-for="k in (d.drawn.reversed ? d.card.keywordsReversed : d.card.keywordsUpright)" :key="k" class="kw-chip">{{ k }}</span>
              </div>
              <p>{{ d.drawn.reversed ? d.card.reversed : d.card.upright }}</p>
              <p class="detail-advice"><strong>建议</strong>{{ d.card.advice }}</p>
            </div>
          </article>
        </div>

        <section class="card ai-card">
          <div class="ai-head">
            <h3 class="section-title"><Sparkles :size="18" class="icon" />天枢解读</h3>
            <button v-if="interpreting" class="btn btn-secondary btn-sm" @click="stopInterpret"><Square :size="13" />停止</button>
            <button v-else class="btn btn-primary btn-sm" @click="interpret">
              <Sparkles :size="14" />{{ interpretation ? '重新解读' : 'AI 解读' }}
            </button>
          </div>
          <div v-if="interpretation" class="markdown-body ai-body" v-html="interpretationHtml" />
          <div v-else-if="interpreting" class="loading-state compact"><Loader2 :size="20" class="spin" />正在推演牌面…</div>
          <p v-else class="text-muted ai-hint">结合问题与整组牌的关系生成综合解读，结果会自动保存到这条记录。</p>
          <p v-if="interpretation" class="form-hint">塔罗揭示的是趋势与心境，仅供参考；重大决定请结合现实情况与专业意见。</p>
        </section>

        <section class="card card-compact note-card">
          <div class="form-group">
            <label for="tarot-note">我的备注</label>
            <textarea id="tarot-note" v-model="note" class="input" rows="2" maxlength="2000" placeholder="记录当下的感受，之后回来对照" />
          </div>
          <div class="form-actions">
            <button class="btn btn-secondary btn-sm" :disabled="savingNote" @click="saveNote">保存备注</button>
          </div>
        </section>
      </div>
    </section>

    <!-- ═══ 历史 ═══ -->
    <section v-else-if="tab === 'history'" class="history">
      <div class="history-bar">
        <div class="tabs">
          <button class="tab" :class="{ active: historyFilter === 'all' }" @click="historyFilter = 'all'">全部</button>
          <button class="tab" :class="{ active: historyFilter === 'fav' }" @click="historyFilter = 'fav'"><Star :size="13" />收藏</button>
        </div>
      </div>
      <div v-if="historyLoading" class="loading-state"><Loader2 :size="22" class="spin" />加载中…</div>
      <EmptyState
        v-else-if="!shownHistory.length"
        :icon="History"
        :title="historyFilter === 'fav' ? '还没有收藏的记录' : '还没有占卜记录'"
        description="完成一次占卜后，记录会自动保存在这里。"
      >
        <template #actions><button class="btn btn-primary" @click="tab = 'reading'">开始占卜</button></template>
      </EmptyState>
      <div v-else class="history-list">
        <article v-for="h in shownHistory" :key="h.readingId" class="card card-compact card-interactive h-item" @click="openReading(h.readingId)">
          <div class="h-cards">
            <div v-for="c in h.preview" :key="c.positionId" class="h-mini">
              <TarotCard_ :card="deckMap.get(c.cardId)" :deck="h.deck" :reversed="c.reversed" face-up />
            </div>
          </div>
          <div class="h-body">
            <div class="h-title">
              <strong>{{ h.spreadName }}</strong>
              <span class="text-muted">{{ fmtTime(h.createdAt) }}</span>
              <span v-if="h.hasInterpretation" class="badge badge-accent">已解读</span>
            </div>
            <p class="h-q">{{ h.question || '（未提问）' }}</p>
          </div>
          <div class="h-actions" @click.stop>
            <button class="btn-icon sm" :aria-label="h.favorite ? '取消收藏' : '收藏'" @click="toggleFavorite(h.readingId, h.favorite)">
              <Star :size="16" :class="{ fav: h.favorite }" />
            </button>
            <button class="btn-icon sm danger" aria-label="删除" @click="removeReading(h.readingId)"><Trash2 :size="16" /></button>
          </div>
        </article>
        <div v-if="history.length < historyTotal" class="h-more">
          <button class="btn btn-secondary" :disabled="historyMoreLoading" @click="loadHistory(true)">
            <Loader2 v-if="historyMoreLoading" :size="15" class="spin" />
            加载更多（{{ history.length }} / {{ historyTotal }}）
          </button>
        </div>
      </div>
    </section>

    <!-- ═══ 图鉴 ═══ -->
    <section v-else class="deck-ref">
      <div class="deck-bar">
        <div class="tabs">
          <button v-for="f in DECK_FILTERS" :key="f.id" class="tab" :class="{ active: deckFilter === f.id }" @click="deckFilter = f.id">{{ f.label }}</button>
        </div>
        <input v-model="deckQuery" class="input input-sm deck-search" placeholder="搜索牌名或关键词" aria-label="搜索牌名或关键词" />
      </div>
      <div class="deck-grid">
        <button v-for="c in shownDeck" :key="c.id" class="deck-item" :aria-label="c.nameZh" @click="openDetail(c)">
          <TarotCard_ :card="c" face-up />
          <span class="deck-name">{{ c.nameZh }}</span>
        </button>
      </div>
      <EmptyState v-if="!shownDeck.length" compact title="没有匹配的牌" />
      <p v-if="deckPref === 'rws'" class="deck-credit">
        牌面：Rider–Waite–Smith，Pamela Colman Smith 绘（1909），公有领域；扫描来自
        <a href="https://commons.wikimedia.org/wiki/Category:Rider-Waite-Smith_tarot_deck_(TaionWC)" target="_blank" rel="noopener">Wikimedia Commons</a>。
      </p>
    </section>

    <!-- Card detail -->
    <AppModal :open="!!detailCard" :title="detailCard?.nameZh" size="lg" @update:open="(v) => !v && (detailCard = null)">
      <div v-if="detailCard" class="detail-modal">
        <div class="dm-card"><TarotCard_ :card="detailCard" :deck="detailDeck" size="lg" :reversed="detailReversed && !detailBoth" face-up /></div>
        <TarotCardInfo :card="detailCard" :reversed="detailReversed" :both="detailBoth" />
      </div>
    </AppModal>

    <!-- Settings -->
    <AppModal v-model:open="showSettings" title="抽牌设置" size="sm">
      <div class="settings-body">
        <div class="form-group">
          <span class="form-label">牌组</span>
          <div class="deck-choices">
            <button
              v-for="d in TAROT_DECKS"
              :key="d.id"
              type="button"
              class="deck-choice"
              :class="{ active: deckPref === d.id }"
              :aria-pressed="deckPref === d.id"
              @click="setDeck(d.id)"
            >
              <strong>{{ d.name }}</strong>
              <span>{{ d.description }}</span>
            </button>
          </div>
        </div>
        <label class="switch"><input v-model="settings.allowReversed" type="checkbox" /><span class="switch-track" />启用逆位</label>
        <p class="form-hint">关闭后所有牌都以正位出现，适合初学者。</p>
        <label class="switch"><input v-model="settings.majorOnly" type="checkbox" /><span class="switch-track" />只用大阿卡纳（22 张）</label>
        <p class="form-hint">只用大阿卡纳时解读更侧重人生课题与大方向；十二张的年度牌阵仍可使用。</p>
        <details class="deck-about">
          <summary>关于牌组</summary>
          <p>
            「经典 RWS」使用 Pamela Colman Smith（1878–1951）为 1909 年 Rider–Waite–Smith 塔罗绘制的原版牌面，
            扫描自早期原版印刷，来源 Wikimedia Commons，已进入公有领域；未使用后期重新上色的版本，仅做了统一裁切与压缩。
            逐张来源见 <a href="/tarot/rws/CREDITS.md" target="_blank" rel="noopener">CREDITS.md</a>。
          </p>
          <p>「天枢自绘」为本站原创的象征性牌面。已保存的占卜会沿用抽牌时的牌组。</p>
        </details>
      </div>
      <template #footer><button class="btn btn-primary" @click="showSettings = false">完成</button></template>
    </AppModal>
  </div>
</template>

<style scoped>
.tarot-page { max-width: 1080px; }
.tarot-tabs { margin-bottom: var(--space-lg); }

/* Deck choice & credits */
.deck-choices { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.deck-choice {
  display: flex; flex-direction: column; gap: 3px; padding: 10px 12px; text-align: left; font: inherit;
  border: 1px solid var(--color-border-strong); border-radius: var(--radius-md);
  background: var(--color-bg-secondary); color: var(--color-text-primary); cursor: pointer;
  transition: border-color var(--transition-fast), background var(--transition-fast);
}
.deck-choice span { font-size: 0.75rem; color: var(--color-text-muted); line-height: 1.4; }
.deck-choice:hover { border-color: var(--color-accent); }
.deck-choice.active { border-color: var(--color-accent); background: var(--color-accent-soft); box-shadow: inset 0 0 0 1px var(--color-accent); }
.deck-about { margin-top: 4px; font-size: 0.8rem; color: var(--color-text-secondary); }
.deck-about summary { cursor: pointer; color: var(--color-text-muted); }
.deck-about p { margin-top: 6px; line-height: 1.7; }
.deck-about a, .deck-credit a { color: var(--color-accent); text-decoration: underline; text-underline-offset: 2px; }
.deck-credit { margin-top: var(--space-lg); font-size: 0.75rem; color: var(--color-text-muted); text-align: center; line-height: 1.6; }

/* Spread selection */
.spread-group + .spread-group { margin-top: var(--space-lg); }
.group-name { margin-bottom: var(--space-sm); font-size: 0.8rem; font-weight: 600; letter-spacing: 0.12em; color: var(--color-text-muted); }
.spread-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--space-md); }
.spread-card { display: flex; flex-direction: column; gap: 8px; text-align: left; font: inherit; color: inherit; }
.spread-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.spread-head strong { font-family: var(--font-serif); font-size: 1.05rem; }
.spread-card p { font-size: 0.85rem; line-height: 1.65; color: var(--color-text-secondary); }
.spread-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: auto; }

/* Question */
.narrow { max-width: 680px; margin: 0 auto; }
.link-back { display: inline-flex; align-items: center; gap: 4px; margin-bottom: var(--space-sm); padding: 4px 6px; border: none; background: none; color: var(--color-text-muted); font-size: 0.85rem; cursor: pointer; border-radius: var(--radius-sm); }
.link-back:hover { color: var(--color-accent); background: var(--color-bg-tertiary); }
.q-card { display: flex; flex-direction: column; gap: var(--space-md); }
.q-spread { display: flex; align-items: center; gap: 8px; }
.q-spread strong { font-family: var(--font-serif); font-size: 1.15rem; }
.q-desc { font-size: 0.86rem; line-height: 1.6; margin-top: -8px; }
.quick-q { display: flex; flex-wrap: wrap; gap: 6px; margin-top: -6px; }
.switches { justify-content: center; gap: 12px; }

/* Shuffle */
.shuffle-step { display: flex; flex-direction: column; align-items: center; gap: var(--space-lg); padding: var(--space-2xl) 0; }
.shuffle-stack { position: relative; width: 120px; height: 200px; }
.shuffle-card { position: absolute; inset: 0; animation: shuffle 0.85s ease-in-out infinite alternate; animation-delay: calc(var(--i) * 0.09s); }
.shuffle-card:nth-child(odd) { --dir: -1; }
.shuffle-card:nth-child(even) { --dir: 1; }
@keyframes shuffle {
  from { transform: translateX(0) rotate(0deg); }
  to { transform: translateX(calc(var(--dir) * 46px)) rotate(calc(var(--dir) * 8deg)); }
}

/* Pick fan */
.pick-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-sm); flex-wrap: wrap; margin-bottom: var(--space-md); }
.pick-head strong { margin-right: 10px; font-family: var(--font-serif); }
.fan { position: relative; height: 250px; margin: 0 auto; max-width: 900px; }
.fan-card {
  position: absolute;
  width: 54px;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  transform: translateX(-50%) rotate(var(--rot));
  transform-origin: 50% 120%;
  transition: transform 0.2s ease;
}
.fan-card:hover { transform: translateX(-50%) rotate(var(--rot)) translateY(-10px); z-index: 5; }
.fan-card.picked { transform: translateX(-50%) rotate(var(--rot)) translateY(-26px); z-index: 6; }
.fan-card.picked :deep(.tcard-side) { box-shadow: 0 0 0 2px var(--color-accent), 0 8px 18px rgba(10, 12, 20, 0.35); }
.fan-card:focus-visible { outline: none; }
.fan-card:focus-visible :deep(.tcard-side) { box-shadow: var(--focus-ring); }
.pick-no {
  position: absolute; top: -8px; left: 50%; transform: translateX(-50%);
  display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%;
  background: var(--color-accent); color: var(--color-accent-contrast); font-size: 0.7rem; font-weight: 700;
}
.center { text-align: center; }

/* Reveal */
.reveal-step { display: flex; flex-direction: column; gap: var(--space-lg); }
.reveal-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-md); flex-wrap: wrap; }
.rh-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.rh-title strong { font-family: var(--font-serif); font-size: 1.08rem; }
.rh-title .text-muted { font-size: 0.8rem; }
.rh-q { margin-top: 4px; color: var(--color-text-secondary); }
.fav { fill: var(--color-gold); color: var(--color-gold); }
.board-wrap { padding: var(--space-md) 0; }
.stats { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }

.details { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: var(--space-md); }
.detail { display: flex; gap: var(--space-md); cursor: pointer; transition: border-color var(--transition-fast); }
.detail.active { border-color: var(--color-accent); }
.detail-card { width: 92px; flex-shrink: 0; }
.detail-body { min-width: 0; display: flex; flex-direction: column; gap: 6px; font-size: 0.87rem; line-height: 1.7; }
.detail-pos { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; font-size: 0.8rem; font-weight: 600; color: var(--color-accent); }
.detail-pos .text-muted { font-weight: 400; }
.pos-no { display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; background: var(--color-accent-soft); font-size: 0.68rem; }
.detail-name { display: flex; align-items: center; gap: 8px; font-family: var(--font-serif); font-size: 1.08rem; }
.orient { padding: 1px 8px; border-radius: 999px; font-family: var(--font-sans); font-size: 0.7rem; font-weight: 600; }
.orient.up { background: var(--color-ji-soft); color: var(--color-ji); }
.orient.down { background: var(--color-xiong-soft); color: var(--color-xiong); }
.kw { display: flex; flex-wrap: wrap; gap: 4px; }
.kw-chip { padding: 1px 8px; border-radius: 999px; font-size: 0.72rem; background: var(--color-accent-soft); color: var(--color-accent); }
.detail-advice { display: flex; gap: 8px; color: var(--color-text-secondary); }
.detail-advice strong { flex-shrink: 0; color: var(--color-gold); }

.ai-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-sm); margin-bottom: var(--space-sm); }
.ai-head .section-title { margin-bottom: 0; }
.ai-body { font-size: 0.93rem; line-height: 1.8; max-width: 72ch; }
.ai-hint { font-size: 0.86rem; }
.loading-state.compact { padding: var(--space-lg); }
.note-card textarea { min-height: 64px; }

/* History */
.history-bar, .deck-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--space-sm); flex-wrap: wrap; margin-bottom: var(--space-md); }
.history-list { display: flex; flex-direction: column; gap: var(--space-sm); }
.h-item { display: flex; align-items: center; gap: var(--space-md); }
.h-cards { display: flex; gap: 4px; flex-shrink: 0; }
.h-mini { width: 34px; }
.h-body { flex: 1; min-width: 0; }
.h-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.h-title strong { font-family: var(--font-serif); }
.h-title .text-muted { font-size: 0.78rem; }
.h-q { margin-top: 2px; font-size: 0.86rem; color: var(--color-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.h-actions { display: flex; gap: 2px; }

/* Deck reference */
.deck-search { width: 220px; }
.deck-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: var(--space-md) var(--space-sm); }
.deck-item { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 0; border: none; background: none; cursor: pointer; color: inherit; font: inherit; }
.deck-item:hover :deep(.tcard-side) { box-shadow: 0 8px 20px rgba(10, 12, 20, 0.3); }
.deck-item:focus-visible { outline: none; box-shadow: var(--focus-ring); border-radius: 8px; }
.deck-name { font-size: 0.8rem; color: var(--color-text-secondary); }

.detail-modal { display: flex; gap: var(--space-lg); align-items: flex-start; }
.dm-card { width: 150px; flex-shrink: 0; }
.settings-body { display: flex; flex-direction: column; gap: 6px; }
.settings-body .form-hint { margin: 0 0 10px 46px; }

@media (max-width: 640px) {
  .details { grid-template-columns: 1fr; }
  .detail-card { width: 72px; }
  .fan { height: 200px; }
  .fan-card { width: 40px; }
  .detail-modal { flex-direction: column; align-items: center; }
  .dm-card { width: 120px; }
  .deck-search { width: 100%; }
  .deck-grid { grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); }
  .h-cards { display: none; }
  .pick-head { flex-direction: column; align-items: stretch; }
}
@media (prefers-reduced-motion: reduce) {
  .shuffle-card { animation: none; }
  .fan-card { transition: none; }
}
.h-more { display: flex; justify-content: center; padding: var(--space-sm) 0; grid-column: 1 / -1; }
</style>
