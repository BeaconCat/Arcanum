/**
 * 西洋占星本命盘（星盘）引擎
 *
 * - 行星位置：astronomy-engine（MIT），地心视位置，真黄道/真春分点（of date），含光行差与章动
 * - 平均月交点：Meeus《Astronomical Algorithms》47.7
 * - 上升/天顶：格林尼治视恒星时 + 真黄赤交角
 * - 宫制：Placidus（迭代）/ 整宫 / 等宫 / Porphyry；|纬度| > 66° 时 Placidus 退化为 Porphyry
 * - 相位：11 种（5 主相位 + 6 小相位），容许度可配置
 * - 庙旺陷落：传统七星用古典表；天王/海王/冥王只论现代庙陷（旺落各派说法不一，不标注）
 * - 格局：大三角、大十字、T三角、风筝、上帝之指、神秘长方形、星群
 * - 小行星（凯龙、谷神、智神、婚神、灶神）：预计算星历表插值（asteroid.engine.ts，1850–2200）；
 *   虚点：莉莉丝（平均月亮远地点）、福点（昼夜公式）。它们只取主相位、容许度单独设置，
 *   不计入元素/模式/阴阳/半球分布与格局，也不标庙旺陷。
 *
 * 计算分两步：`rawPositionsAt`（某 UTC 时刻的原始黄经与速度）→ `assembleChart`（宫位、相位、
 * 分布、格局）。行运、推运、返照、组合盘（astro-overlay.engine.ts）复用这两步。
 */
import * as AstronomyNs from 'astronomy-engine';

// tsx resolves the package's CJS build, whose namespace only exposes `default`; plain ESM exposes named exports
const Astronomy = ((AstronomyNs as { Body?: unknown }).Body ? AstronomyNs : (AstronomyNs as unknown as { default: typeof AstronomyNs }).default) as typeof AstronomyNs;
type Body = AstronomyNs.Body;
type AstroTime = AstronomyNs.AstroTime;
import { asteroidPosition, meanLilith, partOfFortune, asteroidRange, type AsteroidKey } from './asteroid.engine';
import type {
  AstroAngle, AstroAspect, AstroAspectClass, AstroAspectType, AstroBodyCategory, AstroBodyKey, AstroChart, AstroChartSettings,
  AstroExtraBodyKey,
  AstroDignity, AstroDistribution, AstroElement, AstroHouseCusp, AstroHouseSystem, AstroModality, AstroPattern,
  AstroPlanet, AstroPointKey, AstroSignPosition, BirthPlaceResolution,
} from '../../shared/types/astro.types';

// ── Constants ──

export const SIGNS = ['白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '射手', '摩羯', '水瓶', '双鱼'];
// U+FE0E forces text presentation so browsers don't render these as emoji
export const SIGN_SYMBOLS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'].map((s) => `${s}︎`);
const SIGN_ELEMENT: AstroElement[] = ['fire', 'earth', 'air', 'water', 'fire', 'earth', 'air', 'water', 'fire', 'earth', 'air', 'water'];
const SIGN_MODALITY: AstroModality[] = ['cardinal', 'fixed', 'mutable', 'cardinal', 'fixed', 'mutable', 'cardinal', 'fixed', 'mutable', 'cardinal', 'fixed', 'mutable'];
export const ELEMENT_NAMES: Record<AstroElement, string> = { fire: '火', earth: '土', air: '风', water: '水' };
export const MODALITY_NAMES: Record<AstroModality, string> = { cardinal: '本位', fixed: '固定', mutable: '变动' };

interface BodyDef { key: AstroBodyKey; name: string; symbol: string; category: AstroBodyCategory; body?: Body }
const BODIES: BodyDef[] = ([
  { key: 'sun', name: '太阳', symbol: '☉', category: 'planet', body: Astronomy.Body.Sun },
  { key: 'moon', name: '月亮', symbol: '☽', category: 'planet', body: Astronomy.Body.Moon },
  { key: 'mercury', name: '水星', symbol: '☿', category: 'planet', body: Astronomy.Body.Mercury },
  { key: 'venus', name: '金星', symbol: '♀', category: 'planet', body: Astronomy.Body.Venus },
  { key: 'mars', name: '火星', symbol: '♂', category: 'planet', body: Astronomy.Body.Mars },
  { key: 'jupiter', name: '木星', symbol: '♃', category: 'planet', body: Astronomy.Body.Jupiter },
  { key: 'saturn', name: '土星', symbol: '♄', category: 'planet', body: Astronomy.Body.Saturn },
  { key: 'uranus', name: '天王星', symbol: '♅', category: 'planet', body: Astronomy.Body.Uranus },
  { key: 'neptune', name: '海王星', symbol: '♆', category: 'planet', body: Astronomy.Body.Neptune },
  { key: 'pluto', name: '冥王星', symbol: '♇', category: 'planet', body: Astronomy.Body.Pluto },
  { key: 'northNode', name: '北交点', symbol: '☊', category: 'node' },
  { key: 'southNode', name: '南交点', symbol: '☋', category: 'node' },
  { key: 'chiron', name: '凯龙星', symbol: '⚷', category: 'asteroid' },
  { key: 'ceres', name: '谷神星', symbol: '⚳', category: 'asteroid' },
  { key: 'pallas', name: '智神星', symbol: '⚴', category: 'asteroid' },
  { key: 'juno', name: '婚神星', symbol: '⚵', category: 'asteroid' },
  { key: 'vesta', name: '灶神星', symbol: '⚶', category: 'asteroid' },
  { key: 'lilith', name: '莉莉丝', symbol: '⚸', category: 'point' },
  { key: 'fortune', name: '福点', symbol: '⊗', category: 'point' },
] as BodyDef[]).map((b) => ({ ...b, symbol: `${b.symbol}︎` }));

export const PLANET_KEYS: AstroBodyKey[] = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
export const EXTRA_BODY_KEYS: AstroExtraBodyKey[] = ['chiron', 'ceres', 'pallas', 'juno', 'vesta', 'lilith', 'fortune'];
const ASTEROID_KEYS_SET = new Set<AstroBodyKey>(['chiron', 'ceres', 'pallas', 'juno', 'vesta']);
/** Asteroids and computed points: major aspects only, own orb, excluded from distribution/patterns/dignities */
export const isMinorBody = (k: AstroPointKey): boolean => (EXTRA_BODY_KEYS as string[]).includes(k);
export const BODY_CATEGORY: Record<AstroBodyKey, AstroBodyCategory> =
  Object.fromEntries(BODIES.map((b) => [b.key, b.category])) as Record<AstroBodyKey, AstroBodyCategory>;

export const POINT_NAMES: Record<AstroPointKey, string> = {
  ...Object.fromEntries(BODIES.map((b) => [b.key, b.name])) as Record<AstroBodyKey, string>,
  asc: '上升', mc: '天顶',
};

/** Traditional rulers by sign (命主星) */
const SIGN_RULER: AstroBodyKey[] = ['mars', 'venus', 'mercury', 'moon', 'sun', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'saturn', 'jupiter'];

export interface AspectDef {
  type: AstroAspectType;
  name: string;
  angle: number;
  class: AstroAspectClass;
  harmony: AstroAspect['harmony'];
}

export const ASPECT_DEFS: AspectDef[] = [
  { type: 'conjunction', name: '合', angle: 0, class: 'major', harmony: 'neutral' },
  { type: 'semisextile', name: '十二分', angle: 30, class: 'minor', harmony: 'neutral' },
  { type: 'semisquare', name: '八分', angle: 45, class: 'minor', harmony: 'challenging' },
  { type: 'sextile', name: '六合', angle: 60, class: 'major', harmony: 'harmonious' },
  { type: 'quintile', name: '五分', angle: 72, class: 'minor', harmony: 'harmonious' },
  { type: 'square', name: '刑', angle: 90, class: 'major', harmony: 'challenging' },
  { type: 'trine', name: '拱', angle: 120, class: 'major', harmony: 'harmonious' },
  { type: 'sesquiquadrate', name: '补八分', angle: 135, class: 'minor', harmony: 'challenging' },
  { type: 'biquintile', name: '倍五分', angle: 144, class: 'minor', harmony: 'harmonious' },
  { type: 'quincunx', name: '梅花', angle: 150, class: 'minor', harmony: 'challenging' },
  { type: 'opposition', name: '冲', angle: 180, class: 'major', harmony: 'challenging' },
];
const ASPECT_TYPES = ASPECT_DEFS.map((a) => a.type);
export const MAJOR_ASPECTS: AstroAspectType[] = ASPECT_DEFS.filter((a) => a.class === 'major').map((a) => a.type);

export const HOUSE_SYSTEM_NAMES: Record<AstroHouseSystem, string> = {
  placidus: 'Placidus', 'whole-sign': '整宫制', equal: '等宫制', porphyry: 'Porphyry',
};
const HOUSE_SYSTEMS: AstroHouseSystem[] = ['placidus', 'whole-sign', 'equal', 'porphyry'];

/** Defaults: the five Ptolemaic aspects plus the quincunx (needed for 上帝之指). */
export const DEFAULT_ASTRO_SETTINGS: AstroChartSettings = {
  houseSystem: 'placidus',
  aspects: ['conjunction', 'sextile', 'square', 'trine', 'opposition', 'quincunx'],
  orbs: {
    conjunction: 8, opposition: 8, trine: 7, square: 7, sextile: 5,
    semisextile: 2, semisquare: 2, quintile: 2, sesquiquadrate: 2, biquintile: 2, quincunx: 2,
  },
  luminaryBonus: 2,
  extraBodies: ['chiron', 'lilith', 'fortune'],
  minorBodyOrb: 3,
};

/** Merge user settings over defaults, dropping anything invalid. */
export function resolveSettings(partial?: Partial<AstroChartSettings> | null, legacyHouseSystem?: AstroHouseSystem): AstroChartSettings {
  const p = partial || {};
  const houseSystem = HOUSE_SYSTEMS.includes(p.houseSystem as AstroHouseSystem)
    ? p.houseSystem as AstroHouseSystem
    : (legacyHouseSystem && HOUSE_SYSTEMS.includes(legacyHouseSystem) ? legacyHouseSystem : DEFAULT_ASTRO_SETTINGS.houseSystem);
  const aspects = Array.isArray(p.aspects)
    ? ASPECT_TYPES.filter((t) => p.aspects!.includes(t))
    : [...DEFAULT_ASTRO_SETTINGS.aspects];
  const orbs: AstroChartSettings['orbs'] = { ...DEFAULT_ASTRO_SETTINGS.orbs };
  if (p.orbs && typeof p.orbs === 'object') {
    for (const t of ASPECT_TYPES) {
      const v = Number((p.orbs as Record<string, unknown>)[t]);
      if (Number.isFinite(v)) orbs[t] = Math.min(15, Math.max(0, v));
    }
  }
  const bonus = Number(p.luminaryBonus);
  const extraBodies = Array.isArray(p.extraBodies)
    ? EXTRA_BODY_KEYS.filter((k) => p.extraBodies!.includes(k))
    : [...DEFAULT_ASTRO_SETTINGS.extraBodies];
  const minorOrb = Number(p.minorBodyOrb);
  return {
    houseSystem,
    aspects,
    orbs,
    luminaryBonus: Number.isFinite(bonus) ? Math.min(5, Math.max(0, bonus)) : DEFAULT_ASTRO_SETTINGS.luminaryBonus,
    extraBodies,
    minorBodyOrb: Number.isFinite(minorOrb) ? Math.min(10, Math.max(0, minorOrb)) : DEFAULT_ASTRO_SETTINGS.minorBodyOrb,
  };
}

// ── Dignities ──

// signIndex lists
const DOMICILE: Partial<Record<AstroBodyKey, number[]>> = {
  sun: [4], moon: [3], mercury: [2, 5], venus: [1, 6], mars: [0, 7], jupiter: [8, 11], saturn: [9, 10],
  uranus: [10], neptune: [11], pluto: [7],
};
// Outer planets: exaltations are disputed between schools, so none are assigned
const EXALTATION: Partial<Record<AstroBodyKey, number>> = {
  sun: 0, moon: 1, mercury: 5, venus: 11, mars: 9, jupiter: 3, saturn: 6,
};
const DIGNITY_NAMES: Record<AstroDignity, string> = { domicile: '庙', exaltation: '旺', detriment: '陷', fall: '落', peregrine: '' };

export function dignityOf(key: AstroBodyKey, signIndex: number): AstroDignity | undefined {
  if (!PLANET_KEYS.includes(key)) return undefined;
  const dom = DOMICILE[key] || [];
  const ex = EXALTATION[key];
  if (dom.includes(signIndex)) return 'domicile';
  if (ex === signIndex) return 'exaltation';
  if (dom.some((s) => (s + 6) % 12 === signIndex)) return 'detriment';
  if (ex !== undefined && (ex + 6) % 12 === signIndex) return 'fall';
  return 'peregrine';
}

// ── Math helpers ──

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
export const norm = (x: number) => ((x % 360) + 360) % 360;
const sind = (x: number) => Math.sin(x * D2R);
const cosd = (x: number) => Math.cos(x * D2R);
const tand = (x: number) => Math.tan(x * D2R);
/** Signed smallest difference b - a in (-180, 180] */
export const diff = (a: number, b: number) => { const d = norm(b - a); return d > 180 ? d - 360 : d; };
/** The nearer of the two midpoints of a and b */
export const midpoint = (a: number, b: number) => norm(a + diff(a, b) / 2);

export function signPosition(longitude: number): AstroSignPosition {
  const lon = norm(longitude);
  const signIndex = Math.floor(lon / 30) % 12;
  const within = lon - signIndex * 30;
  let degree = Math.floor(within);
  let minute = Math.round((within - degree) * 60);
  if (minute === 60) { minute = 0; degree += 1; }
  return { longitude: +lon.toFixed(4), signIndex, sign: SIGNS[signIndex], signSymbol: SIGN_SYMBOLS[signIndex], degree: Math.min(degree, 29), minute };
}

export function formatDegree(p: AstroSignPosition): string {
  return `${p.sign}${p.degree}°${String(p.minute).padStart(2, '0')}′`;
}

// ── Time zone: local wall-clock time ↔ UTC (DST aware via Intl / IANA tzdata) ──

export function tzOffsetMinutes(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - utcMs) / 60000);
}

export function localToUtc(birthDate: string, birthTime: string, timeZone: string): { date: Date; offsetMinutes: number } {
  const [y, m, d] = birthDate.split('-').map(Number);
  const [hh, mm] = (birthTime || '12:00').split(':').map(Number);
  if (![y, m, d, hh].every(Number.isFinite)) throw new Error(`无效的出生日期/时间: ${birthDate} ${birthTime}`);
  const wall = Date.UTC(y, m - 1, d, hh, mm || 0);
  // Two passes resolve offsets that differ on either side of a DST transition
  let offset = tzOffsetMinutes(wall, timeZone);
  offset = tzOffsetMinutes(wall - offset * 60000, timeZone);
  return { date: new Date(wall - offset * 60000), offsetMinutes: offset };
}

/** Local wall-clock parts of a UTC instant in a time zone. */
export function utcToLocal(date: Date, timeZone: string): { date: string; time: string; seconds: string; offsetMinutes: number } {
  const offsetMinutes = tzOffsetMinutes(date.getTime(), timeZone);
  const local = new Date(date.getTime() + offsetMinutes * 60000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`,
    time: `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`,
    seconds: pad(local.getUTCSeconds()),
    offsetMinutes,
  };
}

export function formatOffset(min: number): string {
  const sign = min >= 0 ? '+' : '-';
  const a = Math.abs(min);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

// ── Positions ──

function bodyLongitude(body: Body, time: AstroTime): number {
  if (body === Astronomy.Body.Sun) return Astronomy.SunPosition(time).elon;
  return Astronomy.Ecliptic(Astronomy.GeoVector(body, time, true)).elon;
}

/** Mean ascending lunar node (Meeus 47.7) */
function meanNode(time: AstroTime): number {
  const T = time.tt / 36525;
  return norm(125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + (T * T * T) / 467441 - (T * T * T * T) / 60616000);
}

/** Longitude and speed (deg/day); null when unavailable (asteroid outside the ephemeris range) or not a moving body (福点). */
function longitudeAndSpeed(def: BodyDef, time: AstroTime): { lon: number; speed: number } | null {
  if (ASTEROID_KEYS_SET.has(def.key)) {
    const p = asteroidPosition(def.key as AsteroidKey, time.ut + 2451545.0);
    return p ? { lon: p.longitude, speed: p.speed } : null;
  }
  if (def.key === 'lilith') {
    const l = meanLilith(time.tt + 2451545.0);
    return { lon: l.longitude, speed: l.speed };
  }
  if (def.key === 'fortune') return null; // needs the ascendant — computed in assembleChart
  const at = (t: AstroTime) => (def.key === 'northNode' || def.key === 'southNode')
    ? norm(meanNode(t) + (def.key === 'southNode' ? 180 : 0))
    : bodyLongitude(def.body!, t);
  const lon = at(time);
  const speed = diff(at(time.AddDays(-0.5)), at(time.AddDays(0.5)));
  return { lon, speed };
}

/** Apparent geocentric longitude of the Sun at a UTC instant (for solar arcs / returns). */
export function sunLongitudeAt(date: Date): number {
  return Astronomy.SunPosition(Astronomy.MakeTime(date)).elon;
}

// ── Angles & houses ──

function ascendant(ramc: number, eps: number, lat: number): number {
  return norm(Math.atan2(cosd(ramc), -(sind(ramc) * cosd(eps) + tand(lat) * sind(eps))) * R2D);
}

function midheaven(ramc: number, eps: number): number {
  return norm(Math.atan2(sind(ramc), cosd(ramc) * cosd(eps)) * R2D);
}

/** RAMC for a given MC longitude (inverse of `midheaven`) */
function ramcFromMc(mc: number, eps: number): number {
  return norm(Math.atan2(sind(mc) * cosd(eps), cosd(mc)) * R2D);
}

/** Ecliptic longitude on the ecliptic for a given right ascension */
function lonFromRa(ra: number, eps: number): number {
  return norm(Math.atan2(sind(ra), cosd(ra) * cosd(eps)) * R2D);
}

function placidusCusp(ramc: number, eps: number, lat: number, house: 11 | 12 | 2 | 3): number | null {
  const cfg = { 11: { f: 1 / 3, day: true }, 12: { f: 2 / 3, day: true }, 2: { f: 2 / 3, day: false }, 3: { f: 1 / 3, day: false } }[house];
  let ra = ramc + (house === 11 ? 30 : house === 12 ? 60 : house === 2 ? 120 : 150);
  for (let i = 0; i < 60; i++) {
    const lon = lonFromRa(ra, eps);
    const dec = Math.asin(sind(eps) * sind(lon)) * R2D;
    const x = -tand(lat) * tand(dec);
    if (Math.abs(x) > 1) return null;
    const dsa = Math.acos(x) * R2D;          // diurnal semi-arc
    const nsa = 180 - dsa;                   // nocturnal semi-arc
    const next = cfg.day ? ramc + cfg.f * dsa : ramc + 180 - cfg.f * nsa;
    if (Math.abs(diff(ra, next)) < 1e-7) { ra = next; break; }
    ra = next;
  }
  return lonFromRa(ra, eps);
}

function porphyryCusps(asc: number, mc: number): number[] {
  const ic = norm(mc + 180);
  const dsc = norm(asc + 180);
  const q1 = norm(ic - asc) / 3;   // houses 1–3
  const q2 = norm(dsc - ic) / 3;   // houses 4–6
  const cusps = new Array<number>(12);
  cusps[0] = asc; cusps[1] = norm(asc + q1); cusps[2] = norm(asc + 2 * q1);
  cusps[3] = ic; cusps[4] = norm(ic + q2); cusps[5] = norm(ic + 2 * q2);
  for (let i = 0; i < 6; i++) cusps[i + 6] = norm(cusps[i] + 180);
  return cusps;
}

export function houseCusps(system: AstroHouseSystem, asc: number, mc: number, ramc: number, eps: number, lat: number): { cusps: number[]; used: AstroHouseSystem; note?: string } {
  if (system === 'whole-sign') {
    const start = Math.floor(asc / 30) * 30;
    return { cusps: Array.from({ length: 12 }, (_, i) => norm(start + i * 30)), used: system };
  }
  if (system === 'equal') return { cusps: Array.from({ length: 12 }, (_, i) => norm(asc + i * 30)), used: system };
  if (system === 'porphyry') return { cusps: porphyryCusps(asc, mc), used: system };

  const note = '出生地纬度超过 ±66°，Placidus 宫位无解，已自动改用 Porphyry 宫制';
  if (Math.abs(lat) > 66) return { cusps: porphyryCusps(asc, mc), used: 'porphyry', note };
  const c11 = placidusCusp(ramc, eps, lat, 11);
  const c12 = placidusCusp(ramc, eps, lat, 12);
  const c2 = placidusCusp(ramc, eps, lat, 2);
  const c3 = placidusCusp(ramc, eps, lat, 3);
  if (c11 === null || c12 === null || c2 === null || c3 === null) return { cusps: porphyryCusps(asc, mc), used: 'porphyry', note };
  const cusps = [asc, c2, c3, norm(mc + 180), norm(c11 + 180), norm(c12 + 180), norm(asc + 180), norm(c2 + 180), norm(c3 + 180), mc, c11, c12];
  return { cusps, used: 'placidus' };
}

export function houseOf(lon: number, cusps: number[]): number {
  for (let i = 0; i < 12; i++) {
    const start = cusps[i];
    const end = cusps[(i + 1) % 12];
    const span = norm(end - start);
    if (norm(lon - start) < span) return i + 1;
  }
  return 1;
}

// ── Aspects ──

export interface AspectPoint { key: AstroPointKey; name: string; lon: number; speed: number }

const isLuminary = (k: AstroPointKey) => k === 'sun' || k === 'moon';

/**
 * Find the closest enabled aspect between two points, or null.
 * `orbFor` returns the allowed orb for an aspect type given whether a luminary is involved.
 */
export function aspectBetween(
  a: AspectPoint, b: AspectPoint,
  types: AstroAspectType[],
  orbFor: (type: AstroAspectType, luminary: boolean) => number,
  /** Orb cap when an asteroid / point is involved (they take major aspects only) */
  minorBodyOrb: number = DEFAULT_ASTRO_SETTINGS.minorBodyOrb,
): AstroAspect | null {
  const sep = Math.abs(diff(a.lon, b.lon));
  const minor = isMinorBody(a.key) || isMinorBody(b.key);
  const lum = !minor && (isLuminary(a.key) || isLuminary(b.key));
  let best: { def: AspectDef; orb: number } | null = null;
  for (const def of ASPECT_DEFS) {
    if (!types.includes(def.type)) continue;
    if (minor && def.class !== 'major') continue;
    const orb = Math.abs(sep - def.angle);
    const allowed = minor ? Math.min(minorBodyOrb, orbFor(def.type, false)) : orbFor(def.type, lum);
    if (orb > allowed) continue;
    if (!best || orb < best.orb) best = { def, orb };
  }
  if (!best) return null;
  // Applying if the orb shrinks a moment later (angles / fixed natal points have speed 0)
  const dt = 0.01;
  const sepLater = Math.abs(diff(a.lon + a.speed * dt, b.lon + b.speed * dt));
  const applying = Math.abs(sepLater - best.def.angle) < best.orb;
  return {
    a: a.key, b: b.key, aName: a.name, bName: b.name,
    type: best.def.type, typeName: best.def.name, angle: best.def.angle, class: best.def.class,
    orb: +best.orb.toFixed(2), applying, harmony: best.def.harmony,
  };
}

export function settingsOrb(settings: AstroChartSettings) {
  return (type: AstroAspectType, luminary: boolean) =>
    (settings.orbs[type] ?? DEFAULT_ASTRO_SETTINGS.orbs[type] ?? 2) + (luminary ? settings.luminaryBonus : 0);
}

// ── Patterns ──

function findPatterns(planets: AstroPlanet[], settings: AstroChartSettings): AstroPattern[] {
  const pts = planets.filter((p) => PLANET_KEYS.includes(p.key));
  const orbFor = settingsOrb(settings);
  const n = pts.length;
  // Pairwise major aspects (+ quincunx for 上帝之指) regardless of which aspects are displayed
  const rel = new Map<string, AstroAspectType>();
  const key = (i: number, j: number) => (i < j ? `${i}-${j}` : `${j}-${i}`);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const asp = aspectBetween(
        { key: pts[i].key, name: pts[i].name, lon: pts[i].longitude, speed: 0 },
        { key: pts[j].key, name: pts[j].name, lon: pts[j].longitude, speed: 0 },
        [...MAJOR_ASPECTS, 'quincunx'], orbFor,
      );
      if (asp) rel.set(key(i, j), asp.type);
    }
  }
  const is = (i: number, j: number, t: AstroAspectType) => rel.get(key(i, j)) === t;
  const names = (idx: number[]) => idx.map((i) => pts[i].name);
  const keysOf = (idx: number[]) => idx.map((i) => pts[i].key as AstroPointKey);
  const out: AstroPattern[] = [];
  const seen = new Set<string>();
  const add = (p: AstroPattern) => {
    const id = `${p.type}:${[...p.bodies].sort().join(',')}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push(p);
  };
  const sameElement = (idx: number[]) => idx.every((i) => SIGN_ELEMENT[pts[i].signIndex] === SIGN_ELEMENT[pts[idx[0]].signIndex]);
  const sameModality = (idx: number[]) => idx.every((i) => SIGN_MODALITY[pts[i].signIndex] === SIGN_MODALITY[pts[idx[0]].signIndex]);

  // Grand trines (and kites built on them)
  const trines: number[][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
    if (is(i, j, 'trine') && is(j, k, 'trine') && is(i, k, 'trine')) {
      trines.push([i, j, k]);
      const el = sameElement([i, j, k]) ? `${ELEMENT_NAMES[SIGN_ELEMENT[pts[i].signIndex]]}象大三角` : '大三角（跨元素）';
      add({ type: 'grand-trine', name: '大三角', bodies: keysOf([i, j, k]), bodyNames: names([i, j, k]), detail: el });
    }
  }
  for (const t of trines) {
    for (let d = 0; d < n; d++) {
      if (t.includes(d)) continue;
      for (const head of t) {
        const others = t.filter((x) => x !== head);
        if (is(d, head, 'opposition') && others.every((o) => is(d, o, 'sextile'))) {
          add({
            type: 'kite', name: '风筝', bodies: keysOf([...t, d]), bodyNames: names([...t, d]), apex: pts[head].key,
            detail: `大三角加上${pts[d].name}对冲${pts[head].name}，${pts[head].name}为风筝头，天赋有了发挥的方向`,
          });
        }
      }
    }
  }

  // Grand crosses, then T-squares not contained in one
  const crossSets: number[][] = [];
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) for (let c = a + 1; c < n; c++) for (let d = b + 1; d < n; d++) {
    const set = [a, b, c, d];
    if (new Set(set).size < 4 || a > b) continue;
    if (is(a, c, 'opposition') && is(b, d, 'opposition') && is(a, b, 'square') && is(b, c, 'square') && is(c, d, 'square') && is(d, a, 'square')) {
      crossSets.push(set);
      add({
        type: 'grand-cross', name: '大十字', bodies: keysOf(set), bodyNames: names(set),
        detail: sameModality(set) ? `${MODALITY_NAMES[SIGN_MODALITY[pts[a].signIndex]]}大十字` : '大十字（跨模式）',
      });
    }
  }
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    if (!is(a, b, 'opposition')) continue;
    for (let c = 0; c < n; c++) {
      if (c === a || c === b || !is(a, c, 'square') || !is(b, c, 'square')) continue;
      if (crossSets.some((s) => [a, b, c].every((x) => s.includes(x)))) continue;
      add({
        type: 't-square', name: 'T三角', bodies: keysOf([a, b, c]), bodyNames: names([a, b, c]), apex: pts[c].key,
        detail: `${pts[a].name}冲${pts[b].name}，共同刑${pts[c].name}（顶点，压力集中处）；${MODALITY_NAMES[SIGN_MODALITY[pts[c].signIndex]]}T三角`,
      });
    }
  }

  // Mystic rectangles: two oppositions joined alternately by sextiles and trines
  for (let a = 0; a < n; a++) for (let c = a + 1; c < n; c++) {
    if (!is(a, c, 'opposition')) continue;
    for (let b = 0; b < n; b++) for (let d = b + 1; d < n; d++) {
      if ([a, c].includes(b) || [a, c].includes(d) || !is(b, d, 'opposition')) continue;
      const ok = (is(a, b, 'sextile') && is(b, c, 'trine') && is(c, d, 'sextile') && is(d, a, 'trine'))
        || (is(a, b, 'trine') && is(b, c, 'sextile') && is(c, d, 'trine') && is(d, a, 'sextile'));
      if (ok) add({ type: 'mystic-rectangle', name: '神秘长方形', bodies: keysOf([a, b, c, d]), bodyNames: names([a, b, c, d]), detail: '两组对冲由六合与三分相连，张力可以被转化为实际行动' });
    }
  }

  // Yods: two planets in sextile, both quincunx a third
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    if (!is(a, b, 'sextile')) continue;
    for (let c = 0; c < n; c++) {
      if (c === a || c === b || !is(a, c, 'quincunx') || !is(b, c, 'quincunx')) continue;
      add({
        type: 'yod', name: '上帝之指', bodies: keysOf([a, b, c]), bodyNames: names([a, b, c]), apex: pts[c].key,
        detail: `${pts[a].name}与${pts[b].name}六合，同时与${pts[c].name}成梅花相位；${pts[c].name}为指尖，常代表需要不断调整的人生课题`,
      });
    }
  }

  // Stelliums: ≥3 of the 10 planets in one sign or one house
  const bySign = new Map<number, number[]>();
  const byHouse = new Map<number, number[]>();
  pts.forEach((p, i) => {
    bySign.set(p.signIndex, [...(bySign.get(p.signIndex) || []), i]);
    byHouse.set(p.house, [...(byHouse.get(p.house) || []), i]);
  });
  const signGroups: { idx: number[]; pattern: AstroPattern }[] = [];
  for (const [s, idx] of bySign) {
    if (idx.length < 3) continue;
    const pattern: AstroPattern = { type: 'stellium', name: '星群', bodies: keysOf(idx), bodyNames: names(idx), detail: `${SIGNS[s]}座星群（${idx.length}颗行星）` };
    signGroups.push({ idx, pattern });
    add(pattern);
  }
  for (const [h, idx] of byHouse) {
    if (idx.length < 3) continue;
    const same = signGroups.find((g) => g.idx.length === idx.length && g.idx.every((i) => idx.includes(i)));
    if (same) { same.pattern.detail = same.pattern.detail.replace('座星群', `座 / 第${h}宫星群`); continue; }
    add({ type: 'stellium', name: '星群', bodies: keysOf(idx), bodyNames: names(idx), detail: `第${h}宫星群（${idx.length}颗行星）` });
  }
  return out;
}

// ── Assembly ──

export interface RawBody { key: AstroBodyKey; lon: number; speed: number }

/**
 * Positions of all bodies at a UTC instant (asteroids outside the ephemeris range and the
 * 福点, which needs the ascendant, are omitted — `assembleChart` adds / reports them).
 */
export function rawPositionsAt(date: Date): { time: AstroTime; bodies: RawBody[] } {
  const time = Astronomy.MakeTime(date);
  const bodies: RawBody[] = [];
  for (const def of BODIES) {
    const p = longitudeAndSpeed(def, time);
    if (p) bodies.push({ key: def.key, ...p });
  }
  return { time, bodies };
}

export interface AngleFrame { asc: number; mc: number; ramc: number; eps: number; lat: number }

/** Angles for a UTC instant and location. */
export function anglesAt(time: AstroTime, lat: number, lon: number): AngleFrame & { lst: number } {
  const eps = Astronomy.e_tilt(time).tobl;
  const gast = Astronomy.SiderealTime(time);          // hours
  const lst = ((gast + lon / 15) % 24 + 24) % 24;
  const ramc = lst * 15;
  return { asc: ascendant(ramc, eps, lat), mc: midheaven(ramc, eps), ramc, eps, lat, lst };
}

/** Angles derived from a (directed) MC at a latitude — used by progressions. */
export function anglesFromMc(mc: number, eps: number, lat: number): AngleFrame {
  const ramc = ramcFromMc(mc, eps);
  return { asc: ascendant(ramc, eps, lat), mc, ramc, eps, lat };
}

export interface AssembleInput {
  bodies: RawBody[];
  frame: AngleFrame;
  /** Explicit cusps (composite); otherwise computed from frame + settings.houseSystem */
  cusps?: { cusps: number[]; used: AstroHouseSystem; note?: string };
  settings: AstroChartSettings;
  meta: {
    birthDate: string; birthTime: string; timezone: string; lat: number; lon: number;
    utc: string; utcOffset: string; julianDayUT: number; localSiderealTime: number;
  };
  place?: BirthPlaceResolution;
  /** Composite charts have no meaningful retrogradation */
  noRetrograde?: boolean;
}

export function assembleChart(x: AssembleInput): AstroChart {
  const { frame, settings } = x;
  const hc = x.cusps || houseCusps(settings.houseSystem, frame.asc, frame.mc, frame.ramc, frame.eps, frame.lat);
  const cusps = hc.cusps;

  const enabled = new Set<AstroBodyKey>(settings.extraBodies);
  const bodies = x.bodies.filter((b) => !isMinorBody(b.key) || enabled.has(b.key));
  // 福点 needs the ascendant: day chart when the Sun is above the horizon (houses 7–12)
  if (enabled.has('fortune') && !bodies.some((b) => b.key === 'fortune')) {
    const sun = bodies.find((b) => b.key === 'sun');
    const moon = bodies.find((b) => b.key === 'moon');
    if (sun && moon) {
      const isDay = houseOf(sun.lon, cusps) >= 7;
      bodies.push({ key: 'fortune', lon: partOfFortune(frame.asc, sun.lon, moon.lon, isDay), speed: 0 });
    }
  }
  const missing = settings.extraBodies.filter((k) => !bodies.some((b) => b.key === k));
  const [rangeFrom, rangeTo] = asteroidRange();
  const extraBodiesNote = missing.length
    ? `${missing.map((k) => POINT_NAMES[k]).join('、')}不在星历表范围（${rangeFrom.slice(0, 4)}–${rangeTo.slice(0, 4)} 年）内，未显示`
    : undefined;

  const order = new Map(BODIES.map((d, i) => [d.key, i]));
  bodies.sort((p, q) => (order.get(p.key) ?? 99) - (order.get(q.key) ?? 99));

  const planets: AstroPlanet[] = bodies.map((b) => {
    const def = BODIES.find((d) => d.key === b.key)!;
    const pos = signPosition(b.lon);
    const dignity = dignityOf(b.key, pos.signIndex);
    return {
      key: b.key,
      category: def.category,
      name: def.name,
      symbol: def.symbol,
      ...pos,
      house: houseOf(b.lon, cusps),
      speed: +b.speed.toFixed(4),
      retrograde: !x.noRetrograde && (def.category === 'planet' || def.category === 'asteroid') && b.speed < 0,
      ...(dignity ? { dignity, dignityName: DIGNITY_NAMES[dignity] } : {}),
    };
  });

  const angle = (key: AstroAngle['key'], name: string, l: number): AstroAngle => ({ key, name, ...signPosition(l) });
  const angles = {
    asc: angle('asc', '上升', frame.asc),
    mc: angle('mc', '天顶', frame.mc),
    dsc: angle('dsc', '下降', norm(frame.asc + 180)),
    ic: angle('ic', '天底', norm(frame.mc + 180)),
  };
  const houses: AstroHouseCusp[] = cusps.map((c, i) => ({ house: i + 1, ...signPosition(c) }));

  // Aspects among planets (south node excluded — it mirrors the north node) and the ASC/MC
  const pts: AspectPoint[] = [
    ...planets.filter((p) => p.key !== 'southNode').map((p) => ({ key: p.key as AstroPointKey, name: p.name, lon: p.longitude, speed: p.speed })),
    { key: 'asc', name: '上升', lon: frame.asc, speed: 0 },
    { key: 'mc', name: '天顶', lon: frame.mc, speed: 0 },
  ];
  const orbFor = settingsOrb(settings);
  const aspects: AstroAspect[] = [];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i]; const b = pts[j];
      if ((a.key === 'asc' || a.key === 'mc') && (b.key === 'asc' || b.key === 'mc')) continue;
      const asp = aspectBetween(a, b, settings.aspects, orbFor, settings.minorBodyOrb);
      if (asp) aspects.push(asp);
    }
  }
  aspects.sort((p, q) => (p.class === q.class ? p.orb - q.orb : p.class === 'major' ? -1 : 1));

  // Distribution over the 10 planets
  const distribution: AstroDistribution = {
    elements: { fire: 0, earth: 0, air: 0, water: 0 },
    modalities: { cardinal: 0, fixed: 0, mutable: 0 },
    polarity: { yang: 0, yin: 0 },
    hemispheres: { east: 0, west: 0, north: 0, south: 0 },
    counted: PLANET_KEYS,
  };
  for (const p of planets) {
    if (!PLANET_KEYS.includes(p.key)) continue;
    const el = SIGN_ELEMENT[p.signIndex];
    distribution.elements[el]++;
    distribution.modalities[SIGN_MODALITY[p.signIndex]]++;
    if (el === 'fire' || el === 'air') distribution.polarity.yang++; else distribution.polarity.yin++;
    // East = ASC side (houses 10–3), north = below the horizon (houses 1–6)
    if (p.house >= 10 || p.house <= 3) distribution.hemispheres.east++; else distribution.hemispheres.west++;
    if (p.house <= 6) distribution.hemispheres.north++; else distribution.hemispheres.south++;
  }

  const rulerKey = SIGN_RULER[angles.asc.signIndex];
  const m = x.meta;
  return {
    input: { birthDate: m.birthDate, birthTime: m.birthTime, timezone: m.timezone, lat: m.lat, lon: m.lon, houseSystem: settings.houseSystem },
    utc: m.utc,
    utcOffset: m.utcOffset,
    julianDayUT: m.julianDayUT,
    houseSystemUsed: hc.used,
    houseSystemNote: hc.note,
    obliquity: +frame.eps.toFixed(5),
    localSiderealTime: m.localSiderealTime,
    planets,
    angles,
    houses,
    aspects,
    distribution,
    chartRuler: { key: rulerKey, name: POINT_NAMES[rulerKey] },
    place: x.place,
    patterns: findPatterns(planets, settings),
    settings,
    ...(extraBodiesNote ? { extraBodiesNote } : {}),
  };
}

// ── Main ──

export interface AstroInput {
  birthDate: string;          // YYYY-MM-DD (local)
  birthTime: string;          // HH:mm (local clock time)
  timezone?: string;          // IANA, default Asia/Shanghai
  lat: number;
  lon: number;                // east positive
  houseSystem?: AstroHouseSystem;
  place?: BirthPlaceResolution;
}

export function assertLocation(lat: number, lon: number): void {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new Error('无效的出生地经纬度');
  }
}

/**
 * Chart for a UTC instant at a location. `display` sets the date/time shown in `input`
 * (defaults to the local wall-clock time of the instant).
 */
export function chartAtInstant(
  date: Date,
  loc: { lat: number; lon: number; timezone: string; place?: BirthPlaceResolution },
  settings: AstroChartSettings,
  display?: { date: string; time: string },
): AstroChart {
  assertLocation(loc.lat, loc.lon);
  const { time, bodies } = rawPositionsAt(date);
  const frame = anglesAt(time, loc.lat, loc.lon);
  const local = utcToLocal(date, loc.timezone);
  return assembleChart({
    bodies, frame, settings, place: loc.place,
    meta: {
      birthDate: display?.date ?? local.date,
      birthTime: display?.time ?? local.time,
      timezone: loc.timezone, lat: loc.lat, lon: loc.lon,
      utc: date.toISOString(),
      utcOffset: formatOffset(local.offsetMinutes),
      julianDayUT: +(time.ut + 2451545.0).toFixed(6),
      localSiderealTime: +frame.lst.toFixed(5),
    },
  });
}

export function getAstroChart(input: AstroInput & { settings?: Partial<AstroChartSettings> }): AstroChart {
  const timezone = input.timezone || 'Asia/Shanghai';
  assertLocation(input.lat, input.lon);
  const settings = resolveSettings(input.settings, input.houseSystem);
  const { date } = localToUtc(input.birthDate, input.birthTime, timezone);
  return chartAtInstant(date, { lat: input.lat, lon: input.lon, timezone, place: input.place }, settings, {
    date: input.birthDate, time: input.birthTime,
  });
}

// ── LLM formatting ──

const PRECISION_TEXT: Record<BirthPlaceResolution['precision'], string> = {
  manual: '手动填写的经纬度',
  county: '区县级',
  city: '地级市级',
  province: '仅省级（按省会估算）',
  default: '未能识别出生地，按北京估算',
};

export function placeLine(pl: BirthPlaceResolution): string[] {
  const lines = [`出生地: ${pl.matched}（${pl.lat.toFixed(2)}, ${pl.lon.toFixed(2)}；精度: ${PRECISION_TEXT[pl.precision]}）${pl.note ? ` ${pl.note}` : ''}`];
  if (pl.precision === 'province' || pl.precision === 'default') {
    lines.push('[注意] 出生地精度不足：行星星座可靠，但上升、天顶与宫位可能有偏差，解读宫位时请提示用户。');
  }
  return lines;
}

export function planetLine(p: AstroPlanet): string {
  return `${p.name}: ${formatDegree(p)} 第${p.house}宫${p.retrograde ? ' 逆行' : ''}${p.dignityName ? ` [${p.dignityName}]` : ''}`;
}

/** 「（小行星）」/「（虚点）」 marker for asteroids and computed points. */
export function bodyTag(p: { category?: AstroBodyCategory; key: AstroBodyKey }): string {
  const c = p.category ?? BODY_CATEGORY[p.key];
  return c === 'asteroid' ? '（小行星）' : c === 'point' ? '（虚点）' : '';
}

export function aspectLine(x: AstroAspect): string {
  return `${x.aName}${x.typeName}${x.bName} 容许度${x.orb.toFixed(1)}° ${x.applying ? '入相' : '出相'}${x.class === 'minor' ? '（次要）' : ''}`;
}

/** Chart body shared by natal / composite formatting (no header, no place line). */
export function formatChartBody(chart: AstroChart): string[] {
  const lines: string[] = [];
  lines.push(`宫制: ${HOUSE_SYSTEM_NAMES[chart.houseSystemUsed]}${chart.houseSystemNote ? `（${chart.houseSystemNote}）` : ''}`);
  const a = chart.angles;
  lines.push(`四轴: 上升 ${formatDegree(a.asc)}，天顶 ${formatDegree(a.mc)}，下降 ${formatDegree(a.dsc)}，天底 ${formatDegree(a.ic)}；命主星: ${chart.chartRuler.name}`);
  lines.push('行星与交点（[庙/旺/陷/落] 为先天尊贵；外行星只论庙陷）:');
  for (const p of chart.planets.filter((q) => !isMinorBody(q.key))) lines.push(`- ${planetLine(p)}`);
  const minors = chart.planets.filter((q) => isMinorBody(q.key));
  if (minors.length) {
    lines.push(`小行星与虚点（只取主相位，容许度 ${chart.settings?.minorBodyOrb ?? DEFAULT_ASTRO_SETTINGS.minorBodyOrb}°；莉莉丝为平均月亮远地点，福点按${chart.planets.some((q) => q.key === 'sun' && q.house >= 7) ? '日生' : '夜生'}公式）:`);
    for (const p of minors) lines.push(`- ${planetLine(p)}${bodyTag(p)}`);
  }
  if (chart.extraBodiesNote) lines.push(`[说明] ${chart.extraBodiesNote}`);
  lines.push(`宫头: ${chart.houses.map((h) => `${h.house}宫${formatDegree(h)}`).join('，')}`);
  if (chart.aspects.length) {
    lines.push('相位（主相位在前，按容许度排序）:');
    for (const x of chart.aspects) lines.push(`- ${aspectLine(x)}`);
  }
  if (chart.patterns?.length) {
    lines.push('格局:');
    for (const p of chart.patterns) lines.push(`- ${p.name}：${p.bodyNames.join('、')}｜${p.detail}`);
  }
  const d = chart.distribution;
  lines.push(`元素: ${(Object.keys(d.elements) as AstroElement[]).map((k) => `${ELEMENT_NAMES[k]}${d.elements[k]}`).join(' ')}；模式: ${(Object.keys(d.modalities) as AstroModality[]).map((k) => `${MODALITY_NAMES[k]}${d.modalities[k]}`).join(' ')}`);
  if (d.polarity && d.hemispheres) {
    lines.push(`阴阳: 阳${d.polarity.yang} 阴${d.polarity.yin}；半球: 东(上升侧)${d.hemispheres.east} 西${d.hemispheres.west} 地平线下${d.hemispheres.north} 地平线上${d.hemispheres.south}`);
  }
  return lines;
}

/** Compact Chinese text summary of a chart for LLM context. */
export function formatAstroForLlm(chart: AstroChart): string {
  const lines: string[] = [];
  lines.push(`[西洋占星本命盘] 出生 ${chart.input.birthDate} ${chart.input.birthTime}（${chart.input.timezone}，UTC${chart.utcOffset}）`);
  if (chart.place) lines.push(...placeLine(chart.place));
  lines.push(...formatChartBody(chart));
  return lines.join('\n');
}
