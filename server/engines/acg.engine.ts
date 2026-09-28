/**
 * 地理占星（Astrocartography）引擎
 *
 * For a birth moment, every place on Earth has the planets in some position relative to its
 * local horizon and meridian. An ACG line is the set of places where a planet sat exactly on
 * one of the four angles at birth:
 *   MC  上中天  — local sidereal time = RA          → a meridian at lon = RA − GAST
 *   IC  下中天  — the opposite meridian              → lon = RA − GAST + 180°
 *   AC  上升   — rising: hour angle H = −H0         → lon = RA − H0 − GAST
 *   DC  下降   — setting: H = +H0                   → lon = RA + H0 − GAST
 * with cos H0 = −tan φ · tan δ (geometric horizon, no refraction). Where |cos H0| > 1 the
 * planet never rises/sets at that latitude, so the AC/DC line breaks there.
 */
import * as AstronomyNs from 'astronomy-engine';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localToUtc } from './astro.engine';
import type { BirthPlaceResolution } from '../../shared/types/astro.types';
import type {
  AcgAngle, AcgBody, AcgBodyKey, AcgLine, AcgNearHit, AcgPlace, AcgRankedPlace, AcgResult, AcgText, AcgTheme, AcgThemeDef,
} from '../../shared/types/acg.types';

// tsx loads the package's CJS build whose namespace only exposes `default`; bundlers expose named exports
const A = ((AstronomyNs as { Body?: unknown }).Body ? AstronomyNs : (AstronomyNs as unknown as { default: typeof AstronomyNs }).default) as typeof AstronomyNs;
const { Body, MakeTime, GeoVector, Rotation_EQJ_EQD, RotateVector, EquatorFromVector, SiderealTime } = A;
type Body = AstronomyNs.Body;

const DEG = Math.PI / 180;
const EARTH_RADIUS_KM = 6371;
const LAT_LIMIT = 75;
const LAT_STEP = 0.5;

export const ACG_BODIES: { key: AcgBodyKey; name: string; symbol: string; body?: Body }[] = [
  { key: 'sun', name: '太阳', symbol: '☉︎', body: Body.Sun },
  { key: 'moon', name: '月亮', symbol: '☽︎', body: Body.Moon },
  { key: 'mercury', name: '水星', symbol: '☿︎', body: Body.Mercury },
  { key: 'venus', name: '金星', symbol: '♀︎', body: Body.Venus },
  { key: 'mars', name: '火星', symbol: '♂︎', body: Body.Mars },
  { key: 'jupiter', name: '木星', symbol: '♃︎', body: Body.Jupiter },
  { key: 'saturn', name: '土星', symbol: '♄︎', body: Body.Saturn },
  { key: 'uranus', name: '天王星', symbol: '♅︎', body: Body.Uranus },
  { key: 'neptune', name: '海王星', symbol: '♆︎', body: Body.Neptune },
  { key: 'pluto', name: '冥王星', symbol: '♇︎', body: Body.Pluto },
  { key: 'northNode', name: '北交点', symbol: '☊︎' },
];

export const ACG_ANGLE_NAMES: Record<AcgAngle, string> = { AC: '上升线', DC: '下降线', MC: '天顶线', IC: '天底线' };

const norm180 = (x: number) => {
  let v = ((x + 180) % 360 + 360) % 360 - 180;
  if (v === -180) v = 180;
  return v;
};

export interface AcgInput {
  birthDate: string;          // YYYY-MM-DD (local wall clock)
  birthTime: string;          // HH:mm
  timezone?: string;          // IANA, default Asia/Shanghai
  lat: number;                // birth place (only used for display / "home" marker)
  lon: number;
  place?: BirthPlaceResolution;
  /** Include the mean north node (default true) */
  includeNode?: boolean;
}

/** Geocentric apparent RA/Dec of date (degrees) for a body at time t. */
function equatorial(body: Body, t: ReturnType<typeof MakeTime>): { ra: number; dec: number } {
  const eqj = GeoVector(body, t, true);
  const eqd = RotateVector(Rotation_EQJ_EQD(t), eqj);
  const eq = EquatorFromVector(eqd);
  return { ra: eq.ra * 15, dec: eq.dec };
}

/** Mean lunar ascending node → RA/Dec (ecliptic latitude 0). */
function meanNode(t: ReturnType<typeof MakeTime>): { ra: number; dec: number } {
  const T = t.tt / 36525;
  const lonDeg = ((125.04452 - 1934.136261 * T + 0.0020708 * T * T) % 360 + 360) % 360;
  const eps = (23.4392911 - 0.0130042 * T) * DEG;
  const l = lonDeg * DEG;
  const ra = Math.atan2(Math.sin(l) * Math.cos(eps), Math.cos(l)) / DEG;
  const dec = Math.asin(Math.sin(eps) * Math.sin(l)) / DEG;
  return { ra: (ra + 360) % 360, dec };
}

function meridianSegments(lon: number): [number, number][][] {
  const pts: [number, number][] = [];
  for (let lat = -85; lat <= 85; lat += 5) pts.push([lon, lat]);
  return [pts];
}

function horizonSegments(ra: number, dec: number, gast: number, rising: boolean): [number, number][][] {
  const segs: [number, number][][] = [];
  let cur: [number, number][] = [];
  const tanDec = Math.tan(dec * DEG);
  for (let i = 0; i <= (2 * LAT_LIMIT) / LAT_STEP; i++) {
    const lat = -LAT_LIMIT + i * LAT_STEP;
    const c = -Math.tan(lat * DEG) * tanDec;
    if (c < -1 || c > 1) {
      if (cur.length > 1) segs.push(cur);
      cur = [];
      continue;
    }
    const h0 = Math.acos(c) / DEG;
    const lon = norm180(rising ? ra - h0 - gast : ra + h0 - gast);
    cur.push([round(lon, 3), lat]);
  }
  if (cur.length > 1) segs.push(cur);
  return segs;
}

const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

export function getAcgLines(input: AcgInput): AcgResult {
  const timezone = input.timezone || 'Asia/Shanghai';
  const { date } = localToUtc(input.birthDate, input.birthTime, timezone);
  const t = MakeTime(date);
  const gast = SiderealTime(t) * 15;

  const bodies: AcgBody[] = [];
  for (const def of ACG_BODIES) {
    if (def.key === 'northNode' && input.includeNode === false) continue;
    const { ra, dec } = def.body !== undefined ? equatorial(def.body, t) : meanNode(t);
    bodies.push({ key: def.key, name: def.name, symbol: def.symbol, ra: round(ra, 4), dec: round(dec, 4) });
  }

  const lines: AcgLine[] = [];
  for (const b of bodies) {
    const mc = norm180(b.ra - gast);
    const ic = norm180(mc + 180);
    const mk = (angle: AcgAngle, segments: [number, number][][], longitude?: number): AcgLine => ({
      body: b.key, bodyName: b.name, angle, angleName: ACG_ANGLE_NAMES[angle], segments,
      ...(longitude !== undefined ? { longitude: round(longitude, 3) } : {}),
    });
    lines.push(mk('MC', meridianSegments(round(mc, 3)), mc));
    lines.push(mk('IC', meridianSegments(round(ic, 3)), ic));
    lines.push(mk('AC', horizonSegments(b.ra, b.dec, gast, true)));
    lines.push(mk('DC', horizonSegments(b.ra, b.dec, gast, false)));
  }

  return {
    input: { birthDate: input.birthDate, birthTime: input.birthTime, timezone, lat: input.lat, lon: input.lon },
    utc: date.toISOString(),
    gastDeg: round(gast, 4),
    bodies,
    lines,
    place: input.place,
  };
}

// ── Distances ──

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Shortest distance from a point to an ACG line (km).
 * With maxKm, polyline vertices whose latitude alone puts them farther away are skipped
 * (1° of latitude ≈ 111 km), which makes ranking hundreds of places fast; Infinity if nothing is within reach.
 */
export function distanceToLine(line: AcgLine, lat: number, lon: number, maxKm = Infinity): number {
  if (line.longitude !== undefined) {
    // Distance to a meridian = arc along the great circle perpendicular to it
    const dLon = Math.abs(norm180(lon - line.longitude)) * DEG;
    if (dLon >= Math.PI / 2) return haversineKm(lat, lon, lat >= 0 ? 90 : -90, 0);
    return EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.abs(Math.sin(dLon) * Math.cos(lat * DEG))));
  }
  let best = Infinity;
  const latWindow = Number.isFinite(maxKm) ? maxKm / 111 + LAT_STEP : Infinity;
  for (const seg of line.segments) {
    for (let i = 0; i < seg.length; i++) {
      const [lo, la] = seg[i];
      if (Math.abs(la - lat) > latWindow) continue;
      best = Math.min(best, haversineKm(lat, lon, la, lo));
      if (i + 1 < seg.length) {
        // Sub-sample between vertices (they are ≤ 0.5° apart in latitude)
        const [lo2, la2] = seg[i + 1];
        const dl = norm180(lo2 - lo);
        for (let k = 1; k < 4; k++) {
          const f = k / 4;
          best = Math.min(best, haversineKm(lat, lon, la + (la2 - la) * f, norm180(lo + dl * f)));
        }
      }
    }
  }
  return best;
}

// ── Texts ──

let textCache: Record<string, AcgText> | null = null;
export function acgText(body: AcgBodyKey, angle: AcgAngle): AcgText | undefined {
  if (!textCache) {
    const here = dirname(fileURLToPath(import.meta.url));
    textCache = JSON.parse(readFileSync(resolve(here, '../data/acg-texts.json'), 'utf8')).lines as Record<string, AcgText>;
  }
  return textCache[`${body}.${angle}`];
}

export function nearestAcgLines(result: AcgResult, lat: number, lon: number, radiusKm = 600, withText = true): AcgNearHit[] {
  const hits: AcgNearHit[] = [];
  for (const line of result.lines) {
    const d = distanceToLine(line, lat, lon, radiusKm);
    if (d > radiusKm) continue;
    hits.push({
      body: line.body,
      bodyName: line.bodyName,
      angle: line.angle,
      angleName: line.angleName,
      distanceKm: Math.round(d),
      strength: round(Math.max(0, 1 - d / radiusKm), 3),
      ...(withText ? { text: acgText(line.body, line.angle) } : {}),
    });
  }
  return hits.sort((a, b) => a.distanceKm - b.distanceKm);
}

// ── Themes ──

export const ACG_THEMES: AcgThemeDef[] = [
  { key: 'career', name: '事业发展', description: '曝光度、职位与社会认可' },
  { key: 'love', name: '感情关系', description: '遇见伴侣、经营亲密关系' },
  { key: 'wealth', name: '财富机遇', description: '收入、资源与商业机会' },
  { key: 'healing', name: '休养疗愈', description: '放松身心、恢复元气' },
  { key: 'creativity', name: '创作灵感', description: '艺术、写作与灵感迸发' },
  { key: 'adventure', name: '冒险突破', description: '挑战自我、打破常规' },
  { key: 'study', name: '求学进修', description: '学习、研究与思维拓展' },
  { key: 'home', name: '安家定居', description: '归属感、家庭与长期居住' },
];

type Weights = Partial<Record<AcgBodyKey, Partial<Record<AcgAngle, number>>>>;

/**
 * Editorial weights (Tianshu's own model): positive = supportive for the theme,
 * negative = tends to add friction. MC favours public/career, IC home/roots,
 * AC self-expression, DC partnerships.
 */
const THEME_WEIGHTS: Record<AcgTheme, Weights> = {
  career: {
    sun: { MC: 5, AC: 3 }, jupiter: { MC: 5, AC: 2 }, saturn: { MC: 3, IC: -2 }, mars: { MC: 3, AC: 2 },
    mercury: { MC: 2 }, venus: { MC: 2 }, pluto: { MC: 2 }, northNode: { MC: 2 }, neptune: { MC: -2 }, moon: { MC: 1 },
  },
  love: {
    venus: { DC: 5, AC: 4, MC: 1, IC: 2 }, moon: { DC: 3, IC: 2 }, jupiter: { DC: 3 }, sun: { DC: 2 },
    mars: { DC: 2, AC: 1 }, saturn: { DC: -3, AC: -1 }, uranus: { DC: -2 }, pluto: { DC: -1 }, northNode: { DC: 2 },
  },
  wealth: {
    jupiter: { MC: 5, IC: 3, AC: 2 }, venus: { MC: 3, IC: 2 }, sun: { MC: 2 }, mercury: { MC: 2 },
    pluto: { MC: 2 }, saturn: { MC: 1, IC: -2 }, neptune: { MC: -3, IC: -1 }, uranus: { MC: -1 },
  },
  healing: {
    moon: { IC: 4, AC: 2 }, venus: { IC: 3, AC: 3 }, jupiter: { IC: 3, AC: 3 }, neptune: { IC: 2, AC: 1 },
    sun: { AC: 1 }, mars: { AC: -3, IC: -2, MC: -1 }, saturn: { AC: -3, IC: -3 }, pluto: { AC: -2, IC: -2 }, uranus: { IC: -2 },
  },
  creativity: {
    neptune: { AC: 4, MC: 3 }, venus: { AC: 4, MC: 3 }, moon: { AC: 3 }, uranus: { AC: 3, MC: 2 },
    sun: { AC: 2, MC: 2 }, mercury: { AC: 2, MC: 1 }, saturn: { AC: -2 },
  },
  adventure: {
    uranus: { AC: 5, MC: 3 }, mars: { AC: 4, MC: 2 }, jupiter: { AC: 3, DC: 1 }, pluto: { AC: 2 },
    sun: { AC: 2 }, saturn: { AC: -2, MC: -1 }, moon: { IC: -1 },
  },
  study: {
    mercury: { AC: 4, MC: 4 }, jupiter: { AC: 4, MC: 3 }, uranus: { AC: 2, MC: 2 }, saturn: { MC: 2, AC: 1 },
    sun: { MC: 1 }, neptune: { AC: -1 },
  },
  home: {
    moon: { IC: 5, AC: 2 }, venus: { IC: 4 }, jupiter: { IC: 4 }, sun: { IC: 2 }, saturn: { IC: -2 },
    uranus: { IC: -3 }, mars: { IC: -2 }, pluto: { IC: -2 }, neptune: { IC: -1 },
  },
};

const RANK_RADIUS_KM = 800;

export function rankPlacesForTheme(result: AcgResult, places: AcgPlace[], theme: AcgTheme, limit = 20): AcgRankedPlace[] {
  const weights = THEME_WEIGHTS[theme];
  if (!weights) throw new Error(`未知主题: ${theme}`);
  const relevant = result.lines.filter((l) => weights[l.body]?.[l.angle]);
  const ranked: AcgRankedPlace[] = [];
  for (const p of places) {
    let score = 0;
    const hits: AcgRankedPlace['hits'] = [];
    for (const line of relevant) {
      const d = distanceToLine(line, p.lat, p.lon, RANK_RADIUS_KM);
      if (d > RANK_RADIUS_KM) continue;
      const w = weights[line.body]![line.angle]!;
      const fall = (1 - d / RANK_RADIUS_KM) ** 1.5;
      score += w * fall;
      hits.push({ body: line.body, bodyName: line.bodyName, angle: line.angle, angleName: line.angleName, distanceKm: Math.round(d), weight: w });
    }
    // Require at least one supportive line so pure "least bad" places don't rank
    if (hits.some((h) => h.weight > 0) && score > 0) {
      ranked.push({ ...p, score: round(score, 2), hits: hits.sort((a, b) => a.distanceKm - b.distanceKm) });
    }
  }
  return ranked.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ── LLM text ──

export function formatAcgForLlm(
  result: AcgResult,
  focus?: { label?: string; lat?: number; lon?: number; near?: AcgNearHit[]; theme?: AcgThemeDef; ranked?: AcgRankedPlace[] },
): string {
  const out: string[] = [];
  out.push(`[地理占星 ACG] 出生 ${result.input.birthDate} ${result.input.birthTime}（${result.input.timezone}），UTC ${result.utc.slice(0, 16).replace('T', ' ')}`);
  if (result.place) out.push(`出生地: ${result.place.matched}（${result.place.lat}, ${result.place.lon}；精度 ${result.place.precision}）`);
  out.push('说明: 行星线表示出生那一刻该行星恰好位于当地四轴的地点。天顶线=上中天（事业/公众形象），天底线=下中天（家庭/根基），上升线=东升（自我/身体），下降线=西落（关系/合作）。离线越近（约 300 公里内）影响越明显，800 公里外基本可忽略。');
  out.push('各行星天顶线经度（东经为正）: ' + result.lines
    .filter((l) => l.angle === 'MC')
    .map((l) => `${l.bodyName}${l.longitude! >= 0 ? '东经' : '西经'}${Math.abs(l.longitude!).toFixed(1)}°`)
    .join('，'));
  const home = nearestAcgLines(result, result.input.lat, result.input.lon, 800, false);
  out.push(`出生地附近的行星线: ${home.length ? home.map((h) => `${h.bodyName}${h.angleName}(${h.distanceKm}km)`).join('、') : '800 公里内无'}`);

  if (focus?.near) {
    out.push(`\n[关注地点] ${focus.label || `${focus.lat}, ${focus.lon}`}`);
    if (!focus.near.length) out.push('附近没有明显的行星线，这里对命主而言星象影响较中性。');
    for (const h of focus.near) {
      out.push(`- ${h.bodyName}${h.angleName}：距离 ${h.distanceKm} km（影响强度 ${Math.round(h.strength * 100)}%）${h.text ? `｜${h.text.subtitle}｜${h.text.text}｜适合：${h.text.good}｜注意：${h.text.caution}` : ''}`);
    }
  }
  if (focus?.theme && focus.ranked) {
    out.push(`\n[主题推荐] ${focus.theme.name}（${focus.theme.description}）— 天枢自拟权重，仅供参考`);
    focus.ranked.forEach((p, i) => {
      out.push(`${i + 1}. ${p.name}（${p.region ? `${p.region}，` : ''}${p.country}）得分 ${p.score}：${p.hits.slice(0, 3).map((h) => `${h.bodyName}${h.angleName}${h.distanceKm}km`).join('、')}`);
    });
  }
  return out.join('\n');
}
