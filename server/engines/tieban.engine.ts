/**
 * 铁板神数引擎 — 基于参考实现完整重写
 *
 * 算法流程:
 * 1. 先天命数 = 农历月份 + 3 - 时支数值 (<=0 则 +12)
 * 2. 五音命数 = lookup(先天命数, 年干组) → 宫5/商4/角3/徵2/羽1
 * 3. 日命数 = lookup(日柱纳音五行, 求测时天干)
 *    时运数 = lookup(时柱纳音五行)
 * 4. 考刻 = 阳男阴女/阴男阳女 + (日命+时运)>6 → 初刻/正刻
 * 5. 本命数 = (五音命数×5 + 日命 + 时运 - correction) × 30 + 农历日
 * 6. 十二辟卦 = lookup(刻别, 本命数) → hexagram
 * 7. 本命条文 = lookup(hexagram, moment, 先天命数) → base+seq+offsets
 * 8. 流年条文 = 1-100岁 multi-table lookup chain → fortune numbers → 断语
 *
 * Data: 16 CSV tables in server/data/tieban/
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data', 'tieban');

// ── CSV Loader (handles quoted multiline fields) ──

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuote = false;
  const len = text.length;
  for (let i = 0; i < len; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"') {
        if (i + 1 < len && text[i + 1] === '"') { field += '"'; i++; } // escaped ""
        else inQuote = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') { inQuote = true; }
      else if (ch === ',') { row.push(field.trim().replace(/^\uFEFF/, '')); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && i + 1 < len && text[i + 1] === '\n') i++;
        row.push(field.trim().replace(/^\uFEFF/, ''));
        if (row.some(c => c !== '')) rows.push(row);
        row = []; field = '';
      } else {
        field += ch;
      }
    }
  }
  // last field / row
  row.push(field.trim().replace(/^\uFEFF/, ''));
  if (row.some(c => c !== '')) rows.push(row);
  return rows;
}

function readCsvFile(filename: string): string {
  const buf = readFileSync(join(DATA_DIR, filename));
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf).replace(/^\uFEFF/, '');
  // If UTF-8 decode produced replacement characters, try GBK
  if (utf8.includes('\ufffd')) {
    try { return new TextDecoder('gbk').decode(buf); } catch { /* fall through */ }
  }
  return utf8;
}

function readCsv(filename: string): string[][] {
  try {
    return parseCsv(readCsvFile(filename));
  } catch {
    return [];
  }
}

function readCsvDicts(filename: string): Record<string, string>[] {
  const rows = readCsv(filename);
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).filter(r => r.length > 0 && r[0]).map(r => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = r[i] || ''; });
    return obj;
  });
}

// ── Static Constants ──

const TIANGAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const DIZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

const NAYIN_WUXING: Record<string, string> = {
  甲子: '金', 乙丑: '金', 丙寅: '火', 丁卯: '火', 戊辰: '木', 己巳: '木',
  庚午: '土', 辛未: '土', 壬申: '金', 癸酉: '金', 甲戌: '火', 乙亥: '火',
  丙子: '水', 丁丑: '水', 戊寅: '土', 己卯: '土', 庚辰: '金', 辛巳: '金',
  壬午: '木', 癸未: '木', 甲申: '水', 乙酉: '水', 丙戌: '土', 丁亥: '土',
  戊子: '火', 己丑: '火', 庚寅: '木', 辛卯: '木', 壬辰: '水', 癸巳: '水',
  甲午: '金', 乙未: '金', 丙申: '火', 丁酉: '火', 戊戌: '木', 己亥: '木',
  庚子: '土', 辛丑: '土', 壬寅: '金', 癸卯: '金', 甲辰: '火', 乙巳: '火',
  丙午: '水', 丁未: '水', 戊申: '土', 己酉: '土', 庚戌: '金', 辛亥: '金',
  壬子: '木', 癸丑: '木', 甲寅: '水', 乙卯: '水', 丙辰: '土', 丁巳: '土',
  戊午: '火', 己未: '火', 庚申: '木', 辛酉: '木', 壬戌: '水', 癸亥: '水',
};

// 字母校正数映射
const LETTER_CORRECTION: Record<string, number> = {};
function buildLetterCorrection() {
  for (const c of '福分粉方务勿娼问') LETTER_CORRECTION[c] = 1;
  for (const c of '器坷玄和') LETTER_CORRECTION[c] = 2;
  for (const c of '忆召滞桃舌离誓绍') LETTER_CORRECTION[c] = 3;
  for (const c of '龙吏鲁禄动弟社屯') LETTER_CORRECTION[c] = 4;
  for (const c of '神肾物尾') LETTER_CORRECTION[c] = 5;
  for (const c of '等亶旦刀西萨訾省') LETTER_CORRECTION[c] = 6;
}
buildLetterCorrection();

// ── Data Tables (loaded once) ──

interface TiebanData {
  table14_1: Record<string, number>;   // 农历月份→数值
  table14_2: Record<string, number>;   // 时支→数值
  table14_3: Record<number, Record<string, string>>; // 先天命数→(年干组→五音)
  table14_4: Record<string, number>;   // 五音→数值
  table14_5: Record<string, Record<string, number>>; // 日柱纳音→(天干→日命数)
  table14_6: Record<string, number>;   // 时柱纳音→时运数
  ruleTable: Array<{ group: string; cond: string; moment: string }>; // 14-7 考刻规则
  hexagramDetailMap: Map<string, string>; // `${刻别},${本命数}` → 卦名
  hexagramMap: Record<number, string>;    // 本命数 → 卦名 (fallback)
  destinyData: Map<string, { base: number; seq: number; offsets: Record<string, number[]> }>; // (卦名,moment,先天命数)
  liunianStart: Map<string, number>;  // (先天命数,年支组,性别) → 起始数
  liunianSeq: Map<string, string[]>;  // (先天命数,年干) → 12四声序列
  markerTable: Map<string, string>;   // `${地支},${后天命数}` → 标记
  letterTable: Map<string, string>;   // `${考刻},${奇偶},${四声},${标记}` → 字母
  dataByLetter: Map<string, [number, number, number]>; // `${字母},${岁数}` → [基数,加数,校正数]
  dataByCorrection: Map<string, [number, number]>;     // `${校正数},${岁数}` → [基数,加数]
  fortuneDuanyu: Map<number, { text: string; age: string }>; // 条文数→断语
  loaded: boolean;
}

let _db: TiebanData | null = null;

function loadData(): TiebanData {
  if (_db?.loaded) return _db;

  const db: TiebanData = {
    table14_1: {}, table14_2: {}, table14_3: {}, table14_4: {},
    table14_5: {}, table14_6: {},
    ruleTable: [],
    hexagramDetailMap: new Map(), hexagramMap: {},
    destinyData: new Map(),
    liunianStart: new Map(), liunianSeq: new Map(),
    markerTable: new Map(), letterTable: new Map(),
    dataByLetter: new Map(), dataByCorrection: new Map(),
    fortuneDuanyu: new Map(),
    loaded: false,
  };

  // 14-1: 农历月份→数值
  for (const r of readCsvDicts('14-1.csv')) {
    db.table14_1[r['农历月份']] = parseInt(r['数值']) || 0;
  }

  // 14-2: 时支→数值
  for (const r of readCsvDicts('14-2.csv')) {
    db.table14_2[r['时支']] = parseInt(r['数值']) || 0;
  }

  // 14-3: 先天命数→(年干组→五音)
  for (const r of readCsvDicts('14-3.csv')) {
    if (r['先天命数']) {
      for (const n of r['先天命数'].split('|')) {
        const num = parseInt(n);
        if (!isNaN(num)) {
          const obj: Record<string, string> = {};
          for (const [k, v] of Object.entries(r)) {
            if (k !== '先天命数') obj[k.trim()] = v;
          }
          db.table14_3[num] = obj;
        }
      }
    }
  }

  // 14-4: 五音→数值
  for (const r of readCsvDicts('14-4.csv')) {
    db.table14_4[r['五音']] = parseInt(r['数值']) || 0;
  }

  // 14-5: 日柱纳音五行→(天干→日命数)
  for (const r of readCsvDicts('14-5.csv')) {
    const nayin = r['日柱纳音'];
    if (nayin) {
      const obj: Record<string, number> = {};
      for (const [k, v] of Object.entries(r)) {
        if (k !== '日柱纳音') obj[k.trim()] = parseInt(v) || 0;
      }
      db.table14_5[nayin] = obj;
    }
  }

  // 14-6: 时柱纳音→时运数
  for (const r of readCsvDicts('14-6.csv')) {
    db.table14_6[r['时柱纳音']] = parseInt(r['数值']) || 0;
  }

  // 14-7: 考刻规则
  for (const r of readCsvDicts('14-7.csv')) {
    db.ruleTable.push({ group: r['组别'], cond: r['和值条件'], moment: r['刻别'] });
  }

  // 14-9: (刻别, 本命数) → 卦名
  const rows149 = readCsv('14-9.csv');
  for (const row of rows149) {
    if (row.length >= 3) {
      const kebie = row[0].trim();
      const num = parseInt(row[1]);
      const guaName = row[2].trim();
      if ((kebie === '初刻' || kebie === '正刻') && !isNaN(num) && guaName && guaName !== 'nan') {
        db.hexagramDetailMap.set(`${kebie},${num}`, guaName);
        if (!(num in db.hexagramMap)) db.hexagramMap[num] = guaName;
      }
    }
  }

  // 14-10: 本命条文 (卦名,moment,先天命数) → {base, seq, offsets}
  for (const r of readCsvDicts('14-10.csv')) {
    try {
      const gua = r['十二辟卦'] || r['卦名'];
      const base = parseInt(r['基数']) || 0;
      const seq = parseInt(r['序数']) || 0;
      const parseOffsets = (s: string) =>
        s.replace(/，/g, '|').replace(/\n/g, '|').split('|').map(x => parseInt(x.trim())).filter(x => !isNaN(x));
      const offsets: Record<string, number[]> = {
        性格: parseOffsets(r['性格'] || ''),
        才能前程: parseOffsets(r['才能前程'] || ''),
        财运: parseOffsets(r['财运'] || ''),
        兄弟个数: parseOffsets(r['兄弟个数'] || ''),
      };
      // 初刻
      const ckField = r['初刻生人先天命数'] || r['初刻先天'] || '';
      for (const n of ckField.split('|')) {
        const v = parseInt(n.trim());
        if (!isNaN(v)) db.destinyData.set(`${gua},Initial,${v}`, { base, seq, offsets });
      }
      // 正刻
      const zkField = r['正刻生人先天命数'] || r['正刻先天'] || r['正刻'] || '';
      for (const n of zkField.split('|')) {
        const v = parseInt(n.trim());
        if (!isNaN(v)) db.destinyData.set(`${gua},Main,${v}`, { base, seq, offsets });
      }
    } catch { /* skip */ }
  }

  // 14-11-1: (年支组, 性别) → 起始数
  for (const r of readCsvDicts('14-11-1.csv')) {
    if (r['年支组'] && r['性别']) {
      db.liunianStart.set(`${r['年支组']},${r['性别']}`, parseInt(r['起始数']) || 0);
    }
  }

  // 14-11-2: (先天命数, 天干) → 12四声序列
  for (const r of readCsvDicts('14-11-2.csv')) {
    const num = parseInt(r['先天命数']);
    const gan = r['天干'];
    if (!isNaN(num) && gan) {
      const seq: string[] = [];
      for (let i = 1; i <= 12; i++) {
        seq.push(r[String(i)] || '?');
      }
      if (seq.some(s => s !== '?')) {
        db.liunianSeq.set(`${num},${gan}`, seq);
      }
    }
  }

  // 14-12: (地支, 后天命数) → 标记
  for (const r of readCsvDicts('14-12.csv')) {
    const zhi = r['流年地支'];
    const num = parseInt(r['后天命数']);
    const marker = r['流年标记'];
    if (zhi && !isNaN(num) && marker) {
      db.markerTable.set(`${zhi},${num}`, marker);
    }
  }

  // 14-13: (考刻, 奇偶, 四声, 标记) → 字母
  for (const r of readCsvDicts('14-13.csv')) {
    const key = `${r['考刻']},${r['日命数加时运数的奇偶性']},${r['流年天四声']},${r['流年标记']}`;
    if (r['流年字母']) db.letterTable.set(key, r['流年字母']);
  }

  // 14-14: (字母, 岁数) → [基数, 加数, 条文校正数]
  for (const r of readCsvDicts('14-14.csv')) {
    const letter = r['流年字母'];
    const age = parseInt(r['流年岁数']);
    const base = parseInt(r['基数']);
    const add = parseInt(r['加数']);
    const correction = parseInt(r['条文校正数']);
    if (letter && !isNaN(age) && !isNaN(base) && !isNaN(add)) {
      db.dataByLetter.set(`${letter},${age}`, [base, add, correction || 0]);
      if (!isNaN(correction) && correction > 0) {
        db.dataByCorrection.set(`${correction},${age}`, [base, add]);
      }
    }
  }

  // 条文断词
  for (const r of readCsvDicts('铁板神数-条文断词.csv')) {
    const numField = r['条文数'] || r['条文数字'] || r['数字'] || '';
    const num = parseInt(numField);
    if (!isNaN(num) && num > 0) {
      db.fortuneDuanyu.set(num, {
        text: r['吉凶断词'] || r['断语'] || r['内容'] || '',
        age: r['年龄'] || r['对应年龄'] || '',
      });
    }
  }

  db.loaded = true;
  _db = db;
  return db;
}

// ── Helper Functions ──

function getGanGroup(gan: string): string {
  const idx = TIANGAN.indexOf(gan);
  if (idx < 0) return '甲己';
  return ['甲己', '乙庚', '丙辛', '丁壬', '戊癸'][idx % 5];
}

function getZhiGroup(zhi: string): string {
  if ('寅午戌'.includes(zhi)) return '寅午戌';
  if ('申子辰'.includes(zhi)) return '申子辰';
  if ('巳酉丑'.includes(zhi)) return '巳酉丑';
  if ('亥卯未'.includes(zhi)) return '亥卯未';
  return '申子辰';
}

function isYangGan(gan: string): boolean {
  return '甲丙戊庚壬'.includes(gan);
}

function calculateCorrectedCorrection(original: number, age: number): number {
  if (original === 0) return 0;
  if ((age >= 1 && age <= 10) || (age >= 81 && age <= 108)) {
    let v = original + 2;
    if (v > 6) v -= 6;
    return v;
  }
  let v = original + 3;
  if (v > 20) v -= 20;
  return v;
}

// ── Result Types ──

export interface TiebanLiunianEntry {
  age: number;
  ganZhi: string;
  sound: string;
  marker: string;
  letter: string;
  originalCorrection: number;
  correctedCorrection: number;
  formula: string;
  originalFortune: number | null;
  correctedFortune: number | null;
  originalDuanyu: string;
  originalDuanyuAge: string;
  correctedDuanyu: string;
  correctedDuanyuAge: string;
}

export interface TiebanDestinyEntry {
  category: string;
  value: number;
  formula: string;
}

export interface TiebanResult {
  headerInfo: string;
  congNum: number;     // 先天命数
  toneNum: number;     // 五音命数
  dayLife: number;     // 日命数
  timeLuck: number;    // 时运数
  momentCn: string;    // 考刻 (初刻/正刻)
  mainNum: number;     // 本命数
  pnNum: number;       // 后天命数
  hexName: string;     // 十二辟卦
  destinyEntries: TiebanDestinyEntry[]; // 本命条文
  liunian: TiebanLiunianEntry[];        // 流年条文 1-100
}

/**
 * 完整铁板神数排盘
 *
 * @param birthBazi {year, month, day, hour} 出生八字干支
 * @param queryBazi {year, month, day, hour} 求测八字干支 (用于日命数/时运数计算)
 * @param gender '男' | '女'
 * @param lunarMonth 农历月份 (1-12)
 * @param lunarDay 农历日 (1-30)
 * @param isLeap 是否闰月
 */
export function tiebanCalculate(
  birthBazi: { year: string; month: string; day: string; hour: string },
  queryBazi: { year: string; month: string; day: string; hour: string },
  gender: '男' | '女',
  lunarMonth: number,
  lunarDay: number,
  isLeap: boolean,
): TiebanResult {
  const db = loadData();

  const yGan = birthBazi.year[0];
  const yZhi = birthBazi.year[1];
  const tZhi = birthBazi.hour[1];
  const dPillar = birthBazi.day;
  const qTimeGan = queryBazi.hour[0];
  const qTimePillar = queryBazi.hour;

  // Step 1: 先天命数
  const calcMonth = isLeap ? Math.min(lunarMonth + 1, 12) : lunarMonth;
  const monthVal = db.table14_1[String(calcMonth)] ?? calcMonth;
  const timeVal = db.table14_2[tZhi] ?? 0;
  let congNum = monthVal + 3 - timeVal;
  if (congNum <= 0) congNum += 12;

  // Step 2: 五音命数
  const ganGroup = getGanGroup(yGan);
  const tone = db.table14_3[congNum]?.[ganGroup] ?? '宫';
  const toneNum = db.table14_4[tone] ?? 5;

  // Step 3: 日命数 & 时运数
  const dayNayin = NAYIN_WUXING[dPillar] ?? '金';
  const dayLife = db.table14_5[dayNayin]?.[qTimeGan] ?? 0;
  const timeNayin = NAYIN_WUXING[qTimePillar] ?? '金';
  const timeLuck = db.table14_6[timeNayin] ?? 0;

  // Step 4: 考刻
  const sumVal = dayLife + timeLuck;
  const isYang = isYangGan(yGan);
  const grp = ((gender === '男' && isYang) || (gender === '女' && !isYang))
    ? '阳男阴女' : '阴男阳女';
  const cond = sumVal > 6 ? '>6' : '<=6';
  let moment = 'Main';
  for (const r of db.ruleTable) {
    if (r.group === grp && r.cond === cond) {
      moment = r.moment === '初刻' ? 'Initial' : 'Main';
      break;
    }
  }
  const momentCn = moment === 'Initial' ? '初刻' : '正刻';

  // Step 5: 本命数
  const baseVal = toneNum * 5 + dayLife + timeLuck;
  const fact = sumVal <= 6 ? (baseVal - 1) : (baseVal - 6);
  const mainNum = fact * 30 + lunarDay;

  // Step 6: 十二辟卦
  const hexName = db.hexagramDetailMap.get(`${momentCn},${mainNum}`)
    ?? db.hexagramMap[mainNum]
    ?? `未知(${momentCn},${mainNum})`;

  // Step 7: 本命条文
  const destinyEntries: TiebanDestinyEntry[] = [];
  const tblData = db.destinyData.get(`${hexName},${moment},${congNum}`);
  if (tblData) {
    for (const [cat, offsets] of Object.entries(tblData.offsets)) {
      for (const off of offsets) {
        const val = tblData.base + tblData.seq + off;
        destinyEntries.push({ category: cat, value: val, formula: `${tblData.base}+${tblData.seq}+${off}` });
      }
    }
  }

  // Step 7b: 后天命数
  const pnSum = congNum + mainNum;
  let pnNum = pnSum % 8;
  if (pnNum === 0) pnNum = 8;

  // Step 8: 流年条文 (1-100)
  const liunian: TiebanLiunianEntry[] = [];
  const zhiGroup = getZhiGroup(yZhi);
  const startKey1 = `${zhiGroup},${gender}`;
  const start = db.liunianStart.get(startKey1) ?? 0;

  // 四声序列 — try (congNum, yGan) first, then (congNum, ganStemGroup) as fallback
  let rawSeq: string[] = [];
  const seqKey1 = `${congNum},${yGan}`;
  if (db.liunianSeq.has(seqKey1)) {
    rawSeq = db.liunianSeq.get(seqKey1)!;
  }

  const finalSeq: string[] = new Array(12).fill('?');
  if (start !== 0 && rawSeq.length >= 12) {
    const off = (13 - start) % 12;
    for (let i = 0; i < 12; i++) {
      finalSeq[i] = rawSeq[(i + off) % 12];
    }
  }

  const stTg = TIANGAN.indexOf(yGan);
  const stDz = DIZHI.indexOf(yZhi);

  for (let age = 1; age <= 100; age++) {
    const curTg = TIANGAN[(stTg + age - 1) % 10];
    const curDz = DIZHI[(stDz + age - 1) % 12];
    const sound = finalSeq[(age - 1) % 12];
    const marker = db.markerTable.get(`${curDz},${pnNum}`) ?? '?';

    const ageParity = age % 2 !== 0 ? '奇数' : '偶数';
    const letterKey = `${momentCn},${ageParity},${sound},${marker}`;
    const letter = db.letterTable.get(letterKey) ?? '?';

    let base = 0, add = 0, originalCorrection = 0, correctedCorrection = 0;
    let originalFortune: number | null = null;
    let correctedFortune: number | null = null;
    let formula = '';

    const letterAgeKey = `${letter},${age}`;
    if (letter !== '?' && db.dataByLetter.has(letterAgeKey)) {
      [base, add, originalCorrection] = db.dataByLetter.get(letterAgeKey)!;
      formula = `${base}+${add}`;
      originalFortune = base + add;

      correctedCorrection = calculateCorrectedCorrection(originalCorrection, age);
      if (correctedCorrection > 0) {
        const corrKey = `${correctedCorrection},${age}`;
        if (db.dataByCorrection.has(corrKey)) {
          const [cBase, cAdd] = db.dataByCorrection.get(corrKey)!;
          correctedFortune = cBase + cAdd;
        }
      }
    }

    // 断语查询
    const origDuanyu = originalFortune ? db.fortuneDuanyu.get(originalFortune) : undefined;
    const corrDuanyu = correctedFortune ? db.fortuneDuanyu.get(correctedFortune) : undefined;

    liunian.push({
      age,
      ganZhi: `${curTg}${curDz}`,
      sound,
      marker,
      letter,
      originalCorrection,
      correctedCorrection,
      formula,
      originalFortune,
      correctedFortune,
      originalDuanyu: origDuanyu?.text ?? '',
      originalDuanyuAge: origDuanyu?.age ?? '',
      correctedDuanyu: corrDuanyu?.text ?? '',
      correctedDuanyuAge: corrDuanyu?.age ?? '',
    });
  }

  return {
    headerInfo: `性别:${gender}, 出生八字：${birthBazi.year} ${birthBazi.month} ${birthBazi.day} ${birthBazi.hour}, 求测八字：${queryBazi.year} ${queryBazi.month} ${queryBazi.day} ${queryBazi.hour}`,
    congNum,
    toneNum,
    dayLife,
    timeLuck,
    momentCn,
    mainNum,
    pnNum,
    hexName,
    destinyEntries,
    liunian,
  };
}
