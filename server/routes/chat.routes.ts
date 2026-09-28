import express, { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  chatCompletionStream,
  chatCompletionWithToolsStream,
  compressHistory,
  estimateMessagesTokens,
  loadMemory,
  formatMemoryForPrompt,
  extractMemories,
  getSettings,
  subagentCall,
  type ChatMessage,
  type StreamChunk,
} from '../services/llm.service';
import {
  FC_TOOLS,
  executeFcToolRich,
  TOOL_TITLES,
  backfillToolStubs,
  buildLlmHistory,
  localParts,
  type ToolContext,
} from '../services/fc-tools.service';
import { readYaml, writeYaml, deleteYaml, listDir, getUserDir, saveBase64Image, readImageAsDataUri } from '../services/storage.service';
import { getMonthlyCalendar } from '../services/fortune.service';
import { listProfiles, getProfile } from '../services/profile.service';
import { getNatalChart } from '../services/natal.service';
import { getBaziChart } from '../engines/bazi.engine';
import { getZiweiChart } from '../engines/ziwei.engine';
import { getAstroChart } from '../engines/astro.engine';
import { resolveProfilePlace } from '../services/geo.service';
import type { Profile } from '../../shared/types/profile.types';
import type { ChatErrorInfo } from '../../shared/types/chat-error.types';
import { AppError } from '../middleware/error-handler';
import { describeLlmError } from '../services/llm-errors';
import { startRun, subscribeRun, stopRun, listRuns, activeRunFor, RunConflictError } from '../services/chat-runs.service';
import type { ChatRunInfo, ChatRunEvent, ChatStartRequest } from '../../shared/types/chat-run.types';
import type { Request, Response, NextFunction } from 'express';

export const chatRouter = Router();

chatRouter.use(authenticate);
// A 50 MB binary image expands to ~66.7 MB as base64 plus JSON overhead
chatRouter.use(express.json({ limit: '70mb' }));

// ── Image helpers ──

/** Save base64 data URI images to disk, return storage paths */
async function persistImages(userId: string, dataUris: string[]): Promise<string[]> {
  const paths: string[] = [];
  for (const uri of dataUris) {
    try {
      paths.push(await saveBase64Image(userId, uri));
    } catch (e) {
      console.warn('[chat] failed to save image:', e);
    }
  }
  return paths;
}

/** Convert stored image paths back to data URIs for LLM consumption */
async function imagesToDataUris(paths: string[]): Promise<string[]> {
  const uris: string[] = [];
  for (const p of paths) {
    try {
      uris.push(await readImageAsDataUri(p));
    } catch (e) {
      console.warn('[chat] failed to read image:', p, e);
    }
  }
  return uris;
}

// ── Chat session types ──

interface ChatSession {
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  tokenEstimate?: number;
  activeProfileId?: string;
}

interface SessionMeta {
  sessionId: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

const SYSTEM_PROMPT = `你是"天枢"，一位精通八字命理与紫微斗数的资深命理师。

回答格式要求（严格遵守）：
1. 先用markdown引用块（> ）写一段**斜体**的古典命理风格引言（2-4句，可引经据典，用词雅致），例如：
> *甲木参天，生于辰月得令，日主身旺气足……*

2. 紧接其后，用"---"分割线隔开，再给出**通俗易懂的人话版本**解读。人话版要：
   - 说人话，不要文绉绉
   - 直接回答用户关心的问题
   - 给出具体、可操作的建议
   - 用emoji让回答更生动 🎯
   - 用markdown格式（加粗重点、列表、标题等）让结构清晰

如果用户提供了命盘信息，请结合命盘数据进行个性化解读。
回答使用中文，态度温和亲切，像一个靠谱的朋友在聊天。
不要重复用户的问题，直接给分析和建议。`;

const TOOL_GUIDE = `

你拥有以下工具，可随时调用获取精确的命理计算数据。请先调用工具拿到数据再分析，不要凭空推测：
- 本命：get_bazi_chart（八字）、get_ziwei_chart（紫微）、get_astro_chart（西洋星盘）、get_dayun_analysis（大运）、get_wuxing_analysis（五行喜忌）、get_flying_stars（紫微飞星）、tieban_shenshu（铁板神数）
- 流年/流月/流日：get_bazi_flow_year + get_ziwei_flow_year；get_bazi_flow_month + get_ziwei_flow_month；get_bazi_flow_day + get_flow_day_context
- 择日择时：get_today_huangli（黄历）、get_shichen_detail（十二时辰）、get_yearly_calendar（全年月令）
- 西洋星盘进阶：get_astro_transit（行运）、get_astro_progressed（次限推运）、get_astro_solar_return（太阳返照）、get_astrocartography（地理占星：某地影响 / 按主题推荐城市）、get_astro_interpretation（天枢星盘解读文案库：取与盘面匹配的原创释义）
- 关系：compare_bazi（八字合盘）、get_astro_synastry（星盘比较盘+匹配度）、get_astro_composite（组合中点盘）——双方用 profileId1 / profileId2
- 其他：analyze_name（姓名五格）、analyze_fengshui（八宅）、analyze_xuankong（玄空飞星）
- 占卜：liu_yao（六爻）、mei_hua（梅花）、qi_men（奇门）——均按当下时刻起卦；draw_tarot（塔罗，按牌阵抽牌，结果以工具返回为准，不得自行编造牌面）
- 已保存的资料：get_natal_analysis（该档案已生成的本命详解报告）、get_daily_fortune（运势日历里已生成的每日/每月运势）

调用规则：
1. 分析当前命主时，个人类工具不必填写出生信息，系统会自动使用档案中的权威资料。
2. 分析档案里的其他人时，必须传该人的 profileId（见下方档案列表），不要自己抄写生日。
3. 只有档案之外的人，才填写 birthDate / birthTime / gender。
4. 分析流年需同时调用八字流年 + 紫微流年；流月、流日同理。
5. 用户问到本命详解或运势日历里已有的结论时，先用 get_natal_analysis / get_daily_fortune 读取，保持前后一致。
6. 用户消息中的"[系统附注]"是之前工具的真实演算结果，可直接引用；若数据被截断或省略，可重新调用工具。`;

function chatDir(userId: string): string {
  return `${getUserDir(userId)}/chat-history`;
}

function requireSessionId(value: unknown): string {
  if (typeof value !== 'string' || !/^session-[A-Za-z0-9_-]{1,64}$/.test(value)) {
    throw new AppError(400, '无效的会话编号');
  }
  return value;
}

function safeTimezone(tz: unknown): string {
  if (typeof tz !== 'string' || !tz) return 'Asia/Shanghai';
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return tz;
  } catch {
    return 'Asia/Shanghai';
  }
}

// ── Profile context ──

interface ProfileContext {
  block: string;
  profileName: string;
  profileId: string;
  current: Profile;
  profiles: Profile[];
}

async function buildProfileContext(userId: string, reqProfileId: string | undefined, tz: string): Promise<{ ctx: ProfileContext | null; profiles: Profile[] }> {
  let profiles: Profile[] = [];
  try {
    profiles = await listProfiles(userId);
    if (!profiles.length) return { ctx: null, profiles };
    const current = (reqProfileId ? profiles.find(p => p.profileId === reqProfileId) : null)
      || profiles.find(p => p.isPrimary)
      || profiles[0];

    const chart = getBaziChart(current.birthDate, current.birthTime, current.gender);
    const wx = chart.wuXingAnalysis;
    const currentDy = chart.currentDaYun;
    const genderStr = current.gender === 'male' ? '男' : '女';
    const sep = '─'.repeat(48);
    const now = localParts(tz);

    const pillarDetail = (key: 'year' | 'month' | 'day' | 'hour') => {
      const p = chart.pillars[key];
      const parts: string[] = [`${p.gan}${p.zhi}(${p.naYin})`];
      if (p.ganTenGod) parts.push(`天干十神:${p.ganTenGod}`);
      if (p.zhiTenGods?.length) parts.push(`地支十神:${p.zhiTenGods.join(',')}`);
      if (p.hideGan?.length) parts.push(`藏干:${p.hideGan.map((h: any) => typeof h === 'string' ? h : `${h.gan}(${h.tenGod},${h.percentage}%)`).join(',')}`);
      if (p.diShi) parts.push(`地势:${p.diShi}`);
      if (p.xunKong) parts.push(`旬空:${p.xunKong}`);
      if (p.shenSha?.length) parts.push(`神煞:${p.shenSha.join(',')}`);
      return parts.join(' | ');
    };

    let block = `\n\n${sep}
[当前分析对象] ${current.name}（${genderStr}，${chart.birthInfo.shengXiao}）
[当前档案基础资料]
profileId: ${current.profileId}
name: ${current.name}
relation: ${current.relation || '未填写'}
birthDate: ${current.birthDate}
birthTime: ${current.birthTime}
gender: ${current.gender}（${genderStr}）
birthPlace: ${current.birthPlace || '未填写'}
[规则] 以上是当前所选档案的权威资料。不得声称缺少生日、时间或性别，也不得从聊天历史猜测或改写。
[注意] 以下命盘数据均属于"${current.name}"，除非用户明确指定其他人，所有分析都针对此人。
${sep}

[${current.name}的八字命盘]
日主: ${chart.dayMaster}（${chart.dayMasterWuXing}），身强弱: ${wx?.dayMasterStrength || '未知'}
五行分布: ${wx?.counts?.map(c => `${c.element}${c.count}(${c.status})`).join(' ') || JSON.stringify(chart.wuXingPairs)}，缺: ${wx?.missing?.join('') || '无'}，旺: ${wx?.dominant || ''}
年柱: ${pillarDetail('year')}
月柱: ${pillarDetail('month')}
日柱: ${pillarDetail('day')}
时柱: ${pillarDetail('hour')}
胎元: ${chart.taiYuan}(${chart.taiYuanNaYin})，胎息: ${chart.taiXi}(${chart.taiXiNaYin})
命宫: ${chart.mingGong}(${chart.mingGongNaYin})，身宫: ${chart.shenGong}(${chart.shenGongNaYin})
吉神: ${chart.jiShen?.join('、') || '无'}
凶煞: ${chart.xiongSha?.join('、') || '无'}`;

    if (currentDy) block += `\n当前大运: ${currentDy.gan}${currentDy.zhi}（${currentDy.startAge}-${currentDy.endAge}岁）`;
    if (chart.daYun?.length) {
      block += `\n大运排列: ${chart.daYun.map(d => `${d.gan}${d.zhi}(${d.startAge}-${d.endAge})`).join(' -> ')}`;
    }
    if (chart.dayLu) block += `\n日禄: ${chart.dayLu}`;

    try {
      const zw = getZiweiChart(current.birthDate, current.birthTime, current.gender);
      const sh = zw.siHua;
      // 紫微大限按虚岁
      const nominalAge = now.year - Number(current.birthDate.slice(0, 4)) + 1;
      const curDecadal = zw.palaces.find(p => p.decadal?.range && nominalAge >= p.decadal.range[0] && nominalAge <= p.decadal.range[1]);
      block += `\n\n[${current.name}的紫微斗数命盘]
五行局: ${zw.fiveElementsClass}，命主: ${zw.soul}，身主: ${zw.body}
四化: 禄${sh.lu.star}(${sh.lu.palace}) 权${sh.quan.star}(${sh.quan.palace}) 科${sh.ke.star}(${sh.ke.palace}) 忌${sh.ji.star}(${sh.ji.palace})`;
      if (curDecadal) block += `\n当前大限: ${curDecadal.name}（${curDecadal.decadal.heavenlyStem}${curDecadal.decadal.earthlyBranch}，虚岁${curDecadal.decadal.range[0]}-${curDecadal.decadal.range[1]}，今年虚岁${nominalAge}）`;
      for (const p of zw.palaces) {
        const majorStr = p.majorStars.filter((s: any) => s.name).map((s: any) => {
          let n = s.name;
          if (s.brightness) n += `(${s.brightness})`;
          if (s.mutagen) n += `[化${s.mutagen}]`;
          return n;
        }).join(' ') || '无主星';
        const minorStr = p.minorStars?.filter((s: any) => s.name).map((s: any) => `${s.name}${s.mutagen ? `[化${s.mutagen}]` : ''}`).join(' ') || '';
        const adjStr = p.adjectiveStars?.filter((s: any) => s.name).map((s: any) => s.name).join(' ') || '';
        let line = `${p.name}(${p.heavenlyStem}${p.earthlyBranch})${p.isBodyPalace ? ' [身宫]' : ''}: 主星[${majorStr}]`;
        if (minorStr) line += ` 辅星[${minorStr}]`;
        if (adjStr) line += ` 杂曜[${adjStr}]`;
        if (p.changsheng12) line += ` 长生12神:${p.changsheng12}`;
        if (p.decadal?.range) line += ` 大限:${p.decadal.range[0]}-${p.decadal.range[1]}`;
        block += `\n${line}`;
      }
    } catch { /* ok */ }

    try {
      const place = resolveProfilePlace(current);
      const astro = getAstroChart({
        birthDate: current.birthDate, birthTime: current.birthTime,
        timezone: current.timezone || 'Asia/Shanghai', lat: place.lat, lon: place.lon, place,
      });
      const at = (k: string) => astro.planets.find((p) => p.key === k);
      const sun = at('sun');
      const moon = at('moon');
      const asc = astro.angles.asc;
      block += `\n\n[${current.name}的西洋星盘概要]（完整星盘用 get_astro_chart 获取）
太阳${sun?.sign}（${sun?.house}宫） 月亮${moon?.sign}（${moon?.house}宫） 上升${asc.sign}，命主星${astro.chartRuler.name}${place.precision === 'province' || place.precision === 'default' ? `（出生地仅识别到${place.precision === 'default' ? '默认地点' : '省级'}，上升与宫位可能不准）` : ''}`;
    } catch { /* optional */ }

    // Saved analyses the model can read with tools
    const saved: string[] = [];
    try {
      const natal = await getNatalChart(userId, current.profileId);
      const n = Object.keys(natal.analysis?.sections || {}).length;
      saved.push(n ? `本命详解：已生成 ${n}/7 项（用 get_natal_analysis 读取）` : '本命详解：未生成');
    } catch { /* ignore */ }
    try {
      const cal = await getMonthlyCalendar(userId, current.profileId, now.year, now.month);
      saved.push(cal.days.length
        ? `${now.year}年${now.month}月运势日历：已生成 ${cal.days.length} 天（用 get_daily_fortune 读取）`
        : `${now.year}年${now.month}月运势日历：未生成`);
    } catch { /* ignore */ }
    if (saved.length) block += `\n\n[已保存的资料]\n${saved.join('\n')}`;

    const others = profiles.filter(p => p.profileId !== current.profileId);
    if (others.length) {
      block += `\n\n${sep}
[档案列表中的其他人（非当前分析对象；分析他们时调用工具须传 profileId）]
${others.map(p => `- ${p.name}｜profileId: ${p.profileId}｜${p.relation || '关系未知'}｜${p.birthDate} ${p.birthTime}｜${p.gender === 'female' ? '女' : '男'}`).join('\n')}
[提醒] 用户未明确指定时，所有分析均针对"${current.name}"。
${sep}`;
    } else {
      block += `\n${sep}`;
    }

    return {
      ctx: { block, profileName: current.name, profileId: current.profileId, current, profiles },
      profiles,
    };
  } catch {
    return { ctx: null, profiles };
  }
}

function toolContext(userId: string, profiles: Profile[], ctx: ProfileContext | null, timezone: string, now?: Date): ToolContext {
  return { userId, profiles, current: ctx?.current ?? null, timezone, now };
}

// ── Session helpers ──

function fallbackTitle(firstMessage: string): string {
  return firstMessage.slice(0, 30) + (firstMessage.length > 30 ? '...' : '');
}

function newSession(sid: string, firstMessage: string): ChatSession {
  const now = new Date().toISOString();
  return { sessionId: sid, title: fallbackTitle(firstMessage), createdAt: now, updatedAt: now, messages: [] };
}

/**
 * Recompute tool results that older versions stored only as "调用 xxx(...)" stubs,
 * so the UI and the model both see real data. Persists the repaired session.
 */
async function repairSession(userId: string, sessionPath: string, session: ChatSession): Promise<void> {
  if (!session.messages?.some(m => m.role === 'tool' && m.recomputed === undefined && /^调用 \w+/.test(m.content || ''))) return;
  try {
    const profiles = await listProfiles(userId).catch(() => [] as Profile[]);
    const current = profiles.find(p => p.profileId === session.activeProfileId) || profiles.find(p => p.isPrimary) || profiles[0] || null;
    const ctx: ToolContext = {
      userId, profiles, current, timezone: 'Asia/Shanghai',
      now: session.createdAt ? new Date(session.createdAt) : undefined,
    };
    if (await backfillToolStubs(session.messages, ctx)) {
      await writeYaml(sessionPath, session);
    }
  } catch (e) {
    console.warn('[chat] session repair failed:', e);
  }
}

async function loadOrCreateSession(userId: string, sid: string, firstMessage: string): Promise<{ session: ChatSession; path: string }> {
  const path = `${chatDir(userId)}/${sid}.yaml`;
  const existing = await readYaml<ChatSession>(path);
  if (!existing) return { session: newSession(sid, firstMessage), path };
  await repairSession(userId, path, existing);
  return { session: existing, path };
}

/**
 * When the user retries a question whose last attempt failed, remove that failed exchange
 * (user message, its tool calls and the error) so the history doesn't hold the question twice.
 */
function dropFailedRetry(session: ChatSession, message: string) {
  const msgs = session.messages || [];
  const last = msgs[msgs.length - 1];
  if (!last || last.role !== 'assistant' || !last.error || last.content) return;
  let i = msgs.length - 2;
  while (i >= 0 && msgs[i].role === 'tool') i--;
  if (i >= 0 && msgs[i].role === 'user' && msgs[i].content.trim() === message.trim()) msgs.splice(i);
}

async function generateAiTitle(userMsg: string, assistantMsg: string): Promise<string> {
  try {
    const result = await subagentCall(
      '根据以下用户问题和AI回复，生成一个简短的对话标题（8字以内，不要标点符号，不要引号）。只输出标题文字，不要任何额外内容。',
      `用户: ${userMsg.slice(0, 200)}\nAI: ${assistantMsg.slice(0, 200)}`,
      { maxTokens: 32 },
    );
    const title = result.content.trim().replace(/[""''「」]/g, '').slice(0, 20);
    return title || fallbackTitle(userMsg);
  } catch {
    return fallbackTitle(userMsg);
  }
}

interface PreparedTurn {
  sid: string;
  session: ChatSession;
  sessionPath: string;
  profileCtx: ProfileContext | null;
  profiles: Profile[];
  timezone: string;
  thinkingEnabled: boolean;
  /** Message as stored in the session (without context notes). */
  userMsg: ChatMessage;
  llmMessages: ChatMessage[];
}

/** Shared setup for a chat turn: session, system prompt, history with tool notes. */
async function prepareTurn(userId: string, body: ChatStartRequest & { context?: string }, withTools: boolean): Promise<PreparedTurn> {
  const sid = body.sessionId ? requireSessionId(body.sessionId) : `session-${Date.now()}`;
  const { session, path: sessionPath } = await loadOrCreateSession(userId, sid, body.message);
  dropFailedRetry(session, body.message);
  const timezone = safeTimezone(body.timezone);

  const memory = await loadMemory(userId);
  const memoryStr = formatMemoryForPrompt(memory, sid);
  const settings = await getSettings();
  const thinkingEnabled = body.enableThinking ?? settings.llm.enableThinking;

  let sysContent = SYSTEM_PROMPT;
  const clientNow = body.clientTime ? new Date(body.clientTime) : new Date();
  const now = Number.isNaN(clientNow.getTime()) ? new Date() : clientNow;
  const timeStr = now.toLocaleString('zh-CN', { timeZone: timezone, year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', hour: '2-digit', minute: '2-digit' });
  sysContent += `\n\n[当前时间] ${timeStr}（${timezone}）`;
  if (memoryStr) sysContent += memoryStr;
  if (body.context) sysContent += `\n\n命盘上下文:\n${body.context}`;
  if (withTools) sysContent += TOOL_GUIDE;
  else sysContent += '\n\n（本次为纯对话模式，无法调用计算工具；请基于下方命盘数据与对话中的[系统附注]作答，需要精确流年/流日等数据时可建议用户开启「工具」模式。）';

  if (thinkingEnabled) {
    const level = settings.llm.thinkingLevel || 'medium';
    const levelText = { low: '简要核对关键事实', medium: '分步骤分析并交叉核对', high: '进行深入、多路径推演并严格复核' }[level];
    sysContent += `\n\n已开启思考，等级：${level}。请${levelText}后再回答。`;
  }

  const { ctx: profileCtx, profiles } = await buildProfileContext(userId, body.profileId || session.activeProfileId, timezone);
  if (profileCtx) {
    session.activeProfileId = profileCtx.profileId;
    sysContent += profileCtx.block;
  }

  const { history, pendingNote } = buildLlmHistory(session.messages || []);
  const compressed = await compressHistory(history, 6, profileCtx?.profileName);
  const images = body.imagesBase64?.length
    ? await imagesToDataUris(await persistImages(userId, body.imagesBase64.slice(0, 4)))
    : undefined;
  const userMsg: ChatMessage = { role: 'user', content: body.message, images };
  const llmUserMsg: ChatMessage = { ...userMsg, content: pendingNote + body.message };

  return {
    sid, session, sessionPath, profileCtx, profiles, timezone, thinkingEnabled, userMsg,
    llmMessages: [{ role: 'system', content: sysContent }, ...compressed, llmUserMsg],
  };
}

const FC_TOOL_NAMES = new Set(FC_TOOLS.map((t) => t.function.name));

/** Validate quick-tool presets from the client: known tools only, plain-object args, at most 4. */
function parsePresetTools(raw: unknown): { name: string; args: Record<string, unknown> }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is { name: string; args?: unknown } => !!t && typeof t === 'object' && typeof (t as any).name === 'string')
    .filter((t) => FC_TOOL_NAMES.has(t.name))
    .slice(0, 4)
    .map((t) => ({
      name: t.name,
      args: t.args && typeof t.args === 'object' && !Array.isArray(t.args) && JSON.stringify(t.args).length < 4000
        ? { ...(t.args as Record<string, unknown>) }
        : {},
    }));
}

export class ChatTurnError extends Error {
  constructor(public status: number, message: string, public runId?: string) {
    super(message);
  }
}

interface TurnResult {
  tools: { name: string; args: Record<string, unknown>; result: string; display?: unknown }[];
  content: string;
  thinking: string;
  error: ChatErrorInfo | null;
}

/**
 * Append the finished turn to the session. Re-reads the file so a rename during generation is
 * kept, and does nothing if the session was deleted meanwhile (the user message was already
 * saved when the turn started).
 */
async function finishTurn(userId: string, sessionPath: string, sid: string, userMsg: ChatMessage, r: TurnResult, profileId?: string) {
  const session = await readYaml<ChatSession>(sessionPath);
  if (!session) return;
  for (const tc of r.tools) {
    session.messages.push({ role: 'tool', content: tc.result, toolName: tc.name, toolArgs: tc.args, toolDisplay: tc.display });
  }
  if (r.content || r.error) {
    // A failure is stored as structured error, never as the assistant's text
    const assistantMsg: ChatMessage = { role: 'assistant', content: r.content };
    if (r.error) assistantMsg.error = r.error;
    if (r.thinking) assistantMsg.thinking = r.thinking;
    session.messages.push(assistantMsg);
  }
  session.updatedAt = new Date().toISOString();
  session.tokenEstimate = estimateMessagesTokens(session.messages);
  const firstExchange = session.messages.filter((m) => m.role === 'user').length === 1;
  if (firstExchange && r.content && session.title === fallbackTitle(userMsg.content)) {
    session.title = await generateAiTitle(userMsg.content, r.content);
  }
  await writeYaml(sessionPath, session).catch(() => {});
  if (r.content) extractMemories(userId, session.messages.slice(-4), profileId, sid).catch(() => {});
}

const MAX_MESSAGE_CHARS = 20_000;
const MAX_IMAGES = 4;
const MAX_RUNNING_PER_USER = 3;
const MAX_STARTS_PER_MIN = 12;
/** userId → timestamps of recent starts */
const userStarts = new Map<string, number[]>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of userStarts) if (!v.some((t) => now - t < 60_000)) userStarts.delete(k);
}, 5 * 60_000).unref();

/**
 * Start a chat turn as a background run. The user message is saved immediately; generation
 * continues on the server regardless of the client connection, and every event is buffered
 * for (re)subscribers — see chat-runs.service.ts.
 */
export async function startChatTurn(userId: string, body: ChatStartRequest): Promise<ChatRunInfo> {
  if (typeof body?.message !== 'string' || !body.message.trim()) throw new ChatTurnError(400, '消息不能为空');
  if (body.message.length > MAX_MESSAGE_CHARS) throw new ChatTurnError(400, `消息太长了（最多 ${MAX_MESSAGE_CHARS} 字）`);
  if (body.imagesBase64 !== undefined && body.imagesBase64 !== null
    && (!Array.isArray(body.imagesBase64) || body.imagesBase64.length > MAX_IMAGES || body.imagesBase64.some((i) => typeof i !== 'string'))) {
    throw new ChatTurnError(400, `图片格式不正确（最多 ${MAX_IMAGES} 张）`);
  }
  if (body.sessionId !== undefined && body.sessionId !== null && body.sessionId !== '') {
    let sid: string;
    try { sid = requireSessionId(body.sessionId); } catch { throw new ChatTurnError(400, '会话编号无效'); }
    const active = activeRunFor(userId, sid);
    if (active?.status === 'running') throw new ChatTurnError(409, '这个对话正在生成回复，请等它完成或先停止', active.runId);
  }
  // Per-account limits (shared by WebSocket and SSE, however many connections are open):
  // they bound model spend and server load from one account
  if (listRuns(userId).filter((r) => r.status === 'running').length >= MAX_RUNNING_PER_USER) {
    throw new ChatTurnError(429, `同时进行的回复最多 ${MAX_RUNNING_PER_USER} 个，请等其中一个完成`);
  }
  const now = Date.now();
  const recent = (userStarts.get(userId) || []).filter((t) => now - t < 60_000);
  if (recent.length >= MAX_STARTS_PER_MIN) throw new ChatTurnError(429, '发送太频繁了，请稍后再试');
  recent.push(now);
  userStarts.set(userId, recent);
  const withTools = body.mode !== 'plain';
  if (body.imagesBase64?.length) {
    console.log(`[chat] received ${body.imagesBase64.length} image(s), sizes: ${body.imagesBase64.map((i) => Math.round(i.length / 1024) + 'KB').join(', ')}`);
  }
  const turn = await prepareTurn(userId, body, withTools);
  const { sid, session, sessionPath, profileCtx, profiles, timezone, thinkingEnabled, userMsg, llmMessages } = turn;

  // Persist the question right away so it survives reloads and shows up in the session list
  session.messages.push(userMsg);
  session.updatedAt = new Date().toISOString();
  await writeYaml(sessionPath, session);

  try {
    return startRun(userId, sid, { content: userMsg.content, images: userMsg.images }, async ({ signal, emit }) => {
      emit({ sessionId: sid });
      const r: TurnResult = { tools: [], content: '', thinking: '', error: null };
      try {
        if (withTools) {
          const tctx = toolContext(userId, profiles, profileCtx, timezone);
          // Quick tools: run the chosen tools deterministically first so their cards appear at once,
          // then hand the results to the model as a note on this turn's user message.
          const presets = parsePresetTools(body.presetTools);
          if (presets.length) {
            const notes: string[] = [];
            for (const p of presets) {
              signal.throwIfAborted();
              const args = { ...p.args };
              let text: string;
              let display: unknown;
              try {
                const out = await executeFcToolRich(p.name, args, tctx);
                text = typeof out === 'string' ? out : out.text;
                display = typeof out === 'string' ? undefined : out.display;
              } catch (err: any) {
                text = `工具执行失败: ${err?.message || err}`;
              }
              r.tools.push({ name: p.name, args, result: text, display });
              emit({ toolCall: { name: p.name, args, result: text, display } });
              notes.push(`【${TOOL_TITLES[p.name] || p.name}（${p.name}）】参数: ${JSON.stringify(args)}\n${text.length > 12000 ? `${text.slice(0, 12000)}\n…（已截断）` : text}`);
            }
            const last = llmMessages[llmMessages.length - 1];
            last.content += `\n\n[系统附注：用户通过快捷工具运行了以下工具，结果如下。请直接基于这些结果作答，必要时可再调用其他工具补充]\n${notes.join('\n\n')}`;
          }
          const stream = chatCompletionWithToolsStream(
            llmMessages,
            FC_TOOLS,
            (name, args) => executeFcToolRich(name, args, tctx),
            { enableThinking: thinkingEnabled, signal },
          );
          for await (const chunk of stream) {
            if (chunk.type === 'tool_call') {
              r.tools.push({ name: chunk.name, args: chunk.args, result: chunk.result, display: chunk.display });
              emit({ toolCall: { name: chunk.name, args: chunk.args, result: chunk.result, display: chunk.display } });
            } else if (chunk.type === 'content') {
              r.content += chunk.text;
              emit({ content: chunk.text });
            } else if (chunk.type === 'thinking') {
              r.thinking += chunk.text;
              emit({ thinking: chunk.text });
            }
          }
        } else {
          for await (const chunk of chatCompletionStream(llmMessages, { enableThinking: thinkingEnabled, signal })) {
            const sc = chunk as StreamChunk;
            if (sc.type === 'thinking') {
              r.thinking += sc.text;
              emit({ thinking: sc.text });
            } else {
              r.content += sc.text;
              emit({ content: sc.text });
            }
          }
        }
      } catch (err: any) {
        if (!signal.aborted) {
          r.error = describeLlmError(err);
          console.warn('[chat] generation failed:', err?.message || err);
          emit({ error: r.error.message, errorInfo: r.error });
        }
      }
      // Stopped by the user: keep whatever was generated, without an error
      await finishTurn(userId, sessionPath, sid, userMsg, r, profileCtx?.profileId);
    });
  } catch (err) {
    if (err instanceof RunConflictError) throw new ChatTurnError(409, err.message, err.runId);
    throw err;
  }
}

/**
 * SSE transport for a run (kept for HTTP clients): start it, stream its events, end with [DONE].
 * If the client disconnects the run keeps going and still saves its result.
 */
async function streamTurnOverSse(req: Request, res: Response, mode: 'fc' | 'plain') {
  const userId = req.user!.userId;
  let run: ChatRunInfo;
  try {
    run = await startChatTurn(userId, { ...(req.body || {}), mode });
  } catch (err: any) {
    const status = err instanceof ChatTurnError ? err.status : 400;
    res.status(status).json({ success: false, error: err.message || '请求无效', runId: err?.runId });
    return;
  }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Session-Id', run.sessionId);
  res.setHeader('X-Run-Id', run.runId);
  res.flushHeaders();

  let closed = false;
  const write = (ev: ChatRunEvent) => {
    if (closed) return;
    if (ev.data.runEnd) {
      res.write('data: [DONE]\n\n');
      closed = true;
      res.end();
      sub?.unsubscribe();
      return;
    }
    res.write(`data: ${JSON.stringify(ev.data)}\n\n`);
  };
  const sub = subscribeRun(userId, run.runId, 0, write);
  req.on('close', () => { closed = true; sub?.unsubscribe(); });
  for (const ev of sub?.replay || []) write(ev);
}

chatRouter.post('/', (req: Request, res: Response) => { void streamTurnOverSse(req, res, 'plain'); });
chatRouter.post('/fc', (req: Request, res: Response) => { void streamTurnOverSse(req, res, 'fc'); });

/** Runs of the current user (active + recently finished). */
chatRouter.get('/runs', (req: Request, res: Response) => {
  res.json({ success: true, data: listRuns(req.user!.userId) });
});

/** Stop a run (HTTP alternative to the WebSocket `stop` message). */
chatRouter.post('/runs/:runId/stop', (req: Request, res: Response) => {
  res.json({ success: true, data: { stopped: stopRun(req.user!.userId, String(req.params.runId)) } });
});

// ── Data source resolution for AI context ──

async function resolveDataSource(
  userId: string,
  sourceId: string,
  params: Record<string, string>,
): Promise<{ name: string; data: unknown } | null> {
  try {
    switch (sourceId) {
      case 'profiles': {
        const profiles = await listProfiles(userId);
        return {
          name: '命盘档案列表',
          data: profiles.map(p => ({
            profileId: p.profileId,
            name: p.name,
            relation: p.relation,
            isPrimary: p.isPrimary,
            birthDate: p.birthDate,
            birthTime: p.birthTime,
            gender: p.gender,
          })),
        };
      }
      case 'bazi': {
        const pid = params.profileId;
        if (!pid) return null;
        const profile = await getProfile(userId, pid);
        if (!profile) return null;
        const chart = getBaziChart(profile.birthDate, profile.birthTime, profile.gender);
        return { name: `${profile.name}的八字命盘`, data: chart };
      }
      case 'ziwei': {
        const pid = params.profileId;
        if (!pid) return null;
        const profile = await getProfile(userId, pid);
        if (!profile) return null;
        const chart = getZiweiChart(profile.birthDate, profile.birthTime, profile.gender);
        return { name: `${profile.name}的紫微命盘`, data: chart };
      }
      case 'todayFortune': {
        const pid = params.profileId;
        if (!pid) return null;
        const profile = await getProfile(userId, pid);
        if (!profile) return null;
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth() + 1;
        const dd = `${y}-${String(m).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const cal = await getMonthlyCalendar(userId, pid, y, m);
        const today = cal?.days?.find(d => d.date === dd) || null;
        return { name: `${profile.name}的今日运势`, data: today };
      }
      case 'natalAnalysis': {
        const pid = params.profileId;
        if (!pid) return null;
        const profile = await getProfile(userId, pid);
        if (!profile) return null;
        const result = await getNatalChart(userId, pid);
        return { name: `${profile.name}的命理分析`, data: result?.analysis || null };
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

chatRouter.get(
  '/data-sources/:sourceId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const sourceId = req.params.sourceId as string;
      const params = req.query as Record<string, string>;
      const result = await resolveDataSource(userId, sourceId, params);
      if (!result) {
        res.status(404).json({ success: false, error: '数据源不存在或参数缺失' });
        return;
      }
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ── List chat sessions (with metadata) ──

chatRouter.get(
  '/sessions',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const files = await listDir(`${chatDir(userId)}`);
      const yamlFiles = files.filter((f) => f.endsWith('.yaml')).sort().reverse();

      const metas: SessionMeta[] = [];
      for (const f of yamlFiles) {
        const sid = f.replace('.yaml', '');
        const session = await readYaml<ChatSession>(`${chatDir(userId)}/${f}`);
        if (session) {
          metas.push({
            sessionId: sid,
            title: session.title || fallbackTitle(session.messages[0]?.content || sid),
            updatedAt: session.updatedAt || session.createdAt || '',
            messageCount: session.messages?.length || 0,
          });
        }
      }
      res.json({ success: true, data: metas });
    } catch (err) {
      next(err);
    }
  },
);

// ── Load a specific session ──

chatRouter.get(
  '/sessions/:sessionId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const sessionId = requireSessionId(req.params.sessionId);
      const sessionPath = `${chatDir(userId)}/${sessionId}.yaml`;
      const session = await readYaml<ChatSession>(sessionPath);
      if (!session) {
        res.status(404).json({ success: false, error: '会话不存在' });
        return;
      }
      await repairSession(userId, sessionPath, session);
      // Older versions saved failures as reply text; present them as structured errors instead
      for (const m of session.messages || []) {
        const legacy = m.role === 'assistant' && !m.error ? /^\[(?:生成失败|错误)\]\s*([\s\S]*)$/.exec((m.content || '').trim()) : null;
        if (legacy) {
          m.error = describeLlmError(new Error(legacy[1]));
          m.content = '';
        }
      }
      res.json({ success: true, data: session });
    } catch (err) {
      next(err);
    }
  },
);

// ── Delete a session ──

chatRouter.delete(
  '/sessions/:sessionId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const sessionId = requireSessionId(req.params.sessionId);
      const sessionPath = `${chatDir(userId)}/${sessionId}.yaml`;
      // A reply still generating for this session would otherwise be wasted work
      const active = activeRunFor(userId, sessionId);
      if (active) stopRun(userId, active.runId);
      await deleteYaml(sessionPath);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

// ── Append messages to a session (for tool results) ──

chatRouter.post(
  '/sessions/:sessionId/messages',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const sid = requireSessionId(req.params.sessionId);
      const { messages } = req.body as { messages: ChatMessage[] };
      if (!messages?.length) {
        res.status(400).json({ success: false, error: '消息不能为空' });
        return;
      }
      if (messages.length > 20 || messages.some(m => !['user', 'assistant', 'tool'].includes(m.role) || typeof m.content !== 'string' || m.content.length > 200_000)) {
        res.status(400).json({ success: false, error: '消息格式或长度不合法' });
        return;
      }
      const sessionPath = `${chatDir(userId)}/${sid}.yaml`;
      let session = await readYaml<ChatSession>(sessionPath);
      if (!session) {
        session = {
          sessionId: sid,
          title: fallbackTitle(messages[0]?.content || sid),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [],
        };
      }
      // Whitelist fields — the client supplies these, don't persist arbitrary keys
      const clean = messages.map((m): ChatMessage => {
        const out: ChatMessage = { role: m.role, content: m.content };
        if (typeof m.toolName === 'string') out.toolName = m.toolName.slice(0, 64);
        if (m.toolArgs && typeof m.toolArgs === 'object' && JSON.stringify(m.toolArgs).length < 20_000) out.toolArgs = m.toolArgs;
        if (typeof m.toolRaw === 'string') out.toolRaw = m.toolRaw.slice(0, 200_000);
        if (m.userTriggered === true) out.userTriggered = true;
        return out;
      });
      session!.messages.push(...clean);
      session!.updatedAt = new Date().toISOString();
      session!.tokenEstimate = estimateMessagesTokens(session!.messages);
      await writeYaml(sessionPath, session!);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

// ── Rename a session ──

chatRouter.patch(
  '/sessions/:sessionId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const sessionId = requireSessionId(req.params.sessionId);
      const { title } = req.body as { title: string };
      if (typeof title !== 'string' || !title.trim() || title.length > 100) {
        res.status(400).json({ success: false, error: '标题长度需为1-100字符' });
        return;
      }
      const sessionPath = `${chatDir(userId)}/${sessionId}.yaml`;
      const session = await readYaml<ChatSession>(sessionPath);
      if (!session) {
        res.status(404).json({ success: false, error: '会话不存在' });
        return;
      }
      session.title = title.trim();
      await writeYaml(sessionPath, session);
      res.json({ success: true, data: { title } });
    } catch (err) {
      next(err);
    }
  },
);
