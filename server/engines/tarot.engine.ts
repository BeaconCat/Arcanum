/**
 * 塔罗引擎：牌库与牌阵加载、密码学安全洗牌、按牌阵抽牌。
 * 数据：server/data/tarot/*.json（原创内容，见该目录 README）
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { randomInt } from 'crypto';
import type {
  TarotCard, TarotSpread, TarotSuit, TarotDrawnCard,
} from '../../shared/types/tarot.types';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'tarot');

const SUITS: { key: TarotSuit; name: string; element: string }[] = [
  { key: 'wands', name: '权杖', element: '火' },
  { key: 'cups', name: '圣杯', element: '水' },
  { key: 'swords', name: '宝剑', element: '风' },
  { key: 'pentacles', name: '星币', element: '土' },
];

type RawCard = Omit<TarotCard, 'id' | 'index' | 'arcana' | 'suit' | 'suitName' | 'element'> & { id?: string };

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8')) as T;
}

let deckCache: TarotCard[] | null = null;
let spreadCache: TarotSpread[] | null = null;

/** Full 78-card deck in canonical order (majors, wands, cups, swords, pentacles). */
export function getTarotDeck(): TarotCard[] {
  if (deckCache) return deckCache;
  const deck: TarotCard[] = [];
  for (const c of readJson<RawCard[]>('major.json')) {
    deck.push({
      ...c,
      id: `major-${String(c.number).padStart(2, '0')}`,
      index: deck.length,
      arcana: 'major',
    });
  }
  for (const s of SUITS) {
    for (const c of readJson<RawCard[]>(`${s.key}.json`)) {
      deck.push({
        ...c,
        id: `${s.key}-${String(c.number).padStart(2, '0')}`,
        index: deck.length,
        arcana: 'minor',
        suit: s.key,
        suitName: s.name,
        element: s.element,
      });
    }
  }
  deckCache = deck;
  return deck;
}

export function getTarotSpreads(): TarotSpread[] {
  if (!spreadCache) spreadCache = readJson<TarotSpread[]>('spreads.json');
  return spreadCache;
}

export function getTarotCard(id: string): TarotCard | undefined {
  return getTarotDeck().find((c) => c.id === id);
}

export function getTarotSpread(id: string): TarotSpread | undefined {
  return getTarotSpreads().find((s) => s.id === id);
}

/** Fisher–Yates shuffle driven by crypto.randomInt (uniform, unpredictable). */
export function secureShuffle<T>(items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface DrawSpreadOptions {
  allowReversed?: boolean;
  majorOnly?: boolean;
  /** Indices into the shuffled deck picked by the user (one per position); invalid/missing → next unused card */
  picks?: number[];
}

/** Shuffle and deal one card per spread position. */
export function drawForSpread(spread: TarotSpread, opts: DrawSpreadOptions = {}): TarotDrawnCard[] {
  const pool = getTarotDeck().filter((c) => !opts.majorOnly || c.arcana === 'major');
  if (spread.positions.length > pool.length) throw new Error('牌数不足以完成该牌阵');
  const shuffled = secureShuffle(pool);

  const used = new Set<number>();
  const chosen: number[] = [];
  for (const p of opts.picks || []) {
    if (chosen.length >= spread.positions.length) break;
    if (Number.isInteger(p) && p >= 0 && p < shuffled.length && !used.has(p)) {
      used.add(p);
      chosen.push(p);
    }
  }
  for (let i = 0; chosen.length < spread.positions.length && i < shuffled.length; i++) {
    if (!used.has(i)) { used.add(i); chosen.push(i); }
  }

  return spread.positions.map((pos, k) => ({
    positionId: pos.id,
    cardId: shuffled[chosen[k]].id,
    reversed: opts.allowReversed !== false && randomInt(2) === 1,
  }));
}

/** Integrity check for the content files. Returns a list of problems (empty = OK). */
export function validateTarotData(): string[] {
  const problems: string[] = [];
  const deck = getTarotDeck();
  if (deck.length !== 78) problems.push(`牌数应为 78，实际 ${deck.length}`);
  const majors = deck.filter((c) => c.arcana === 'major');
  if (majors.length !== 22) problems.push(`大阿卡纳应为 22 张，实际 ${majors.length}`);
  majors.forEach((c, i) => { if (c.number !== i) problems.push(`大阿卡纳编号不连续：${c.id}`); });
  for (const s of SUITS) {
    const cards = deck.filter((c) => c.suit === s.key);
    if (cards.length !== 14) problems.push(`${s.name}应为 14 张，实际 ${cards.length}`);
    cards.forEach((c, i) => { if (c.number !== i + 1) problems.push(`${s.name}编号不连续：${c.id}`); });
  }
  const ids = new Set<string>();
  for (const c of deck) {
    if (ids.has(c.id)) problems.push(`重复 id：${c.id}`);
    ids.add(c.id);
    const need: (keyof TarotCard)[] = ['nameZh', 'nameEn', 'upright', 'reversed', 'advice'];
    for (const k of need) if (!c[k]) problems.push(`${c.id} 缺少 ${k}`);
    for (const k of ['love', 'career', 'wealth', 'growth'] as const) if (!c.aspects?.[k]) problems.push(`${c.id} 缺少方面 ${k}`);
    if (!(c.keywordsUpright?.length >= 3 && c.keywordsUpright.length <= 5)) problems.push(`${c.id} 正位关键词应 3–5 个`);
    if (!(c.keywordsReversed?.length >= 3 && c.keywordsReversed.length <= 5)) problems.push(`${c.id} 逆位关键词应 3–5 个`);
    for (const k of ['upright', 'reversed'] as const) {
      const n = [...(c[k] || '')].length;
      if (n < 60 || n > 120) problems.push(`${c.id} ${k} 长度 ${n} 超出 60–120 字范围`);
    }
  }
  const spreadIds = new Set<string>();
  for (const s of getTarotSpreads()) {
    if (spreadIds.has(s.id)) problems.push(`重复牌阵 id：${s.id}`);
    spreadIds.add(s.id);
    s.positions.forEach((p, i) => {
      if (p.id !== i + 1) problems.push(`牌阵 ${s.id} 位置编号不连续`);
      if (!p.name || !p.meaning) problems.push(`牌阵 ${s.id} 位置 ${p.id} 缺少名称或含义`);
      if (p.x < 0 || p.x > 100 || p.y < 0 || p.y > 100) problems.push(`牌阵 ${s.id} 位置 ${p.id} 坐标越界`);
    });
  }
  return problems;
}
