/**
 * 星盘解读：把盘面数据映射到原创文案库（server/data/astro-texts）。
 * 文案库按 category 分文件存放，首次使用时加载并缓存。
 */
import { readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type {
  AstroAspect, AstroBiWheel, AstroChart, AstroCompositeResponse, AstroPattern,
} from '../../shared/types/astro.types';
import type {
  AstroInterpretation, AstroInterpretationItem, AstroInterpretationSection,
} from '../../shared/types/astro-interpret.types';

// ── Text library ──

interface TextEntry { k: string[]; t: string; a?: string }

const TEXT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'astro-texts');
let library: Map<string, TextEntry> | null = null;

function lib(): Map<string, TextEntry> {
  if (library) return library;
  const map = new Map<string, TextEntry>();
  for (const file of readdirSync(TEXT_DIR).filter((f) => f.endsWith('.json'))) {
    const json = JSON.parse(readFileSync(join(TEXT_DIR, file), 'utf8')) as { category: string; entries: Record<string, TextEntry> };
    for (const [k, v] of Object.entries(json.entries)) map.set(`${json.category}.${k}`, v);
  }
  library = map;
  return map;
}

/** Look up a library entry by full key, e.g. "sign.sun.4" or "aspect.sun.moon.tens". */
export function lookupAstroText(key: string): TextEntry | undefined {
  return lib().get(key);
}

// ── Names & helpers ──

const SIGNS = ['白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '射手', '摩羯', '水瓶', '双鱼'];
const HOUSE_CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];

const NAMES: Record<string, string> = {
  sun: '太阳', moon: '月亮', mercury: '水星', venus: '金星', mars: '火星', jupiter: '木星', saturn: '土星',
  uranus: '天王星', neptune: '海王星', pluto: '冥王星', northNode: '北交点', southNode: '南交点',
  chiron: '凯龙星', ceres: '谷神星', pallas: '智神星', juno: '婚神星', vesta: '灶神星', lilith: '莉莉丝', fortune: '福点',
  asc: '上升', mc: '天顶', dsc: '下降', ic: '天底',
};
const nameOf = (k: string) => NAMES[k] || k;

/** Canonical order used by aspect / synastry keys (a before b). */
const ORDER = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'asc', 'mc'];
const SYN_POINTS = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'asc'];
const TRANSIT_OUTERS = ['jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
const TRANSIT_NATAL = ['sun', 'moon', 'mercury', 'venus', 'mars', 'asc', 'mc'];
const SIGN_BODIES = ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'northNode', 'chiron'];
const HOUSE_BODIES = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'northNode', 'chiron'];
const SHORT_HOUSE_BODIES = ['lilith', 'fortune', 'ceres', 'pallas', 'juno', 'vesta'];
const POINT_INTROS = ['northNode', 'chiron', 'lilith', 'fortune', 'ceres', 'pallas', 'juno', 'vesta'];

const ELEMENT_OF_SIGN = ['fire', 'earth', 'air', 'water'];
const MODALITY_OF_SIGN = ['cardinal', 'fixed', 'mutable'];

type Kind = 'conj' | 'harm' | 'tens';
const MAJOR_KIND: Record<string, Kind> = { conjunction: 'conj', sextile: 'harm', trine: 'harm', square: 'tens', opposition: 'tens' };

function orderedPair(a: string, b: string): [string, string] {
  return ORDER.indexOf(a) <= ORDER.indexOf(b) ? [a, b] : [b, a];
}

function item(key: string, title: string, extra: Partial<AstroInterpretationItem> = {}): AstroInterpretationItem | null {
  const e = lookupAstroText(key);
  if (!e) return null;
  return { key, title, keywords: e.k, text: e.t, advice: e.a, ...extra };
}

const compact = <T>(xs: (T | null | undefined)[]) => xs.filter((x): x is T => !!x);
const section = (key: string, title: string, items: (AstroInterpretationItem | null | undefined)[]): AstroInterpretationSection | null => {
  const list = compact(items);
  return list.length ? { key, title, items: list } : null;
};

const DISCLAIMER = '以上解读由天枢原创文案库根据盘面组合生成，描述的是倾向与可能性，而非定论；请结合自身经历理性参考。';

// Planets may gain new keys (chiron, lilith, …) — read them loosely.
type Planetish = { key: string; signIndex: number; house: number; sign: string; retrograde?: boolean };
const planetsOf = (c: AstroChart) => c.planets as unknown as Planetish[];
const planetAt = (c: AstroChart, key: string) => planetsOf(c).find((p) => p.key === key);

function aspectTitle(x: AstroAspect): string {
  return `${x.aName}${x.typeName}${x.bName}（容许度 ${x.orb.toFixed(1)}°${x.applying ? '，入相' : ''}）`;
}

/** Cross aspects: a = inner (natal) point, b = outer point → "行运木星合本命太阳". Engine names may already carry the prefix. */
const withPrefix = (name: string, prefix: string) => (!prefix || name.startsWith(prefix) ? name : `${prefix}${name}`);
function crossTitle(x: AstroAspect, outerPrefix: string, innerPrefix: string): string {
  return `${withPrefix(x.bName, outerPrefix)}${x.typeName}${withPrefix(x.aName, innerPrefix)}（容许度 ${x.orb.toFixed(1)}°${x.applying ? '，入相' : ''}）`;
}

// ── Natal pieces (shared with composite / solar return) ──

function aspectItems(aspects: AstroAspect[], limit: number, note?: string): AstroInterpretationItem[] {
  const out: AstroInterpretationItem[] = [];
  let minors = 0;
  for (const x of [...aspects].sort((p, q) => p.orb - q.orb)) {
    if (out.length >= limit) break;
    const a = x.a as string;
    const b = x.b as string;
    if (!ORDER.includes(a) || !ORDER.includes(b)) continue;
    const refs = [a, b];
    const kind = MAJOR_KIND[x.type];
    if (kind) {
      const [p, q] = orderedPair(a, b);
      const it = item(`aspect.${p}.${q}.${kind}`, aspectTitle(x), { refs, note });
      if (it) out.push(it);
    } else if (minors < 5) {
      const it = item(`aspect.minor.${x.type}`, aspectTitle(x), { refs, note: note ? `${note}；次要相位` : '次要相位' });
      if (it) { out.push(it); minors++; }
    }
  }
  return out;
}

function majority<T extends string>(values: T[]): T | undefined {
  const count = new Map<T, number>();
  for (const v of values) count.set(v, (count.get(v) || 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function patternItem(chart: AstroChart, p: AstroPattern): AstroInterpretationItem | null {
  const signs = p.bodies.map((k) => planetAt(chart, k as string)?.signIndex).filter((s): s is number => s !== undefined);
  let key: string;
  switch (p.type) {
    case 'grand-trine': key = `pattern.grand-trine.${majority(signs.map((s) => ELEMENT_OF_SIGN[s % 4])) || 'fire'}`; break;
    case 'grand-cross': {
      const mods = new Set(signs.map((s) => MODALITY_OF_SIGN[s % 3]));
      key = `pattern.grand-cross.${mods.size === 1 ? [...mods][0] : 'mixed'}`;
      break;
    }
    case 't-square': {
      const apexSign = p.apex ? planetAt(chart, p.apex as string)?.signIndex : undefined;
      key = `pattern.t-square.${MODALITY_OF_SIGN[(apexSign ?? signs[0] ?? 0) % 3]}`;
      break;
    }
    case 'stellium': key = `pattern.stellium.${p.detail.includes('座') ? 'sign' : 'house'}`; break;
    default: key = `pattern.${p.type}`;
  }
  return item(key, `${p.name}：${p.bodyNames.join('、')}`, { refs: p.bodies as string[], note: p.detail });
}

function natalSections(chart: AstroChart, opts: { aspectNote?: string; aspectLimit?: number } = {}): AstroInterpretationSection[] {
  const sun = planetAt(chart, 'sun');
  const moon = planetAt(chart, 'moon');
  const asc = chart.angles.asc;
  const mc = chart.angles.mc;
  const ruler = chart.chartRuler ? planetAt(chart, chart.chartRuler.key) : undefined;

  const core = section('core', '核心：日 · 月 · 升', [
    sun && item(`sign.sun.${sun.signIndex}`, `太阳在${SIGNS[sun.signIndex]}（第${sun.house}宫）`, { refs: ['sun'] }),
    moon && item(`sign.moon.${moon.signIndex}`, `月亮在${SIGNS[moon.signIndex]}（第${moon.house}宫）`, { refs: ['moon'] }),
    item(`sign.asc.${asc.signIndex}`, `上升${SIGNS[asc.signIndex]}`, { refs: ['asc'] }),
    item(`sign.mc.${mc.signIndex}`, `天顶${SIGNS[mc.signIndex]}`, { refs: ['mc'] }),
    ruler && item(`house.${ruler.key}.${ruler.house}`, `命主星${nameOf(ruler.key)}在第${HOUSE_CN[ruler.house]}宫`, {
      refs: [ruler.key], note: '命主星（上升星座的守护星）描述人生的主要着力点',
    }),
  ]);

  const signs = section('signs', '行星落星座', SIGN_BODIES.map((k) => {
    const p = planetAt(chart, k);
    return p ? item(`sign.${k}.${p.signIndex}`, `${nameOf(k)}在${SIGNS[p.signIndex]}${p.retrograde ? '（逆行）' : ''}`, { refs: [k] }) : null;
  }));

  const houses = section('houses', '行星落宫位', [...HOUSE_BODIES, ...SHORT_HOUSE_BODIES].map((k) => {
    const p = planetAt(chart, k);
    return p?.house ? item(`house.${k}.${p.house}`, `${nameOf(k)}在第${HOUSE_CN[p.house]}宫`, { refs: [k] }) : null;
  }));

  const aspects = section('aspects', '主要相位', aspectItems(chart.aspects, opts.aspectLimit ?? 20, opts.aspectNote));
  const patterns = section('patterns', '格局', (chart.patterns || []).map((p) => patternItem(chart, p)));
  const points = section('points', '特殊点与小行星', POINT_INTROS.map((k) => (planetAt(chart, k) ? item(`body.${k}`, nameOf(k), { refs: [k] }) : null)));

  return compact([core, patterns, signs, houses, aspects, points]);
}

// ── Public API ──

export function interpretNatal(chart: AstroChart, subtitle?: string): AstroInterpretation {
  return { kind: 'natal', title: '本命盘解读', subtitle, sections: natalSections(chart), disclaimer: DISCLAIMER };
}

export function interpretComposite(c: AstroCompositeResponse): AstroInterpretation {
  const chart = c.chart;
  const sun = planetAt(chart, 'sun');
  const moon = planetAt(chart, 'moon');
  const venus = planetAt(chart, 'venus');
  const asc = chart.angles.asc;
  const core = section('core', '关系的核心', [
    sun && item(`composite.sign.sun.${sun.signIndex}`, `组合太阳在${SIGNS[sun.signIndex]}`, { refs: ['sun'] }),
    sun && item(`composite.house.sun.${sun.house}`, `组合太阳在第${HOUSE_CN[sun.house]}宫`, { refs: ['sun'] }),
    moon && item(`composite.sign.moon.${moon.signIndex}`, `组合月亮在${SIGNS[moon.signIndex]}`, { refs: ['moon'] }),
    moon && item(`composite.house.moon.${moon.house}`, `组合月亮在第${HOUSE_CN[moon.house]}宫`, { refs: ['moon'] }),
    venus && item(`composite.sign.venus.${venus.signIndex}`, `组合金星在${SIGNS[venus.signIndex]}`, { refs: ['venus'] }),
    venus && item(`composite.house.venus.${venus.house}`, `组合金星在第${HOUSE_CN[venus.house]}宫`, { refs: ['venus'] }),
    item(`composite.sign.asc.${asc.signIndex}`, `组合上升${SIGNS[asc.signIndex]}`, { refs: ['asc'] }),
  ]);
  const aspects = section('aspects', '组合盘相位', aspectItems(chart.aspects, 12, '组合盘相位：描述关系内部的互动模式（借用本命相位文案）'));
  const patterns = section('patterns', '组合盘格局', (chart.patterns || []).map((p) => patternItem(chart, p)));
  return {
    kind: 'composite',
    title: '组合中点盘解读',
    subtitle: `${c.labelA} × ${c.labelB}`,
    sections: compact([core, patterns, aspects]),
    disclaimer: DISCLAIMER,
  };
}

export function interpretBiWheel(w: AstroBiWheel): AstroInterpretation {
  if (w.kind === 'synastry') return interpretSynastry(w);

  const sections: (AstroInterpretationSection | null)[] = [];
  const cross = [...w.crossAspects].sort((p, q) => p.orb - q.orb);

  if (w.kind === 'transit') {
    sections.push(section('cross', '重要行运', cross
      .filter((x) => TRANSIT_OUTERS.includes(x.b as string) && TRANSIT_NATAL.includes(x.a as string) && MAJOR_KIND[x.type])
      .slice(0, 20)
      .map((x) => item(`transit.${x.b}.${x.a}.${MAJOR_KIND[x.type]}`, crossTitle(x, '行运', '本命'), { refs: [x.a as string, x.b as string] }))));
    sections.push(section('overlay', '行运外行星经过的宫位', w.outerInInnerHouses
      .filter((h) => TRANSIT_OUTERS.includes(h.key))
      .map((h) => item(`house.${h.key}.${h.house}`, `行运${h.name}经过第${HOUSE_CN[h.house]}宫`, {
        refs: [h.key], note: '借用本命落宫文案：这段时期该宫位的主题会被激活',
      }))));
  } else if (w.kind === 'progressed') {
    sections.push(section('cross', '推运与本命的相位', cross
      .filter((x) => MAJOR_KIND[x.type] && ORDER.includes(x.a as string) && ORDER.includes(x.b as string))
      .slice(0, 15)
      .map((x) => {
        const [p, q] = orderedPair(x.a as string, x.b as string);
        return item(`aspect.${p}.${q}.${MAJOR_KIND[x.type]}`, crossTitle(x, '推运', '本命'), {
          refs: [x.a as string, x.b as string], note: '推运相位借用本命相位文案解读，代表这一人生阶段被唤醒的主题',
        });
      })));
    const psun = planetAt(w.outer, 'sun');
    const pmoon = planetAt(w.outer, 'moon');
    sections.push(section('progressed', '推运日月', [
      psun && item(`sign.sun.${psun.signIndex}`, `推运太阳在${SIGNS[psun.signIndex]}`, { refs: ['sun'], note: '推运太阳换座常标志人生重心的转换' }),
      pmoon && item(`sign.moon.${pmoon.signIndex}`, `推运月亮在${SIGNS[pmoon.signIndex]}`, { refs: ['moon'], note: '推运月亮约两年半换一个星座，描述近期的情感需要' }),
    ]));
  } else if (w.kind === 'solar-return') {
    const ret = w.outer;
    const rsun = planetAt(ret, 'sun');
    const rmoon = planetAt(ret, 'moon');
    sections.push(section('core', '返照年度主题', [
      item(`sign.asc.${ret.angles.asc.signIndex}`, `返照上升${SIGNS[ret.angles.asc.signIndex]}`, { refs: ['asc'], note: '返照上升描述这一年面对世界的姿态' }),
      rsun && item(`house.sun.${rsun.house}`, `返照太阳在第${HOUSE_CN[rsun.house]}宫`, { refs: ['sun'], note: '返照太阳所在宫位是这一年的重心' }),
      rmoon && item(`sign.moon.${rmoon.signIndex}`, `返照月亮在${SIGNS[rmoon.signIndex]}`, { refs: ['moon'] }),
      rmoon && item(`house.moon.${rmoon.house}`, `返照月亮在第${HOUSE_CN[rmoon.house]}宫`, { refs: ['moon'], note: '返照月亮宫位描述这一年的情感关注点' }),
    ]));
    sections.push(section('aspects', '返照盘相位', aspectItems(ret.aspects, 10, '返照盘相位：这一年内在能量的互动')));
    sections.push(section('cross', '返照与本命的交互', cross
      .filter((x) => TRANSIT_OUTERS.includes(x.b as string) && TRANSIT_NATAL.includes(x.a as string) && MAJOR_KIND[x.type])
      .slice(0, 10)
      .map((x) => item(`transit.${x.b}.${x.a}.${MAJOR_KIND[x.type]}`, crossTitle(x, '返照', '本命'), {
        refs: [x.a as string, x.b as string], note: '借用行运文案，时间范围为这一个生日年',
      }))));
  }

  return {
    kind: w.kind,
    title: `${w.kindName}解读`,
    subtitle: w.outerMoment ? `${w.innerLabel} · ${w.outerMoment}` : w.innerLabel,
    sections: compact(sections),
    disclaimer: DISCLAIMER,
  };
}

function interpretSynastry(w: AstroBiWheel): AstroInterpretation {
  const A = w.innerLabel || '甲方';
  const B = w.outerLabel || '乙方';
  const contacts = [...w.crossAspects]
    .sort((p, q) => p.orb - q.orb)
    .filter((x) => SYN_POINTS.includes(x.a as string) && SYN_POINTS.includes(x.b as string) && MAJOR_KIND[x.type])
    .slice(0, 25)
    .map((x) => {
      const a = x.a as string;
      const b = x.b as string;
      const [p, q] = SYN_POINTS.indexOf(a) <= SYN_POINTS.indexOf(b) ? [a, b] : [b, a];
      return item(`synastry.${p}.${q}.${MAJOR_KIND[x.type]}`,
        `${withPrefix(x.aName, `${A}的`)}${x.typeName}${withPrefix(x.bName, `${B}的`)}（容许度 ${x.orb.toFixed(1)}°）`, { refs: [a, b] });
    });

  const overlay = (list: { key: string; name: string; house: number }[] | undefined, owner: string, host: string) =>
    (list || []).filter((h) => ['sun', 'moon', 'venus', 'mars', 'jupiter', 'saturn'].includes(h.key)).map((h) =>
      item(`synHouse.${h.key}.${h.house}`, `${owner}的${h.name}落入${host}的第${HOUSE_CN[h.house]}宫`, {
        refs: [h.key], note: `文中“你”指${host}，“对方”指${owner}`,
      }));

  const compat = w.compatibility;
  const sections = compact([
    compat ? {
      key: 'score',
      title: '匹配度概览',
      items: [{
        key: 'compatibility',
        title: `综合 ${compat.score} 分 · ${compat.level}`,
        keywords: compat.dimensions.map((d) => `${d.name}${d.score}`),
        text: compat.dimensions.map((d) => `${d.name}：${d.notes[0] || `${d.score}分`}`).join('；'),
        note: '天枢自拟的参考模型，仅供参考',
      }],
    } : null,
    section('cross', '重要接触', contacts),
    section('overlayB', `${B}的行星落入${A}的宫位`, overlay(w.outerInInnerHouses, B, A)),
    section('overlayA', `${A}的行星落入${B}的宫位`, overlay(w.innerInOuterHouses, A, B)),
  ]);
  return { kind: 'synastry', title: '比较盘解读', subtitle: `${A} × ${B}`, sections, disclaimer: DISCLAIMER };
}

/** Compact text for the LLM: section headings + "title：text（建议…）" lines. */
export function formatInterpretationForLlm(i: AstroInterpretation, maxItems = 30): string {
  const lines = [`[${i.title}]${i.subtitle ? ` ${i.subtitle}` : ''}`];
  let n = 0;
  for (const s of i.sections) {
    if (n >= maxItems) break;
    lines.push(`## ${s.title}`);
    for (const it of s.items) {
      if (n >= maxItems) break;
      lines.push(`- ${it.title}：${it.text}${it.advice ? `（建议：${it.advice}）` : ''}${it.note ? `〔${it.note}〕` : ''}`);
      n++;
    }
  }
  lines.push(`（${i.disclaimer}）`);
  return lines.join('\n');
}
