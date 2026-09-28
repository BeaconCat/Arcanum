/**
 * Function-calling tools exposed to the chat LLM: definitions, subject (命主) resolution,
 * execution, and helpers for replaying / backfilling tool results in session history.
 */
import * as yaml from 'js-yaml';
import { Solar } from 'lunar-javascript';
import { getBaziChart, getTenGodForStem } from '../engines/bazi.engine';
import { getZiweiChart, getFlowDayContext, getFlowYearContext, getFlowMonthContext } from '../engines/ziwei.engine';
import { liuYaoByTime, meiHuaByTime, meiHuaByNumber, qiMenByTime } from '../engines/divination.engine';
import { createHash } from 'node:crypto';
import { analyzeWuGe } from '../engines/nameology.engine';
import { analyzeFengshui } from '../engines/fengshui.engine';
import { analyzeFlyingStars } from '../engines/ziwei-feixing.engine';
import { analyzeXuanKong } from '../engines/xuankong.engine';
import { tiebanCalculate } from '../engines/tieban.engine';
import { getAstroChart, formatAstroForLlm, type AstroInput } from '../engines/astro.engine';
import {
  getTransitWheel, getProgressedWheel, getSolarReturnWheel, getSynastryWheel, getCompositeChart,
  formatBiWheelForLlm, formatCompositeForLlm,
} from '../engines/astro-overlay.engine';
import { resolveBirthPlace, resolveProfilePlace } from './geo.service';
import { getAcgLines, nearestAcgLines, rankPlacesForTheme, formatAcgForLlm, ACG_THEMES } from '../engines/acg.engine';
import { rankCandidates, searchPlaces } from './acg-places.service';
import { drawTarotReading, formatTarotForLlm } from './tarot.service';
import { interpretNatal, interpretBiWheel, interpretComposite, formatInterpretationForLlm } from './astro-interpret.service';
import { getMonthlyCalendar, getDailyDetail } from './fortune.service';
import { getNatalChart } from './natal.service';
import type { FnToolDef, ChatMessage, ToolExecOutput } from './llm.service';
import type { ToolDisplay } from '../../shared/types/tool-display.types';
import type { AcgResult } from '../../shared/types/acg.types';
import type { Profile } from '../../shared/types/profile.types';

// ── Context ──

export interface ToolContext {
  userId: string;
  profiles: Profile[];
  /** The profile currently selected in the UI (默认分析对象). */
  current: Profile | null;
  /** IANA timezone of the user, used for "today" defaults. */
  timezone: string;
  /** Reference "now" for defaults; backfill uses the session's creation time. */
  now?: Date;
}

/** Local date/time parts in a timezone (toISOString() is UTC and shifts the day before 08:00 in China). */
export function localParts(tz: string, at: Date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(at).map((x) => [x.type, x.value]));
  const hour = p.hour === '24' ? '00' : p.hour;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${hour}:${p.minute}`,
    year: Number(p.year),
    month: Number(p.month),
  };
}

export const TOOL_TITLES: Record<string, string> = {
  get_bazi_chart: '八字命盘', get_ziwei_chart: '紫微命盘', get_today_huangli: '黄历',
  get_bazi_flow_year: '八字流年', get_bazi_flow_month: '八字流月', get_bazi_flow_day: '八字流日',
  get_ziwei_flow_year: '紫微流年', get_ziwei_flow_month: '紫微流月', get_flow_day_context: '紫微流日',
  get_dayun_analysis: '大运分析', get_wuxing_analysis: '五行分析', compare_bazi: '八字合盘',
  get_yearly_calendar: '全年运势日历', get_shichen_detail: '十二时辰吉凶', analyze_name: '姓名分析',
  get_flying_stars: '紫微飞星', analyze_fengshui: '八宅风水', analyze_xuankong: '玄空飞星',
  tieban_shenshu: '铁板神数', liu_yao: '六爻起卦', mei_hua: '梅花易数', qi_men: '奇门遁甲',
  get_natal_analysis: '本命详解', get_daily_fortune: '运势日历', get_astro_chart: '西洋星盘',
  get_astro_transit: '星盘行运', get_astro_progressed: '次限推运', get_astro_solar_return: '太阳返照',
  get_astro_synastry: '星盘比较盘', get_astro_composite: '组合中点盘', get_astrocartography: '地理占星',
  draw_tarot: '塔罗抽牌', get_astro_interpretation: '星盘解读',
  ze_ri: '择日分析', xun_wu: '寻物断卦', daily_sign: '每日一签', ze_ming: '择名参考',
};

/** Tools whose result depends on the moment they were run — cannot be recomputed later. */
const TIME_DEPENDENT_TOOLS = new Set(['liu_yao', 'mei_hua', 'qi_men', 'draw_tarot', 'xun_wu']);

// ── Definitions ──

const PROFILE_ID = {
  type: 'string',
  description: '档案ID（见系统提示中的档案列表）。分析档案里的人时填写；不填则默认当前命主。',
};
const BIRTH_FIELDS = {
  birthDate: { type: 'string', description: '阳历出生日期 YYYY-MM-DD。仅在分析档案之外的人时填写' },
  birthTime: { type: 'string', description: '出生时间 HH:mm（24小时制）。仅档案外的人需要' },
  gender: { type: 'string', enum: ['male', 'female'], description: '性别。仅档案外的人需要' },
};

function fn(name: string, description: string, properties: Record<string, unknown>, required: string[] = []): FnToolDef {
  return { type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } };
}

/** Tools bound to one person: accept profileId (preferred) or explicit birth data. */
function personTool(name: string, description: string, extra: Record<string, unknown> = {}, required: string[] = []): FnToolDef {
  return fn(name, `${description}（分析对象默认当前命主，可用 profileId 指定其他档案）`, { profileId: PROFILE_ID, ...BIRTH_FIELDS, ...extra }, required);
}

export const FC_TOOLS: FnToolDef[] = [
  personTool('get_bazi_chart', '排八字命盘：完整四柱、十神、藏干、神煞、五行分析、大运等'),
  personTool('get_ziwei_chart', '排紫微斗数命盘：十二宫主星、辅星、杂曜、四化、长生12神、大限'),
  fn('get_today_huangli', '指定日期的黄历：日干支、纳音、值星、天神、二十八宿、宜忌、彭祖百忌、冲煞、九星等', {
    date: { type: 'string', description: '查询日期 YYYY-MM-DD，默认今天' },
  }),
  personTool('get_flow_day_context', '紫微斗数流日宫位：各宫本命星曜、流运星曜、四化、长生12神', {
    targetDate: { type: 'string', description: '目标日期 YYYY-MM-DD' },
  }, ['targetDate']),
  fn('liu_yao', '六爻起卦（三枚铜钱法，依当下时刻起卦）：本卦、变卦、动爻、纳甲六亲六神、世应与八宫', {
    question: { type: 'string', description: '所问之事' },
  }, ['question']),
  fn('mei_hua', '梅花易数起卦：默认按当下时间起卦；用户报了两个数字时用数字起卦。返回本卦、变卦、体卦、用卦、体用关系', {
    question: { type: 'string', description: '所问之事' },
    num1: { type: 'number', description: '上卦数（可选，用户报数时）' },
    num2: { type: 'number', description: '下卦数（可选，用户报数时）' },
  }, ['question']),
  fn('qi_men', '奇门遁甲起局（当下时刻）：年/月/日/时四层九星、八门、方位、吉凶', {
    question: { type: 'string', description: '所问之事（可选）' },
  }),
  personTool('get_dayun_analysis', '大运详情：当前大运与完整大运排列'),
  personTool('get_bazi_flow_year', '八字流年：流年干支、十神、纳音、神煞，并附本命四柱与当前大运', {
    targetYear: { type: 'number', description: '流年年份，如 2026' },
  }, ['targetYear']),
  personTool('get_bazi_flow_month', '八字流月：流月干支、十神、纳音、神煞', {
    targetYear: { type: 'number', description: '年份' },
    targetMonth: { type: 'number', description: '月份 1-12' },
  }, ['targetYear', 'targetMonth']),
  personTool('get_ziwei_flow_year', '紫微流年盘：12宫本命星曜 + 大限/流年流运星曜 + 四化', {
    targetYear: { type: 'number', description: '年份' },
  }, ['targetYear']),
  personTool('get_ziwei_flow_month', '紫微流月盘：关键宫位本命星曜 + 大限/流年/流月流运星曜 + 四化', {
    targetYear: { type: 'number', description: '年份' },
    targetMonth: { type: 'number', description: '月份 1-12' },
  }, ['targetYear', 'targetMonth']),
  personTool('get_bazi_flow_day', '八字流日：流日干支与日主十神关系、纳音、神煞、宜忌、冲煞', {
    targetDate: { type: 'string', description: '日期 YYYY-MM-DD' },
  }, ['targetDate']),
  personTool('get_wuxing_analysis', '五行强弱与喜忌：五行分布计数、日主旺衰、缺失五行'),
  fn('compare_bazi', '双方八字合盘：日主关系、纳音、属相合冲、五行互补。双方优先用 profileId1/profileId2 指定档案；档案外的人再填出生信息。甲方默认当前命主。', {
    profileId1: { ...PROFILE_ID, description: '甲方档案ID（不填默认当前命主）' },
    birthDate1: { type: 'string' }, birthTime1: { type: 'string' }, gender1: { type: 'string', enum: ['male', 'female'] },
    profileId2: { ...PROFILE_ID, description: '乙方档案ID' },
    birthDate2: { type: 'string' }, birthTime2: { type: 'string' }, gender2: { type: 'string', enum: ['male', 'female'] },
  }),
  fn('get_yearly_calendar', '某年12个月的干支、九星、奇门概要，用于全年规划', {
    year: { type: 'number', description: '年份，默认今年' },
  }),
  fn('get_shichen_detail', '某日十二时辰详细吉凶：干支、天神、吉凶、冲煞、宜忌', {
    date: { type: 'string', description: '日期 YYYY-MM-DD，默认今天' },
  }),
  fn('analyze_name', '姓名学五格剖象：天格/人格/地格/总格/外格数理、五行、三才吉凶', {
    surname: { type: 'string', description: '姓氏' },
    givenName: { type: 'string', description: '名字' },
  }, ['surname', 'givenName']),
  personTool('get_flying_stars', '紫微飞星：宫干飞化、自化、双忌、禄忌交驰'),
  fn('analyze_fengshui', '八宅风水：朝向→坐山、东/西四宅、八方吉凶；会自动结合命主命卦', {
    facingDegree: { type: 'number', description: '朝向度数 0-360（0=北，90=东，180=南，270=西）' },
    profileId: PROFILE_ID,
  }, ['facingDegree']),
  fn('analyze_xuankong', '玄空飞星：运盘/山盘/向盘九宫飞星、旺衰、特殊格局', {
    facingDegree: { type: 'number', description: '朝向度数 0-360' },
    year: { type: 'number', description: '建造或入住年份' },
  }, ['facingDegree', 'year']),
  personTool('tieban_shenshu', '铁板神数：先天命数、五音、考刻、本命数、十二辟卦、本命条文及流年断语', {
    queryDate: { type: 'string', description: '求测日期 YYYY-MM-DD（默认今天）' },
    queryTime: { type: 'string', description: '求测时间 HH:mm（默认现在）' },
  }),
  personTool('get_astro_chart', '西洋占星本命星盘：十大行星与南北交的星座、度数、宫位、逆行，上升/天顶四轴，宫头，主要相位，元素与模式分布，命主星', {
    birthPlace: { type: 'string', description: '出生地（中文，如"浙江杭州"）。仅档案外的人需要；档案里的人自动使用档案出生地/经纬度' },
    houseSystem: { type: 'string', enum: ['placidus', 'whole-sign', 'equal', 'porphyry'], description: '宫制，默认 placidus' },
  }),
  personTool('get_astro_transit', '星盘行运：某时刻天象与本命盘的交互相位、行运行星落入本命宫位（看近期/某天的星象影响）', {
    date: { type: 'string', description: '日期 YYYY-MM-DD，默认今天' },
    time: { type: 'string', description: '时间 HH:mm，默认 12:00' },
    birthPlace: { type: 'string', description: '出生地，仅档案外的人需要' },
  }),
  personTool('get_astro_progressed', '次限推运（一日一年）：推运盘行星与本命盘的交互，看人生阶段性主题', {
    date: { type: 'string', description: '推运到的日期 YYYY-MM-DD，默认今天' },
    birthPlace: { type: 'string', description: '出生地，仅档案外的人需要' },
  }),
  personTool('get_astro_solar_return', '太阳返照：太阳回到本命位置的精确时刻所起的盘，看该生日年度的运势主题', {
    year: { type: 'number', description: '返照年份，默认今年' },
    birthPlace: { type: 'string', description: '出生地，仅档案外的人需要' },
  }),
  fn('get_astro_synastry', '星盘比较盘（合盘）：双方行星交互相位、互落宫位与匹配度评分（吸引力/情感/沟通/稳定/成长）。双方优先用 profileId1 / profileId2；甲方默认当前命主。', {
    profileId1: { ...PROFILE_ID, description: '甲方档案ID（不填默认当前命主）' },
    profileId2: { ...PROFILE_ID, description: '乙方档案ID' },
    birthDate2: { type: 'string' }, birthTime2: { type: 'string' }, gender2: { type: 'string', enum: ['male', 'female'] },
    birthPlace2: { type: 'string', description: '乙方出生地（档案外的人）' },
  }),
  fn('get_astro_composite', '组合中点盘：把两人关系本身当作一张盘来看（关系的性质与课题）。参数同 get_astro_synastry。', {
    profileId1: { ...PROFILE_ID, description: '甲方档案ID（不填默认当前命主）' },
    profileId2: { ...PROFILE_ID, description: '乙方档案ID' },
    birthDate2: { type: 'string' }, birthTime2: { type: 'string' }, gender2: { type: 'string', enum: ['male', 'female'] },
    birthPlace2: { type: 'string', description: '乙方出生地（档案外的人）' },
  }),
  personTool('get_astrocartography', '地理占星（ACG）：出生时各行星落在地球四轴的经纬线。可查询某地附近有哪些行星线及其影响，或按主题（事业/感情/财富/疗愈/创意/冒险/学业/安家）推荐适合的城市', {
    place: { type: 'string', description: '要查询的地点（城市名，如"上海"、"东京"、"伦敦"）' },
    theme: { type: 'string', enum: ['career', 'love', 'wealth', 'healing', 'creativity', 'adventure', 'study', 'home'], description: '按主题推荐城市' },
    birthPlace: { type: 'string', description: '出生地，仅档案外的人需要' },
  }),
  fn('get_astro_interpretation', '读取天枢星盘解读文案库中与该盘匹配的条目（行星落座/落宫、相位、格局、比较盘接触、行运等的原创释义），用于给出更具体、前后一致的星盘解读。先用星盘工具看数据，再用它取对应释义。', {
    kind: { type: 'string', enum: ['natal', 'transit', 'progressed', 'solar-return', 'synastry', 'composite'], description: '盘型，默认 natal' },
    profileId: PROFILE_ID,
    profileId2: { ...PROFILE_ID, description: '比较盘/组合盘的乙方档案ID' },
    date: { type: 'string', description: '行运/推运日期 YYYY-MM-DD，默认今天' },
    year: { type: 'number', description: '太阳返照年份，默认今年' },
    maxItems: { type: 'number', description: '最多返回多少条，默认 30' },
  }),
  fn('draw_tarot', '塔罗抽牌：按牌阵随机抽牌（安全随机数洗牌），返回每个位置的牌、正逆位与关键词；抽牌记录会保存到用户的塔罗历史。用户想用塔罗问事时调用，不要自己编造抽到的牌。', {
    question: { type: 'string', description: '所问之事' },
    spreadId: {
      type: 'string',
      enum: ['single', 'three-time', 'three-advice', 'two-choices', 'lovers', 'celtic-cross', 'horseshoe', 'mind-body-spirit', 'four-elements', 'year-ahead'],
      description: '牌阵：single 单张指引 / three-time 过去现在未来 / three-advice 现状阻碍建议 / two-choices 二选一 / lovers 恋人牌阵 / celtic-cross 凯尔特十字 / horseshoe 马蹄 / mind-body-spirit 身心灵 / four-elements 四元素 / year-ahead 年度十二宫。默认 three-time',
    },
    allowReversed: { type: 'boolean', description: '是否启用逆位，默认 true' },
    majorOnly: { type: 'boolean', description: '只用大阿卡纳，默认 false' },
  }, ['question']),
  personTool('ze_ri', '择日：某天的黄历宜忌、值星、天神、冲煞，与用途是否相合，并结合命主判断当天与本命的冲合关系与流日十神', {
    date: { type: 'string', description: '候选日期 YYYY-MM-DD' },
    purpose: { type: 'string', description: '用途，如 搬家、开业、结婚、签约、出行' },
  }, ['date']),
  fn('xun_wu', '寻物断卦：以当下时刻同时起奇门局与六爻卦，给出方位、八门、用神相关数据，用于判断失物方位与能否找回', {
    item: { type: 'string', description: '丢失的物品' },
  }, ['item']),
  fn('daily_sign', '每日一签：为用户抽取今日灵签（同一用户同一天签号固定），返回签号、签等与当日历法，签诗由你据此原创', {}),
  personTool('ze_ming', '择名参考：命主八字的五行分布、日主强弱、按扶抑法的简化喜用五行与宜用字的五行方向，用于取名或改名建议（候选名字可再用 analyze_name 检验）', {
    surname: { type: 'string', description: '姓氏' },
    babyGender: { type: 'string', enum: ['male', 'female'], description: '取名对象性别（默认与命主相同）' },
  }, ['surname']),
  fn('get_natal_analysis', '读取已为档案生成的「本命详解」报告（总览/性格/事业/财运/感情/健康/大运，由天枢事先深度分析并保存）。回答本命类问题时可先读取以保持结论一致。', {
    profileId: PROFILE_ID,
    section: { type: 'string', enum: ['overview', 'personality', 'career', 'wealth', 'relationship', 'health', 'dayun'], description: '只取某一部分；不填返回全部' },
  }),
  fn('get_daily_fortune', '读取已生成的运势日历数据：某天的评分、吉凶、概述、五维分数、宜忌（若生成过每日详解则一并返回），或某月的逐日概览。', {
    profileId: PROFILE_ID,
    date: { type: 'string', description: '某一天 YYYY-MM-DD' },
    month: { type: 'string', description: '某个月 YYYY-MM（与 date 二选一，默认本月）' },
  }),
];

// ── Subject resolution ──

interface Subject {
  birthDate: string;
  birthTime: string;
  gender: 'male' | 'female';
  label: string;
}

function label(p: Profile): string {
  return `${p.name}（${p.relation || '档案'}，${p.birthDate} ${p.birthTime}，${p.gender === 'female' ? '女' : '男'}）`;
}

/**
 * Work out whose chart a tool call is about and write the authoritative birth data back
 * into args (so the persisted tool card shows what the engine actually used).
 *
 * Order: explicit profileId → no birth data (current profile) → birth data matching a
 * saved profile → custom person outside the profiles.
 */
export function resolveSubject(args: Record<string, unknown>, ctx: ToolContext, suffix = ''): Subject {
  const k = (f: string) => `${f}${suffix}`;
  const pid = args[k('profileId')] as string | undefined;
  const bd = args[k('birthDate')] as string | undefined;

  let profile: Profile | undefined;
  if (pid) {
    profile = ctx.profiles.find((p) => p.profileId === pid);
    if (!profile) throw new Error(`未找到档案 ${pid}，请使用系统提示中列出的 profileId`);
  } else if (!bd) {
    if (!ctx.current) throw new Error('当前没有选中的命主档案，请提供出生日期、时间和性别');
    profile = ctx.current;
  } else if (ctx.current && ctx.current.birthDate === bd) {
    profile = ctx.current;
  } else {
    profile = ctx.profiles.find((p) => p.birthDate === bd);
  }

  if (profile) {
    Object.assign(args, {
      [k('profileId')]: profile.profileId,
      [k('birthDate')]: profile.birthDate,
      [k('birthTime')]: profile.birthTime,
      [k('gender')]: profile.gender,
    });
    return { birthDate: profile.birthDate, birthTime: profile.birthTime, gender: profile.gender, label: label(profile) };
  }

  // Custom person not in the profiles
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bd || '')) throw new Error('出生日期格式应为 YYYY-MM-DD');
  const time = (args[k('birthTime')] as string) || '';
  const gender = args[k('gender')] === 'female' ? 'female' : 'male';
  const notes: string[] = [];
  if (!/^\d{1,2}:\d{2}$/.test(time)) notes.push('未提供出生时间，按12:00计算，时柱仅供参考');
  const t = /^\d{1,2}:\d{2}$/.test(time) ? time : '12:00';
  if (!args[k('gender')]) notes.push('未提供性别，按男命计算');
  Object.assign(args, { [k('birthTime')]: t, [k('gender')]: gender });
  return {
    birthDate: bd!, birthTime: t, gender,
    label: `档案外人员（${bd} ${t}，${gender === 'female' ? '女' : '男'}）${notes.length ? `；注意：${notes.join('；')}` : ''}`,
  };
}

const dump = (o: unknown) => yaml.dump(o, { indent: 2, noRefs: true, skipInvalid: true, lineWidth: 160 });
const withSubject = (subject: Subject, body: unknown) => dump({ 分析对象: subject.label, ...(body as object) });

function resolveProfileId(args: Record<string, unknown>, ctx: ToolContext): Profile {
  const pid = args.profileId as string | undefined;
  const p = pid ? ctx.profiles.find((x) => x.profileId === pid) : ctx.current;
  if (!p) throw new Error(pid ? `未找到档案 ${pid}` : '当前没有选中的命主档案');
  args.profileId = p.profileId;
  return p;
}

// ── Astro helpers ──

/** Build the astro engine input for a resolved subject (profile place, or free-text birthPlace for others). */
function astroInputFor(args: Record<string, unknown>, ctx: ToolContext, suffix = ''): { input: AstroInput; label: string; name: string } {
  const s = resolveSubject(args, ctx, suffix);
  const profile = ctx.profiles.find((p) => p.profileId === args[`profileId${suffix}`]);
  const place = profile ? resolveProfilePlace(profile) : resolveBirthPlace(args[`birthPlace${suffix}`] as string);
  return {
    input: {
      birthDate: s.birthDate,
      birthTime: s.birthTime,
      timezone: profile?.timezone || 'Asia/Shanghai',
      lat: place.lat,
      lon: place.lon,
      place,
    },
    label: s.label,
    name: profile?.name || '对方',
  };
}

// ── Execution ──

/** Text result only (history backfill, tests). */
export async function executeFcTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const out = await runFcTool(name, args, ctx);
  return typeof out === 'string' ? out : out.text;
}

/** Text for the model plus, for chart/tarot/map tools, a structured display for the chat UI. */
export function executeFcToolRich(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecOutput> {
  return runFcTool(name, args, ctx);
}

const rich = (text: string, display: ToolDisplay): ToolExecOutput => ({ text, display });

/**
 * Shrink ACG polylines for a chat-sized map before persisting: keep every 3rd point (≈1.5° of
 * latitude, still smooth at that size) plus segment ends, rounded to 0.1°.
 */
function compactAcg(r: AcgResult): AcgResult {
  const q = (n: number) => Math.round(n * 10) / 10;
  const thin = (seg: [number, number][]) => seg.filter((_, i) => i % 3 === 0 || i === seg.length - 1);
  return {
    ...r,
    lines: r.lines.map((l) => ({
      ...l,
      segments: l.segments.map((seg) => thin(seg).map(([lon, lat]) => [q(lon), q(lat)] as [number, number])),
    })),
  };
}

const WX_ORDER = ['木', '火', '土', '金', '水'];
const GAN_WX: Record<string, string> = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
const ZHI_CHONG: Record<string, string> = { 子: '午', 午: '子', 丑: '未', 未: '丑', 寅: '申', 申: '寅', 卯: '酉', 酉: '卯', 辰: '戌', 戌: '辰', 巳: '亥', 亥: '巳' };
const ZHI_HE: Record<string, string> = { 子: '丑', 丑: '子', 寅: '亥', 亥: '寅', 卯: '戌', 戌: '卯', 辰: '酉', 酉: '辰', 巳: '申', 申: '巳', 午: '未', 未: '午' };

/** Elements related to the day master: 生我(印) 同我(比) 我生(食伤) 我克(财) 克我(官杀) */
function wxRelations(me: string) {
  const i = WX_ORDER.indexOf(me);
  const at = (k: number) => WX_ORDER[(i + k + 5) % 5];
  return { yin: at(-1), bi: me, shi: at(1), cai: at(2), guan: at(3) };
}

/** 1–100 sign number, stable for one user on one day */
function dailySignNumber(userId: string, date: string): number {
  const h = createHash('sha256').update(`${userId}|${date}|arcanum-sign`).digest();
  return (h.readUInt32BE(0) % 100) + 1;
}

function signLevel(n: number): string {
  // 上上 8% / 上 22% / 中 40% / 下 22% / 下下 8%
  if (n <= 8) return '上上签';
  if (n <= 30) return '上签';
  if (n <= 70) return '中签';
  if (n <= 92) return '下签';
  return '下下签';
}

async function runFcTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecOutput> {
  const now = localParts(ctx.timezone, ctx.now);

  switch (name) {
    case 'get_bazi_chart': {
      const s = resolveSubject(args, ctx);
      return withSubject(s, getBaziChart(s.birthDate, s.birthTime, s.gender));
    }
    case 'get_ziwei_chart': {
      const s = resolveSubject(args, ctx);
      return withSubject(s, getZiweiChart(s.birthDate, s.birthTime, s.gender));
    }
    case 'get_today_huangli': {
      const dateStr = (args.date as string) || now.date;
      args.date = dateStr;
      const [y, m, d] = dateStr.split('-').map(Number);
      const lunar = Solar.fromYmd(y, m, d).getLunar() as any;
      const chart = getBaziChart(dateStr, '12:00', 'male');
      return dump({
        date: dateStr,
        lunarDate: lunar.toString(),
        dayGanZhi: `${chart.pillars.day.gan}${chart.pillars.day.zhi}`,
        naYin: chart.pillars.day.naYin,
        zhiXing: chart.zhiXing,
        tianShen: chart.tianShen,
        tianShenLuck: chart.tianShenLuck,
        xiu: chart.xiu, xiuLuck: chart.xiuLuck,
        dayYi: chart.dayYi, dayJi: chart.dayJi,
        pengZu: `${chart.pengZuGan} ${chart.pengZuZhi}`,
        dayChong: chart.dayChongDesc, daySha: chart.daySha,
        jiShen: chart.jiShen, xiongSha: chart.xiongSha,
        dayLu: chart.dayLu,
        nineStar: chart.nineStar,
      });
    }
    case 'get_flow_day_context': {
      const s = resolveSubject(args, ctx);
      const target = (args.targetDate as string) || now.date;
      args.targetDate = target;
      return withSubject(s, getFlowDayContext(s.birthDate, s.birthTime, s.gender, target));
    }
    case 'liu_yao':
      return dump(liuYaoByTime((args.question as string) || '此事吉凶'));
    case 'mei_hua': {
      const q = (args.question as string) || '此事吉凶';
      const n1 = Number(args.num1);
      const n2 = Number(args.num2);
      return dump(n1 > 0 && n2 > 0 ? meiHuaByNumber(Math.floor(n1), Math.floor(n2), q) : meiHuaByTime(q));
    }
    case 'qi_men':
      return dump(qiMenByTime((args.question as string) || '此时吉凶'));
    case 'get_dayun_analysis': {
      const s = resolveSubject(args, ctx);
      const chart = getBaziChart(s.birthDate, s.birthTime, s.gender);
      return withSubject(s, {
        dayMaster: chart.dayMaster,
        dayMasterWuXing: chart.dayMasterWuXing,
        currentDaYun: chart.currentDaYun,
        daYun: chart.daYun,
      });
    }
    case 'get_bazi_flow_year': {
      const s = resolveSubject(args, ctx);
      const natal = getBaziChart(s.birthDate, s.birthTime, s.gender);
      const yr = Number(args.targetYear) || now.year;
      // A sexagenary year changes at 立春; mid-June is safely inside the target year.
      const flow = getBaziChart(`${yr}-06-15`, '12:00', 'male');
      return withSubject(s, {
        targetYear: yr,
        flowYearGanZhi: `${flow.pillars.year.gan}${flow.pillars.year.zhi}`,
        flowYearNaYin: flow.pillars.year.naYin,
        flowYearTenGod: getTenGodForStem(natal.dayMaster, flow.pillars.year.gan),
        flowYearShenSha: flow.pillars.year.shenSha,
        natalDayMaster: `${natal.dayMaster}(${natal.dayMasterWuXing})`,
        natalPillars: pillarsOf(natal),
        wuXingAnalysis: natal.wuXingAnalysis,
        currentDaYun: natal.currentDaYun,
      });
    }
    case 'get_bazi_flow_month': {
      const s = resolveSubject(args, ctx);
      const natal = getBaziChart(s.birthDate, s.birthTime, s.gender);
      const yr = Number(args.targetYear) || now.year;
      const mo = Number(args.targetMonth) || now.month;
      const flow = getBaziChart(`${yr}-${String(mo).padStart(2, '0')}-15`, '12:00', 'male');
      return withSubject(s, {
        targetYear: yr,
        targetMonth: mo,
        flowMonthGanZhi: `${flow.pillars.month.gan}${flow.pillars.month.zhi}`,
        flowMonthNaYin: flow.pillars.month.naYin,
        flowMonthTenGod: getTenGodForStem(natal.dayMaster, flow.pillars.month.gan),
        flowMonthShenSha: flow.pillars.month.shenSha,
        flowYearGanZhi: `${flow.pillars.year.gan}${flow.pillars.year.zhi}`,
        natalDayMaster: `${natal.dayMaster}(${natal.dayMasterWuXing})`,
        wuXingAnalysis: natal.wuXingAnalysis,
        currentDaYun: natal.currentDaYun,
      });
    }
    case 'get_ziwei_flow_year': {
      const s = resolveSubject(args, ctx);
      return withSubject(s, getFlowYearContext(s.birthDate, s.birthTime, s.gender, Number(args.targetYear) || now.year));
    }
    case 'get_ziwei_flow_month': {
      const s = resolveSubject(args, ctx);
      return withSubject(s, getFlowMonthContext(
        s.birthDate, s.birthTime, s.gender,
        Number(args.targetYear) || now.year, Number(args.targetMonth) || now.month,
      ));
    }
    case 'get_bazi_flow_day': {
      const s = resolveSubject(args, ctx);
      const natal = getBaziChart(s.birthDate, s.birthTime, s.gender);
      const td = (args.targetDate as string) || now.date;
      args.targetDate = td;
      const [y, m, d] = td.split('-').map(Number);
      const flow = getBaziChart(td, '12:00', 'male');
      const lunar = Solar.fromYmd(y, m, d).getLunar() as any;
      return withSubject(s, {
        targetDate: td,
        flowDayGanZhi: `${flow.pillars.day.gan}${flow.pillars.day.zhi}`,
        flowDayNaYin: flow.pillars.day.naYin,
        flowDayTenGod: getTenGodForStem(natal.dayMaster, flow.pillars.day.gan),
        flowDayShenSha: flow.pillars.day.shenSha,
        flowMonthGanZhi: `${flow.pillars.month.gan}${flow.pillars.month.zhi}`,
        zhiXing: flow.zhiXing,
        tianShen: flow.tianShen,
        tianShenLuck: flow.tianShenLuck,
        dayYi: flow.dayYi?.slice(0, 8),
        dayJi: flow.dayJi?.slice(0, 8),
        dayChong: flow.dayChongDesc,
        daySha: flow.daySha,
        lunarDate: lunar.toString(),
        natalDayMaster: `${natal.dayMaster}(${natal.dayMasterWuXing})`,
        currentDaYun: natal.currentDaYun,
      });
    }
    case 'get_wuxing_analysis': {
      const s = resolveSubject(args, ctx);
      const chart = getBaziChart(s.birthDate, s.birthTime, s.gender);
      return withSubject(s, {
        dayMaster: chart.dayMaster,
        dayMasterWuXing: chart.dayMasterWuXing,
        wuXingPairs: chart.wuXingPairs,
        wuXingAnalysis: chart.wuXingAnalysis,
        pillars: Object.fromEntries((['year', 'month', 'day', 'hour'] as const).map((key) => {
          const p = chart.pillars[key];
          return [key, `${p.gan}${p.zhi}(${p.naYin})`];
        })),
      });
    }
    case 'compare_bazi': {
      const a = resolveSubject(args, ctx, '1');
      if (!args.profileId2 && !args.birthDate2) throw new Error('请提供乙方的 profileId2 或出生信息');
      const b = resolveSubject(args, ctx, '2');
      const side = (s: Subject) => {
        const c = getBaziChart(s.birthDate, s.birthTime, s.gender);
        return {
          对象: s.label,
          八字: Object.values(pillarsOf(c)).join(' '),
          日主: c.dayMaster,
          五行: c.dayMasterWuXing,
          纳音: c.pillars.day.naYin,
          生肖: c.birthInfo?.shengXiao,
          wuXingAnalysis: c.wuXingAnalysis,
        };
      };
      return dump({ 甲方: side(a), 乙方: side(b) });
    }
    case 'get_yearly_calendar': {
      const yr = Number(args.year) || now.year;
      args.year = yr;
      const months = [];
      for (let m = 1; m <= 12; m++) {
        const l = Solar.fromYmd(yr, m, 15).getLunar() as any;
        const ns = l.getMonthNineStar();
        months.push({
          月份: `${yr}-${String(m).padStart(2, '0')}`,
          月干支: l.getMonthInGanZhi(),
          九星: ns?.toString() || '',
          奇门: ns ? `${ns.getNameInQiMen()} ${ns.getBaMenInQiMen()}门 ${ns.getLuckInQiMen()}` : '',
        });
      }
      const mid = Solar.fromYmd(yr, 6, 1).getLunar() as any;
      return dump({ year: yr, yearGanZhi: mid.getYearInGanZhi(), months });
    }
    case 'get_shichen_detail': {
      const dateStr = (args.date as string) || now.date;
      args.date = dateStr;
      const [y, m, d] = dateStr.split('-').map(Number);
      const lunar = Solar.fromYmd(y, m, d).getLunar() as any;
      const shichen = (lunar.getTimes() as any[]).map((t: any) => ({
        ganZhi: t.getGanZhi(),
        time: `${t.getMinHm()}-${t.getMaxHm()}`,
        tianShen: t.getTianShen(),
        tianShenType: t.getTianShenType(),
        luck: t.getTianShenLuck(),
        chong: t.getChongDesc(),
        sha: t.getSha(),
        yi: t.getYi(),
        ji: t.getJi(),
      }));
      return dump({ date: dateStr, shichen });
    }
    case 'analyze_name':
      return dump(analyzeWuGe(args.surname as string, args.givenName as string));
    case 'get_flying_stars': {
      const s = resolveSubject(args, ctx);
      const fs = analyzeFlyingStars(getZiweiChart(s.birthDate, s.birthTime, s.gender));
      return withSubject(s, {
        natalSiHua: fs.natalSiHua,
        selfMutations: fs.selfMutations,
        doubleJi: fs.doubleJi,
        luJiConflict: fs.luJiConflict,
        palaceFlyingStars: fs.palaceFlyingStars.map((p) => ({
          palace: p.palaceName,
          stem: p.heavenlyStem,
          flies: p.flyingStars.map((f) => `${f.star}${f.mutation}→${f.targetPalace}${f.isSelfMutation ? '(自化)' : ''}`),
        })),
      });
    }
    case 'analyze_fengshui': {
      let birthYear: number | undefined;
      let gender: 'male' | 'female' | undefined;
      try {
        const p = resolveProfileId(args, ctx);
        birthYear = Number(p.birthDate.slice(0, 4));
        gender = p.gender;
      } catch { /* 无档案时只做宅卦分析 */ }
      return dump(analyzeFengshui(Number(args.facingDegree), birthYear, gender));
    }
    case 'analyze_xuankong': {
      const r = analyzeXuanKong(Number(args.facingDegree), Number(args.year));
      return dump({
        period: r.period,
        yuan: r.yuan,
        facing: `${r.facingMountain}山 (${r.facingDegree}°)`,
        sitting: `${r.sittingMountain}山`,
        specialPatterns: r.specialPatterns,
        palaces: r.palaces.map((p) => ({
          方位: p.position,
          运星: p.periodStar,
          山星: p.mountainStar,
          向星: p.facingStar,
          山星旺衰: p.mountainStarInfo.timeliness,
          向星旺衰: p.facingStarInfo.timeliness,
          组合: p.combo,
        })),
      });
    }
    case 'tieban_shenshu': {
      const s = resolveSubject(args, ctx);
      const queryDate = (args.queryDate as string) || now.date;
      const queryTime = (args.queryTime as string) || now.time;
      Object.assign(args, { queryDate, queryTime });
      return withSubject(s, tieban(s, queryDate, queryTime));
    }
    case 'get_astro_chart': {
      const s = resolveSubject(args, ctx);
      const profile = ctx.profiles.find((p) => p.profileId === args.profileId);
      const place = profile ? resolveProfilePlace(profile) : resolveBirthPlace(args.birthPlace as string);
      const houseSystem = (['placidus', 'whole-sign', 'equal', 'porphyry'] as const)
        .find((h) => h === args.houseSystem) || 'placidus';
      args.houseSystem = houseSystem;
      const chart = getAstroChart({
        birthDate: s.birthDate,
        birthTime: s.birthTime,
        timezone: profile?.timezone || 'Asia/Shanghai',
        lat: place.lat,
        lon: place.lon,
        houseSystem,
        place,
      });
      return rich(`分析对象: ${s.label}\n${formatAstroForLlm(chart)}`, {
        kind: 'astro-chart', subject: s.label, chart, link: { to: '/astro?tab=natal', label: '在星盘工作台打开' },
      });
    }
    case 'get_astro_transit': {
      const { input, label: who } = astroInputFor(args, ctx);
      const date = (args.date as string) || now.date;
      const time = (args.time as string) || '12:00';
      Object.assign(args, { date, time });
      const wheel = getTransitWheel(input, { date, time, timezone: input.timezone });
      return rich(`分析对象: ${who}\n${formatBiWheelForLlm(wheel)}`, {
        kind: 'astro-biwheel', subject: who, wheel, link: { to: '/astro?tab=transit', label: '在星盘工作台打开' },
      });
    }
    case 'get_astro_progressed': {
      const { input, label: who } = astroInputFor(args, ctx);
      const date = (args.date as string) || now.date;
      args.date = date;
      const wheel = getProgressedWheel(input, date);
      return rich(`分析对象: ${who}\n${formatBiWheelForLlm(wheel)}`, {
        kind: 'astro-biwheel', subject: who, wheel, link: { to: '/astro?tab=progressed', label: '在星盘工作台打开' },
      });
    }
    case 'get_astro_solar_return': {
      const { input, label: who } = astroInputFor(args, ctx);
      const year = Number(args.year) || now.year;
      args.year = year;
      const wheel = getSolarReturnWheel(input, year);
      return rich(`分析对象: ${who}\n${formatBiWheelForLlm(wheel)}`, {
        kind: 'astro-biwheel', subject: who, wheel, link: { to: '/astro?tab=solar-return', label: '在星盘工作台打开' },
      });
    }
    case 'get_astro_synastry':
    case 'get_astro_composite': {
      const a = astroInputFor(args, ctx, '1');
      if (!args.profileId2 && !args.birthDate2) throw new Error('请提供乙方的 profileId2 或出生信息');
      const b = astroInputFor(args, ctx, '2');
      const labels = { a: a.name === '对方' ? '甲方' : a.name, b: b.name };
      const placeOf = (x: typeof a) => `${x.input.place?.matched || '未知'}（精度: ${x.input.place?.precision || '未知'}）`;
      const head = `甲方: ${a.label}，出生地 ${placeOf(a)}\n乙方: ${b.label}，出生地 ${placeOf(b)}\n`;
      const subject = `${labels.a} × ${labels.b}`;
      if (name === 'get_astro_synastry') {
        const wheel = getSynastryWheel(a.input, b.input, labels);
        return rich(head + formatBiWheelForLlm(wheel), {
          kind: 'astro-biwheel', subject, wheel, link: { to: '/astro?tab=synastry', label: '在星盘工作台打开' },
        });
      }
      const composite = getCompositeChart(a.input, b.input, labels);
      return rich(head + formatCompositeForLlm(composite), {
        kind: 'astro-composite', subject, composite, link: { to: '/astro?tab=composite', label: '在星盘工作台打开' },
      });
    }
    case 'get_astrocartography': {
      const { input, label: who } = astroInputFor(args, ctx);
      const result = getAcgLines({ ...input, includeNode: true });
      const focus: Parameters<typeof formatAcgForLlm>[1] = {};
      if (args.place) {
        const q = String(args.place);
        const hit = searchPlaces(q, 1)[0];
        const coord = hit ? { lat: hit.lat, lon: hit.lon, label: hit.name } : (() => {
          const r = resolveBirthPlace(q);
          return r.precision === 'default' ? null : { lat: r.lat, lon: r.lon, label: r.matched };
        })();
        if (!coord) throw new Error(`没有找到地点「${q}」，请换一个城市名`);
        Object.assign(focus, coord, { near: nearestAcgLines(result, coord.lat, coord.lon, 800) });
      }
      if (args.theme) {
        const theme = ACG_THEMES.find((t) => t.key === args.theme);
        if (theme) Object.assign(focus, { theme, ranked: rankPlacesForTheme(result, rankCandidates(), theme.key, 12) });
      }
      return rich(`分析对象: ${who}\n${formatAcgForLlm(result, focus)}`, {
        kind: 'acg',
        subject: who,
        result: compactAcg(result),
        focus: focus.near && focus.lat !== undefined && focus.lon !== undefined
          ? { lat: focus.lat, lon: focus.lon, label: focus.label, near: focus.near }
          : undefined,
        theme: focus.theme,
        ranked: focus.ranked,
        link: { to: '/astro/map', label: '在地理占星中打开' },
      });
    }
    case 'get_astro_interpretation': {
      const kind = (args.kind as string) || 'natal';
      args.kind = kind;
      const max = Math.min(Math.max(Number(args.maxItems) || 30, 5), 60);
      if (kind === 'synastry' || kind === 'composite') {
        if (!args.profileId2) throw new Error('比较盘/组合盘需要提供乙方 profileId2');
        const pa = { profileId1: args.profileId } as Record<string, unknown>;
        const a = astroInputFor(pa, ctx, '1');
        const b = astroInputFor({ profileId2: args.profileId2 }, ctx, '2');
        const labels = { a: a.name, b: b.name };
        const interp = kind === 'synastry'
          ? interpretBiWheel(getSynastryWheel(a.input, b.input, labels))
          : interpretComposite(getCompositeChart(a.input, b.input, labels));
        return rich(`甲方: ${a.label}\n乙方: ${b.label}\n${formatInterpretationForLlm(interp, max)}`, {
          kind: 'astro-interpretation', subject: `${labels.a} × ${labels.b}`, interpretation: interp,
          link: { to: `/astro?tab=${kind}`, label: '在星盘工作台打开' },
        });
      }
      const { input, label: who } = astroInputFor(args, ctx);
      let interp;
      if (kind === 'transit') {
        const date = (args.date as string) || now.date;
        args.date = date;
        interp = interpretBiWheel(getTransitWheel(input, { date, time: '12:00', timezone: input.timezone }));
      } else if (kind === 'progressed') {
        const date = (args.date as string) || now.date;
        args.date = date;
        interp = interpretBiWheel(getProgressedWheel(input, date));
      } else if (kind === 'solar-return') {
        const year = Number(args.year) || now.year;
        args.year = year;
        interp = interpretBiWheel(getSolarReturnWheel(input, year));
      } else {
        interp = interpretNatal(getAstroChart(input));
      }
      return rich(`分析对象: ${who}\n${formatInterpretationForLlm(interp, max)}`, {
        kind: 'astro-interpretation', subject: who, interpretation: interp,
        link: { to: `/astro?tab=${kind}`, label: '在星盘工作台打开' },
      });
    }
    case 'draw_tarot': {
      const reading = await drawTarotReading(ctx.userId, {
        spreadId: (args.spreadId as string) || 'three-time',
        question: (args.question as string) || '',
        allowReversed: args.allowReversed !== false,
        majorOnly: args.majorOnly === true,
        profileId: ctx.current?.profileId,
      });
      args.spreadId = reading.spreadId;
      return rich(`${formatTarotForLlm(reading)}\n（此次抽牌已保存到「塔罗 → 历史」，记录ID ${reading.readingId}）`, {
        kind: 'tarot', reading, link: { to: '/tarot?tab=history', label: '在塔罗中查看' },
      });
    }
    case 'ze_ri': {
      const s = resolveSubject(args, ctx);
      const date = (args.date as string) || now.date;
      args.date = date;
      const purpose = ((args.purpose as string) || '').trim();
      const [y, m, d] = date.split('-').map(Number);
      const lunar = Solar.fromYmd(y, m, d).getLunar() as any;
      const day = getBaziChart(date, '12:00', 'male');
      const natal = getBaziChart(s.birthDate, s.birthTime, s.gender);
      const dayZhi = day.pillars.day.zhi;
      const clashes = (['year', 'day'] as const)
        .filter((k) => ZHI_CHONG[natal.pillars[k].zhi] === dayZhi)
        .map((k) => `日支${dayZhi}冲本命${k === 'year' ? '年' : '日'}支${natal.pillars[k].zhi}`);
      const harmonies = (['year', 'day'] as const)
        .filter((k) => ZHI_HE[natal.pillars[k].zhi] === dayZhi)
        .map((k) => `日支${dayZhi}合本命${k === 'year' ? '年' : '日'}支${natal.pillars[k].zhi}`);
      const match = purpose
        ? {
          用途: purpose,
          在宜中: day.dayYi.filter((x) => x.includes(purpose) || purpose.includes(x)),
          在忌中: day.dayJi.filter((x) => x.includes(purpose) || purpose.includes(x)),
        }
        : undefined;
      return withSubject(s, {
        date,
        农历: lunar.toString(),
        日干支: `${day.pillars.day.gan}${dayZhi}`,
        纳音: day.pillars.day.naYin,
        值星: day.zhiXing,
        天神: `${day.tianShen}（${day.tianShenType}，${day.tianShenLuck}）`,
        二十八宿: `${day.xiu}（${day.xiuLuck}）`,
        宜: day.dayYi,
        忌: day.dayJi,
        冲煞: `${day.dayChongDesc} 煞${day.daySha}`,
        彭祖百忌: `${day.pengZuGan} ${day.pengZuZhi}`,
        吉神: day.jiShen,
        凶煞: day.xiongSha,
        用途匹配: match,
        与命主: {
          流日十神: getTenGodForStem(natal.dayMaster, day.pillars.day.gan),
          冲: clashes.length ? clashes : '无',
          合: harmonies.length ? harmonies : '无',
        },
      });
    }
    case 'xun_wu': {
      const item = String(args.item || '失物');
      const q = `寻找丢失的${item}`;
      const qm = qiMenByTime(q);
      const ly = liuYaoByTime(q);
      return dump({
        寻物: item,
        起卦时间: ly.timestamp,
        奇门: {
          日盘: { 九星: qm.dayStar.qiMen, 八门: qm.dayStar.baMen, 方位: qm.dayStar.position },
          时盘: { 九星: qm.timeStar.qiMen, 八门: qm.timeStar.baMen, 方位: qm.timeStar.position },
          综合吉凶: qm.overallLuck,
          推荐方位: qm.direction,
        },
        六爻: {
          本卦: ly.gua64Name,
          变卦: ly.bianGua,
          动爻: ly.dongYaoList,
          世爻: ly.shiYao,
          应爻: ly.yingYao,
          爻位: ly.yaoLines.map((yl) => `${yl.position}爻 ${yl.yinYang} ${yl.liuQin} ${yl.diZhi}${yl.isDong ? '（动）' : ''}${yl.isShi ? ' 世' : ''}${yl.isYing ? ' 应' : ''}`),
        },
        断法提示: '失物以妻财爻为用神：用神旺相或生世可寻回；用神所临地支定方位（子北、午南、卯东、酉西…），五行定场所（金属/木器/近水/高处等）。',
      });
    }
    case 'daily_sign': {
      const lunar = Solar.fromYmd(now.year, now.month, Number(now.date.slice(8, 10))).getLunar() as any;
      const n = dailySignNumber(ctx.userId, now.date);
      return dump({
        日期: now.date,
        农历: lunar.toString(),
        日干支: lunar.getDayInGanZhi(),
        节候: `${lunar.getSeason() || ''} ${lunar.getHou() || ''}`.trim(),
        月相: lunar.getYueXiang(),
        签号: `第${n}签`,
        签等: signLevel(n),
        说明: '签号与签等按用户与日期固定生成；请据此原创四句七言签诗、白话解曰、宜忌与一句贴心提醒，不要引用任何现成签诗。',
      });
    }
    case 'ze_ming': {
      const s = resolveSubject(args, ctx);
      const chart = getBaziChart(s.birthDate, s.birthTime, s.gender);
      const wx = chart.wuXingAnalysis;
      const me = GAN_WX[chart.dayMaster] || chart.dayMasterWuXing;
      const rel = wxRelations(me);
      const strong = wx?.dayMasterStrength === '身强';
      const weak = wx?.dayMasterStrength === '身弱';
      const favorable = strong ? [rel.shi, rel.cai, rel.guan] : weak ? [rel.yin, rel.bi] : [];
      return withSubject(s, {
        姓氏: args.surname,
        取名对象性别: args.babyGender === 'female' ? '女' : args.babyGender === 'male' ? '男' : (s.gender === 'female' ? '女' : '男'),
        八字: Object.values(pillarsOf(chart)).join(' '),
        日主: `${chart.dayMaster}（${me}）`,
        日主强弱: wx?.dayMasterStrength,
        五行分布: wx?.counts?.map((c) => `${c.element}${c.count}（${c.status}）`),
        缺: wx?.missing?.length ? wx.missing : '无',
        简化喜用五行: favorable.length ? favorable : '中和，以补缺、平衡为主',
        依据: strong
          ? `身强宜泄耗：取食伤(${rel.shi})、财(${rel.cai})、官杀(${rel.guan})`
          : weak ? `身弱宜生扶：取印(${rel.yin})、比劫(${rel.bi})` : '日主中和，以补缺五行与字义、音律为先',
        提醒: '此为按扶抑法的简化判断，未计调候与格局；可先给出若干候选名，再用 analyze_name 检验五格数理。',
      });
    }
    case 'get_natal_analysis': {
      const p = resolveProfileId(args, ctx);
      const natal = await getNatalChart(ctx.userId, p.profileId);
      const sections = natal.analysis?.sections;
      if (!sections || !Object.keys(sections).length) {
        return dump({ 分析对象: label(p), 状态: '尚未生成本命详解。可以直接根据命盘分析，并建议用户在「命盘档案 → 本命详解」中生成完整报告。' });
      }
      const pick = args.section ? { [args.section as string]: sections[args.section as string] } : sections;
      return dump({
        分析对象: label(p),
        生成时间: natal.analysis?.generatedAt,
        报告: Object.fromEntries(Object.entries(pick).filter(([, v]) => v).map(([k, v]) => [k, {
          标题: v!.title,
          要点: v!.keyPoints?.map((kp) => `${kp.label}：${kp.value}`),
          正文: v!.paragraphs?.join('\n\n'),
        }])),
      });
    }
    case 'get_daily_fortune': {
      const p = resolveProfileId(args, ctx);
      if (args.date) {
        const date = args.date as string;
        const [y, m] = date.split('-').map(Number);
        const cal = await getMonthlyCalendar(ctx.userId, p.profileId, y, m);
        const day = cal.days.find((d) => d.date === date);
        const detail = await getDailyDetail(ctx.userId, p.profileId, date);
        if (!day && !detail) return dump({ 分析对象: label(p), date, 状态: '这一天的运势尚未在月历中生成。可以用流日工具直接分析，或建议用户去「运势月历」生成。' });
        return dump({
          分析对象: label(p),
          日历: day,
          每日详解: detail ? {
            overview: detail.overview,
            events: detail.events,
            hourlyFortune: detail.hourlyFortune?.map((h: any) => `${h.hour} ${h.level} ${h.tip}`),
            directions: detail.directions,
            luckyColor: detail.luckyColor,
            luckyNumber: detail.luckyNumber,
            detailedFavorable: detail.detailedFavorable,
            detailedUnfavorable: detail.detailedUnfavorable,
          } : '未生成',
        });
      }
      const [y, m] = ((args.month as string) || now.date.slice(0, 7)).split('-').map(Number);
      args.month = `${y}-${String(m).padStart(2, '0')}`;
      const cal = await getMonthlyCalendar(ctx.userId, p.profileId, y, m);
      if (!cal.days.length) return dump({ 分析对象: label(p), month: args.month, 状态: '该月运势日历尚未生成。' });
      return dump({
        分析对象: label(p),
        month: args.month,
        逐日: [...cal.days].sort((a, b) => a.date.localeCompare(b.date))
          .map((d) => `${d.date} ${d.dayGanZhi} ${d.overallScore}分 ${d.rating}｜${d.tagline}`),
      });
    }
    default:
      return `未知工具: ${name}`;
  }
}

function pillarsOf(c: ReturnType<typeof getBaziChart>) {
  return Object.fromEntries((['year', 'month', 'day', 'hour'] as const).map((k) => [k, `${c.pillars[k].gan}${c.pillars[k].zhi}`]));
}

function tieban(s: Subject, queryDate: string, queryTime: string) {
  const eight = (date: string, time: string) => {
    const [y, m, d] = date.split('-').map(Number);
    const [h] = time.split(':').map(Number);
    const lunar = Solar.fromYmdHms(y, m, d, h, 0, 0).getLunar() as any;
    const e = lunar.getEightChar() as any;
    return { lunar, bazi: { year: e.getYear() as string, month: e.getMonth() as string, day: e.getDay() as string, hour: e.getTime() as string } };
  };
  const birth = eight(s.birthDate, s.birthTime);
  const query = eight(queryDate, queryTime);
  const rawMonth = birth.lunar.getMonth() as number;
  const r = tiebanCalculate(birth.bazi, query.bazi, s.gender === 'female' ? '女' : '男', Math.abs(rawMonth), birth.lunar.getDay() as number, rawMonth < 0);

  const out: Record<string, unknown> = {
    求测时间: `${queryDate} ${queryTime}`,
    基础信息: r.headerInfo,
    先天命数: r.congNum,
    五音命数: r.toneNum,
    日命数: r.dayLife,
    时运数: r.timeLuck,
    考刻: r.momentCn,
    本命数: r.mainNum,
    后天命数: r.pnNum,
    十二辟卦: r.hexName,
  };
  if (r.destinyEntries.length) out.本命条文 = r.destinyEntries.map((e) => `${e.category}: ${e.value} (${e.formula})`);
  const ln = r.liunian.filter((l) => l.originalDuanyu || l.correctedDuanyu);
  out.流年条文总数 = ln.length;
  out.流年条文 = ln.map((l) => ({
    岁: l.age,
    干支: l.ganZhi,
    原条文: l.originalFortune,
    原断语: l.originalDuanyu || undefined,
    原断语年龄: l.originalDuanyuAge || undefined,
    校正条文: l.correctedFortune || undefined,
    校正断语: l.correctedDuanyu || undefined,
    校正年龄: l.correctedDuanyuAge || undefined,
  }));
  return out;
}

// ── History helpers ──

const STUB_RE = /^调用 (\w+)(?:\((\{[\s\S]*\})\))?$/;

/**
 * Old server versions persisted only "调用 name({args})" instead of the tool result.
 * Recompute deterministic tools from the stored args; time-dependent ones get an explanation.
 * Returns true if any message changed (caller persists the session).
 */
export async function backfillToolStubs(messages: ChatMessage[], ctx: ToolContext): Promise<boolean> {
  let changed = false;
  for (const m of messages) {
    if (m.role !== 'tool' || m.recomputed !== undefined) continue;
    const match = STUB_RE.exec((m.content || '').trim());
    if (!match) continue;
    const name = match[1];
    let args: Record<string, unknown> = { ...(m.toolArgs || {}) };
    if (match[2]) {
      try { args = { ...JSON.parse(match[2]), ...args }; } catch { /* keep stored args */ }
    }
    m.toolName = m.toolName || name;
    changed = true;
    if (TIME_DEPENDENT_TOOLS.has(name)) {
      m.toolArgs = args;
      m.recomputed = false;
      m.content = dump({ 说明: '该次起卦的原始卦象当时没有被保存；起卦依赖当时的时刻，无法事后复原。对话中天枢的解读仍保留在下方回复里。' });
      continue;
    }
    try {
      m.content = await executeFcTool(name, args, ctx);
      m.toolArgs = args;
      m.recomputed = true;
    } catch (err: any) {
      m.toolArgs = args;
      m.recomputed = false;
      m.content = dump({ 说明: `原始结果未保存，按原参数重算失败：${err?.message || err}` });
    }
  }
  return changed;
}

const RECENT_TOOL_TURNS = 3;
const RECENT_TOOL_CHARS = 6000;
const TOTAL_TOOL_CHARS = 60000;

function toolTitle(m: ChatMessage): string {
  const n = m.toolName || '';
  return TOOL_TITLES[n] ? `${TOOL_TITLES[n]}（${n}）` : n || '工具';
}

function clip(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}\n…（已截断，完整数据可重新调用工具获取）`;
}

/**
 * Turn stored session messages into LLM-ready history.
 *
 * Tool messages can't be replayed as-is (the tool_call_ids of past rounds are gone and
 * replaying raw payloads as assistant text makes the model imitate them), so their results
 * are attached as a context note to the user message they belong to:
 *   - function-calling results follow the user message of that turn → appended to it;
 *   - tools the user ran manually from the toolbar follow an assistant reply → prefixed
 *     to the next user message (returned as `pendingNote` if that is the new message).
 * Results from the last few turns are included (clipped); older ones become a one-line reference.
 */
export function buildLlmHistory(messages: ChatMessage[]): { history: ChatMessage[]; pendingNote: string } {
  const userIdx = messages.flatMap((m, i) => (m.role === 'user' ? [i] : []));
  const detailFrom = userIdx.length > RECENT_TOOL_TURNS ? userIdx[userIdx.length - RECENT_TOOL_TURNS] : 0;
  let budget = TOTAL_TOOL_CHARS;

  const history: ChatMessage[] = [];
  let lastUser: ChatMessage | null = null;
  let prevNonTool: ChatMessage['role'] | '' = '';
  let pending: string[] = [];

  const describe = (m: ChatMessage, i: number): string => {
    const argStr = m.toolArgs && Object.keys(m.toolArgs).length ? ` 参数: ${JSON.stringify(m.toolArgs)}` : '';
    const head = `【${toolTitle(m)}】${argStr}${m.recomputed ? '（按原参数重新演算）' : ''}`;
    if (i < detailFrom || budget <= 0) return `${head}\n（较早的结果已省略，如需可重新调用工具）`;
    let body = m.toolRaw ? `演算数据:\n${m.toolRaw}\n\n解读:\n${m.content}` : m.content;
    body = clip(body || '', Math.min(RECENT_TOOL_CHARS, budget));
    budget -= body.length;
    return `${head}\n${body}`;
  };

  messages.forEach((m, i) => {
    if (m.role === 'tool') {
      const note = describe(m, i);
      if (prevNonTool === 'user' && lastUser && !m.userTriggered) {
        lastUser.content += `\n\n[系统附注：本轮已调用的工具及结果，仅供参考]\n${note}`;
      } else {
        pending.push(note);
      }
      return;
    }
    prevNonTool = m.role;
    if (m.role === 'user') {
      const copy: ChatMessage = { role: 'user', content: m.content, images: m.images };
      if (pending.length) {
        copy.content = `[系统附注：在此之前用户手动运行了以下工具，结果如下]\n${pending.join('\n\n')}\n\n[用户消息]\n${copy.content}`;
        pending = [];
      }
      history.push(copy);
      lastUser = copy;
    } else if (m.role === 'assistant' || m.role === 'system') {
      // Failed turns carry no answer — replaying provider errors would only confuse the model
      if (m.role === 'assistant' && (m.error || /^\[(生成失败|错误)\]/.test(m.content.trim()))) {
        if (m.content && m.error) history.push({ role: 'assistant', content: m.content });
        return;
      }
      history.push({ role: m.role, content: m.content, meta: m.meta });
    }
  });

  return {
    history,
    pendingNote: pending.length ? `[系统附注：在此之前用户手动运行了以下工具，结果如下]\n${pending.join('\n\n')}\n\n[用户消息]\n` : '',
  };
}
