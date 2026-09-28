/**
 * 风水引擎 — 基础方位/坐向分析
 *
 * - 八宅法 (Eight Mansions)
 * - 坐山朝向 → 东四宅/西四宅判定
 * - 命卦计算（男女年命→东四命/西四命）
 * - 八方吉凶方位
 */

// 后天八卦方位
const BAGUA: Record<string, { direction: string; wuXing: string; degree: [number, number] }> = {
  坎: { direction: '北', wuXing: '水', degree: [337.5, 22.5] },
  艮: { direction: '东北', wuXing: '土', degree: [22.5, 67.5] },
  震: { direction: '东', wuXing: '木', degree: [67.5, 112.5] },
  巽: { direction: '东南', wuXing: '木', degree: [112.5, 157.5] },
  离: { direction: '南', wuXing: '火', degree: [157.5, 202.5] },
  坤: { direction: '西南', wuXing: '土', degree: [202.5, 247.5] },
  兑: { direction: '西', wuXing: '金', degree: [247.5, 292.5] },
  乾: { direction: '西北', wuXing: '金', degree: [292.5, 337.5] },
};

// 24山 → 八卦映射
const MOUNTAIN_TO_GUA: Record<string, string> = {
  壬: '坎', 子: '坎', 癸: '坎',
  丑: '艮', 艮: '艮', 寅: '艮',
  甲: '震', 卯: '震', 乙: '震',
  辰: '巽', 巽: '巽', 巳: '巽',
  丙: '离', 午: '离', 丁: '离',
  未: '坤', 坤: '坤', 申: '坤',
  庚: '兑', 酉: '兑', 辛: '兑',
  戌: '乾', 乾: '乾', 亥: '乾',
};

// 东四宅/西四宅
const EAST_HOUSES = ['坎', '离', '震', '巽'];
const WEST_HOUSES = ['乾', '坤', '艮', '兑'];

// 八宅吉凶方位 (以坐山为key)
// 格式: 坐山 → { 卦名: 吉凶类型 }
const BAZHAI_MAP: Record<string, Record<string, string>> = {
  坎: { 坎: '伏位', 离: '延年', 震: '天医', 巽: '生气', 乾: '六煞', 坤: '五鬼', 艮: '绝命', 兑: '祸害' },
  离: { 离: '伏位', 坎: '延年', 巽: '天医', 震: '生气', 兑: '六煞', 艮: '五鬼', 坤: '绝命', 乾: '祸害' },
  震: { 震: '伏位', 巽: '延年', 坎: '天医', 离: '生气', 坤: '六煞', 乾: '五鬼', 兑: '绝命', 艮: '祸害' },
  巽: { 巽: '伏位', 震: '延年', 离: '天医', 坎: '生气', 艮: '六煞', 兑: '五鬼', 乾: '绝命', 坤: '祸害' },
  乾: { 乾: '伏位', 兑: '延年', 艮: '天医', 坤: '生气', 巽: '六煞', 震: '五鬼', 离: '绝命', 坎: '祸害' },
  坤: { 坤: '伏位', 艮: '延年', 兑: '天医', 乾: '生气', 震: '六煞', 巽: '五鬼', 坎: '绝命', 离: '祸害' },
  艮: { 艮: '伏位', 坤: '延年', 乾: '天医', 兑: '生气', 离: '六煞', 坎: '五鬼', 巽: '绝命', 震: '祸害' },
  兑: { 兑: '伏位', 乾: '延年', 坤: '天医', 艮: '生气', 坎: '六煞', 离: '五鬼', 震: '绝命', 巽: '祸害' },
};

const LUCK_TYPE: Record<string, { luck: string; desc: string }> = {
  生气: { luck: '大吉', desc: '旺丁旺财，精力充沛' },
  天医: { luck: '大吉', desc: '健康长寿，贵人扶持' },
  延年: { luck: '中吉', desc: '感情和美，人际融洽' },
  伏位: { luck: '小吉', desc: '平稳安定，适合静修' },
  祸害: { luck: '小凶', desc: '口舌是非，小人暗害' },
  六煞: { luck: '中凶', desc: '桃花烂桃，感情困扰' },
  五鬼: { luck: '大凶', desc: '火灾意外，破财损丁' },
  绝命: { luck: '大凶', desc: '重病绝症，大灾大祸' },
};

/**
 * 根据出生年份和性别计算命卦
 * 男命: (100 - 出生年后两位) % 9，0→离，余数对应卦
 * 女命: (出生年后两位 - 4) % 9，0→坎，余数对应卦
 */
function getMingGua(birthYear: number, gender: 'male' | 'female'): string {
  const lastTwo = birthYear % 100;
  const guaOrder = ['坎', '坤', '震', '巽', '中', '乾', '兑', '艮', '离'];
  let num: number;
  if (gender === 'male') {
    num = (100 - lastTwo) % 9;
    if (num === 0) num = 9;
    // 男命五归坤
    if (num === 5) return '坤';
  } else {
    num = (lastTwo - 4) % 9;
    if (num <= 0) num += 9;
    // 女命五归艮
    if (num === 5) return '艮';
  }
  return guaOrder[num - 1] || '坎';
}

function degreeToBagua(deg: number): string {
  const normalized = ((deg % 360) + 360) % 360;
  for (const [name, info] of Object.entries(BAGUA)) {
    const [start, end] = info.degree;
    if (start > end) {
      if (normalized >= start || normalized < end) return name;
    } else {
      if (normalized >= start && normalized < end) return name;
    }
  }
  return '坎';
}

export interface FengshuiResult {
  sittingDegree: number;
  facingDegree: number;
  sittingMountain: string;
  facingMountain: string;
  sittingGua: string;
  facingGua: string;
  houseGroup: '东四宅' | '西四宅';
  directions: Record<string, { gua: string; direction: string; wuXing: string; type: string; luck: string; desc: string }>;
  mingGua?: string;
  mingGuaGroup?: '东四命' | '西四命';
  mingGuaMatch?: boolean;
}

/**
 * 八宅风水分析
 * @param facingDeg 朝向度数 (面对的方向)
 * @param birthYear 出生年（可选，用于命卦匹配）
 * @param gender 性别（可选）
 */
export function analyzeFengshui(
  facingDeg: number,
  birthYear?: number,
  gender?: 'male' | 'female',
): FengshuiResult {
  const facing = ((facingDeg % 360) + 360) % 360;
  const sitting = (facing + 180) % 360;

  const facingGua = degreeToBagua(facing);
  const sittingGua = degreeToBagua(sitting);

  // 24山
  const facingMountain = degreeToMountain(facing);
  const sittingMountain = degreeToMountain(sitting);

  const houseGroup: '东四宅' | '西四宅' = EAST_HOUSES.includes(sittingGua) ? '东四宅' : '西四宅';

  // 八宅方位吉凶
  const bazhaiRow = BAZHAI_MAP[sittingGua] || {};
  const directions: FengshuiResult['directions'] = {};
  for (const [gua, info] of Object.entries(BAGUA)) {
    const type = bazhaiRow[gua] || '未知';
    const luckInfo = LUCK_TYPE[type] || { luck: '未知', desc: '' };
    directions[gua] = {
      gua,
      direction: info.direction,
      wuXing: info.wuXing,
      type,
      luck: luckInfo.luck,
      desc: luckInfo.desc,
    };
  }

  const result: FengshuiResult = {
    sittingDegree: Math.round(sitting * 10) / 10,
    facingDegree: Math.round(facing * 10) / 10,
    sittingMountain,
    facingMountain,
    sittingGua,
    facingGua,
    houseGroup,
    directions,
  };

  if (birthYear && gender) {
    const mingGua = getMingGua(birthYear, gender);
    result.mingGua = mingGua;
    result.mingGuaGroup = EAST_HOUSES.includes(mingGua) ? '东四命' : '西四命';
    result.mingGuaMatch = (result.mingGuaGroup === '东四命') === (houseGroup === '东四宅');
  }

  return result;
}

function degreeToMountain(deg: number): string {
  const MOUNTAINS_24 = [
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
  const normalized = ((deg % 360) + 360) % 360;
  for (const m of MOUNTAINS_24) {
    if (m.start > m.end) {
      if (normalized >= m.start || normalized < m.end) return m.name;
    } else {
      if (normalized >= m.start && normalized < m.end) return m.name;
    }
  }
  return '子';
}
