import { AppError } from '../middleware/error-handler';
import { Solar } from 'lunar-javascript';
import * as LunarLib from 'lunar-javascript';

// LunarYear not in TS type defs but exported at runtime
const LunarYear = (LunarLib as any).LunarYear;
import * as yaml from 'js-yaml';
import { getBaziChart } from '../engines/bazi.engine';
import { getFlowDayContext, getZiweiChart } from '../engines/ziwei.engine';
import { getProfile } from './profile.service';
import { chatCompletion, type ChatMessage } from './llm.service';
import { readYaml, writeYaml, getProfileDir } from './storage.service';
import type { BaziChart } from '../../shared/types/bazi.types';
import type { Profile } from '../../shared/types/profile.types';
import type {
  DailyFortune,
  DailyDetail,
  FlowDayContext,
  MonthlyCalendar,
  WeekBatch,
  FortuneRating,
  HourlyFortune,
  ActionWithReason,
  DimensionDetail,
  TrendData,
  TrendPoint,
} from '../../shared/types/fortune.types';

// ── Paths ──

// Dates end up in file names: validate strictly so "../" can never reach the path
function checkYearMonth(year: unknown, month: unknown) {
  if (!Number.isInteger(year) || (year as number) < 1800 || (year as number) > 2200
    || !Number.isInteger(month) || (month as number) < 1 || (month as number) > 12) {
    throw new AppError(400, '年月不正确');
  }
}

function checkDate(date: unknown): string {
  if (typeof date !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date)) {
    throw new AppError(400, '日期格式应为 YYYY-MM-DD');
  }
  return date;
}

function monthlyPath(userId: string, profileId: string, year: number, month: number): string {
  checkYearMonth(year, month);
  const mm = String(month).padStart(2, '0');
  return `${getProfileDir(userId, profileId)}/monthly/${year}-${mm}.yaml`;
}

function dailyPath(userId: string, profileId: string, date: string): string {
  return `${getProfileDir(userId, profileId)}/daily/${checkDate(date)}.yaml`;
}

// ── Week splitting ──

function splitMonthIntoWeeks(year: number, month: number): WeekBatch[] {
  const weeks: WeekBatch[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  let weekIndex = 0;
  let dayOfMonth = 1;

  while (dayOfMonth <= daysInMonth) {
    const startDay = dayOfMonth;
    const startDate = new Date(year, month - 1, dayOfMonth);
    const dayOfWeek = startDate.getDay(); // 0=Sun, 1=Mon...
    // Each week Mon-Sun; first batch starts from day 1 to first Sunday
    const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
    const endDay = Math.min(dayOfMonth + daysUntilSunday, daysInMonth);

    const dates: string[] = [];
    for (let d = startDay; d <= endDay; d++) {
      const mm = String(month).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      dates.push(`${year}-${mm}-${dd}`);
    }

    weeks.push({
      weekIndex,
      startDate: dates[0],
      endDate: dates[dates.length - 1],
      dates,
      generated: false,
    });

    weekIndex++;
    dayOfMonth = endDay + 1;
  }

  return weeks;
}

// ── Engine data for a single day ──

interface TimeSlotData {
  ganZhi: string;
  timeRange: string;
  tianShen: string;
  tianShenType: string;
  tianShenLuck: string;
  chong: string;
  sha: string;
  nineStar: string;
  yi: string[];
  ji: string[];
}

interface DayEngineData {
  date: string;
  lunarDate: string;
  dayGanZhi: string;
  tenGod: string;
  naYin: string;
  dayYi: string[];
  dayJi: string[];
  jiShen: string[];
  xiongSha: string[];
  tianShen: string;
  tianShenLuck: string;
  xiu: string;
  xiuLuck: string;
  // New enriched fields
  zhiXing: string;
  liuYao: string;
  yueXiang: string;
  wuHou: string;
  hou: string;
  season: string;
  yuanYun: string;
  dayNineStar: string;
  taiSuiPos: string;
  monthTaiSuiPos: string;
  pengZuGan: string;
  pengZuZhi: string;
  dayChong: string;
  daySha: string;
  timeSlots: TimeSlotData[];
}

export function computeDayData(dateStr: string, natalBazi: BaziChart): DayEngineData {
  // Use noon as default time for daily calculations
  const dayChart = getBaziChart(dateStr, '12:00', 'male');
  const dayGan = dayChart.pillars.day.gan;
  const dayZhi = dayChart.pillars.day.zhi;

  // tenGod = relationship between natal day master and this day's gan
  const natalDayGan = natalBazi.dayMaster.split('')[0];
  const tenGod = computeTenGod(natalDayGan, dayGan);

  const [yr, mo, dy] = dateStr.split('-').map(Number);
  const solar = Solar.fromYmd(yr, mo, dy);
  const lunar = solar.getLunar() as any;

  // Three-Yuan Nine-Yun
  const lunarYear = LunarYear.fromYear(lunar.getYear());
  const yuanYun = `${lunarYear.getYuan()}${lunarYear.getYun()}`;

  // 12 Shichen time slots
  const times = lunar.getTimes() as any[];
  const timeSlots: TimeSlotData[] = times.map((t: any) => ({
    ganZhi: t.getGanZhi() as string,
    timeRange: `${t.getMinHm()}-${t.getMaxHm()}`,
    tianShen: t.getTianShen() as string,
    tianShenType: t.getTianShenType() as string,
    tianShenLuck: t.getTianShenLuck() as string,
    chong: t.getChongDesc() as string,
    sha: t.getSha() as string,
    nineStar: t.getNineStar()?.toString() || '',
    yi: (t.getYi() || []) as string[],
    ji: (t.getJi() || []) as string[],
  }));

  return {
    date: dateStr,
    lunarDate: lunar.getDayInChinese(),
    dayGanZhi: `${dayGan}${dayZhi}`,
    tenGod,
    naYin: dayChart.pillars.day.naYin,
    dayYi: dayChart.dayYi || [],
    dayJi: dayChart.dayJi || [],
    jiShen: dayChart.jiShen || [],
    xiongSha: dayChart.xiongSha || [],
    tianShen: dayChart.tianShen || '',
    tianShenLuck: dayChart.tianShenLuck || '',
    xiu: dayChart.xiu || '',
    xiuLuck: dayChart.xiuLuck || '',
    zhiXing: dayChart.zhiXing || '',
    liuYao: lunar.getLiuYao() || '',
    yueXiang: lunar.getYueXiang() || '',
    wuHou: lunar.getWuHou() || '',
    hou: lunar.getHou() || '',
    season: lunar.getSeason() || '',
    yuanYun,
    dayNineStar: dayChart.nineStar?.day || '',
    taiSuiPos: `${lunar.getDayPositionTaiSui() || ''} ${lunar.getDayPositionTaiSuiDesc() || ''}`.trim(),
    monthTaiSuiPos: `${lunar.getMonthPositionTaiSui() || ''} ${lunar.getMonthPositionTaiSuiDesc() || ''}`.trim(),
    pengZuGan: dayChart.pengZuGan || '',
    pengZuZhi: dayChart.pengZuZhi || '',
    dayChong: dayChart.dayChongDesc || '',
    daySha: dayChart.daySha || '',
    timeSlots,
  };
}

// ── Ten God calculation ──

const GAN_ORDER = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const TEN_GOD_NAMES = ['比肩', '劫财', '食神', '伤官', '偏财', '正财', '七杀', '正官', '偏印', '正印'];

function computeTenGod(dayMasterGan: string, targetGan: string): string {
  const meIdx = GAN_ORDER.indexOf(dayMasterGan);
  const targetIdx = GAN_ORDER.indexOf(targetGan);
  if (meIdx < 0 || targetIdx < 0) return '';
  const diff = (targetIdx - meIdx + 10) % 10;
  return TEN_GOD_NAMES[diff];
}

// ── Score to rating ──

function scoreToRating(score: number): FortuneRating {
  if (score >= 82) return '大吉';
  if (score >= 64) return '吉';
  if (score >= 40) return '平';
  if (score >= 22) return '凶';
  return '大凶';
}

interface DeterministicFortuneScore {
  overallScore: number;
  dimensions: DailyFortune['dimensions'];
  factors: string[];
}

export function calculateFortuneScore(
  dayData: DayEngineData,
  natalBazi: BaziChart,
  flowContext?: FlowDayContext,
): DeterministicFortuneScore {
  const factors: string[] = [];
  let common = 55;
  const add = (value: number, label: string) => {
    common += value;
    if (value) factors.push(`${label}${value > 0 ? '+' : ''}${value}`);
  };

  add(dayData.tianShenLuck === '吉' ? 5 : dayData.tianShenLuck === '凶' ? -5 : 0, `天神${dayData.tianShen}`);
  const officerScore: Record<string, number> = { 成: 5, 开: 5, 除: 3, 定: 3, 建: 1, 满: 1, 平: 0, 收: 0, 执: -2, 危: -2, 破: -5, 闭: -5 };
  add(officerScore[dayData.zhiXing] ?? 0, `${dayData.zhiXing}日`);
  const sixDayScore: Record<string, number> = { 大安: 3, 速喜: 3, 友引: 2, 先胜: 1, 先负: -1, 赤口: -3, 佛灭: -4 };
  add(sixDayScore[dayData.liuYao] ?? 0, `六曜${dayData.liuYao}`);
  add(dayData.xiuLuck === '吉' ? 2 : dayData.xiuLuck === '凶' ? -2 : 0, `${dayData.xiu}宿`);
  add(Math.min(6, dayData.jiShen.length), '吉神');
  add(-Math.min(6, dayData.xiongSha.length), '凶煞');

  const natalDayZhi = natalBazi.pillars.day.zhi;
  const dayZhi = dayData.dayGanZhi.slice(1);
  const clash: Record<string, string> = { 子: '午', 午: '子', 丑: '未', 未: '丑', 寅: '申', 申: '寅', 卯: '酉', 酉: '卯', 辰: '戌', 戌: '辰', 巳: '亥', 亥: '巳' };
  if (clash[natalDayZhi] === dayZhi) add(-5, '流日冲日支');

  const strength = natalBazi.wuXingAnalysis?.dayMasterStrength;
  const strongTenGod: Record<string, number> = { 食神: 4, 伤官: 4, 偏财: 4, 正财: 4, 七杀: 2, 正官: 2, 偏印: -1, 正印: -1, 比肩: -2, 劫财: -3 };
  const weakTenGod: Record<string, number> = { 偏印: 5, 正印: 5, 比肩: 4, 劫财: 4, 食神: -2, 伤官: -2, 偏财: -4, 正财: -4, 七杀: -4, 正官: -3 };
  add((strength === '身强' ? strongTenGod : weakTenGod)[dayData.tenGod] ?? 0, `${strength || '中和'}遇${dayData.tenGod}`);

  const dimensions: DailyFortune['dimensions'] = {
    career: common,
    wealth: common,
    relationship: common,
    health: common,
    study: common,
  };
  const adjust = (key: keyof DailyFortune['dimensions'], value: number) => { dimensions[key] += value; };
  if (['正官', '七杀', '正印', '偏印'].includes(dayData.tenGod)) adjust('career', 4);
  if (['食神', '伤官'].includes(dayData.tenGod)) { adjust('career', 2); adjust('wealth', 3); adjust('study', 3); }
  if (['正财', '偏财'].includes(dayData.tenGod)) { adjust('wealth', 7); adjust('relationship', 3); adjust('study', -1); }
  if (['比肩', '劫财'].includes(dayData.tenGod)) { adjust('wealth', -5); adjust('relationship', -2); }
  if (['正印', '偏印'].includes(dayData.tenGod)) { adjust('study', 6); adjust('health', 2); }
  if (['正官', '七杀'].includes(dayData.tenGod)) adjust('health', -2);

  const palaceDimensions: Record<string, keyof DailyFortune['dimensions']> = {
    官禄: 'career', 财帛: 'wealth', 夫妻: 'relationship', 疾厄: 'health', 父母: 'study',
  };
  if (flowContext) {
    for (const [palace, dimension] of Object.entries(palaceDimensions)) {
      const siHua = flowContext.dailyPalaces[palace]?.siHua || [];
      for (const item of siHua) {
        if (item.includes('化禄')) adjust(dimension, 6);
        else if (item.includes('化科')) adjust(dimension, 4);
        else if (item.includes('化权')) adjust(dimension, 2);
        else if (item.includes('化忌')) adjust(dimension, -7);
      }
    }
  }

  for (const key of Object.keys(dimensions) as (keyof DailyFortune['dimensions'])[]) {
    dimensions[key] = Math.max(15, Math.min(90, Math.round(dimensions[key])));
  }
  const overallScore = Math.round(
    dimensions.career * 0.30 + dimensions.wealth * 0.25 + dimensions.relationship * 0.20
    + dimensions.health * 0.15 + dimensions.study * 0.10,
  );
  return { overallScore, dimensions, factors };
}

// ── LLM batch generation for a week ──

async function generateWeekFortunes(
  weekDates: DayEngineData[],
  natalBazi: BaziChart,
  profile: Profile,
  ziweiSiHua?: string,
  flowContextMap?: Map<string, FlowDayContext>,
): Promise<DailyFortune[]> {
  const wx = natalBazi.wuXingAnalysis;
  const currentDy = natalBazi.currentDaYun;
  const targetYear = Number(weekDates[0]?.date.slice(0, 4));
  const birthYear = Number(profile.birthDate.slice(0, 4));
  const targetAge = targetYear - birthYear;
  const targetDaYun = natalBazi.daYun.find((d) => targetAge >= d.startAge && targetAge < d.endAge) || currentDy;
  const pillar = (key: keyof BaziChart['pillars']) => {
    const p = natalBazi.pillars[key];
    return {
      ganZhi: `${p.gan}${p.zhi}`,
      naYin: p.naYin,
      ganTenGod: p.ganTenGod,
      zhiTenGods: p.zhiTenGods,
      hiddenStems: p.hideGanDetail,
      shenSha: p.shenSha || [],
      diShi: p.diShi,
      xunKong: p.xunKong,
    };
  };
  const natalCtx: Record<string, unknown> = {
    profileId: profile.profileId,
    name: profile.name,
    relation: profile.relation,
    birthDate: profile.birthDate,
    birthTime: profile.birthTime,
    gender: profile.gender === 'male' ? '男' : '女',
    birthPlace: profile.birthPlace,
    timezone: profile.timezone,
    dayMaster: `${natalBazi.dayMaster}（${natalBazi.dayMasterWuXing}）`,
    pillars: { year: pillar('year'), month: pillar('month'), day: pillar('day'), hour: pillar('hour') },
    wuXingPairs: natalBazi.wuXingPairs,
    wuXingCounts: wx?.counts || [],
    dayMasterStrength: wx?.dayMasterStrength || '',
    missingElements: wx?.missing?.join('') || '无',
    dominantElement: wx?.dominant || '',
    yearShenSha: natalBazi.pillars.year.shenSha || [],
    monthShenSha: natalBazi.pillars.month.shenSha || [],
    dayShenSha: natalBazi.pillars.day.shenSha || [],
    hourShenSha: natalBazi.pillars.hour.shenSha || [],
  };
  if (targetDaYun) natalCtx.targetDaYun = `${targetDaYun.gan}${targetDaYun.zhi}（${targetDaYun.startAge}-${targetDaYun.endAge}岁，按目标年份${targetYear}计算）`;
  if (ziweiSiHua) natalCtx.ziweiSiHua = ziweiSiHua;
  const scoreMap = new Map(weekDates.map((day) => [
    day.date,
    calculateFortuneScore(day, natalBazi, flowContextMap?.get(day.date)),
  ]));

  const daysYaml = yaml.dump({
    natalChart: natalCtx,
    days: weekDates.map((d) => {
      const dayObj: Record<string, unknown> = {
        date: d.date,
        lunar: d.lunarDate,
        ganZhi: d.dayGanZhi,
        tenGod: d.tenGod,
        naYin: d.naYin,
        zhiXing: d.zhiXing,
        liuYao: d.liuYao,
        yueXiang: d.yueXiang,
        wuHou: d.wuHou,
        hou: d.hou,
        season: d.season,
        yuanYun: d.yuanYun,
        dayNineStar: d.dayNineStar,
        taiSuiPos: d.taiSuiPos,
        monthTaiSuiPos: d.monthTaiSuiPos,
        xiu: d.xiu,
        xiuLuck: d.xiuLuck,
        pengZu: `${d.pengZuGan} ${d.pengZuZhi}`,
        chong: d.dayChong,
        sha: d.daySha,
        yi: d.dayYi,
        ji: d.dayJi,
        jiShen: d.jiShen,
        xiongSha: d.xiongSha,
        tianShen: d.tianShen,
        tianShenLuck: d.tianShenLuck,
        deterministicScore: scoreMap.get(d.date),
      };
      // Add ziwei flow-day palace context if available
      const fCtx = flowContextMap?.get(d.date);
      if (fCtx) {
        const palaces: Record<string, any> = {};
        for (const [name, info] of Object.entries(fCtx.dailyPalaces)) {
          palaces[name] = {
            本命星: info.natalStars.join(' ') || '无',
            流运星: info.flowStars.join(' ') || '无',
            四化: info.siHua.join(' ') || '无',
          };
        }
        dayObj.紫微流日宫位 = palaces;
        dayObj.流运四化 = fCtx.flowMutagen;
      }
      return dayObj;
    }),
  }, { indent: 2, noRefs: true });

  const dateList = weekDates.map((d) => d.date).join('、');

  const sysPrompt = `你是"天枢"，一位客观严谨的八字命理与紫微斗数运势分析师。请如实分析每日运势，让数据说话。

严格以 JSON 数组格式返回，每个元素对应一天：
[
  {
    "date": "YYYY-MM-DD",
    "overallScore": 0-100,
    "tagline": "8字以内短句点评",
    "overview": "3-5句话概括当日运势，通俗易懂，引用具体干支术语",
    "favorable": ["宜做的事1", "宜做的事2", "宜做的事3"],
    "unfavorable": ["忌做的事1", "忌做的事2"],
    "dimensions": {"career": 0-100, "wealth": 0-100, "relationship": 0-100, "health": 0-100, "study": 0-100}
  }
]

═══ 评分方法 ═══

评分已由本地命理规则引擎确定。输入中的 deterministicScore 包含 overallScore、dimensions 和加减分依据。
你必须原样复制其中的 overallScore 与 dimensions，只负责根据依据撰写文案，不得自行重新打分。

要求：
- 解释 deterministicScore.factors 中已经完成的加减分，不要另造与分数矛盾的吉凶依据
- 紫微流日宫位对应维度：事业看官禄宫、财运看财帛宫、感情看夫妻宫、健康看疾厄宫、学业看父母宫
- 化禄主利、化权主争、化科主名、化忌主困
- 综合参考：月相、九星+三元九运、太岁方位、彭祖百忌、日冲煞方、物候/节候
- tagline 客观反映当日特征，好日直说好，差日直说差
- 文案语气必须与确定性分数一致，不得为了谨慎把中性或吉日写成凶日

只输出 JSON 数组，不要其他文字。分析日期：${dateList}`;

  const messages: ChatMessage[] = [
    { role: 'system', content: sysPrompt },
    { role: 'user', content: daysYaml },
  ];

  const result = await chatCompletion(messages, {
    maxTokens: 30000,
    temperature: 0.15,
    enableThinking: false,
  });

  const raw = result.content.trim();

  try {
    let text = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    // Fix truncated JSON array
    if (!text.endsWith(']')) {
      const lastBrace = text.lastIndexOf('}');
      if (lastBrace > 0) {
        text = text.slice(0, lastBrace + 1) + ']';
      }
    }

    const parsed = JSON.parse(text) as any[];
    const fortunes: DailyFortune[] = [];

    for (const dayData of weekDates) {
      const llmDay = parsed.find((p: any) => p.date === dayData.date) || {};
      const engineScore = scoreMap.get(dayData.date)!;
      const score = engineScore.overallScore;

      fortunes.push({
        date: dayData.date,
        lunarDate: dayData.lunarDate,
        dayGanZhi: dayData.dayGanZhi,
        tenGod: dayData.tenGod,
        overallScore: score,
        rating: scoreToRating(score),
        tagline: llmDay.tagline || '平稳度日',
        overview: llmDay.overview || '',
        favorable: Array.isArray(llmDay.favorable) ? llmDay.favorable : dayData.dayYi.slice(0, 3),
        unfavorable: Array.isArray(llmDay.unfavorable) ? llmDay.unfavorable : dayData.dayJi.slice(0, 3),
        dimensions: engineScore.dimensions,
      });
    }

    return fortunes;
  } catch (err) {
    console.warn('[fortune] LLM JSON parse failed, using engine defaults', err);
    // Fallback: engine-only data with default scores
    return weekDates.map((d) => {
      const engineScore = scoreMap.get(d.date)!;
      return {
      date: d.date,
      lunarDate: d.lunarDate,
      dayGanZhi: d.dayGanZhi,
      tenGod: d.tenGod,
      overallScore: engineScore.overallScore,
      rating: scoreToRating(engineScore.overallScore),
      tagline: d.tianShenLuck === '吉' ? '吉神护佑' : '平稳度日',
      overview: '',
      favorable: d.dayYi.slice(0, 3),
      unfavorable: d.dayJi.slice(0, 3),
      dimensions: engineScore.dimensions,
    };
    });
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

function getZiweiSiHuaSummary(profile: Profile): string | undefined {
  try {
    const zw = getZiweiChart(profile.birthDate, profile.birthTime, profile.gender);
    const sh = zw.siHua;
    return `禄${sh.lu.star}(${sh.lu.palace}) 权${sh.quan.star}(${sh.quan.palace}) 科${sh.ke.star}(${sh.ke.palace}) 忌${sh.ji.star}(${sh.ji.palace})`;
  } catch {
    return undefined;
  }
}

async function computeWeekBatchFortunes(
  profile: Profile,
  natalBazi: BaziChart,
  week: WeekBatch,
  ziweiSiHua?: string,
): Promise<DailyFortune[]> {
  const engineDays = week.dates.map((dateStr) => computeDayData(dateStr, natalBazi));
  const flowContextMap = new Map<string, FlowDayContext>();
  for (const dateStr of week.dates) {
    try {
      flowContextMap.set(dateStr, getFlowDayContext(
        profile.birthDate,
        profile.birthTime,
        profile.gender,
        dateStr,
      ));
    } catch { /* A single Ziwei failure must not abort the whole week. */ }
  }
  return generateWeekFortunes(engineDays, natalBazi, profile, ziweiSiHua, flowContextMap);
}

// ── Public API ──

/**
 * Get or initialize monthly calendar data.
 * Returns existing data with week batch info.
 */
export async function getMonthlyCalendar(
  userId: string,
  profileId: string,
  year: number,
  month: number,
): Promise<MonthlyCalendar> {
  const path = monthlyPath(userId, profileId, year, month);
  const cached = await readYaml<MonthlyCalendar>(path);
  if (cached) return cached;

  // Initialize empty calendar with week structure
  const weeks = splitMonthIntoWeeks(year, month);
  const cal: MonthlyCalendar = {
    year,
    month,
    profileId,
    generatedAt: '',
    weeks,
    days: [],
  };
  return cal;
}

/**
 * Generate a single week batch for a month.
 * Returns the updated full MonthlyCalendar.
 */
export async function generateWeekBatch(
  userId: string,
  profileId: string,
  year: number,
  month: number,
  weekIndex: number,
): Promise<MonthlyCalendar> {
  const profile = await getProfile(userId, profileId);
  const natalBazi = getBaziChart(profile.birthDate, profile.birthTime, profile.gender);

  const ziweiSiHua = getZiweiSiHuaSummary(profile);

  // Load or init calendar
  const path = monthlyPath(userId, profileId, year, month);
  let cal = await readYaml<MonthlyCalendar>(path);
  if (!cal) {
    const weeks = splitMonthIntoWeeks(year, month);
    cal = { year, month, profileId, generatedAt: '', weeks, days: [] };
  }

  const week = cal.weeks[weekIndex];
  if (!week) throw new Error(`Invalid weekIndex: ${weekIndex}`);

  const fortunes = await computeWeekBatchFortunes(profile, natalBazi, week, ziweiSiHua);

  // Merge into calendar (replace existing days in this week's range)
  const weekDatesSet = new Set(week.dates);
  cal.days = cal.days.filter((d) => !weekDatesSet.has(d.date));
  cal.days.push(...fortunes);
  cal.days.sort((a, b) => a.date.localeCompare(b.date));

  // Mark week as generated
  week.generated = true;
  cal.generatedAt = new Date().toISOString();

  await writeYaml(path, cal);
  return cal;
}

/**
 * Generate all missing weeks with bounded parallelism, then persist once.
 * Returns the complete MonthlyCalendar.
 */
export async function generateFullMonth(
  userId: string,
  profileId: string,
  year: number,
  month: number,
  force = false,
): Promise<MonthlyCalendar> {
  const path = monthlyPath(userId, profileId, year, month);
  let cal = await readYaml<MonthlyCalendar>(path);
  if (!cal) {
    const weeks = splitMonthIntoWeeks(year, month);
    cal = { year, month, profileId, generatedAt: '', weeks, days: [] };
  }

  const targets = cal.weeks.filter((week) => force || !week.generated);
  if (!targets.length) return cal;

  // Do not call generateWeekBatch here: each invocation reads/writes the same
  // YAML and parallel calls would lose updates. Compute independently, merge
  // deterministically, and write exactly once.
  const profile = await getProfile(userId, profileId);
  const natalBazi = getBaziChart(profile.birthDate, profile.birthTime, profile.gender);
  const ziweiSiHua = getZiweiSiHuaSummary(profile);
  const generated = await mapWithConcurrency(targets, 3, async (week) => ({
    week,
    fortunes: await computeWeekBatchFortunes(profile, natalBazi, week, ziweiSiHua),
  }));

  const generatedDates = new Set(generated.flatMap(({ week }) => week.dates));
  cal.days = cal.days.filter((day) => !generatedDates.has(day.date));
  for (const { week, fortunes } of generated) {
    cal.days.push(...fortunes);
    const storedWeek = cal.weeks.find((item) => item.weekIndex === week.weekIndex);
    if (storedWeek) storedWeek.generated = true;
  }
  cal.days.sort((a, b) => a.date.localeCompare(b.date));
  cal.generatedAt = new Date().toISOString();
  await writeYaml(path, cal);

  return cal;
}

// ══════════════════════════════════════════════════════════
// ── Trend Data ──
// ══════════════════════════════════════════════════════════

/**
 * Aggregate trend data from monthly YAML files across a date range.
 */
export async function getFortuneTrend(
  userId: string,
  profileId: string,
  from: string,
  to: string,
): Promise<TrendData> {
  const points: TrendPoint[] = [];

  // Determine month range
  const startDate = new Date(from);
  const endDate = new Date(to);

  let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const lastMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

  while (cursor <= lastMonth) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth() + 1;
    const cal = await readYaml<MonthlyCalendar>(monthlyPath(userId, profileId, y, m));
    if (cal?.days) {
      for (const day of cal.days) {
        if (day.date >= from && day.date <= to && day.overallScore != null) {
          points.push({
            date: day.date,
            overall: day.overallScore,
            career: day.dimensions?.career ?? 0,
            wealth: day.dimensions?.wealth ?? 0,
            relationship: day.dimensions?.relationship ?? 0,
            health: day.dimensions?.health ?? 0,
            study: day.dimensions?.study ?? 0,
          });
        }
      }
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  // Sort by date
  points.sort((a, b) => a.date.localeCompare(b.date));

  return { profileId, from, to, points };
}

// ══════════════════════════════════════════════════════════
// ── Daily Detail (Layer 3) ──
// ══════════════════════════════════════════════════════════

/**
 * Get cached daily detail or return null.
 */
export async function getDailyDetail(
  userId: string,
  profileId: string,
  date: string,
): Promise<DailyDetail | null> {
  const path = dailyPath(userId, profileId, date);
  return readYaml<DailyDetail>(path);
}

/**
 * Generate daily detail for a specific date.
 * Combines bazi engine data, ziwei daily chart, and LLM deep analysis.
 */
export async function generateDailyDetail(
  userId: string,
  profileId: string,
  date: string,
): Promise<DailyDetail> {
  checkDate(date);
  const profile = await getProfile(userId, profileId);
  const natalBazi = getBaziChart(profile.birthDate, profile.birthTime, profile.gender);

  // Engine data for this day
  const dayData = computeDayData(date, natalBazi);

  // Ziwei flow-day context (rich palace + mutagen data)
  const flowCtx: FlowDayContext = getFlowDayContext(
    profile.birthDate,
    profile.birthTime,
    profile.gender,
    date,
  );
  const deterministicScore = calculateFortuneScore(dayData, natalBazi, flowCtx);

  // Load monthly card for this date as reference anchor
  let monthlyCardAnchor: Record<string, unknown> | null = null;
  try {
    const d = new Date(date);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const cal = await readYaml<MonthlyCalendar>(monthlyPath(userId, profileId, y, m));
    const card = cal?.days?.find(day => day.date === date);
    if (card) {
      monthlyCardAnchor = {
        overallScore: card.overallScore,
        rating: card.rating,
        tagline: card.tagline,
        overview: card.overview,
        dimensions: card.dimensions,
        favorable: card.favorable,
        unfavorable: card.unfavorable,
      };
    }
  } catch { /* ok */ }

  // Build context YAML for LLM
  const wxD = natalBazi.wuXingAnalysis;
  const currentDyD = natalBazi.currentDaYun;
  let ziweiSiHuaD = '';
  try {
    const zwD = getZiweiChart(profile.birthDate, profile.birthTime, profile.gender);
    const shD = zwD.siHua;
    ziweiSiHuaD = `禄${shD.lu.star}(${shD.lu.palace}) 权${shD.quan.star}(${shD.quan.palace}) 科${shD.ke.star}(${shD.ke.palace}) 忌${shD.ji.star}(${shD.ji.palace})`;
  } catch { /* ok */ }

  const natalCtx: Record<string, unknown> = {
    name: profile.name,
    dayMaster: `${natalBazi.dayMaster}（${natalBazi.dayMasterWuXing}）`,
    year: `${natalBazi.pillars.year.gan}${natalBazi.pillars.year.zhi}`,
    month: `${natalBazi.pillars.month.gan}${natalBazi.pillars.month.zhi}`,
    day: `${natalBazi.pillars.day.gan}${natalBazi.pillars.day.zhi}`,
    hour: `${natalBazi.pillars.hour.gan}${natalBazi.pillars.hour.zhi}`,
    wuXingPairs: natalBazi.wuXingPairs,
    dayMasterStrength: wxD?.dayMasterStrength || '',
    missingElements: wxD?.missing?.join('') || '无',
    dominantElement: wxD?.dominant || '',
    dayShenSha: natalBazi.pillars.day.shenSha || [],
  };
  if (currentDyD) natalCtx.currentDaYun = `${currentDyD.gan}${currentDyD.zhi}（${currentDyD.startAge}-${currentDyD.endAge}岁）`;
  if (ziweiSiHuaD) natalCtx.ziweiSiHua = ziweiSiHuaD;

  // Build readable palace context for LLM
  const palaceContext: Record<string, any> = {};
  for (const [name, info] of Object.entries(flowCtx.dailyPalaces)) {
    palaceContext[name] = {
      本命星曜: info.natalStars.join('、') || '无',
      流运星曜: info.flowStars.join('、') || '无',
      四化: info.siHua.join('、') || '无',
      长生12神: info.changsheng12 || '无',
    };
  }

  // Build time-slot summary for LLM
  const timeSlotsCtx = dayData.timeSlots.map((ts) => ({
    时辰: ts.ganZhi,
    时段: ts.timeRange,
    天神: `${ts.tianShen}(${ts.tianShenType})`,
    吉凶: ts.tianShenLuck,
    九星: ts.nineStar,
    冲: ts.chong,
    煞: ts.sha,
    宜: ts.yi.slice(0, 4),
    忌: ts.ji.slice(0, 4),
  }));

  const ctxObj: Record<string, unknown> = {
    natalChart: natalCtx,
    targetDate: date,
    lunarDate: dayData.lunarDate,
    dayGanZhi: dayData.dayGanZhi,
    tenGod: dayData.tenGod,
    naYin: dayData.naYin,
    zhiXing: dayData.zhiXing,
    liuYao: dayData.liuYao,
    yueXiang: dayData.yueXiang,
    wuHou: dayData.wuHou,
    hou: dayData.hou,
    season: dayData.season,
    yuanYun: dayData.yuanYun,
    dayNineStar: dayData.dayNineStar,
    taiSuiPos: dayData.taiSuiPos,
    monthTaiSuiPos: dayData.monthTaiSuiPos,
    pengZu: `${dayData.pengZuGan} ${dayData.pengZuZhi}`,
    dayChong: dayData.dayChong,
    daySha: dayData.daySha,
    dayYi: dayData.dayYi,
    dayJi: dayData.dayJi,
    jiShen: dayData.jiShen,
    xiongSha: dayData.xiongSha,
    tianShen: dayData.tianShen,
    tianShenLuck: dayData.tianShenLuck,
    xiu: dayData.xiu,
    xiuLuck: dayData.xiuLuck,
    十二时辰: timeSlotsCtx,
    紫微流日宫位: palaceContext,
    流运四化: flowCtx.flowMutagen,
    流日宫位映射: flowCtx.palaceMapping.daily,
    确定性评分: deterministicScore,
  };
  if (monthlyCardAnchor) ctxObj.月历参考 = monthlyCardAnchor;
  const contextYaml = yaml.dump(ctxObj, { indent: 2, noRefs: true });

  const sysPrompt = `你是"天枢"，一位客观严谨的八字命理与紫微斗数资深命理师。请如实分析运势，让数据说话。
请根据命主本命八字、流日干支数据和紫微流日宫位，为${date}生成深度每日运势详解。

严格以 JSON 格式返回（不要 markdown 代码块）：
{
  "overallScore": 0-100,
  "tagline": "8字以内短句",
  "overview": "3-5句总体概括，引用具体术语",
  "events": {
    "career": {"summary": "一句话", "details": "2-4句具体事件预测，引用星曜宫位"},
    "wealth": {"summary": "一句话", "details": "2-4句"},
    "relationship": {"summary": "一句话", "details": "2-4句"},
    "emotion": {"summary": "一句话", "details": "2-4句"},
    "health": {"summary": "一句话", "details": "2-4句"}
  },
  "hourlyFortune": [
    {"hour": "子时 (23-01)", "level": "great|good|neutral|bad|terrible", "tip": "简短建议"},
    ... (十二时辰完整)
  ],
  "directions": {
    "favorable": ["方位1", "方位2"],
    "unfavorable": ["方位"]
  },
  "luckyColor": "颜色",
  "luckyNumber": "数字",
  "favorable": [
    {"action": "宜做的事", "reason": "命理依据"},
    {"action": "...", "reason": "..."}
  ],
  "unfavorable": [
    {"action": "忌做的事", "reason": "命理依据"}
  ],
  "dimensions": {"career": 0-100, "wealth": 0-100, "relationship": 0-100, "health": 0-100, "study": 0-100}
}

═══ 评分方法 ═══
overallScore 与 dimensions 已由输入中的“确定性评分”计算完成，必须原样复制，不得自行重新打分：
- 吉因素（印星助身弱/食伤泄身强/黄道日/建除成开/化禄化科/吉神）→ 加分
- 凶因素（七杀克身弱/比劫夺财身强/黑道日/破危闭执/化忌落关键宫/凶煞/日冲日主）→ 减分
- overallScore = dimensions 加权均值（事业30% 财运25% 感情20% 健康15% 学业10%）
- 评分完全由数据驱动，不人为拉高或压低，如实反映
- 普通吉凶混合日通常为48-63分；两个以上明确吉象且无严重相冲时应达到64分以上
- 仅有明确且互相印证的严重凶象才应低于40分，不要因为谨慎而系统性压低分数
${monthlyCardAnchor ? `
**月历一致性要求：**
数据中包含"月历参考"字段，这是本日在月历卡片中已生成的评分和概述。
若月历参考来自旧评分版本，以“确定性评分”为唯一分数来源；月历重新生成后两者会自然一致。
文案以确定性评分的方向为准，在此基础上做更深入的展开分析。
` : ''}
分析要点：
1. events 必须基于"紫微流日宫位"中各宫的本命星曜+流运星曜+四化组合来断事：
   - career：看官禄宫 + 命宫 | wealth：看财帛宫 | relationship：看夫妻宫 + 迁移宫 | emotion：看夫妻宫 + 福德宫 | health：看疾厄宫
   - 每个 details 必须引用"XX星在XX宫"的具体组合及传统断语
2. 流运四化是关键：化禄主利、化权主争、化科主名、化忌主困。结合落宫断事。
3. hourlyFortune 参考"十二时辰"数据：天神吉凶、九星、冲煞、时辰宜忌，结合日主十神关系判断 level。
4. directions：日干喜用五行对应方位 + 避太岁方位 + 避煞方。
5. favorable/unfavorable：引用建除值星宜忌、六曜、彭祖百忌、日冲煞方。
6. 综合参考：九星+三元九运、二十八宿、物候/节候/季节。
7. 杜绝泛泛而谈！每段 details 至少引用2-3个具体术语。

只输出 JSON，不要任何其他文字。`;

  const messages: ChatMessage[] = [
    { role: 'system', content: sysPrompt },
    { role: 'user', content: contextYaml },
  ];

  const llmResult = await chatCompletion(messages, {
    maxTokens: 30000,
    temperature: 0.15,
    enableThinking: false,
  });

  const raw = llmResult.content.trim();
  let llm: any = {};

  try {
    let text = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    // Fix truncated JSON
    if (!text.endsWith('}')) {
      const lastBrace = text.lastIndexOf('}');
      if (lastBrace > 0) text = text.slice(0, lastBrace + 1);
    }
    llm = JSON.parse(text);
  } catch (err) {
    console.warn('[fortune] Daily detail LLM JSON parse failed, using defaults', err);
  }

  const score = deterministicScore.overallScore;

  // Parse events
  const events: Record<string, DimensionDetail> = {};
  const eventKeys = ['career', 'wealth', 'relationship', 'emotion', 'health'];
  for (const key of eventKeys) {
    const e = llm.events?.[key];
    events[key] = {
      summary: e?.summary || '',
      details: e?.details || '',
    };
  }

  // Parse hourly fortune — merge engine time-slot data with LLM tips
  const defaultHours = [
    '子时 (23-01)', '丑时 (01-03)', '寅时 (03-05)', '卯时 (05-07)',
    '辰时 (07-09)', '巳时 (09-11)', '午时 (11-13)', '未时 (13-15)',
    '申时 (15-17)', '酉时 (17-19)', '戌时 (19-21)', '亥时 (21-23)',
  ];
  const tianShenLuckToLevel = (luck: string): HourlyFortune['level'] => {
    if (luck === '吉') return 'good';
    if (luck === '凶') return 'bad';
    return 'neutral';
  };
  const hourlyFortune: HourlyFortune[] = defaultHours.map((hour, i) => {
    const h = Array.isArray(llm.hourlyFortune) ? llm.hourlyFortune[i] : null;
    const ts = dayData.timeSlots[i];
    const engineLevel = ts ? tianShenLuckToLevel(ts.tianShenLuck) : 'neutral';
    return {
      hour: h?.hour || hour,
      level: (['great', 'good', 'neutral', 'bad', 'terrible'].includes(h?.level) ? h.level : engineLevel) as HourlyFortune['level'],
      tip: h?.tip || (ts ? `${ts.tianShen}(${ts.tianShenType}) ${ts.nineStar}` : ''),
      ganZhi: ts?.ganZhi || '',
      tianShen: ts?.tianShen || '',
      tianShenType: ts?.tianShenType || '',
      nineStar: ts?.nineStar || '',
      chong: ts?.chong || '',
      sha: ts?.sha || '',
    };
  });

  // Parse favorable/unfavorable with reasons
  const detailedFavorable: ActionWithReason[] = Array.isArray(llm.favorable)
    ? llm.favorable.map((f: any) => ({ action: f?.action || '', reason: f?.reason || '' }))
    : dayData.dayYi.slice(0, 3).map((a) => ({ action: a, reason: '' }));

  const detailedUnfavorable: ActionWithReason[] = Array.isArray(llm.unfavorable)
    ? llm.unfavorable.map((u: any) => ({ action: u?.action || '', reason: u?.reason || '' }))
    : dayData.dayJi.slice(0, 3).map((a) => ({ action: a, reason: '' }));

  const detail: DailyDetail = {
    date,
    lunarDate: dayData.lunarDate,
    dayGanZhi: dayData.dayGanZhi,
    tenGod: dayData.tenGod,
    overallScore: score,
    rating: scoreToRating(score),
    tagline: llm.tagline || '平稳度日',
    overview: llm.overview || '',
    favorable: detailedFavorable.map((f) => f.action),
    unfavorable: detailedUnfavorable.map((u) => u.action),
    dimensions: deterministicScore.dimensions,
    flowContext: flowCtx,
    events,
    hourlyFortune,
    directions: {
      favorable: Array.isArray(llm.directions?.favorable) ? llm.directions.favorable : [],
      unfavorable: Array.isArray(llm.directions?.unfavorable) ? llm.directions.unfavorable : [],
    },
    luckyColor: llm.luckyColor || '',
    luckyNumber: llm.luckyNumber || '',
    detailedFavorable,
    detailedUnfavorable,
    dayMetadata: {
      zhiXing: dayData.zhiXing,
      liuYao: dayData.liuYao,
      yueXiang: dayData.yueXiang,
      wuHou: dayData.wuHou,
      hou: dayData.hou,
      season: dayData.season,
      yuanYun: dayData.yuanYun,
      dayNineStar: dayData.dayNineStar,
      taiSuiPos: dayData.taiSuiPos,
      monthTaiSuiPos: dayData.monthTaiSuiPos,
      pengZuGan: dayData.pengZuGan,
      pengZuZhi: dayData.pengZuZhi,
      dayChong: dayData.dayChong,
      daySha: dayData.daySha,
      naYin: dayData.naYin,
    },
  };

  const savePath = dailyPath(userId, profileId, date);
  await writeYaml(savePath, detail);
  return detail;
}
