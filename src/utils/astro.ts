import type {
  AstroAspectType, AstroAspectClass, AstroBodyCategory, AstroBodyKey, AstroChartSettings, AstroDignity, AstroElement,
  AstroExtraBodyKey, AstroModality, AstroHouseSystem, BirthPlaceResolution,
} from '../../shared/types/astro.types';

/** U+FE0E forces text presentation so astro glyphs don't render as emoji. */
export const TXT = '︎';
export const SIGN_GLYPHS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'].map((g) => g + TXT);
export const SIGN_NAMES = ['白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '射手', '摩羯', '水瓶', '双鱼'];
export const SIGN_ELEMENT: AstroElement[] = ['fire', 'earth', 'air', 'water', 'fire', 'earth', 'air', 'water', 'fire', 'earth', 'air', 'water'];
export const ELEMENT_LABEL: Record<AstroElement, string> = { fire: '火', earth: '土', air: '风', water: '水' };
export const MODALITY_LABEL: Record<AstroModality, string> = { cardinal: '本位', fixed: '固定', mutable: '变动' };

export const HOUSE_SYSTEMS: { value: AstroHouseSystem; label: string }[] = [
  { value: 'placidus', label: 'Placidus' },
  { value: 'whole-sign', label: '整宫制' },
  { value: 'equal', label: '等宫制' },
  { value: 'porphyry', label: 'Porphyry' },
];

export const PRECISION_LABEL: Record<BirthPlaceResolution['precision'], string> = {
  manual: '手动经纬度', county: '区县级', city: '市级', province: '省级估算', default: '未识别',
};

export type AspectTone = 'harmonious' | 'challenging' | 'neutral';

export interface AspectMeta {
  type: AstroAspectType;
  name: string;
  angle: number;
  cls: AstroAspectClass;
  tone: AspectTone;
  /** CSS color expression (token based) */
  color: string;
  /** SVG stroke-dasharray; minor aspects are dashed */
  dash?: string;
  width: number;
}

/** All 11 aspects, ordered by angle. Colours stay within the ji / xiong / neutral token families. */
export const ASPECTS: AspectMeta[] = [
  { type: 'conjunction', name: '合', angle: 0, cls: 'major', tone: 'neutral', color: 'var(--color-gold)', width: 1.8 },
  { type: 'semisextile', name: '十二分', angle: 30, cls: 'minor', tone: 'harmonious', color: 'var(--color-ji)', dash: '2 3', width: 1 },
  { type: 'semisquare', name: '八分', angle: 45, cls: 'minor', tone: 'challenging', color: 'var(--color-xiong)', dash: '2 3', width: 1 },
  { type: 'sextile', name: '六合', angle: 60, cls: 'major', tone: 'harmonious', color: 'var(--color-ji)', width: 1.1 },
  { type: 'quintile', name: '五分', angle: 72, cls: 'minor', tone: 'harmonious', color: 'var(--color-info)', dash: '6 3', width: 1 },
  { type: 'square', name: '刑', angle: 90, cls: 'major', tone: 'challenging', color: 'var(--color-xiong)', width: 1.5 },
  { type: 'trine', name: '拱', angle: 120, cls: 'major', tone: 'harmonious', color: 'var(--color-ji)', width: 1.7 },
  { type: 'sesquiquadrate', name: '补八分', angle: 135, cls: 'minor', tone: 'challenging', color: 'var(--color-xiong)', dash: '6 3', width: 1 },
  { type: 'biquintile', name: '倍五分', angle: 144, cls: 'minor', tone: 'harmonious', color: 'var(--color-info)', dash: '2 3', width: 1 },
  { type: 'quincunx', name: '梅花', angle: 150, cls: 'minor', tone: 'challenging', color: 'var(--color-warning)', dash: '5 3', width: 1.1 },
  { type: 'opposition', name: '冲', angle: 180, cls: 'major', tone: 'challenging', color: 'var(--color-xiong)', width: 1.9 },
];

export const ASPECT_META: Record<AstroAspectType, AspectMeta> = Object.fromEntries(ASPECTS.map((a) => [a.type, a])) as Record<AstroAspectType, AspectMeta>;

export function aspectMeta(type: string): AspectMeta {
  return ASPECT_META[type as AstroAspectType] || ASPECT_META.conjunction;
}

export const DIGNITY_LABEL: Record<AstroDignity, string> = {
  domicile: '庙', exaltation: '旺', detriment: '陷', fall: '落', peregrine: '',
};

export function dignityTone(d?: AstroDignity): 'good' | 'bad' | '' {
  if (d === 'domicile' || d === 'exaltation') return 'good';
  if (d === 'detriment' || d === 'fall') return 'bad';
  return '';
}

// ── Asteroids & computed points ──

export interface ExtraBodyMeta { key: AstroExtraBodyKey; name: string; glyph: string; category: AstroBodyCategory; hint: string }

export const EXTRA_BODIES: ExtraBodyMeta[] = [
  { key: 'chiron', name: '凯龙星', glyph: '⚷' + TXT, category: 'asteroid', hint: '伤痛与疗愈' },
  { key: 'ceres', name: '谷神星', glyph: '⚳' + TXT, category: 'asteroid', hint: '滋养与照顾' },
  { key: 'pallas', name: '智神星', glyph: '⚴' + TXT, category: 'asteroid', hint: '智慧与策略' },
  { key: 'juno', name: '婚神星', glyph: '⚵' + TXT, category: 'asteroid', hint: '伴侣与承诺' },
  { key: 'vesta', name: '灶神星', glyph: '⚶' + TXT, category: 'asteroid', hint: '专注与奉献' },
  { key: 'lilith', name: '莉莉丝', glyph: '⚸' + TXT, category: 'point', hint: '平均月亮远地点' },
  { key: 'fortune', name: '福点', glyph: '⊗' + TXT, category: 'point', hint: '昼夜公式' },
];
export const EXTRA_BODY_KEYS: AstroExtraBodyKey[] = EXTRA_BODIES.map((b) => b.key);
export const DEFAULT_EXTRA_BODIES: AstroExtraBodyKey[] = ['chiron', 'lilith', 'fortune'];
export const DEFAULT_MINOR_BODY_ORB = 3;

/**
 * Hand-drawn glyphs (viewBox -10 -10 20 20) for bodies many fonts lack (⚷ ⚳ ⚴ ⚵ ⚶ ⚸ ⊗).
 * `fill` paths are filled with currentColor; the rest are stroked.
 */
export const BODY_GLYPH_PATHS: Partial<Record<AstroBodyKey, { d: string; fill?: string }>> = {
  // 凯龙：K 形钥匙 + 下方小圆
  chiron: { d: 'M0 2.2V-9 M0 -3.6L4.6 -8.6 M0 -3.6L4.2 0.4 M3 5.6A3 3 0 1 1 -3 5.6A3 3 0 1 1 3 5.6' },
  // 谷神：镰刀 + 十字
  ceres: { d: 'M-3.8 -6.2A4 4 0 1 1 0 -1.6V9 M-3.6 5H3.6' },
  // 智神：菱形 + 十字
  pallas: { d: 'M0 -9.5L4 -4.5L0 0.5L-4 -4.5Z M0 0.5V9 M-3.6 5.2H3.6' },
  // 婚神：星形 + 十字
  juno: { d: 'M0 -9V0 M-3.9 -6.8L3.9 -2.2 M-3.9 -2.2L3.9 -6.8 M0 0V9 M-3.6 5.2H3.6' },
  // 灶神：火焰 + 祭坛
  vesta: { d: 'M-5.5 -1.5L0 5.5L5.5 -1.5 M-6 8.5H6', fill: 'M0 -1C-2.6 -3.6 -1.4 -6.4 0 -9.5C1.4 -6.4 2.6 -3.6 0 -1Z' },
  // 莉莉丝：黑月 + 十字
  lilith: { d: 'M-0.8 1.2V9.2 M-4 5.6H2.4', fill: 'M1.2 -9.2A5.3 5.3 0 1 0 1.2 1A7 7 0 0 1 1.2 -9.2Z' },
  // 福点：圆 + 叉
  fortune: { d: 'M6.5 0A6.5 6.5 0 1 1 -6.5 0A6.5 6.5 0 1 1 6.5 0Z M-4.6 -4.6L4.6 4.6 M-4.6 4.6L4.6 -4.6' },
};

export const CATEGORY_LABEL: Record<AstroBodyCategory, string> = {
  planet: '行星', node: '交点', asteroid: '小行星', point: '虚点',
};

/** Asteroids and computed points (the server marks them with `category`; key fallback for old payloads). */
export function isMinorBody(p: { key: AstroBodyKey | string; category?: AstroBodyCategory }): boolean {
  if (p.category) return p.category === 'asteroid' || p.category === 'point';
  return (EXTRA_BODY_KEYS as string[]).includes(p.key);
}

// ── Settings (per chart kind, persisted in localStorage) ──

export type AstroWorkbenchKind = 'natal' | 'transit' | 'progressed' | 'solar-return' | 'synastry' | 'composite';

export interface AstroViewSettings extends AstroChartSettings {
  showDignity: boolean;
}

const MAJOR: AstroAspectType[] = ['conjunction', 'sextile', 'square', 'trine', 'opposition'];

const NATAL_ORBS: Record<AstroAspectType, number> = {
  conjunction: 8, opposition: 8, square: 7, trine: 7, sextile: 5,
  quincunx: 3, semisextile: 2, semisquare: 2, sesquiquadrate: 2, quintile: 2, biquintile: 2,
};
// Transits / progressions use much tighter orbs than natal charts
const TIGHT_ORBS: Record<AstroAspectType, number> = {
  conjunction: 2, opposition: 2, square: 2, trine: 2, sextile: 1.5,
  quincunx: 1, semisextile: 1, semisquare: 1, sesquiquadrate: 1, quintile: 1, biquintile: 1,
};
const SYNASTRY_ORBS: Record<AstroAspectType, number> = {
  conjunction: 6, opposition: 6, square: 5, trine: 5, sextile: 4,
  quincunx: 2, semisextile: 1.5, semisquare: 1.5, sesquiquadrate: 1.5, quintile: 1.5, biquintile: 1.5,
};

export function defaultSettings(kind: AstroWorkbenchKind): AstroViewSettings {
  const base = {
    houseSystem: 'placidus' as AstroHouseSystem, aspects: [...MAJOR], showDignity: true,
    extraBodies: [...DEFAULT_EXTRA_BODIES],
  };
  switch (kind) {
    case 'transit':
      return { ...base, orbs: { ...TIGHT_ORBS }, luminaryBonus: 0.5, minorBodyOrb: 1.5 };
    case 'progressed':
      return { ...base, orbs: Object.fromEntries(Object.entries(TIGHT_ORBS).map(([k, v]) => [k, Math.min(v, 1)])), luminaryBonus: 0, minorBodyOrb: 1 };
    case 'synastry':
      return { ...base, orbs: { ...SYNASTRY_ORBS }, luminaryBonus: 2, minorBodyOrb: 2 };
    default:
      return { ...base, orbs: { ...NATAL_ORBS }, luminaryBonus: 2, minorBodyOrb: DEFAULT_MINOR_BODY_ORB };
  }
}

const storeKey = (kind: AstroWorkbenchKind) => `arcanum.astro.settings.${kind}`;

export function loadSettings(kind: AstroWorkbenchKind): AstroViewSettings {
  const def = defaultSettings(kind);
  try {
    const raw = localStorage.getItem(storeKey(kind));
    if (!raw) return def;
    const saved = JSON.parse(raw) as Partial<AstroViewSettings>;
    return {
      houseSystem: HOUSE_SYSTEMS.some((h) => h.value === saved.houseSystem) ? saved.houseSystem! : def.houseSystem,
      aspects: Array.isArray(saved.aspects) ? saved.aspects.filter((a) => a in ASPECT_META) : def.aspects,
      orbs: { ...def.orbs, ...(saved.orbs || {}) },
      luminaryBonus: typeof saved.luminaryBonus === 'number' ? saved.luminaryBonus : def.luminaryBonus,
      showDignity: typeof saved.showDignity === 'boolean' ? saved.showDignity : def.showDignity,
      // Settings saved before asteroids existed have no such fields → defaults
      extraBodies: Array.isArray(saved.extraBodies)
        ? EXTRA_BODY_KEYS.filter((k) => saved.extraBodies!.includes(k))
        : def.extraBodies,
      minorBodyOrb: typeof saved.minorBodyOrb === 'number' ? saved.minorBodyOrb : def.minorBodyOrb,
    };
  } catch {
    return def;
  }
}

export function saveSettings(kind: AstroWorkbenchKind, s: AstroViewSettings) {
  try { localStorage.setItem(storeKey(kind), JSON.stringify(s)); } catch { /* storage unavailable */ }
}

/** The part of the view settings the server understands. */
export function toServerSettings(s: AstroViewSettings): AstroChartSettings {
  return {
    houseSystem: s.houseSystem, aspects: s.aspects, orbs: s.orbs, luminaryBonus: s.luminaryBonus,
    extraBodies: s.extraBodies, minorBodyOrb: s.minorBodyOrb,
  };
}

export const fmtDeg = (p: { degree: number; minute: number }) => `${p.degree}°${String(p.minute).padStart(2, '0')}′`;
