/**
 * 塔罗占卜记录：抽牌保存、列表/详情/删除/备注、AI 解读（流式）。
 * 存储：data/users/<uid>/tarot/<readingId>.yaml
 */
import { randomBytes } from 'crypto';
import { readYaml, writeYaml, deleteYaml, listDir, getUserDir } from './storage.service';
import { getProfile } from './profile.service';
import { subagentCallStream } from './llm.service';
import { getBaziChart } from '../engines/bazi.engine';
import { getTarotCard, getTarotSpread, drawForSpread } from '../engines/tarot.engine';
import { AppError } from '../middleware/error-handler';
import type { Profile } from '../../shared/types/profile.types';
import type { TarotReading, TarotReadingMeta, TarotDrawOptions, TarotReadingPage } from '../../shared/types/tarot.types';

const ID_RE = /^tr-[a-z0-9]{6,40}$/;

function tarotDir(userId: string): string {
  return `${getUserDir(userId)}/tarot`;
}

function readingPath(userId: string, readingId: string): string {
  if (!ID_RE.test(readingId)) throw new AppError(400, '无效的占卜记录编号');
  return `${tarotDir(userId)}/${readingId}.yaml`;
}

// ── Meta index ──
// Listing used to read every reading file; with many readings that gets slow, so list metadata
// lives in one index file. It is rebuilt when missing or when the file count no longer matches.

interface TarotIndex { items: Record<string, TarotReadingMeta> }

const indexPath = (userId: string) => `${tarotDir(userId)}/_index.yaml`;

function toMeta(r: TarotReading): TarotReadingMeta {
  return {
    readingId: r.readingId,
    spreadName: r.spreadName,
    question: r.question,
    cardCount: r.cards.length,
    preview: r.cards.slice(0, 3),
    hasInterpretation: !!r.interpretation,
    favorite: r.favorite,
    deck: r.deck,
    createdAt: r.createdAt,
  };
}

async function readingFiles(userId: string): Promise<string[]> {
  return (await listDir(tarotDir(userId))).filter((f) => f.endsWith('.yaml') && ID_RE.test(f.replace(/\.yaml$/, '')));
}

async function rebuildIndex(userId: string, files: string[]): Promise<TarotIndex> {
  const index: TarotIndex = { items: {} };
  for (const f of files) {
    const r = await readYaml<TarotReading>(`${tarotDir(userId)}/${f}`);
    if (r) index.items[r.readingId] = toMeta(r);
  }
  await writeYaml(indexPath(userId), index);
  return index;
}

async function loadIndex(userId: string): Promise<TarotIndex> {
  const files = await readingFiles(userId);
  const index = await readYaml<TarotIndex>(indexPath(userId));
  if (!index?.items || Object.keys(index.items).length !== files.length) return rebuildIndex(userId, files);
  return index;
}

/** Persist a reading and keep the list index in sync. */
async function saveReading(userId: string, r: TarotReading): Promise<void> {
  await writeYaml(readingPath(userId, r.readingId), r);
  try {
    const index = await loadIndex(userId);
    index.items[r.readingId] = toMeta(r);
    await writeYaml(indexPath(userId), index);
  } catch { /* index self-heals on next list */ }
}

function newReadingId(): string {
  return `tr-${Date.now().toString(36)}${randomBytes(4).toString('hex')}`;
}

// ── Draw & CRUD ──

/** Shuffle, deal cards for the spread, and persist the reading. */
export async function drawTarotReading(userId: string, opts: TarotDrawOptions): Promise<TarotReading> {
  const spread = getTarotSpread(opts.spreadId);
  if (!spread) throw new AppError(400, '未知的牌阵');
  const question = (opts.question || '').trim().slice(0, 500);

  let profile: Profile | undefined;
  if (opts.profileId) profile = await getProfile(userId, opts.profileId);

  const allowReversed = opts.allowReversed !== false;
  const majorOnly = !!opts.majorOnly;
  const cards = drawForSpread(spread, { allowReversed, majorOnly, picks: opts.picks });
  const now = new Date().toISOString();
  const reading: TarotReading = {
    readingId: newReadingId(),
    spreadId: spread.id,
    spreadName: spread.name,
    question,
    allowReversed,
    majorOnly,
    ...(opts.deck ? { deck: opts.deck } : {}),
    profileId: profile?.profileId,
    profileName: profile?.name,
    cards,
    createdAt: now,
    updatedAt: now,
  };
  await saveReading(userId, reading);
  return reading;
}

export async function getTarotReading(userId: string, readingId: string): Promise<TarotReading> {
  const r = await readYaml<TarotReading>(readingPath(userId, readingId));
  if (!r) throw new AppError(404, '占卜记录不存在');
  return r;
}

/** Newest first; optional favorites-only filter. */
export async function listTarotReadings(
  userId: string,
  opts: { offset?: number; limit?: number; favorite?: boolean } = {},
): Promise<TarotReadingPage> {
  const offset = Math.max(0, Math.floor(opts.offset || 0));
  const limit = Math.min(100, Math.max(1, Math.floor(opts.limit || 20)));
  const index = await loadIndex(userId);
  const all = Object.values(index.items)
    .filter((m) => !opts.favorite || m.favorite)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { items: all.slice(offset, offset + limit), total: all.length, offset, limit };
}

export async function deleteTarotReading(userId: string, readingId: string): Promise<void> {
  await getTarotReading(userId, readingId);
  await deleteYaml(readingPath(userId, readingId));
  try {
    const index = await readYaml<TarotIndex>(indexPath(userId));
    if (index?.items?.[readingId]) {
      delete index.items[readingId];
      await writeYaml(indexPath(userId), index);
    }
  } catch { /* rebuilt on next list */ }
}

export async function updateTarotReading(
  userId: string,
  readingId: string,
  patch: { note?: string; favorite?: boolean },
): Promise<TarotReading> {
  const r = await getTarotReading(userId, readingId);
  if (typeof patch.note === 'string') r.note = patch.note.slice(0, 2000);
  if (typeof patch.favorite === 'boolean') r.favorite = patch.favorite;
  r.updatedAt = new Date().toISOString();
  await saveReading(userId, r);
  return r;
}

// ── LLM formatting ──

/** Compact text of a reading: question, spread, and each position with the card and its keywords. */
export function formatTarotForLlm(reading: TarotReading): string {
  const spread = getTarotSpread(reading.spreadId);
  const lines: string[] = [
    `[塔罗占卜] 牌阵：${reading.spreadName}（${reading.cards.length} 张）`,
    `问题：${reading.question || '（未提问，作一般性指引）'}`,
    `设置：${reading.allowReversed ? '含逆位' : '不含逆位'}${reading.majorOnly ? '，仅大阿卡纳' : ''}`,
    '抽到的牌：',
  ];
  for (const drawn of reading.cards) {
    const pos = spread?.positions.find((p) => p.id === drawn.positionId);
    const card = getTarotCard(drawn.cardId);
    if (!card) continue;
    const kw = (drawn.reversed ? card.keywordsReversed : card.keywordsUpright).join('、');
    lines.push(`${drawn.positionId}. ${pos?.name || '位置'}（${pos?.meaning || ''}）：${card.nameZh}【${drawn.reversed ? '逆位' : '正位'}】关键词：${kw}`);
  }
  if (reading.interpretation) lines.push('', '[已保存的解读]', reading.interpretation);
  return lines.join('\n');
}

// Approximate tropical sun-sign boundaries (month, day the sign begins)
const SUN_SIGNS: [number, number, string][] = [
  [1, 20, '水瓶'], [2, 19, '双鱼'], [3, 21, '白羊'], [4, 20, '金牛'], [5, 21, '双子'], [6, 22, '巨蟹'],
  [7, 23, '狮子'], [8, 23, '处女'], [9, 23, '天秤'], [10, 24, '天蝎'], [11, 23, '射手'], [12, 22, '摩羯'],
];

function sunSignOf(birthDate: string): string {
  const [, m, d] = birthDate.split('-').map(Number);
  let sign = '摩羯';
  for (const [sm, sd, name] of SUN_SIGNS) if (m > sm || (m === sm && d >= sd)) sign = name;
  return sign;
}

function profileNote(p: Profile): string {
  try {
    const bazi = getBaziChart(p.birthDate, p.birthTime, p.gender);
    return `求问者参考：${p.name}，太阳星座约为${sunSignOf(p.birthDate)}座，八字日主${bazi.dayMaster}（${bazi.dayMasterWuXing}），${bazi.wuXingAnalysis?.dayMasterStrength || ''}。仅作性格底色参考，解读仍以牌面为主。`;
  } catch {
    return '';
  }
}

const INTERPRET_SYSTEM = `你是"天枢"的塔罗解读师，语气温和、真诚、务实。请根据用户给出的问题与牌阵结果进行解读。

要求：
1. 开头用一句话点出整体基调（可用 markdown 引用块）。
2. 按牌阵位置逐张解读：说明这张牌在该位置意味着什么，正位/逆位要区别对待，并与所问之事紧密关联，不要只复述通用牌义。
3. 找出牌与牌之间的呼应或张力（例如元素分布、大阿卡纳比例、正逆位比例、相邻位置的关系），给出综合判断。
4. 最后给出 2-4 条具体、可执行的建议。
5. 塔罗揭示的是趋势与心理状态，不做绝对化的预言；涉及健康、法律、投资等重大决定时，提醒用户结合现实与专业意见。
6. 使用中文 markdown（小标题、列表、加粗重点），篇幅适中，不要输出与牌阵无关的内容。`;

/**
 * Stream an AI interpretation for a saved reading and persist the final text.
 * Yields text chunks as they arrive.
 */
export async function* streamTarotInterpretation(userId: string, readingId: string): AsyncGenerator<string, void, unknown> {
  const reading = await getTarotReading(userId, readingId);
  let prompt = formatTarotForLlm({ ...reading, interpretation: undefined });
  if (reading.profileId) {
    try {
      const note = profileNote(await getProfile(userId, reading.profileId));
      if (note) prompt += `\n\n${note}`;
    } catch { /* profile deleted — interpret without it */ }
  }

  let full = '';
  for await (const chunk of subagentCallStream(INTERPRET_SYSTEM, prompt, { maxTokens: 2048 })) {
    if (chunk.type === 'content' && chunk.text) {
      full += chunk.text;
      yield chunk.text;
    }
  }
  if (full.trim()) {
    const latest = await getTarotReading(userId, readingId);
    latest.interpretation = full.trim();
    latest.updatedAt = new Date().toISOString();
    await saveReading(userId, latest);
  }
}
