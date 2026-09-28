/**
 * 玄空飞星风水引擎 (Xuan Kong Flying Star Feng Shui)
 *
 * 核心概念:
 * - 三元九运: 上元(1/2/3运), 中元(4/5/6运), 下元(7/8/9运), 每运20年
 * - 洛书九宫: 3×3 grid, 中宫起飞, 顺/逆飞
 * - 运盘 (Period Chart): 当运数入中宫, 顺飞
 * - 山盘 (Mountain Chart): 坐山方位的运盘数入中宫, 根据坐山阴阳顺逆飞
 * - 向盘 (Facing Chart): 朝向方位的运盘数入中宫, 根据朝向阴阳顺逆飞
 * - 九星吉凶: 当运旺星、退气、死气等判定
 */

// ── 三元九运 (San Yuan Jiu Yun) ──

const PERIOD_TABLE: Array<{ period: number; start: number; end: number; yuan: string }> = [
  { period: 1, start: 1864, end: 1883, yuan: '上元' },
  { period: 2, start: 1884, end: 1903, yuan: '上元' },
  { period: 3, start: 1904, end: 1923, yuan: '上元' },
  { period: 4, start: 1924, end: 1943, yuan: '中元' },
  { period: 5, start: 1944, end: 1963, yuan: '中元' },
  { period: 6, start: 1964, end: 1983, yuan: '中元' },
  { period: 7, start: 1984, end: 2003, yuan: '下元' },
  { period: 8, start: 2004, end: 2023, yuan: '下元' },
  { period: 9, start: 2024, end: 2043, yuan: '下元' },
  // Extended cycles
  { period: 1, start: 2044, end: 2063, yuan: '上元' },
  { period: 2, start: 2064, end: 2083, yuan: '上元' },
  { period: 3, start: 2084, end: 2103, yuan: '上元' },
];

export function getPeriod(year: number): { period: number; yuan: string } {
  for (const entry of PERIOD_TABLE) {
    if (year >= entry.start && year <= entry.end) {
      return { period: entry.period, yuan: entry.yuan };
    }
  }
  // Fallback: calculate cyclically (180-year cycle starting from 1864)
  const offset = ((year - 1864) % 180 + 180) % 180;
  const period = Math.floor(offset / 20) + 1;
  const yuanMap = ['上元', '上元', '上元', '中元', '中元', '中元', '下元', '下元', '下元'];
  return { period, yuan: yuanMap[period - 1] || '下元' };
}

// ── 洛书九宫飞星路径 (Luo Shu Flight Path) ──
// 九宫位置 (palace index 0-8):
//   4(巽SE) 9(离S)  2(坤SW)
//   3(震E)  5(中)   7(兑W)
//   8(艮NE) 1(坎N)  6(乾NW)
//
// 飞星顺序: 中→乾→兑→艮→离→坎→坤→震→巽
// Index mapping: 4→8→6→1→3→7→0→2→5 → (palace positions in flight order)

const FLIGHT_ORDER = [4, 3, 8, 1, 6, 7, 2, 9, 5]; // Star numbers at positions after flight from center

// Position index (0-8) to direction
const PALACE_NAMES = ['巽(东南)', '离(南)', '坤(西南)', '震(东)', '中宫', '兑(西)', '艮(东北)', '坎(北)', '乾(西北)'];
const PALACE_DIRS = ['SE', 'S', 'SW', 'E', 'C', 'W', 'NE', 'N', 'NW'];

// 原始洛书 (Original Luo Shu):
//  4 9 2
//  3 5 7
//  8 1 6
const LUOSHU = [4, 9, 2, 3, 5, 7, 8, 1, 6];

// Flight path: from center, the sequence of palace indices visited
// 中(4) → 乾(8) → 兑(5) → 艮(6) → 离(1) → 坎(7) → 坤(2) → 震(3) → 巽(0)
const FLIGHT_PATH_INDICES = [4, 8, 5, 6, 1, 7, 2, 3, 0];

/**
 * 飞星填盘: 给定入中宫的数字和飞行方向, 返回9宫各位置的星号
 * @param center 入中宫的数字 (1-9)
 * @param forward true=顺飞, false=逆飞
 * @returns 9元素数组, index对应九宫位置
 */
function flyStars(center: number, forward: boolean): number[] {
  const grid = new Array(9).fill(0);
  grid[4] = center; // Center palace

  for (let step = 1; step <= 8; step++) {
    const star = forward
      ? ((center - 1 + step) % 9) + 1
      : ((center - 1 - step + 90) % 9) + 1;
    grid[FLIGHT_PATH_INDICES[step]] = star;
  }

  return grid;
}

// ── 24山阴阳 (24 Mountains Yin/Yang for determining forward/reverse flight) ──
// 天元: 乾坤艮巽子午卯酉 (4阳4阴)
// 人元: 甲乙丙丁庚辛壬癸
// 地元: 寅申巳亥辰戌丑未

// 每山对应的阴阳 (true=阳, false=阴)
const MOUNTAIN_YINYANG: Record<string, boolean> = {
  壬: true,  子: true,  癸: false,
  丑: false, 艮: true,  寅: true,
  甲: true,  卯: false, 乙: false,
  辰: true,  巽: false, 巳: false,
  丙: true,  午: true,  丁: false,
  未: false, 坤: false, 申: true,
  庚: true,  酉: false, 辛: false,
  戌: true,  乾: true,  亥: false,
};

// 24山 → 九宫位置索引 (palace index 0-8)
const MOUNTAIN_TO_PALACE: Record<string, number> = {
  // 坎(北) = index 7
  壬: 7, 子: 7, 癸: 7,
  // 艮(东北) = index 6
  丑: 6, 艮: 6, 寅: 6,
  // 震(东) = index 3
  甲: 3, 卯: 3, 乙: 3,
  // 巽(东南) = index 0
  辰: 0, 巽: 0, 巳: 0,
  // 离(南) = index 1
  丙: 1, 午: 1, 丁: 1,
  // 坤(西南) = index 2
  未: 2, 坤: 2, 申: 2,
  // 兑(西) = index 5
  庚: 5, 酉: 5, 辛: 5,
  // 乾(西北) = index 8
  戌: 8, 乾: 8, 亥: 8,
};

// ── 九星意义 ──
const STAR_MEANINGS: Record<number, { name: string; wuXing: string; nature: string }> = {
  1: { name: '一白贪狼', wuXing: '水', nature: '吉（桃花、聪明、财运）' },
  2: { name: '二黑巨门', wuXing: '土', nature: '凶（病符、疾病、是非）' },
  3: { name: '三碧禄存', wuXing: '木', nature: '凶（口舌、官讼、盗贼）' },
  4: { name: '四绿文曲', wuXing: '木', nature: '吉（文昌、桃花、读书）' },
  5: { name: '五黄廉贞', wuXing: '土', nature: '大凶（灾祸、病伤）' },
  6: { name: '六白武曲', wuXing: '金', nature: '吉（权威、武贵、驿马）' },
  7: { name: '七赤破军', wuXing: '金', nature: '凶（退气、盗贼、口舌）' },
  8: { name: '八白左辅', wuXing: '土', nature: '大吉（当运旺财、旺丁）' },
  9: { name: '九紫右弼', wuXing: '火', nature: '吉（喜庆、桃花、未来旺气）' },
};

/**
 * 判断某星在当运的旺衰
 */
function getStarTimeliness(star: number, period: number): string {
  if (star === period) return '当旺';
  if (star === (period % 9) + 1) return '生气(未来旺)';
  // 退气: 前一运和前两运
  const prev1 = ((period - 2 + 9) % 9) + 1;
  const prev2 = ((period - 3 + 9) % 9) + 1;
  if (star === prev1) return '退气';
  if (star === prev2) return '衰气';
  if (star === 5) return '煞气(五黄)';
  return '死气';
}

// ── 度数 → 24山 ──
function degreeToMountain24(deg: number): string {
  const MOUNTAINS = [
    { name: '壬', start: 337.5, end: 352.5 },
    { name: '子', start: 352.5, end: 7.5 },
    { name: '癸', start: 7.5, end: 22.5 },
    { name: '丑', start: 22.5, end: 37.5 },
    { name: '艮', start: 37.5, end: 52.5 },
    { name: '寅', start: 52.5, end: 67.5 },
    { name: '甲', start: 67.5, end: 82.5 },
    { name: '卯', start: 82.5, end: 97.5 },
    { name: '乙', start: 97.5, end: 112.5 },
    { name: '辰', start: 112.5, end: 127.5 },
    { name: '巽', start: 127.5, end: 142.5 },
    { name: '巳', start: 142.5, end: 157.5 },
    { name: '丙', start: 157.5, end: 172.5 },
    { name: '午', start: 172.5, end: 187.5 },
    { name: '丁', start: 187.5, end: 202.5 },
    { name: '未', start: 202.5, end: 217.5 },
    { name: '坤', start: 217.5, end: 232.5 },
    { name: '申', start: 232.5, end: 247.5 },
    { name: '庚', start: 247.5, end: 262.5 },
    { name: '酉', start: 262.5, end: 277.5 },
    { name: '辛', start: 277.5, end: 292.5 },
    { name: '戌', start: 292.5, end: 307.5 },
    { name: '乾', start: 307.5, end: 322.5 },
    { name: '亥', start: 322.5, end: 337.5 },
  ];
  const n = ((deg % 360) + 360) % 360;
  for (const m of MOUNTAINS) {
    if (m.start > m.end) {
      if (n >= m.start || n < m.end) return m.name;
    } else {
      if (n >= m.start && n < m.end) return m.name;
    }
  }
  return '子';
}

// ── Main Analysis ──

export interface XuanKongPalace {
  position: string;     // e.g. "巽(东南)"
  direction: string;    // e.g. "SE"
  periodStar: number;   // 运盘星
  mountainStar: number; // 山盘星
  facingStar: number;   // 向盘星
  periodStarInfo: { name: string; wuXing: string; nature: string };
  mountainStarInfo: { name: string; wuXing: string; timeliness: string };
  facingStarInfo: { name: string; wuXing: string; timeliness: string };
  combo: string;        // 山向组合判断
}

export interface XuanKongResult {
  period: number;
  yuan: string;
  facingDegree: number;
  facingMountain: string;
  sittingMountain: string;
  facingDirection: string;
  sittingDirection: string;
  palaces: XuanKongPalace[];
  specialPatterns: string[];  // 特殊格局 (旺山旺向, 上山下水, 双星到向/到山, etc.)
}

/**
 * 玄空飞星排盘
 * @param facingDeg 朝向度数
 * @param year 建造年份 (or current year for existing buildings)
 */
export function analyzeXuanKong(facingDeg: number, year: number): XuanKongResult {
  const { period, yuan } = getPeriod(year);

  const facingMtn = degreeToMountain24(facingDeg);
  const sittingDeg = (facingDeg + 180) % 360;
  const sittingMtn = degreeToMountain24(sittingDeg);

  // 运盘: period number enters center, fly forward
  const periodGrid = flyStars(period, true);

  // 山盘: 坐山所在宫位的运盘数入中宫
  const sittingPalaceIdx = MOUNTAIN_TO_PALACE[sittingMtn] ?? 7;
  const mountainCenter = periodGrid[sittingPalaceIdx];
  const sittingIsYang = MOUNTAIN_YINYANG[sittingMtn] ?? true;
  // 阳山顺飞, 阴山逆飞 (based on original Luo Shu odd/even at sitting position)
  const mountainForward = sittingIsYang;
  const mountainGrid = flyStars(mountainCenter, mountainForward);

  // 向盘: 朝向所在宫位的运盘数入中宫
  const facingPalaceIdx = MOUNTAIN_TO_PALACE[facingMtn] ?? 1;
  const facingCenter = periodGrid[facingPalaceIdx];
  const facingIsYang = MOUNTAIN_YINYANG[facingMtn] ?? true;
  const facingForward = facingIsYang;
  const facingGrid = flyStars(facingCenter, facingForward);

  // Build palace data
  const palaces: XuanKongPalace[] = [];
  for (let i = 0; i < 9; i++) {
    const pStar = periodGrid[i];
    const mStar = mountainGrid[i];
    const fStar = facingGrid[i];

    const pInfo = STAR_MEANINGS[pStar] || { name: `${pStar}`, wuXing: '', nature: '' };
    const mInfo = STAR_MEANINGS[mStar] || { name: `${mStar}`, wuXing: '', nature: '' };
    const fInfo = STAR_MEANINGS[fStar] || { name: `${fStar}`, wuXing: '', nature: '' };

    // Combo analysis
    let combo = '';
    if (mStar === period && fStar === period) combo = '山向双旺（大吉）';
    else if (mStar === period) combo = '旺山（利丁）';
    else if (fStar === period) combo = '旺向（利财）';
    else if (mStar === 5 || fStar === 5) combo = '五黄到宫（凶）';
    else if (mStar === 2 && fStar === 5 || mStar === 5 && fStar === 2) combo = '二五交加（大凶，主疾病）';
    else {
      const mTime = getStarTimeliness(mStar, period);
      const fTime = getStarTimeliness(fStar, period);
      if (mTime.includes('旺') || fTime.includes('旺')) combo = '有旺气';
      else if (mTime.includes('死') && fTime.includes('死')) combo = '死气沉沉';
      else combo = '平';
    }

    palaces.push({
      position: PALACE_NAMES[i],
      direction: PALACE_DIRS[i],
      periodStar: pStar,
      mountainStar: mStar,
      facingStar: fStar,
      periodStarInfo: pInfo,
      mountainStarInfo: { ...mInfo, timeliness: getStarTimeliness(mStar, period) },
      facingStarInfo: { ...fInfo, timeliness: getStarTimeliness(fStar, period) },
      combo,
    });
  }

  // Detect special patterns
  const specialPatterns: string[] = [];
  const sittingPalace = palaces[sittingPalaceIdx];
  const facingPalace = palaces[facingPalaceIdx];

  if (sittingPalace?.mountainStar === period && facingPalace?.facingStar === period) {
    specialPatterns.push('旺山旺向（大吉格局：山星旺在坐方，向星旺在朝方，主旺丁旺财）');
  }
  if (sittingPalace?.facingStar === period && facingPalace?.mountainStar === period) {
    specialPatterns.push('上山下水（凶格局：山星旺到向方，向星旺到坐方，主损丁破财）');
  }
  if (facingPalace?.mountainStar === period && facingPalace?.facingStar === period) {
    specialPatterns.push('双星到向（利财不利丁）');
  }
  if (sittingPalace?.mountainStar === period && sittingPalace?.facingStar === period) {
    specialPatterns.push('双星到山（利丁不利财）');
  }

  // Check for 合十 (sum to 10)
  const centerMtn = mountainGrid[4];
  const centerFcg = facingGrid[4];
  if (centerMtn + centerFcg === 10) {
    specialPatterns.push('山向合十（和合之局）');
  }

  // Check for 伏吟/反吟
  let fuyin = true;
  let fanyin = true;
  for (let i = 0; i < 9; i++) {
    if (mountainGrid[i] !== periodGrid[i]) fuyin = false;
    if ((mountainGrid[i] + periodGrid[i]) !== 10) fanyin = false;
  }
  if (fuyin) specialPatterns.push('伏吟（呻吟之象，主悲伤）');
  if (fanyin) specialPatterns.push('反吟（反复之象，主动荡）');

  return {
    period,
    yuan,
    facingDegree: Math.round(facingDeg * 10) / 10,
    facingMountain: facingMtn,
    sittingMountain: sittingMtn,
    facingDirection: PALACE_NAMES[facingPalaceIdx],
    sittingDirection: PALACE_NAMES[sittingPalaceIdx],
    palaces,
    specialPatterns,
  };
}
