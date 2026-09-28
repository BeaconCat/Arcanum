import { ref } from 'vue';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'theme';

function readSaved(): ThemeMode | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    return null;
  }
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

// Module-level singleton so header, charts, etc. share one source of truth
const theme = ref<ThemeMode>(readSaved() ?? (systemPrefersDark() ? 'dark' : 'light'));

function apply(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === 'dark') root.setAttribute('data-theme', 'dark');
  else root.removeAttribute('data-theme');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', mode === 'dark' ? '#101217' : '#f6f3ee');
}

let initialized = false;

export function useTheme() {
  if (!initialized && typeof window !== 'undefined') {
    initialized = true;
    apply(theme.value);
    // Follow system changes only while the user hasn't picked explicitly
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', (e) => {
      if (readSaved()) return;
      theme.value = e.matches ? 'dark' : 'light';
      apply(theme.value);
    });
  }

  function setTheme(mode: ThemeMode) {
    theme.value = mode;
    try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* ignore */ }
    apply(mode);
  }

  function toggleTheme() {
    setTheme(theme.value === 'dark' ? 'light' : 'dark');
  }

  return { theme, setTheme, toggleTheme };
}

/** Read a resolved CSS custom property from :root (for canvas renderers like ECharts). */
export function cssVar(name: string, fallback = ''): string {
  if (typeof window === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}
