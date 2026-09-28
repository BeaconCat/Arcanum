<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';

const heading = ref<number | null>(null);
const error = ref('');
const supported = ref(false);

// 24山 (24 Mountains) mapping — traditional fengshui compass divisions
const MOUNTAINS_24 = [
  { name: '壬', start: 337.5, end: 352.5 },
  { name: '子', start: 352.5, end: 7.5 },
  { name: '癸', start: 7.5, end: 22.5 },
  { name: '丑', start: 22.5, end: 37.5 },
  { name: '艮', start: 37.5, end: 52.5 },
  { name: '寅', start: 52.5, end: 67.5 },
  { name: '甲', start: 67.5, end: 82.5 },
  { name: '卯', start: 82.5, end: 97.5 },
  { name: '乙', start: 97.5, end: 112.5 },
  { name: '辰', start: 112.5, end: 127.5 },
  { name: '巽', start: 127.5, end: 142.5 },
  { name: '巳', start: 142.5, end: 157.5 },
  { name: '丙', start: 157.5, end: 172.5 },
  { name: '午', start: 172.5, end: 187.5 },
  { name: '丁', start: 187.5, end: 202.5 },
  { name: '未', start: 202.5, end: 217.5 },
  { name: '坤', start: 217.5, end: 232.5 },
  { name: '申', start: 232.5, end: 247.5 },
  { name: '庚', start: 247.5, end: 262.5 },
  { name: '酉', start: 262.5, end: 277.5 },
  { name: '辛', start: 277.5, end: 292.5 },
  { name: '戌', start: 292.5, end: 307.5 },
  { name: '乾', start: 307.5, end: 322.5 },
  { name: '亥', start: 322.5, end: 337.5 },
];

const DIRECTIONS: Record<string, string> = {
  N: '北', NE: '东北', E: '东', SE: '东南',
  S: '南', SW: '西南', W: '西', NW: '西北',
};

function getDirection(deg: number): string {
  if (deg >= 337.5 || deg < 22.5) return DIRECTIONS.N;
  if (deg < 67.5) return DIRECTIONS.NE;
  if (deg < 112.5) return DIRECTIONS.E;
  if (deg < 157.5) return DIRECTIONS.SE;
  if (deg < 202.5) return DIRECTIONS.S;
  if (deg < 247.5) return DIRECTIONS.SW;
  if (deg < 292.5) return DIRECTIONS.W;
  return DIRECTIONS.NW;
}

function getMountain(deg: number): string {
  for (const m of MOUNTAINS_24) {
    if (m.start > m.end) {
      // wraps around 0 (e.g. 337.5 – 352.5)
      if (deg >= m.start || deg < m.end) return m.name;
    } else {
      if (deg >= m.start && deg < m.end) return m.name;
    }
  }
  return '子';
}

const directionText = computed(() => heading.value !== null ? getDirection(heading.value) : '--');
const mountainText = computed(() => heading.value !== null ? getMountain(heading.value) : '--');
const degreeText = computed(() => heading.value !== null ? `${Math.round(heading.value)}°` : '--');
const rotateStyle = computed(() => heading.value !== null ? `transform: rotate(${-heading.value}deg)` : '');

const emit = defineEmits<{
  (e: 'reading', data: { heading: number; direction: string; mountain: string }): void;
}>();

function onOrientation(e: DeviceOrientationEvent) {
  // webkitCompassHeading for iOS, alpha for Android (inverted)
  let h = (e as any).webkitCompassHeading ?? (e.alpha !== null ? (360 - e.alpha!) % 360 : null);
  if (h === null) return;
  heading.value = h;
  emit('reading', { heading: h, direction: getDirection(h), mountain: getMountain(h) });
}

async function requestPermission() {
  try {
    // iOS 13+ requires explicit permission
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      const result = await (DeviceOrientationEvent as any).requestPermission();
      if (result !== 'granted') {
        error.value = '未获得陀螺仪权限';
        return;
      }
    }
    window.addEventListener('deviceorientation', onOrientation, true);
    supported.value = true;
  } catch {
    error.value = '设备不支持陀螺仪';
  }
}

onMounted(() => {
  if ('DeviceOrientationEvent' in window) {
    requestPermission();
  } else {
    error.value = '设备不支持方向传感器';
  }
});

onUnmounted(() => {
  window.removeEventListener('deviceorientation', onOrientation, true);
});
</script>

<template>
  <div class="compass-widget">
    <div class="compass-ring" :style="rotateStyle">
      <div class="compass-face">
        <!-- Cardinal marks -->
        <span class="cardinal n">北</span>
        <span class="cardinal e">东</span>
        <span class="cardinal s">南</span>
        <span class="cardinal w">西</span>
        <!-- 24 mountain ticks -->
        <div
          v-for="(m, i) in MOUNTAINS_24"
          :key="i"
          class="mountain-tick"
          :style="`transform: rotate(${m.start + 7.5}deg)`"
        >
          <span class="mountain-label" :style="`transform: rotate(${-(m.start + 7.5)}deg)`">{{ m.name }}</span>
        </div>
      </div>
    </div>
    <!-- Fixed pointer -->
    <div class="compass-pointer">▼</div>
    <div class="compass-info">
      <span class="compass-degree">{{ degreeText }}</span>
      <span class="compass-dir">{{ directionText }} · {{ mountainText }}山</span>
    </div>
    <div v-if="error" class="compass-error">{{ error }}</div>
  </div>
</template>

<style scoped>
.compass-widget {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
}

.compass-ring {
  width: 220px;
  height: 220px;
  border-radius: 50%;
  border: 2px solid var(--color-border-strong);
  background: var(--color-bg-secondary);
  position: relative;
  transition: transform 0.15s ease-out;
}

.compass-face {
  width: 100%;
  height: 100%;
  position: relative;
}

.cardinal {
  position: absolute;
  font-weight: 700;
  font-size: 0.85rem;
  color: var(--color-text-primary);
}
.cardinal.n { top: 8px; left: 50%; transform: translateX(-50%); color: var(--color-seal); }
.cardinal.s { bottom: 8px; left: 50%; transform: translateX(-50%); }
.cardinal.e { right: 8px; top: 50%; transform: translateY(-50%); }
.cardinal.w { left: 8px; top: 50%; transform: translateY(-50%); }

.mountain-tick {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 1px;
  height: 50%;
  transform-origin: bottom center;
}
.mountain-label {
  position: absolute;
  top: 6px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.55rem;
  color: var(--color-text-muted);
  white-space: nowrap;
}

.compass-pointer {
  margin-top: -18px;
  color: var(--color-seal);
  font-size: 1.2rem;
  z-index: 1;
}

.compass-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.compass-degree { font-size: 1.5rem; font-weight: 700; }
.compass-dir { font-size: 0.9rem; color: var(--color-text-secondary); }

.compass-error {
  font-size: 0.8rem;
  color: var(--color-error);
  text-align: center;
}
</style>
