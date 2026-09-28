<script setup lang="ts">
import BrandMark from '../common/BrandMark.vue';

defineProps<{ subtitle?: string }>();

// 北斗七星（天枢为首）坐标，viewBox 0 0 200 120
const dipper = [
  { x: 150, y: 22, r: 2.6 }, // 天枢
  { x: 146, y: 50, r: 2 },   // 天璇
  { x: 112, y: 56, r: 2 },   // 天玑
  { x: 106, y: 30, r: 1.8 }, // 天权
  { x: 76, y: 38, r: 2 },    // 玉衡
  { x: 50, y: 50, r: 2 },    // 开阳
  { x: 18, y: 76, r: 2.1 },  // 摇光
];
const line = dipper.map((s) => `${s.x},${s.y}`).join(' ');
</script>

<template>
  <div class="auth-shell">
    <svg class="auth-stars" viewBox="0 0 200 120" aria-hidden="true">
      <polyline :points="line" class="dipper-line" />
      <polyline points="106,30 112,56" class="dipper-line" />
      <circle v-for="(s, i) in dipper" :key="i" :cx="s.x" :cy="s.y" :r="s.r" class="dipper-star" :class="{ lead: i === 0 }" />
    </svg>
    <div class="auth-dust" aria-hidden="true" />

    <div class="auth-panel">
      <div class="auth-brand">
        <BrandMark :size="56" />
        <h1 class="auth-title">天枢</h1>
        <p class="auth-en">Arcanum</p>
        <p v-if="subtitle" class="auth-subtitle">{{ subtitle }}</p>
      </div>
      <div class="auth-card card">
        <slot />
      </div>
      <div v-if="$slots.footer" class="auth-footer">
        <slot name="footer" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-shell {
  position: relative;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-xl) var(--space-md);
  overflow: hidden;
  background:
    radial-gradient(ellipse 80% 60% at 85% 0%, var(--color-accent-soft), transparent 70%),
    radial-gradient(ellipse 60% 50% at 0% 100%, color-mix(in srgb, var(--color-seal) 7%, transparent), transparent 70%),
    var(--color-bg-primary);
}

.auth-stars {
  position: absolute;
  top: 4%;
  right: 4%;
  width: min(460px, 70vw);
  opacity: 0.55;
  pointer-events: none;
}
.dipper-line {
  fill: none;
  stroke: var(--color-accent);
  stroke-width: 0.5;
  stroke-dasharray: 2 3;
  opacity: 0.45;
}
.dipper-star { fill: var(--color-gold); }
.dipper-star.lead { fill: var(--color-seal); filter: drop-shadow(0 0 3px var(--color-gold)); }

.auth-dust {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.35;
  background-image:
    radial-gradient(1px 1px at 12% 22%, var(--color-text-muted), transparent),
    radial-gradient(1px 1px at 28% 68%, var(--color-text-muted), transparent),
    radial-gradient(1.5px 1.5px at 42% 12%, var(--color-gold), transparent),
    radial-gradient(1px 1px at 64% 82%, var(--color-text-muted), transparent),
    radial-gradient(1px 1px at 78% 58%, var(--color-text-muted), transparent),
    radial-gradient(1.5px 1.5px at 8% 88%, var(--color-gold), transparent),
    radial-gradient(1px 1px at 92% 90%, var(--color-text-muted), transparent);
}

.auth-panel {
  position: relative;
  width: 100%;
  max-width: 400px;
  animation: fadeIn 0.4s ease;
}

.auth-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: var(--space-lg);
}
.auth-title {
  margin-top: 14px;
  font-family: var(--font-serif);
  font-size: 2rem;
  letter-spacing: 0.3em;
  text-indent: 0.3em;
  color: var(--color-text-primary);
}
.auth-en {
  font-size: 0.7rem;
  letter-spacing: 0.4em;
  text-indent: 0.4em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.auth-subtitle {
  margin-top: 10px;
  font-size: 0.92rem;
  color: var(--color-text-secondary);
}

.auth-card {
  padding: var(--space-xl) var(--space-lg);
  box-shadow: var(--shadow-md);
  background: color-mix(in srgb, var(--color-bg-secondary) 92%, transparent);
  backdrop-filter: blur(6px);
}

/* Shared form layout for the pages rendered inside the shell */
.auth-card :deep(.auth-form) { display: flex; flex-direction: column; gap: var(--space-md); }
.auth-card :deep(.auth-form .btn-block) { margin-top: var(--space-xs); }
.auth-card :deep(.auth-row) { display: flex; justify-content: space-between; align-items: center; font-size: 0.82rem; }
.auth-card :deep(.auth-row a) { color: var(--color-accent); }
.auth-card :deep(.auth-row a:hover) { text-decoration: underline; }

.auth-footer {
  margin-top: var(--space-md);
  text-align: center;
  font-size: 0.86rem;
  color: var(--color-text-muted);
}
.auth-footer :deep(a) { color: var(--color-accent); font-weight: 500; }
.auth-footer :deep(a:hover) { text-decoration: underline; }

@media (max-width: 640px) {
  .auth-shell { align-items: flex-start; padding-top: 12vh; }
  .auth-card { padding: var(--space-lg) var(--space-md); }
  .auth-title { font-size: 1.7rem; }
}
</style>
