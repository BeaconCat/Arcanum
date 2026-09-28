/**
 * 紫微飞星引擎 — 宫干飞化 (Palace Stem Flying Star Mutations)
 *
 * 核心概念:
 * - 每个宫位的天干会产生自己的四化（禄/权/科/忌）
 * - 四化会飞入持有该星曜的宫位
 * - 通过分析飞化路径，可以揭示宫位之间的能量流动关系
 *
 * 使用场景:
 * - 自化: 宫干所化之星在本宫 → 能量自我循环
 * - 飞化: 宫干所化之星飞入他宫 → 能量转移/影响
 * - 双忌/禄忌交驰: 高级论断技法
 */

import type { ZiweiChart, ZiweiPalace } from '../../shared/types/ziwei.types';

// ── 四化表 (Ten Heavenly Stems → Four Transformations) ──
// 每个天干化出4颗星: [禄, 权, 科, 忌]
const SIHUA_TABLE: Record<string, [string, string, string, string]> = {
  甲: ['廉贞', '破军', '武曲', '太阳'],
  乙: ['天机', '天梁', '紫微', '太阴'],
  丙: ['天同', '天机', '文昌', '廉贞'],
  丁: ['太阴', '天同', '天机', '巨门'],
  戊: ['贪狼', '太阴', '右弼', '天机'],
  己: ['武曲', '贪狼', '天梁', '文曲'],
  庚: ['太阳', '武曲', '太阴', '天同'],
  辛: ['巨门', '太阳', '文曲', '文昌'],
  壬: ['天梁', '紫微', '左辅', '武曲'],
  癸: ['破军', '巨门', '太阴', '贪狼'],
};

const SIHUA_LABELS = ['禄', '权', '科', '忌'] as const;

export interface FlyingStar {
  star: string;       // 被化的星曜
  mutation: string;   // 化禄/化权/化科/化忌
  targetPalace: string; // 飞入的宫位名称
  targetPalaceIndex: number;
  isSelfMutation: boolean; // 是否自化
}

export interface PalaceFlyingStars {
  palaceName: string;
  palaceIndex: number;
  heavenlyStem: string;
  flyingStars: FlyingStar[];
}

export interface FlyingStarAnalysis {
  /** 本命四化 (生年四化) */
  natalSiHua: {
    stem: string;
    mutations: Array<{ star: string; mutation: string; palace: string }>;
  };
  /** 12宫飞化详情 */
  palaceFlyingStars: PalaceFlyingStars[];
  /** 自化汇总 */
  selfMutations: Array<{ palace: string; star: string; mutation: string }>;
  /** 双忌宫位 (被两颗以上忌星飞入的宫位) */
  doubleJi: Array<{ palace: string; sources: string[] }>;
  /** 禄忌交驰 (A宫飞禄到B, B宫飞忌到A, or vice versa) */
  luJiConflict: Array<{ palaceA: string; palaceB: string; desc: string }>;
  /** 宫位被飞入的汇总 */
  receivedMutations: Record<string, Array<{ from: string; star: string; mutation: string }>>;
}

/**
 * Find which palace a given star resides in.
 * Searches major and minor stars by name (ignoring brightness suffix).
 */
function findStarPalace(palaces: ZiweiPalace[], starName: string): { palace: ZiweiPalace; index: number } | null {
  for (let i = 0; i < palaces.length; i++) {
    const p = palaces[i];
    const allStars = [...p.majorStars, ...p.minorStars, ...p.adjectiveStars];
    for (const s of allStars) {
      if (s.name === starName) return { palace: p, index: i };
    }
  }
  return null;
}

/**
 * 计算宫干飞化
 * 
 * @param chart 已计算的紫微命盘
 * @param birthStem 生年天干 (取自 chineseDate, e.g. "甲" from "甲子年...")
 */
export function analyzeFlyingStars(chart: ZiweiChart): FlyingStarAnalysis {
  const palaces = chart.palaces;

  // Extract birth year stem from chineseDate (first character)
  const birthStem = chart.chineseDate?.charAt(0) || '';

  // ── 1. 本命四化 ──
  const natalMutations: Array<{ star: string; mutation: string; palace: string }> = [];
  const natalStars = SIHUA_TABLE[birthStem];
  if (natalStars) {
    for (let k = 0; k < 4; k++) {
      const found = findStarPalace(palaces, natalStars[k]);
      natalMutations.push({
        star: natalStars[k],
        mutation: `化${SIHUA_LABELS[k]}`,
        palace: found?.palace.name || '未知',
      });
    }
  }

  // ── 2. 12宫飞化 ──
  const palaceFlyingStars: PalaceFlyingStars[] = [];
  const selfMutations: FlyingStarAnalysis['selfMutations'] = [];
  const receivedMutations: FlyingStarAnalysis['receivedMutations'] = {};
  // Initialize received map
  for (const p of palaces) {
    receivedMutations[p.name] = [];
  }

  for (let i = 0; i < palaces.length; i++) {
    const palace = palaces[i];
    const stem = palace.heavenlyStem;
    const stars = SIHUA_TABLE[stem];
    if (!stars) {
      palaceFlyingStars.push({
        palaceName: palace.name,
        palaceIndex: i,
        heavenlyStem: stem,
        flyingStars: [],
      });
      continue;
    }

    const flyingStars: FlyingStar[] = [];
    for (let k = 0; k < 4; k++) {
      const found = findStarPalace(palaces, stars[k]);
      const isSelf = found ? found.index === i : false;
      const entry: FlyingStar = {
        star: stars[k],
        mutation: `化${SIHUA_LABELS[k]}`,
        targetPalace: found?.palace.name || '未知',
        targetPalaceIndex: found?.index ?? -1,
        isSelfMutation: isSelf,
      };
      flyingStars.push(entry);

      if (isSelf) {
        selfMutations.push({ palace: palace.name, star: stars[k], mutation: `化${SIHUA_LABELS[k]}` });
      }

      // Record what the target palace receives
      if (found && receivedMutations[found.palace.name]) {
        receivedMutations[found.palace.name].push({
          from: palace.name,
          star: stars[k],
          mutation: `化${SIHUA_LABELS[k]}`,
        });
      }
    }

    palaceFlyingStars.push({
      palaceName: palace.name,
      palaceIndex: i,
      heavenlyStem: stem,
      flyingStars,
    });
  }

  // ── 3. 双忌 ──
  const doubleJi: FlyingStarAnalysis['doubleJi'] = [];
  for (const [palaceName, received] of Object.entries(receivedMutations)) {
    const jiSources = received.filter(r => r.mutation === '化忌').map(r => r.from);
    if (jiSources.length >= 2) {
      doubleJi.push({ palace: palaceName, sources: jiSources });
    }
  }

  // ── 4. 禄忌交驰 ──
  const luJiConflict: FlyingStarAnalysis['luJiConflict'] = [];
  // Build directional maps: which palace does A's 禄/忌 fly to?
  const luMap = new Map<string, string>(); // palace → target of its 禄
  const jiMap = new Map<string, string>(); // palace → target of its 忌
  for (const pfs of palaceFlyingStars) {
    for (const fs of pfs.flyingStars) {
      if (fs.mutation === '化禄') luMap.set(pfs.palaceName, fs.targetPalace);
      if (fs.mutation === '化忌') jiMap.set(pfs.palaceName, fs.targetPalace);
    }
  }
  // Check: A飞禄到B && B飞忌到A
  const checked = new Set<string>();
  for (const [a, luTarget] of luMap.entries()) {
    const b = luTarget;
    const key = [a, b].sort().join('|');
    if (checked.has(key)) continue;
    if (jiMap.get(b) === a) {
      luJiConflict.push({ palaceA: a, palaceB: b, desc: `${a}飞禄到${b}，${b}飞忌到${a}` });
      checked.add(key);
    }
    // Also check reverse: A飞忌到B && B飞禄到A
    if (jiMap.get(a) === b && luMap.get(b) === a && !checked.has(key)) {
      luJiConflict.push({ palaceA: a, palaceB: b, desc: `${a}飞忌到${b}，${b}飞禄到${a}` });
      checked.add(key);
    }
  }

  return {
    natalSiHua: { stem: birthStem, mutations: natalMutations },
    palaceFlyingStars,
    selfMutations,
    doubleJi,
    luJiConflict,
    receivedMutations,
  };
}
