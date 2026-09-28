/**
 * 西洋占星多盘技术：行运、次限推运、太阳返照、比较盘（含合盘评分）、中点组合盘。
 *
 * 合盘评分模型为天枢自拟：每个跨盘相位的贡献 =
 *   相位性质(按维度可调) × 双方点位权重 × 容许度衰减，
 * 按五个维度（吸引力/情感/沟通/稳定/成长）累加，再用 tanh 压缩到 0–100；
 * 另计入重要行星落入对方关键宫位（宫位叠加）的加分。
 */
import type {
  AstroAspect, AstroAspectType, AstroBiWheel, AstroBodyKey, AstroChart, AstroChartSettings,
  AstroCompatibility, AstroCompatibilityDimension, AstroCompositeResponse, AstroPointKey, BirthPlaceResolution,
} from '../../shared/types/astro.types';
import {
  type AspectPoint, type AstroInput,
  MAJOR_ASPECTS, POINT_NAMES,
  anglesAt, anglesFromMc, aspectBetween, aspectLine, assembleChart, bodyTag, chartAtInstant, diff, formatChartBody,
  formatDegree, formatOffset, getAstroChart, houseCusps, houseOf, localToUtc, midpoint, norm, placeLine,
  rawPositionsAt, resolveSettings, settingsOrb, sunLongitudeAt, utcToLocal,
} from './astro.engine';

const TZ = 'Asia/Shanghai';
const DAY_MS = 86400000;
const TROPICAL_YEAR = 365.24219;

// ── Shared helpers ──

function natalChart(natal: AstroInput, settings?: Partial<AstroChartSettings>): AstroChart {
  return getAstroChart({ ...natal, settings: { ...settings, houseSystem: settings?.houseSystem ?? natal.houseSystem } });
}

/** Points used on each side of a bi-wheel (south node mirrors the north node, so it is skipped). */
function pointsOf(chart: AstroChart, opts: { angles: boolean; moving: boolean }): AspectPoint[] {
  const pts: AspectPoint[] = chart.planets
    .filter((p) => p.key !== 'southNode')
    .map((p) => ({ key: p.key as AstroPointKey, name: p.name, lon: p.longitude, speed: opts.moving ? p.speed : 0 }));
  if (opts.angles) {
    pts.push({ key: 'asc', name: '上升', lon: chart.angles.asc.longitude, speed: 0 });
    pts.push({ key: 'mc', name: '天顶', lon: chart.angles.mc.longitude, speed: 0 });
  }
  return pts;
}

function crossAspects(
  inner: AspectPoint[], outer: AspectPoint[],
  types: AstroAspectType[], orbFor: (t: AstroAspectType, lum: boolean) => number,
  prefix: { inner: string; outer: string },
  minorBodyOrb?: number,
): AstroAspect[] {
  const out: AstroAspect[] = [];
  for (const a of inner) {
    for (const b of outer) {
      if ((a.key === 'asc' || a.key === 'mc') && (b.key === 'asc' || b.key === 'mc') && a.key !== b.key) continue;
      const asp = aspectBetween(
        { ...a, name: `${prefix.inner}${a.name}` },
        { ...b, name: `${prefix.outer}${b.name}` },
        types, orbFor, minorBodyOrb,
      );
      if (asp) out.push(asp);
    }
  }
  return out.sort((x, y) => (x.class === y.class ? x.orb - y.orb : x.class === 'major' ? -1 : 1));
}

function houseOverlay(from: AstroChart, onto: AstroChart) {
  const cusps = onto.houses.map((h) => h.longitude);
  return from.planets.map((p) => ({ key: p.key, name: p.name, house: houseOf(p.longitude, cusps) }));
}

/** Orbs for timing techniques: majors only by default, tight. */
function timingOrbs(settings: Partial<AstroChartSettings> | undefined, base: number, lumBase: number) {
  const types = Array.isArray(settings?.aspects) ? resolveSettings(settings).aspects : [...MAJOR_ASPECTS];
  const orbFor = (t: AstroAspectType, lum: boolean) => {
    const major = MAJOR_ASPECTS.includes(t);
    return lum ? (major ? lumBase : 1.5) : (major ? base : 1);
  };
  return { types, orbFor };
}

function localStamp(date: Date, tz: string, withSeconds = false): string {
  const l = utcToLocal(date, tz);
  return `${l.date} ${l.time}${withSeconds ? `:${l.seconds}` : ''}（${tz}，UTC${formatOffset(l.offsetMinutes)}）`;
}

function assertDate(s: string, label = '日期'): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) throw new Error(`${label}格式应为 YYYY-MM-DD`);
}

// ── Transits ──

export function getTransitWheel(
  natal: AstroInput,
  at: { date: string; time?: string; timezone?: string },
  settings?: Partial<AstroChartSettings>,
): AstroBiWheel {
  assertDate(at.date, '行运日期');
  const inner = natalChart(natal, settings);
  const tz = at.timezone || natal.timezone || TZ;
  const time = at.time && /^\d{1,2}:\d{2}$/.test(at.time) ? at.time : '12:00';
  const { date } = localToUtc(at.date, time, tz);
  const outer = chartAtInstant(date, { lat: natal.lat, lon: natal.lon, timezone: tz, place: natal.place }, inner.settings);
  const { types, orbFor } = timingOrbs(settings, 3, 4);
  return {
    kind: 'transit',
    kindName: '行运',
    innerLabel: '本命',
    outerLabel: `行运 ${at.date} ${time}`,
    inner,
    outer,
    crossAspects: crossAspects(pointsOf(inner, { angles: true, moving: false }), pointsOf(outer, { angles: false, moving: true }), types, orbFor, { inner: '本命', outer: '行运' }, inner.settings.minorBodyOrb),
    outerInInnerHouses: houseOverlay(outer, inner),
    outerMoment: localStamp(date, tz),
    note: '行运相位只取主相位（除非另行设置），容许度收紧为 3°，日月 4°；入相/出相按行运行星当时的运行方向判断。外圈宫位为该时刻在出生地的天象宫位。',
  };
}

// ── Secondary progressions ──

export function getProgressedWheel(natal: AstroInput, targetDate: string, settings?: Partial<AstroChartSettings>): AstroBiWheel {
  assertDate(targetDate, '推运日期');
  const inner = natalChart(natal, settings);
  const tz = natal.timezone || TZ;
  const birthUtc = new Date(inner.utc);
  const target = localToUtc(targetDate, natal.birthTime || '12:00', tz).date;
  const years = (target.getTime() - birthUtc.getTime()) / (TROPICAL_YEAR * DAY_MS);
  if (years < 0) throw new Error('推运日期不能早于出生日期');
  // 一日一年：出生后第 N 天的天象对应第 N 年
  const progUtc = new Date(birthUtc.getTime() + years * DAY_MS);
  const { time, bodies } = rawPositionsAt(progUtc);
  // 推运天顶用太阳弧：天顶前进的度数 = 推运太阳 − 本命太阳
  const natalSun = inner.planets.find((p) => p.key === 'sun')!.longitude;
  const arc = norm(sunLongitudeAt(progUtc) - natalSun);
  const eps = anglesAt(time, natal.lat, natal.lon).eps;
  const frame = anglesFromMc(norm(inner.angles.mc.longitude + arc), eps, natal.lat);
  const pl = utcToLocal(progUtc, tz);
  const outer = assembleChart({
    bodies, frame, settings: inner.settings, place: natal.place,
    meta: {
      birthDate: pl.date, birthTime: pl.time, timezone: tz, lat: natal.lat, lon: natal.lon,
      utc: progUtc.toISOString(), utcOffset: formatOffset(pl.offsetMinutes),
      julianDayUT: +(time.ut + 2451545.0).toFixed(6), localSiderealTime: 0,
    },
  });
  const { types, orbFor } = timingOrbs(settings, 1, 1);
  const pts = (c: AstroChart, moving: boolean) => pointsOf(c, { angles: true, moving });
  return {
    kind: 'progressed',
    kindName: '次限推运',
    innerLabel: '本命',
    outerLabel: `推运至 ${targetDate}`,
    inner,
    outer,
    crossAspects: crossAspects(pts(inner, false), pts(outer, true), types, orbFor, { inner: '本命', outer: '推运' }, inner.settings.minorBodyOrb),
    outerInInnerHouses: houseOverlay(outer, inner),
    outerMoment: `推运至 ${targetDate}（${years.toFixed(2)} 岁），对应星历时刻 ${localStamp(progUtc, tz)}`,
    note: `次限推运（一日一年）。推运四轴采用太阳弧法：天顶按太阳弧 ${arc.toFixed(2)}° 前进，再按出生纬度求上升与宫位。推运相位容许度 1°。`,
  };
}

// ── Solar return ──

export function findSolarReturn(natalSunLon: number, year: number, birthUtc: Date): Date {
  // Start at the birthday in the target year at the natal time of day
  let t = new Date(Date.UTC(year, birthUtc.getUTCMonth(), birthUtc.getUTCDate(), birthUtc.getUTCHours(), birthUtc.getUTCMinutes()));
  for (let i = 0; i < 12; i++) {
    const d = diff(sunLongitudeAt(t), natalSunLon);      // degrees still to go
    const step = (d / 0.98565) * DAY_MS;                 // mean solar motion
    t = new Date(t.getTime() + step);
    if (Math.abs(step) < 200) break;                     // < 0.2 s
  }
  return t;
}

export function getSolarReturnWheel(
  natal: AstroInput,
  year: number,
  location?: { lat: number; lon: number; timezone?: string; place?: BirthPlaceResolution },
  settings?: Partial<AstroChartSettings>,
): AstroBiWheel {
  if (!Number.isInteger(year) || year < 1000 || year > 3000) throw new Error('返照年份无效');
  const inner = natalChart(natal, settings);
  const natalSun = inner.planets.find((p) => p.key === 'sun')!.longitude;
  const birthUtc = new Date(inner.utc);
  if (year < birthUtc.getUTCFullYear()) throw new Error('返照年份不能早于出生年份');
  const moment = findSolarReturn(natalSun, year, birthUtc);
  const loc = {
    lat: location?.lat ?? natal.lat,
    lon: location?.lon ?? natal.lon,
    timezone: location?.timezone || natal.timezone || TZ,
    place: location?.place ?? natal.place,
  };
  const outer = chartAtInstant(moment, loc, inner.settings);
  const { types, orbFor } = timingOrbs(settings, 3, 4);
  return {
    kind: 'solar-return',
    kindName: '太阳返照',
    innerLabel: '本命',
    outerLabel: `${year} 年太阳返照`,
    inner,
    outer,
    crossAspects: crossAspects(pointsOf(inner, { angles: true, moving: false }), pointsOf(outer, { angles: true, moving: false }), types, orbFor, { inner: '本命', outer: '返照' }, inner.settings.minorBodyOrb),
    outerInInnerHouses: houseOverlay(outer, inner),
    outerMoment: localStamp(moment, loc.timezone, true),
    note: `太阳回到本命位置 ${formatDegree(inner.planets.find((p) => p.key === 'sun')!)} 的精确时刻，返照盘地点为${location ? '指定地点' : '出生地'}。返照盘本身的上升、宫位与相位描述这一年的主题；与本命的交互相位容许度 3°，日月 4°。`,
  };
}

// ── Synastry & compatibility ──

type DimKey = AstroCompatibilityDimension['key'];
const DIM_NAMES: Record<DimKey, string> = { attraction: '吸引力', emotion: '情感', communication: '沟通', stability: '稳定', growth: '成长' };
// Calibrated on ~250 real profile pairs: harmonious contacts outnumber hard ones in almost any
// pair, so raw sums skew positive; the offset centres a typical pair near 60.
const SCORE_SCALE = 3.5;
const SCORE_OFFSET = 1.2;
const DIM_WEIGHTS: Record<DimKey, number> = { attraction: 0.22, emotion: 0.24, communication: 0.16, stability: 0.22, growth: 0.16 };

const POINT_WEIGHT: Partial<Record<AstroPointKey, number>> = {
  sun: 1.4, moon: 1.4, venus: 1.3, mars: 1.1, mercury: 1.0, asc: 1.0,
  jupiter: 0.9, saturn: 1.0, mc: 0.6, northNode: 0.6, uranus: 0.5, neptune: 0.5, pluto: 0.6,
  juno: 0.7, chiron: 0.5, lilith: 0.4, ceres: 0.4, pallas: 0.4, vesta: 0.4, fortune: 0.4,
};
const HEAVY = new Set<AstroPointKey>(['saturn', 'uranus', 'neptune', 'pluto']);
const PERSONAL = new Set<AstroPointKey>(['sun', 'moon', 'venus', 'mars', 'asc']);

function pairHas(a: AstroPointKey, b: AstroPointKey, x: AstroPointKey, y?: AstroPointKey) {
  return y ? ((a === x && b === y) || (a === y && b === x)) : (a === x || b === x);
}

/** Base tone of an aspect between two points (−1 … +1). */
function baseTone(type: AstroAspectType, a: AstroPointKey, b: AstroPointKey): number {
  const heavy = HEAVY.has(a) || HEAVY.has(b);
  switch (type) {
    case 'trine': return 1;
    case 'sextile': return 0.8;
    case 'quintile': case 'biquintile': return 0.35;
    case 'semisextile': return 0.15;
    case 'conjunction': return heavy ? -0.15 : 0.85;
    case 'opposition': return heavy ? -0.6 : -0.25;
    case 'square': return -0.75;
    case 'quincunx': case 'semisquare': case 'sesquiquadrate': return -0.3;
    default: return 0;
  }
}

/** Which dimensions a contact speaks to, with a per-dimension tone adjustment. */
function dimensionsFor(type: AstroAspectType, a: AstroPointKey, b: AstroPointKey, tone: number): Partial<Record<DimKey, number>> {
  const out: Partial<Record<DimKey, number>> = {};
  const hard = type === 'square' || type === 'opposition';
  // 吸引力：金火、日月、金星与个人点
  if (pairHas(a, b, 'venus', 'mars') || pairHas(a, b, 'sun', 'moon') || pairHas(a, b, 'venus', 'sun') || pairHas(a, b, 'venus', 'moon')
    || pairHas(a, b, 'mars', 'asc') || pairHas(a, b, 'venus', 'asc') || pairHas(a, b, 'venus', 'venus') || pairHas(a, b, 'mars', 'sun') || pairHas(a, b, 'mars', 'moon')) {
    // 对冲与金火刑相带来张力式的吸引
    out.attraction = hard && (pairHas(a, b, 'venus', 'mars') || type === 'opposition') ? 0.35 : tone;
  }
  if ((pairHas(a, b, 'pluto') || pairHas(a, b, 'uranus')) && (pairHas(a, b, 'venus') || pairHas(a, b, 'mars'))) {
    out.attraction = (out.attraction ?? 0) + 0.3;   // 强烈、难以抗拒，但不一定舒服
  }
  // 情感：月亮相关
  if (pairHas(a, b, 'moon')) out.emotion = tone;
  // 沟通：水星相关
  if (pairHas(a, b, 'mercury')) out.communication = tone;
  // 稳定：土星与个人点；土星合相视为承诺感
  if (pairHas(a, b, 'saturn') && (PERSONAL.has(a) || PERSONAL.has(b) || pairHas(a, b, 'saturn', 'saturn'))) {
    out.stability = type === 'conjunction' ? 0.3 : tone;
  }
  if (pairHas(a, b, 'sun', 'moon') || pairHas(a, b, 'moon', 'moon')) out.stability = (out.stability ?? 0) + tone * 0.5;
  // 成长：木星、北交点
  if (pairHas(a, b, 'jupiter') || pairHas(a, b, 'northNode')) out.growth = type === 'conjunction' ? 0.8 : tone;
  // 婚神星与个人点：对长期伴侣关系的期待是否对得上
  if (pairHas(a, b, 'juno') && (PERSONAL.has(a) || PERSONAL.has(b))) {
    out.stability = (out.stability ?? 0) + (type === 'conjunction' ? 0.6 : tone * 0.8);
  }
  // 凯龙星与个人点：触及旧伤，既能疗愈也可能刺痛
  if (pairHas(a, b, 'chiron') && (PERSONAL.has(a) || PERSONAL.has(b))) {
    out.emotion = (out.emotion ?? 0) + (tone > 0 ? 0.3 : -0.3);
  }
  // 同名个人点合相：本质相近、容易产生共鸣
  if (type === 'conjunction' && a === b) {
    const resonance: Partial<Record<AstroPointKey, DimKey[]>> = {
      sun: ['stability', 'growth'], moon: ['emotion'], mercury: ['communication'],
      venus: ['attraction'], mars: ['attraction'], asc: ['attraction', 'communication'],
    };
    for (const d of resonance[a] || []) out[d] = (out[d] ?? 0) + 1.0;
  }
  return out;
}

const NAME = (k: AstroPointKey) => POINT_NAMES[k];

/** Plain-language reading of one contact (original wording). */
function contactPhrase(_type: AstroAspectType, a: AstroPointKey, b: AstroPointKey, tone: number): string {
  const good = tone > 0.2;
  const bad = tone < -0.2;
  if (pairHas(a, b, 'venus', 'mars')) return good ? '彼此吸引，相处有火花' : bad ? '吸引力强但节奏不同，容易因需求错位起摩擦' : '化学反应明显，热情来得快';
  if (pairHas(a, b, 'sun', 'moon')) return good ? '一方想做的事，恰好能满足另一方的情感需要' : bad ? '目标与情绪需求时有冲突，需要多一点体谅' : '生活重心容易绑在一起，默契感强';
  if (pairHas(a, b, 'moon', 'moon')) return good ? '情绪节奏相近，很容易互相体贴' : bad ? '情绪反应方式不同，可能各自觉得不被理解' : '情绪共振很强，开心难过都会互相传染';
  if (pairHas(a, b, 'saturn')) return good ? '关系里有责任感，愿意为彼此长期投入' : bad ? '一方可能让另一方觉得被约束或被评判' : '有很强的承诺羁绊，也可能伴随压力';
  if (pairHas(a, b, 'jupiter')) return good ? '互相鼓励，在一起更乐观、机会也更多' : bad ? '容易互相纵容或期待过高' : '彼此放大对方的热情与信心';
  if (pairHas(a, b, 'mercury')) return good ? '说话投机，想法容易被对方理解' : bad ? '表达习惯不同，容易误会对方的意思' : '思路容易同步，聊天停不下来';
  if (pairHas(a, b, 'pluto')) return '关系强烈而深刻，可能伴随控制欲或执念，需要保持边界';
  if (pairHas(a, b, 'uranus')) return good ? '彼此带来新鲜感，关系不落俗套' : '新鲜刺激但不太稳定，需要给彼此空间';
  if (pairHas(a, b, 'neptune')) return good ? '浪漫、有灵性上的共鸣' : '容易把对方理想化，需防止期待落差';
  if (pairHas(a, b, 'northNode')) return '有一种"注定相遇"的感觉，关系推动彼此成长';
  if (pairHas(a, b, 'juno')) return good ? '对伴侣关系的期待比较一致，适合谈长久' : bad ? '对"好伴侣"的想象不太一样，需要把期待说清楚' : '容易把对方放进"伴侣"的位置去看';
  if (pairHas(a, b, 'chiron')) return good ? '能温柔地接住对方的旧伤，关系有疗愈感' : '无意间容易碰到对方的痛处，需要多一分体贴';
  if (pairHas(a, b, 'venus')) return good ? '审美与相处方式合拍，在一起很舒服' : bad ? '对爱的表达方式有落差' : '彼此欣赏，容易产生好感';
  if (pairHas(a, b, 'mars')) return good ? '行动力互相带动，一起做事有冲劲' : bad ? '容易起争执，需要学会降温' : '能量强烈，既能并肩也可能较劲';
  return good ? '能量顺畅互补' : bad ? '存在摩擦点，需要磨合' : '影响力彼此交融';
}

// Houses that matter per dimension (planet of one person in the other's house)
const HOUSE_RULES: { dim: DimKey; houses: number[]; planets: AstroBodyKey[]; score: number; text: (who: string, other: string, planet: string, h: number) => string }[] = [
  { dim: 'emotion', houses: [4, 8], planets: ['sun', 'moon', 'venus'], score: 0.5, text: (w, o, p, h) => `${w}的${p}落入${o}的第${h}宫：情感上容易走进对方内心深处` },
  { dim: 'communication', houses: [3], planets: ['sun', 'moon', 'mercury', 'venus'], score: 0.5, text: (w, o, p, h) => `${w}的${p}落入${o}的第${h}宫：日常交流频繁、话题多` },
  { dim: 'stability', houses: [7, 10], planets: ['sun', 'moon', 'venus', 'jupiter', 'saturn'], score: 0.45, text: (w, o, p, h) => `${w}的${p}落入${o}的第${h}宫：${h === 7 ? '容易被视为伴侣、愿意认真经营' : '关系有现实层面的支撑'}` },
  { dim: 'growth', houses: [9, 5, 11], planets: ['jupiter', 'sun', 'northNode'], score: 0.4, text: (w, o, p, h) => `${w}的${p}落入${o}的第${h}宫：一起开阔眼界、互相成就` },
  { dim: 'attraction', houses: [5, 1], planets: ['venus', 'mars', 'sun'], score: 0.45, text: (w, o, p, h) => `${w}的${p}落入${o}的第${h}宫：${h === 5 ? '恋爱感强，彼此觉得有趣' : '第一眼就注意到对方'}` },
];

function scoreCompatibility(
  cross: AstroAspect[],
  aInB: { key: AstroBodyKey; name: string; house: number }[],
  bInA: { key: AstroBodyKey; name: string; house: number }[],
  labels: { a: string; b: string },
  orbFor: (t: AstroAspectType, lum: boolean) => number,
): AstroCompatibility {
  const raw: Record<DimKey, number> = { attraction: 0, emotion: 0, communication: 0, stability: 0, growth: 0 };
  const notes: Record<DimKey, { text: string; w: number }[]> = { attraction: [], emotion: [], communication: [], stability: [], growth: [] };
  const highlights: AstroCompatibility['highlights'] = [];

  for (const x of cross) {
    const a = x.a as AstroPointKey;
    const b = x.b as AstroPointKey;
    const tone = baseTone(x.type, a, b);
    const maxOrb = orbFor(x.type, a === 'sun' || a === 'moon' || b === 'sun' || b === 'moon');
    const decay = Math.max(0, 1 - x.orb / (maxOrb + 1));
    const weight = (POINT_WEIGHT[a] ?? 0.4) * (POINT_WEIGHT[b] ?? 0.4) * decay;
    const dims = dimensionsFor(x.type, a, b, tone);
    const text = `${labels.a}的${NAME(a)}${x.typeName}${labels.b}的${NAME(b)}：${contactPhrase(x.type, a, b, tone)}`;
    let total = 0;
    for (const [dim, t] of Object.entries(dims) as [DimKey, number][]) {
      const c = t * weight;
      raw[dim] += c;
      total += c;
      notes[dim].push({ text, w: c });
    }
    if (!Object.keys(dims).length) continue;
    highlights.push({
      text,
      effect: total > 0.15 ? 'positive' : total < -0.15 ? 'negative' : 'mixed',
      weight: +total.toFixed(3),
    });
  }

  const overlay = (list: { key: AstroBodyKey; name: string; house: number }[], who: string, other: string) => {
    for (const rule of HOUSE_RULES) {
      for (const p of list) {
        if (!rule.planets.includes(p.key) || !rule.houses.includes(p.house)) continue;
        const c = rule.score * (POINT_WEIGHT[p.key] ?? 0.5);
        raw[rule.dim] += c;
        const text = rule.text(who, other, p.name, p.house);
        notes[rule.dim].push({ text, w: c });
        highlights.push({ text, effect: 'positive', weight: +c.toFixed(3) });
      }
    }
  };
  overlay(aInB, labels.a, labels.b);
  overlay(bInA, labels.b, labels.a);

  // tanh keeps a few very strong contacts from pinning the score at 100
  const toScore = (v: number) => Math.round(50 + 50 * Math.tanh((v - SCORE_OFFSET) / SCORE_SCALE));
  const dimensions: AstroCompatibilityDimension[] = (Object.keys(DIM_NAMES) as DimKey[]).map((key) => ({
    key,
    name: DIM_NAMES[key],
    score: toScore(raw[key]),
    notes: notes[key].sort((p, q) => Math.abs(q.w) - Math.abs(p.w)).slice(0, 3).map((n) => n.text),
  }));
  const score = Math.round(dimensions.reduce((s, d) => s + d.score * DIM_WEIGHTS[d.key], 0));
  const level = score >= 80 ? '灵犀相通' : score >= 67 ? '相处融洽' : score >= 55 ? '互有吸引，用心经营会更好' : score >= 43 ? '需要磨合' : '挑战较多，更需要理解与包容';
  highlights.sort((p, q) => Math.abs(q.weight) - Math.abs(p.weight));
  return { score, level, dimensions, highlights: highlights.slice(0, 10) };
}

export function getSynastryWheel(
  a: AstroInput, b: AstroInput,
  labels: { a: string; b: string },
  settings?: Partial<AstroChartSettings>,
): AstroBiWheel {
  const inner = natalChart(a, settings);
  const outer = natalChart(b, settings);
  const s = inner.settings;
  // Synastry uses the chart orbs, a touch tighter so only meaningful contacts count
  const base = settingsOrb(s);
  const orbFor = (t: AstroAspectType, lum: boolean) => base(t, lum) * 0.85;
  const cross = crossAspects(
    pointsOf(inner, { angles: true, moving: false }), pointsOf(outer, { angles: true, moving: false }),
    s.aspects, orbFor, { inner: `${labels.a}的`, outer: `${labels.b}的` }, s.minorBodyOrb,
  ).map((x) => ({ ...x, applying: false }));
  const bInA = houseOverlay(outer, inner);
  const aInB = houseOverlay(inner, outer);
  return {
    kind: 'synastry',
    kindName: '比较盘',
    innerLabel: labels.a,
    outerLabel: labels.b,
    inner,
    outer,
    crossAspects: cross,
    outerInInnerHouses: bInA,
    innerInOuterHouses: aInB,
    compatibility: scoreCompatibility(cross, aInB, bInA, labels, orbFor),
    outerMoment: `${b.birthDate} ${b.birthTime}`,
    note: '比较盘：内圈为甲方本命，外圈为乙方本命。匹配度为天枢自拟的参考模型（相位性质 × 行星权重 × 容许度，另计宫位叠加），仅供参考，不代表关系结论。',
  };
}

// ── Composite ──

export function getCompositeChart(
  a: AstroInput, b: AstroInput,
  labels: { a: string; b: string },
  settings?: Partial<AstroChartSettings>,
): AstroCompositeResponse {
  const ca = natalChart(a, settings);
  const cb = natalChart(b, settings);
  const s = ca.settings;
  const bodies = ca.planets.flatMap((p) => {
    const q = cb.planets.find((x) => x.key === p.key);
    return q ? [{ key: p.key, lon: midpoint(p.longitude, q.longitude), speed: (p.speed + q.speed) / 2 }] : [];
  });
  // Keep the nodal axis exact after taking midpoints
  const nn = bodies.find((x) => x.key === 'northNode')!;
  bodies.find((x) => x.key === 'southNode')!.lon = norm(nn.lon + 180);

  const mc = midpoint(ca.angles.mc.longitude, cb.angles.mc.longitude);
  let asc = midpoint(ca.angles.asc.longitude, cb.angles.asc.longitude);
  // The ASC midpoint can land on the wrong side of the MC axis; keep it east of the MC
  if (norm(asc - mc) > 180) asc = norm(asc + 180);
  const eps = (ca.obliquity + cb.obliquity) / 2;
  const lat = (a.lat + b.lat) / 2;
  const lon = (a.lon + b.lon) / 2;

  let cusps: { cusps: number[]; used: typeof s.houseSystem; note?: string };
  if (s.houseSystem === 'whole-sign' || s.houseSystem === 'equal') {
    cusps = houseCusps(s.houseSystem, asc, mc, 0, eps, lat);
  } else {
    // 中点法：对应宫头取中点，再以组合上升/天顶为准
    const mids = ca.houses.map((h, i) => midpoint(h.longitude, cb.houses[i].longitude));
    mids[0] = asc; mids[9] = mc; mids[6] = norm(asc + 180); mids[3] = norm(mc + 180);
    const ordered = mids.every((c, i) => norm(mids[(i + 1) % 12] - c) < 180);
    cusps = ordered
      ? { cusps: mids, used: s.houseSystem }
      : { ...houseCusps('porphyry', asc, mc, 0, eps, lat), note: '宫头中点顺序错乱，已改用 Porphyry 等分组合四轴' };
  }

  const tA = new Date(ca.utc).getTime();
  const tB = new Date(cb.utc).getTime();
  const midUtc = new Date((tA + tB) / 2);
  const chart = assembleChart({
    bodies, frame: { asc, mc, ramc: 0, eps, lat }, cusps, settings: s, noRetrograde: true,
    meta: {
      birthDate: `${a.birthDate} × ${b.birthDate}`, birthTime: `${a.birthTime} × ${b.birthTime}`,
      timezone: a.timezone || TZ, lat: +lat.toFixed(4), lon: +lon.toFixed(4),
      utc: midUtc.toISOString(), utcOffset: '+00:00',
      julianDayUT: +((ca.julianDayUT + cb.julianDayUT) / 2).toFixed(6), localSiderealTime: 0,
    },
  });
  return {
    kind: 'composite',
    labelA: labels.a,
    labelB: labels.b,
    chart,
    note: '中点组合盘：两人对应行星与四轴取较近中点，宫头按中点法。组合盘描述"这段关系本身"的性格，而非两个人各自的性格；组合盘无逆行概念。',
  };
}

// ── LLM formatting ──

export function formatBiWheelForLlm(w: AstroBiWheel): string {
  const lines: string[] = [];
  lines.push(`[${w.kindName}] ${w.innerLabel}（内圈） × ${w.outerLabel}（外圈）`);
  lines.push(`外圈时刻: ${w.outerMoment}`);
  if (w.inner.place) lines.push(...placeLine(w.inner.place));
  if (w.note) lines.push(`说明: ${w.note}`);
  if (w.inner.planets.some((p) => p.category === 'asteroid' || p.category === 'point')) {
    lines.push(`小行星与虚点只取主相位，容许度 ${w.inner.settings.minorBodyOrb}°（不超过该盘型的主相位容许度）。`);
  }
  for (const n of new Set([w.inner.extraBodiesNote, w.outer.extraBodiesNote].filter(Boolean))) lines.push(`[说明] ${n}`);
  const innerA = w.inner.angles;
  lines.push(`内圈四轴: 上升 ${formatDegree(innerA.asc)}，天顶 ${formatDegree(innerA.mc)}`);
  if (w.kind !== 'transit') {
    const oa = w.outer.angles;
    lines.push(`外圈四轴: 上升 ${formatDegree(oa.asc)}，天顶 ${formatDegree(oa.mc)}`);
  }
  const houseIn = new Map(w.outerInInnerHouses.map((h) => [h.key, h.house]));
  lines.push(`外圈行星（落内圈宫位）:`);
  for (const p of w.outer.planets) {
    lines.push(`- ${p.name}${bodyTag(p)}: ${formatDegree(p)}${p.retrograde ? ' 逆行' : ''}${p.dignityName ? ` [${p.dignityName}]` : ''} → 内圈第${houseIn.get(p.key)}宫`);
  }
  if (w.innerInOuterHouses) {
    lines.push(`内圈行星落外圈宫位: ${w.innerInOuterHouses.map((h) => `${h.name}${h.house}宫`).join('，')}`);
  }
  if (w.kind === 'solar-return') {
    lines.push('返照盘本身:');
    lines.push(...formatChartBody(w.outer).map((l) => `  ${l}`));
  }
  if (w.crossAspects.length) {
    lines.push(`交互相位（前 ${Math.min(25, w.crossAspects.length)} 条，主相位在前）:`);
    for (const x of w.crossAspects.slice(0, 25)) lines.push(`- ${aspectLine(x)}`);
  } else {
    lines.push('交互相位: 在当前容许度内没有明显相位');
  }
  const c = w.compatibility;
  if (c) {
    lines.push(`匹配度: ${c.score}/100（${c.level}）`);
    lines.push(`分项: ${c.dimensions.map((d) => `${d.name}${d.score}`).join('，')}`);
    for (const d of c.dimensions) if (d.notes.length) lines.push(`- ${d.name}: ${d.notes.join('；')}`);
    lines.push('关键接触:');
    for (const h of c.highlights) lines.push(`- ${h.effect === 'positive' ? '＋' : h.effect === 'negative' ? '－' : '±'} ${h.text}`);
  }
  return lines.join('\n');
}

export function formatCompositeForLlm(c: AstroCompositeResponse): string {
  return [
    `[组合中点盘] ${c.labelA} × ${c.labelB}`,
    ...(c.note ? [`说明: ${c.note}`] : []),
    ...formatChartBody(c.chart),
  ].join('\n');
}

