<script setup lang="ts">
import { computed } from 'vue';
import { Plus, Trash2, MessageSquareText } from 'lucide-vue-next';
import type { SessionMeta } from '../../api/chat.api';

const props = defineProps<{ sessions: SessionMeta[]; activeId?: string; /** Sessions with a reply in progress */ running?: Set<string> }>();
const emit = defineEmits<{ select: [string]; remove: [string]; create: [] }>();

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}小时前`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}天前`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// Group by 今天 / 近 7 天 / 更早 (sessions arrive newest-first)
const groups = computed(() => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const t0 = startOfToday.getTime();
  const week = t0 - 6 * 86400000;
  const out: { label: string; items: SessionMeta[] }[] = [
    { label: '今天', items: [] },
    { label: '近 7 天', items: [] },
    { label: '更早', items: [] },
  ];
  for (const s of props.sessions) {
    const t = new Date(s.updatedAt).getTime();
    if (t >= t0) out[0].items.push(s);
    else if (t >= week) out[1].items.push(s);
    else out[2].items.push(s);
  }
  return out.filter((g) => g.items.length);
});
</script>

<template>
  <div class="session-panel">
    <button class="btn btn-secondary btn-block new-btn" @click="emit('create')">
      <Plus :size="16" /> 新建对话
    </button>

    <div class="session-scroll">
      <div v-if="!sessions.length" class="session-empty">
        <MessageSquareText :size="20" />
        <span>暂无历史会话</span>
      </div>
      <div v-for="g in groups" :key="g.label" class="session-group">
        <div class="group-label">{{ g.label }}</div>
        <div
          v-for="s in g.items"
          :key="s.sessionId"
          class="session-item"
          :class="{ active: s.sessionId === activeId }"
          role="button"
          tabindex="0"
          @click="emit('select', s.sessionId)"
          @keydown.enter="emit('select', s.sessionId)"
        >
          <div class="session-info">
            <span class="session-title">{{ s.title || '未命名对话' }}</span>
            <span v-if="running?.has(s.sessionId)" class="session-meta running">
              <span class="run-dot" aria-hidden="true" />正在回复…
            </span>
            <span v-else class="session-meta">{{ s.messageCount }} 条 · {{ formatDate(s.updatedAt) }}</span>
          </div>
          <button class="session-del" title="删除会话" aria-label="删除会话" @click.stop="emit('remove', s.sessionId)">
            <Trash2 :size="14" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.session-panel { display: flex; flex-direction: column; gap: 12px; height: 100%; min-height: 0; }
.new-btn { flex-shrink: 0; }
.session-scroll { flex: 1; min-height: 0; overflow-y: auto; margin: 0 -4px; padding: 0 4px; }
.session-empty {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 28px 8px; color: var(--color-text-muted); font-size: 0.82rem;
}
.session-group + .session-group { margin-top: 12px; }
.group-label {
  padding: 0 8px 6px; font-size: 0.7rem; font-weight: 600;
  letter-spacing: 0.12em; color: var(--color-text-muted);
}
.session-item {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 8px 8px 10px; margin-bottom: 2px;
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}
.session-item:hover { background: var(--color-bg-tertiary); color: var(--color-text-primary); }
.session-item.active { background: var(--color-accent-soft); color: var(--color-accent); }
.session-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.session-title { font-size: 0.85rem; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.session-item.active .session-title { font-weight: 600; }
.session-meta { font-size: 0.7rem; color: var(--color-text-muted); }
.session-meta.running { display: inline-flex; align-items: center; gap: 5px; color: var(--color-accent); font-weight: 500; }
.run-dot {
  width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex-shrink: 0;
  animation: run-pulse 1.4s ease-in-out infinite;
}
@keyframes run-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(0.7); } }
@media (prefers-reduced-motion: reduce) { .run-dot { animation: none; } }
.session-del {
  display: grid; place-items: center; flex-shrink: 0;
  width: 26px; height: 26px; border: none; border-radius: 6px;
  background: transparent; color: var(--color-text-muted);
  cursor: pointer; opacity: 0; transition: opacity var(--transition-fast), background var(--transition-fast);
}
.session-item:hover .session-del, .session-item.active .session-del, .session-del:focus-visible { opacity: 1; }
.session-del:hover { background: var(--color-error-soft); color: var(--color-error); }
@media (hover: none) { .session-del { opacity: 0.7; } }
</style>
