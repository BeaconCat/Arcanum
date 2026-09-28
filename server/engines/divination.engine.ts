/**
 * 占卜引擎 — 六爻起卦 + 梅花易数 + 奇门遁甲
 */
import * as LunarLib from 'lunar-javascript';
import { randomInt, randomUUID } from 'node:crypto';

const SolarClass = (LunarLib as any).Solar;

// ── 八卦基础数据 ──
const BA_GUA_NAMES = ['乾', '兑', '离', '震', '巽', '坎', '艮', '坤'];
const BA_GUA_NATURE = ['天', '泽', '火', '雷', '风', '水', '山', '地'];
const BA_GUA_WUXING = ['金', '金', '火', '木', '木', '水', '土', '土'];
const BA_GUA_SYMBOL = ['☰', '☱', '☲', '☳', '☴', '☵', '☶', '☷'];
// bit0/bit1/bit2 分别代表初爻、二爻、三爻（自下而上）。
const BA_GUA_BITS = [0b111, 0b011, 0b101, 0b001, 0b110, 0b010, 0b100, 0b000];

const GUA_64_NAMES: string[] = [
  '乾为天','天泽履','天火同人','天雷无妄','天风姤','天水讼','天山遁','天地否',
  '泽天夬','兑为泽','泽火革','泽雷随','泽风大过','泽水困','泽山咸','泽地萃',
  '火天大有','火泽睽','离为火','火雷噬嗑','火风鼎','火水未济','火山旅','火地晋',
  '雷天大壮','雷泽归妹','雷火丰','震为雷','雷风恒','雷水解','雷山小过','雷地豫',
  '风天小畜','风泽中孚','风火家人','风雷益','巽为风','风水涣','风山渐','风地观',
  '水天需','水泽节','水火既济','水雷屯','水风井','坎为水','水山蹇','水地比',
  '山天大畜','山泽损','山火贲','山雷颐','山风蛊','山水蒙','艮为山','山地剥',
  '地天泰','地泽临','地火明夷','地雷复','地风升','地水师','地山谦','坤为地',
];

const DI_ZHI = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];

// ── 接口 ──
export interface LiuYaoResult {
  method: string;
  castId: string;
  question: string;
  timestamp: string;
  monthGanZhi: string;
  dayGanZhi: string;
  upperGua: { name: string; symbol: string; nature: string; wuXing: string };
  lowerGua: { name: string; symbol: string; nature: string; wuXing: string };
  gua64Name: string;
  dongYao: number;
  dongYaoList: number[];
  bianGua: string;
  palace: string;
  palaceWuXing: string;
  yaoLines: {
    position: number;
    coinValue: 6 | 7 | 8 | 9;
    yinYang: '阳' | '阴';
    changedYinYang: '阳' | '阴';
    isDong: boolean;
    liuQin: string;
    diZhi: string;
    wuXing: string;
    liuShen: string;
    isShi: boolean;
    isYing: boolean;
  }[];
  shiYao: number;
  yingYao: number;
}

export interface MeiHuaResult {
  method: string;
  question: string;
  timestamp: string;
  upperGua: { name: string; symbol: string; nature: string; wuXing: string; number: number };
  lowerGua: { name: string; symbol: string; nature: string; wuXing: string; number: number };
  gua64Name: string;
  dongYao: number;
  bianGua: string;
  tiGua: string;
  yongGua: string;
  tiYongRelation: string;
}

export interface QiMenResult {
  timestamp: string;
  question: string;
  yearStar: NineStarInfo;
  monthStar: NineStarInfo;
  dayStar: NineStarInfo;
  timeStar: NineStarInfo;
  overallLuck: string;
  direction: string;
}

interface NineStarInfo {
  name: string;
  qiMen: string;
  baMen: string;
  luck: string;
  wuXing: string;
  position: string;
  color: string;
  taiYi: string;
  yinYang: string;
}

// ── 内部工具 ──
function guaIdx(num: number): number {
  const r = num % 8;
  return r === 0 ? 7 : r - 1;
}

function getGuaInfo(idx: number) {
  return { name: BA_GUA_NAMES[idx], symbol: BA_GUA_SYMBOL[idx], nature: BA_GUA_NATURE[idx], wuXing: BA_GUA_WUXING[idx] };
}

function get64Name(up: number, lo: number): string {
  return GUA_64_NAMES[up * 8 + lo] || `${BA_GUA_NAMES[up]}${BA_GUA_NAMES[lo]}`;
}

function flipYao(gIdx: number, yaoPos: number): number {
  const flipped = BA_GUA_BITS[gIdx] ^ (1 << yaoPos);
  const idx = BA_GUA_BITS.indexOf(flipped);
  return idx >= 0 ? idx : 0;
}

function getBianGua(up: number, lo: number, dong: number | number[]): string {
  let newUp = up, newLo = lo;
  for (const yao of Array.isArray(dong) ? dong : [dong]) {
    if (yao <= 3) { newLo = flipYao(newLo, yao - 1); }
    else { newUp = flipYao(newUp, yao - 4); }
  }
  return get64Name(newUp, newLo);
}

function getPalaceAndShiYing(up: number, lo: number): { palace: number; shi: number; ying: number } {
  const patterns = [
    { ux: 0b000, lx: 0b000, shi: 6 },
    { ux: 0b000, lx: 0b001, shi: 1 },
    { ux: 0b000, lx: 0b011, shi: 2 },
    { ux: 0b000, lx: 0b111, shi: 3 },
    { ux: 0b001, lx: 0b111, shi: 4 },
    { ux: 0b011, lx: 0b111, shi: 5 },
    { ux: 0b010, lx: 0b111, shi: 4 },
    { ux: 0b010, lx: 0b000, shi: 3 },
  ];
  for (let palace = 0; palace < BA_GUA_BITS.length; palace++) {
    const base = BA_GUA_BITS[palace];
    for (const pattern of patterns) {
      if ((base ^ pattern.ux) === BA_GUA_BITS[up] && (base ^ pattern.lx) === BA_GUA_BITS[lo]) {
        return { palace, shi: pattern.shi, ying: pattern.shi <= 3 ? pattern.shi + 3 : pattern.shi - 3 };
      }
    }
  }
  return { palace: up, shi: 6, ying: 3 };
}

function yaoYinYang(gIdx: number, yaoPos: number): '阳' | '阴' {
  return (BA_GUA_BITS[gIdx] & (1 << yaoPos)) ? '阳' : '阴';
}

function liuQinRelation(guaWx: string, yaoWx: string): string {
  if (guaWx === yaoWx) return '兄弟';
  const generates: Record<string, string> = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
  const controls: Record<string, string> = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
  if (generates[yaoWx] === guaWx) return '父母';
  if (generates[guaWx] === yaoWx) return '子孙';
  if (controls[yaoWx] === guaWx) return '官鬼';
  if (controls[guaWx] === yaoWx) return '妻财';
  return '兄弟';
}

function wuXingRelation(ti: string, yong: string): string {
  const map: Record<string, Record<string, string>> = {
    '金': { '金': '比和(平)', '水': '体生用(泄)', '木': '体克用(耗)', '火': '用克体(凶)', '土': '用生体(吉)' },
    '水': { '水': '比和(平)', '木': '体生用(泄)', '火': '体克用(耗)', '土': '用克体(凶)', '金': '用生体(吉)' },
    '木': { '木': '比和(平)', '火': '体生用(泄)', '土': '体克用(耗)', '金': '用克体(凶)', '水': '用生体(吉)' },
    '火': { '火': '比和(平)', '土': '体生用(泄)', '金': '体克用(耗)', '水': '用克体(凶)', '木': '用生体(吉)' },
    '土': { '土': '比和(平)', '金': '体生用(泄)', '水': '体克用(耗)', '木': '用克体(凶)', '火': '用生体(吉)' },
  };
  return map[ti]?.[yong] || '未知';
}

function extractNineStar(ns: any): NineStarInfo {
  return {
    name: ns.toString(),
    qiMen: ns.getNameInQiMen(),
    baMen: ns.getBaMenInQiMen(),
    luck: ns.getLuckInQiMen(),
    wuXing: ns.getWuXing(),
    position: `${ns.getPosition()} ${ns.getPositionDesc()}`,
    color: ns.getColor(),
    taiYi: ns.getNameInTaiYi(),
    yinYang: ns.getYinYangInQiMen(),
  };
}

// ── 六爻时间起卦 ──
export function liuYaoByTime(question: string): LiuYaoResult {
  const now = new Date();
  const solar = SolarClass.fromDate(now);
  const lunar = solar.getLunar() as any;

  // 三枚铜钱法：每爻独立掷三枚，字=2、背=3，六次自下而上成卦。
  // 使用系统密码学随机源，避免同一时辰内所有问题得到同一卦。
  const coinValues = Array.from({ length: 6 }, () => {
    const value = Array.from({ length: 3 }, () => randomInt(0, 2) === 0 ? 2 : 3)
      .reduce((sum, coin) => sum + coin, 0);
    return value as 6 | 7 | 8 | 9;
  });
  const lowerBits = coinValues.slice(0, 3).reduce((bits, value, i) => bits | ((value % 2) << i), 0);
  const upperBits = coinValues.slice(3, 6).reduce((bits, value, i) => bits | ((value % 2) << i), 0);
  const lo = BA_GUA_BITS.indexOf(lowerBits);
  const up = BA_GUA_BITS.indexOf(upperBits);
  const dongYaoList = coinValues.flatMap((value, index) => value === 6 || value === 9 ? [index + 1] : []);
  const { palace, shi, ying } = getPalaceAndShiYing(up, lo);
  const palaceWx = BA_GUA_WUXING[palace];
  const branchWx: Record<string, string> = {
    子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火',
    午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水',
  };
  const innerBranches: Record<string, string[]> = {
    乾: ['子', '寅', '辰'], 兑: ['巳', '卯', '丑'], 离: ['卯', '丑', '亥'], 震: ['子', '寅', '辰'],
    巽: ['丑', '亥', '酉'], 坎: ['寅', '辰', '午'], 艮: ['辰', '午', '申'], 坤: ['未', '巳', '卯'],
  };
  const outerBranches: Record<string, string[]> = {
    乾: ['午', '申', '戌'], 兑: ['亥', '酉', '未'], 离: ['酉', '未', '巳'], 震: ['午', '申', '戌'],
    巽: ['未', '巳', '卯'], 坎: ['申', '戌', '子'], 艮: ['戌', '子', '寅'], 坤: ['丑', '亥', '酉'],
  };
  const dayGan = lunar.getDayGan() as string;
  const sixGods = ['青龙', '朱雀', '勾陈', '螣蛇', '白虎', '玄武'];
  const godStart: Record<string, number> = { 甲: 0, 乙: 0, 丙: 1, 丁: 1, 戊: 2, 己: 3, 庚: 4, 辛: 4, 壬: 5, 癸: 5 };

  const yaoLines: LiuYaoResult['yaoLines'] = [];
  for (let pos = 1; pos <= 6; pos++) {
    const inUpper = pos > 3;
    const gIdx = inUpper ? up : lo;
    const yaoInGua = inUpper ? pos - 4 : pos - 1;
    const yy = yaoYinYang(gIdx, yaoInGua);
    const diZhi = (inUpper ? outerBranches : innerBranches)[BA_GUA_NAMES[gIdx]][yaoInGua];
    const yaoWx = branchWx[diZhi];
    const isDong = dongYaoList.includes(pos);
    yaoLines.push({
      position: pos,
      coinValue: coinValues[pos - 1],
      yinYang: yy,
      changedYinYang: isDong ? (yy === '阳' ? '阴' : '阳') : yy,
      isDong,
      liuQin: liuQinRelation(palaceWx, yaoWx),
      diZhi,
      wuXing: yaoWx,
      liuShen: sixGods[((godStart[dayGan] ?? 0) + pos - 1) % 6],
      isShi: pos === shi,
      isYing: pos === ying,
    });
  }

  return {
    method: '三枚铜钱自动起卦',
    castId: randomUUID(),
    question,
    timestamp: now.toISOString(),
    monthGanZhi: lunar.getMonthInGanZhiExact?.() || lunar.getMonthInGanZhi(),
    dayGanZhi: lunar.getDayInGanZhiExact?.() || lunar.getDayInGanZhi(),
    upperGua: getGuaInfo(up),
    lowerGua: getGuaInfo(lo),
    gua64Name: get64Name(up, lo),
    dongYao: dongYaoList[0] || 0,
    dongYaoList,
    bianGua: dongYaoList.length ? getBianGua(up, lo, dongYaoList) : get64Name(up, lo),
    palace: `${BA_GUA_NAMES[palace]}宫`,
    palaceWuXing: palaceWx,
    yaoLines,
    shiYao: shi,
    yingYao: ying,
  };
}

// ── 梅花易数（数字起卦）──
export function meiHuaByNumber(num1: number, num2: number, question: string): MeiHuaResult {
  const now = new Date();
  const solar = SolarClass.fromDate(now);
  const lunar = solar.getLunar() as any;
  const hourZhi = DI_ZHI.indexOf(lunar.getTimeZhi()) + 1;

  const up = guaIdx(num1);
  const lo = guaIdx(num2);
  const total = num1 + num2 + hourZhi;
  const dong = (total % 6) || 6;

  const upInfo = { ...getGuaInfo(up), number: num1 };
  const loInfo = { ...getGuaInfo(lo), number: num2 };

  // 体卦 = 动爻不在的那一卦
  const tiIsUpper = dong <= 3; // 动爻在下卦，体卦为上卦
  const tiGua = tiIsUpper ? BA_GUA_NAMES[up] : BA_GUA_NAMES[lo];
  const yongGua = tiIsUpper ? BA_GUA_NAMES[lo] : BA_GUA_NAMES[up];
  const tiWx = tiIsUpper ? BA_GUA_WUXING[up] : BA_GUA_WUXING[lo];
  const yongWx = tiIsUpper ? BA_GUA_WUXING[lo] : BA_GUA_WUXING[up];

  return {
    method: '数字起卦',
    question,
    timestamp: now.toISOString(),
    upperGua: upInfo,
    lowerGua: loInfo,
    gua64Name: get64Name(up, lo),
    dongYao: dong,
    bianGua: getBianGua(up, lo, dong),
    tiGua,
    yongGua,
    tiYongRelation: wuXingRelation(tiWx, yongWx),
  };
}

// ── 梅花易数（汉字笔画起卦）──
export function meiHuaByChar(char: string, strokes: number, question: string): MeiHuaResult {
  const now = new Date();
  const solar = SolarClass.fromDate(now);
  const lunar = solar.getLunar() as any;
  const hourZhi = DI_ZHI.indexOf(lunar.getTimeZhi()) + 1;

  const up = guaIdx(strokes);
  const lo = guaIdx(strokes + hourZhi);
  const dong = ((strokes + hourZhi) % 6) || 6;

  const upInfo = { ...getGuaInfo(up), number: strokes };
  const loInfo = { ...getGuaInfo(lo), number: strokes + hourZhi };

  const tiIsUpper = dong <= 3;
  const tiGua = tiIsUpper ? BA_GUA_NAMES[up] : BA_GUA_NAMES[lo];
  const yongGua = tiIsUpper ? BA_GUA_NAMES[lo] : BA_GUA_NAMES[up];
  const tiWx = tiIsUpper ? BA_GUA_WUXING[up] : BA_GUA_WUXING[lo];
  const yongWx = tiIsUpper ? BA_GUA_WUXING[lo] : BA_GUA_WUXING[up];

  return {
    method: `汉字起卦「${char}」(${strokes}画)`,
    question,
    timestamp: now.toISOString(),
    upperGua: upInfo,
    lowerGua: loInfo,
    gua64Name: get64Name(up, lo),
    dongYao: dong,
    bianGua: getBianGua(up, lo, dong),
    tiGua,
    yongGua,
    tiYongRelation: wuXingRelation(tiWx, yongWx),
  };
}

// ── 梅花易数（时间起卦）──
export function meiHuaByTime(question: string): MeiHuaResult {
  const now = new Date();
  const solar = SolarClass.fromDate(now);
  const lunar = solar.getLunar() as any;

  const yearZhi = DI_ZHI.indexOf(lunar.getYearZhi()) + 1;
  const monthNum = Math.abs(lunar.getMonth());
  const dayNum = Math.abs(lunar.getDay());
  const hourZhi = DI_ZHI.indexOf(lunar.getTimeZhi()) + 1;

  const upperNum = yearZhi + monthNum + dayNum;
  const lowerNum = upperNum + hourZhi;

  const up = guaIdx(upperNum);
  const lo = guaIdx(lowerNum);
  const dong = (lowerNum % 6) || 6;

  const upInfo = { ...getGuaInfo(up), number: upperNum };
  const loInfo = { ...getGuaInfo(lo), number: lowerNum };

  const tiIsUpper = dong <= 3;
  const tiGua = tiIsUpper ? BA_GUA_NAMES[up] : BA_GUA_NAMES[lo];
  const yongGua = tiIsUpper ? BA_GUA_NAMES[lo] : BA_GUA_NAMES[up];
  const tiWx = tiIsUpper ? BA_GUA_WUXING[up] : BA_GUA_WUXING[lo];
  const yongWx = tiIsUpper ? BA_GUA_WUXING[lo] : BA_GUA_WUXING[up];

  return {
    method: '时间起卦',
    question,
    timestamp: now.toISOString(),
    upperGua: upInfo,
    lowerGua: loInfo,
    gua64Name: get64Name(up, lo),
    dongYao: dong,
    bianGua: getBianGua(up, lo, dong),
    tiGua,
    yongGua,
    tiYongRelation: wuXingRelation(tiWx, yongWx),
  };
}

// ── 奇门遁甲（基于 lunar-javascript NineStar）──
export function qiMenByTime(question: string): QiMenResult {
  const now = new Date();
  const solar = SolarClass.fromDate(now);
  const lunar = solar.getLunar() as any;

  const yearNS = extractNineStar(lunar.getYearNineStar());
  const monthNS = extractNineStar(lunar.getMonthNineStar());
  const dayNS = extractNineStar(lunar.getDayNineStar());
  const timeNS = extractNineStar(lunar.getTimeNineStar());

  // 综合吉凶判断
  const luckMap: Record<string, number> = { '大吉': 2, '小吉': 1, '中': 0, '小凶': -1, '大凶': -2 };
  const totalLuck = [yearNS, monthNS, dayNS, timeNS].reduce((s, ns) => s + (luckMap[ns.luck] ?? 0), 0);
  let overallLuck = '中平';
  if (totalLuck >= 4) overallLuck = '大吉';
  else if (totalLuck >= 2) overallLuck = '吉';
  else if (totalLuck >= 0) overallLuck = '中平';
  else if (totalLuck >= -2) overallLuck = '凶';
  else overallLuck = '大凶';

  // 最佳方位取日星方位
  const direction = dayNS.position;

  return {
    timestamp: now.toISOString(),
    question,
    yearStar: yearNS,
    monthStar: monthNS,
    dayStar: dayNS,
    timeStar: timeNS,
    overallLuck,
    direction,
  };
}
