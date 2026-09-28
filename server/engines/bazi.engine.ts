import { Solar } from 'lunar-javascript';
import type { BaziChart, BaziPillar, DaYunStep, HideGanInfo, WuXingAnalysis, WuXingCount } from '../../shared/types/bazi.types';

// ── Lunisolar (char8ex for per-pillar shensha) ──────────────
import { createRequire } from 'node:module';
const _require = createRequire(import.meta.url);
const lunisolar = _require('lunisolar');
const char8ex = _require('@lunisolar/plugin-char8ex').char8ex;
const zhCn = _require('lunisolar/locale/zh-cn');
const char8exZhCn = _require('@lunisolar/plugin-char8ex/locale/zh-cn');

lunisolar.extend(char8ex);
lunisolar.locale(zhCn);
try { lunisolar.locale(char8exZhCn); } catch { /* ok if not available */ }

// ── WuXing mappings ───────────────────────────────────────
const GAN_WUXING: Record<string, string> = {
  '甲': '木', '乙': '木', '丙': '火', '丁': '火', '戊': '土',
  '己': '土', '庚': '金', '辛': '金', '壬': '水', '癸': '水',
};
const ZHI_WUXING: Record<string, string> = {
  '子': '水', '丑': '土', '寅': '木', '卯': '木', '辰': '土',
  '巳': '火', '午': '火', '未': '土', '申': '金', '酉': '金', '戌': '土', '亥': '水',
};

const NAYIN_WUXING_MAP: Record<string, string> = {
  '海中金': '金', '剑锋金': '金', '白蜡金': '金', '砂中金': '金', '金箔金': '金', '钗钏金': '金',
  '炉中火': '火', '山头火': '火', '霹雳火': '火', '山下火': '火', '佛灯火': '火', '天上火': '火',
  '涧下水': '水', '大溪水': '水', '长流水': '水', '天河水': '水', '泉中水': '水', '大海水': '水',
  '大林木': '木', '杨柳木': '木', '松柏木': '木', '平地木': '木', '桑柘木': '木', '石榴木': '木',
  '壁上土': '土', '城头土': '土', '沙中土': '土', '路旁土': '土', '大驿土': '土', '屋上土': '土',
};

// 五行旺相休囚死 (based on month zhi → season)
const ZHI_SEASON: Record<string, string> = {
  '寅': '春', '卯': '春', '辰': '春',
  '巳': '夏', '午': '夏', '未': '夏',
  '申': '秋', '酉': '秋', '戌': '秋',
  '亥': '冬', '子': '冬', '丑': '冬',
};
const WUXING_STATUS_TABLE: Record<string, Record<string, string>> = {
  '春': { '木': '旺', '火': '相', '水': '休', '金': '囚', '土': '死' },
  '夏': { '火': '旺', '土': '相', '木': '休', '水': '囚', '金': '死' },
  '秋': { '金': '旺', '水': '相', '土': '休', '火': '囚', '木': '死' },
  '冬': { '水': '旺', '木': '相', '金': '休', '土': '囚', '火': '死' },
};

// 自坐关系 (日干对日支的十神关系)
function getZiZuo(ganTenGods: string[]): string {
  if (!ganTenGods || ganTenGods.length === 0) return '';
  // 日支本气(第一个藏干)的十神关系
  return ganTenGods[0] || '';
}

// 十神表
const GAN_LIST = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const TEN_GOD_NAMES: Record<number, [string, string]> = {
  0: ['比肩', '劫财'], 2: ['食神', '伤官'], 4: ['偏财', '正财'],
  6: ['七杀', '正官'], 8: ['偏印', '正印'],
};
function getTenGod(dayGan: string, targetGan: string): string {
  const di = GAN_LIST.indexOf(dayGan);
  const ti = GAN_LIST.indexOf(targetGan);
  if (di < 0 || ti < 0) return '';
  const dayElement = Math.floor(di / 2);
  const targetElement = Math.floor(ti / 2);
  const relation = (targetElement - dayElement + 5) % 5;
  const samePolarity = di % 2 === ti % 2;
  // elements ordered 木火土金水: target relative to day = same/output/wealth/officer/resource
  const names: Record<number, [string, string]> = {
    0: ['比肩', '劫财'], 1: ['食神', '伤官'], 2: ['偏财', '正财'],
    3: ['七杀', '正官'], 4: ['偏印', '正印'],
  };
  return names[relation][samePolarity ? 0 : 1];
}

export function getTenGodForStem(dayGan: string, targetGan: string): string {
  return getTenGod(dayGan, targetGan);
}

// ── Per-pillar Shen Sha via lunisolar char8ex ──────────────
// char8ex provides pillar.gods with comprehensive shensha per pillar

// Shensha now computed by lunisolar char8ex plugin — see getBaziChart()

// ── Main Function ──────────────────────────────────────────

export function getBaziChart(
  birthDate: string,
  birthTime: string,
  gender: 'male' | 'female',
): BaziChart {
  const [year, month, day] = birthDate.split('-').map(Number);
  const [hour, minute] = birthTime.split(':').map(Number);

  const solar = Solar.fromYmdHms(year, month, day, hour, minute, 0);
  const lunar = solar.getLunar();
  const ec: any = lunar.getEightChar();

  const dayGan = ec.getDayGan() as string;
  const monthZhi = ec.getMonthZhi() as string;

  // ── Lunisolar char8ex for per-pillar shensha ──
  const dateStr = `${birthDate} ${birthTime}`;
  const lsInstance = lunisolar(dateStr);
  const c8ex: any = lsInstance.char8ex(gender === 'male' ? 1 : 0);

  // Build pillars with shenSha from char8ex
  function buildPillar(
    prefix: 'Year' | 'Month' | 'Day' | 'Time',
    c8Key: 'year' | 'month' | 'day' | 'hour',
    isDay: boolean,
  ): BaziPillar {
    const gan = ec[`get${prefix}Gan`]() as string;
    const zhi = ec[`get${prefix}Zhi`]() as string;
    const hideGan = ec[`get${prefix}HideGan`]() as string[];
    const zhiTenGods = ec[`get${prefix}ShiShenZhi`]() as string[];
    const naYin = ec[`get${prefix}NaYin`]() as string;

    // Per-pillar shensha from lunisolar char8ex
    let shenSha: string[] = [];
    try {
      const pillar = c8ex[c8Key];
      shenSha = pillar.gods.map((g: any) => g.name as string);
    } catch { /* fallback empty */ }

    const hideGanDetail: HideGanInfo[] = hideGan.map((g, i) => ({
      gan: g,
      wuXing: GAN_WUXING[g] || '',
      tenGod: isDay ? (i === 0 ? '日元' : getTenGod(dayGan, g)) : getTenGod(dayGan, g),
    }));

    return {
      gan,
      zhi,
      ganWuXing: GAN_WUXING[gan] || '',
      zhiWuXing: ZHI_WUXING[zhi] || '',
      ganTenGod: isDay ? '日主' : (ec[`get${prefix}ShiShenGan`]() as string),
      zhiTenGods,
      hideGan,
      hideGanDetail,
      wuXing: ec[`get${prefix}WuXing`]() as string,
      naYin,
      naYinWuXing: NAYIN_WUXING_MAP[naYin] || '',
      xunKong: ec[`get${prefix}XunKong`]() as string,
      diShi: ec[`get${prefix}DiShi`]() as string,
      shenSha,
      ziZuo: getZiZuo(zhiTenGods),
    };
  }

  const pillars = {
    year: buildPillar('Year', 'year', false),
    month: buildPillar('Month', 'month', false),
    day: buildPillar('Day', 'day', true),
    hour: buildPillar('Time', 'hour', false),
  };

  // Cast lunar for accessing all methods
  const L = lunar as any;

  // Birth info
  const jieQi = lunar.getPrevJieQi();
  const birthInfo = {
    solarDate: birthDate,
    lunarDate: `${lunar.getYearInChinese()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
    solarTime: birthTime,
    jieQi: jieQi?.getName() || '',
    jieQiInfo: jieQi ? `出生于${jieQi.getName()}之后` : '',
    shengXiao: L.getYearShengXiao() as string,
  };

  // Wu Xing pairs
  const wuXingPairs = L.getBaZiWuXing() as string[];

  // Shen Sha (day-level from library)
  const jiShen = L.getDayJiShen() as string[];
  const xiongSha = L.getDayXiongSha() as string[];

  // Zhi Xing / Tian Shen (day & time)
  const zhiXing = L.getZhiXing() as string;
  const tianShen = L.getDayTianShen() as string;
  const tianShenType = L.getDayTianShenType() as string;
  const tianShenLuck = L.getDayTianShenLuck() as string;
  const timeTianShen = L.getTimeTianShen() as string;
  const timeTianShenType = L.getTimeTianShenType() as string;
  const timeTianShenLuck = L.getTimeTianShenLuck() as string;

  // Peng Zu (彭祖百忌)
  const pengZuGan = L.getPengZuGan() as string;
  const pengZuZhi = L.getPengZuZhi() as string;

  // Chong / Sha (冲煞)
  const dayChong = L.getDayChong() as string;
  const dayChongDesc = L.getDayChongDesc() as string;
  const daySha = L.getDaySha() as string;
  const timeChong = L.getTimeChong() as string;
  const timeChongDesc = L.getTimeChongDesc() as string;
  const timeSha = L.getTimeSha() as string;

  // Day Lu (禄)
  const dayLu = L.getDayLu() as string;

  // Positions (方位)
  const dayPosition = {
    xi: L.getDayPositionXi() as string,
    xiDesc: L.getDayPositionXiDesc() as string,
    yangGui: L.getDayPositionYangGui() as string,
    yangGuiDesc: L.getDayPositionYangGuiDesc() as string,
    yinGui: L.getDayPositionYinGui() as string,
    yinGuiDesc: L.getDayPositionYinGuiDesc() as string,
    fu: L.getDayPositionFu() as string,
    fuDesc: L.getDayPositionFuDesc() as string,
    cai: L.getDayPositionCai() as string,
    caiDesc: L.getDayPositionCaiDesc() as string,
  };

  // Nine Stars (九星)
  const nineStar = {
    year: L.getYearNineStar()?.toString() || '',
    month: L.getMonthNineStar()?.toString() || '',
    day: L.getDayNineStar()?.toString() || '',
    time: L.getTimeNineStar()?.toString() || '',
  };

  // Xiu / Constellation (二十八宿)
  const xiu = L.getXiu() as string;
  const xiuLuck = L.getXiuLuck() as string;
  const xiuSong = L.getXiuSong() as string;
  const zheng = L.getZheng() as string;
  const animal = L.getAnimal() as string;
  const gong = L.getGong() as string;
  const shou = L.getShou() as string;

  // Day Yi / Ji (宜忌)
  const dayYi = L.getDayYi() as string[];
  const dayJi = L.getDayJi() as string[];
  const timeYi = L.getTimeYi() as string[];
  const timeJi = L.getTimeJi() as string[];

  // Tai position (胎神)
  const dayPositionTai = L.getDayPositionTai() as string;

  // Tai Yuan / Tai Xi / Ming Gong / Shen Gong
  const taiYuan = ec.getTaiYuan();
  const taiYuanNaYin = ec.getTaiYuanNaYin();
  const taiXi = ec.getTaiXi();
  const taiXiNaYin = ec.getTaiXiNaYin();
  const mingGong = ec.getMingGong();
  const mingGongNaYin = ec.getMingGongNaYin();
  const shenGong = ec.getShenGong();
  const shenGongNaYin = ec.getShenGongNaYin();

  // Da Yun
  const genderValue = gender === 'male' ? 1 : 0;
  const yun = ec.getYun(genderValue);
  const daYunList = yun.getDaYun();

  const daYun: DaYunStep[] = daYunList.map((dy: any) => ({
    gan: dy.getGanZhi ? dy.getGanZhi().substring(0, 1) : '',
    zhi: dy.getGanZhi ? dy.getGanZhi().substring(1) : '',
    startAge: dy.getStartAge(),
    endAge: dy.getEndAge(),
  }));

  const now = new Date();
  const age = now.getFullYear() - year;
  const currentDaYun = daYun.find((d) => age >= d.startAge && age < d.endAge) || null;

  const dayMasterWuXing = (ec.getDayWuXing() as string).substring(0, 1);

  // ── WuXing Analysis ──
  const wxCounts: Record<string, number> = { '金': 0, '木': 0, '水': 0, '火': 0, '土': 0 };
  // Count from 4 pillars: gan + all hideGan (支中藏干)
  (['year', 'month', 'day', 'hour'] as const).forEach(key => {
    const p = pillars[key];
    wxCounts[p.ganWuXing] = (wxCounts[p.ganWuXing] || 0) + 1;
    p.hideGanDetail.forEach(h => {
      wxCounts[h.wuXing] = (wxCounts[h.wuXing] || 0) + 1;
    });
  });

  const season = ZHI_SEASON[monthZhi] || '春';
  const statusTable = WUXING_STATUS_TABLE[season] || {};
  const wuXingCountList: WuXingCount[] = ['木', '火', '土', '金', '水'].map(el => ({
    element: el,
    count: wxCounts[el] || 0,
    status: statusTable[el] || '',
  }));
  const missingElements = wuXingCountList.filter(w => w.count === 0).map(w => w.element);
  const dominantElement = wuXingCountList.reduce((a, b) => b.count > a.count ? b : a).element;

  // Day master strength: count same + 生我 elements
  const SHENG_MAP: Record<string, string> = { '木': '水', '火': '木', '土': '火', '金': '土', '水': '金' };
  const helpCount = (wxCounts[dayMasterWuXing] || 0) + (wxCounts[SHENG_MAP[dayMasterWuXing]] || 0);
  const totalChars = Object.values(wxCounts).reduce((a, b) => a + b, 0);
  const dayMasterStrength = helpCount > totalChars / 2 ? '身强' : helpCount < totalChars / 2 ? '身弱' : '中和';

  const wuXingAnalysis: WuXingAnalysis = {
    counts: wuXingCountList,
    missing: missingElements,
    dominant: dominantElement,
    dayMasterStrength,
  };

  return {
    birthInfo,
    pillars,
    dayMaster: dayGan,
    dayMasterWuXing,
    wuXingPairs,
    wuXingAnalysis,
    taiYuan,
    taiYuanNaYin,
    taiXi,
    taiXiNaYin,
    mingGong,
    mingGongNaYin,
    shenGong,
    shenGongNaYin,
    jiShen,
    xiongSha,
    zhiXing,
    tianShen,
    tianShenType,
    tianShenLuck,
    timeTianShen,
    timeTianShenType,
    timeTianShenLuck,
    pengZuGan,
    pengZuZhi,
    dayChong,
    dayChongDesc,
    daySha,
    timeChong,
    timeChongDesc,
    timeSha,
    dayLu,
    dayPosition,
    nineStar,
    xiu,
    xiuLuck,
    xiuSong,
    zheng,
    animal,
    gong,
    shou,
    dayYi,
    dayJi,
    timeYi,
    timeJi,
    dayPositionTai,
    daYun,
    currentDaYun,
  };
}

// ── Utility Exports ────────────────────────────────────────

export function getDayGanZhi(date: string): { gan: string; zhi: string; ganZhi: string } {
  const [y, m, d] = date.split('-').map(Number);
  const solar = Solar.fromYmd(y, m, d);
  const lunar = solar.getLunar();
  const ganZhi = lunar.getDayInGanZhi();
  return { gan: ganZhi.substring(0, 1), zhi: ganZhi.substring(1), ganZhi };
}

export function getTenGodForDay(dayMaster: string, date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const solar = Solar.fromYmd(y, m, d);
  const ec = solar.getLunar().getEightChar();
  const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  const TEN_GODS: Record<number, [string, string]> = {
    0: ['比肩', '劫财'], 2: ['食神', '伤官'], 4: ['偏财', '正财'],
    6: ['七杀', '正官'], 8: ['偏印', '正印'],
  };
  const dmIdx = GAN.indexOf(dayMaster);
  const tgIdx = GAN.indexOf(ec.getDayGan());
  if (dmIdx < 0 || tgIdx < 0) return '未知';
  const diff = (tgIdx - dmIdx + 10) % 10;
  const pair = TEN_GODS[diff - (diff % 2)];
  return pair ? pair[diff % 2] : '未知';
}

export function getLunarDateString(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const solar = Solar.fromYmd(y, m, d);
  const lunar = solar.getLunar();
  return `${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`;
}
