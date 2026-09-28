/**
 * 姓名学 — 五格剖象法 (Five Grid Name Analysis)
 *
 * Uses unicode-strokes.json for stroke counts (康熙笔画).
 * Calculates: 天格/人格/地格/总格/外格, 五行, 三才配置, 吉凶.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Bundled with the server (it used to live outside the project and was missing in deployments)
const STROKES_PATH = resolve(__dirname, '../data/unicode-strokes.json');

let strokeMap: Record<string, number> | null = null;

function getStrokeMap(): Record<string, number> {
  if (!strokeMap) {
    const raw = readFileSync(STROKES_PATH, 'utf-8');
    strokeMap = JSON.parse(raw);
  }
  return strokeMap!;
}

/**
 * Get the stroke count for a single Chinese character.
 * Falls back to 0 if not found.
 */
export function getStrokes(char: string): number {
  const map = getStrokeMap();
  return map[char] ?? 0;
}

// ── 五格 number → 五行 mapping ──
const WUXING_MAP = ['木', '木', '火', '火', '土', '土', '金', '金', '水', '水'];
function numToWuXing(n: number): string {
  const last = n % 10;
  // 1,2=木 3,4=火 5,6=土 7,8=金 9,0=水
  if (last === 0) return '水';
  return WUXING_MAP[last - 1];
}

// ── 81数理 吉凶 table ──
// 1-81, 1-indexed. J=吉, X=凶, JX=半吉半凶
const SULI_TABLE: Record<number, { luck: string; meaning: string }> = {
  1:  { luck: '吉', meaning: '万物起始，富贵荣达，为最大吉数' },
  2:  { luck: '凶', meaning: '一身孤节，属末定的分离破灭数' },
  3:  { luck: '吉', meaning: '进取如意，增长繁荣，阴阳和合' },
  4:  { luck: '凶', meaning: '万事休止，进退不自由，灾厄频来' },
  5:  { luck: '吉', meaning: '阴阳和合，福禄长寿，精壮圆满' },
  6:  { luck: '吉', meaning: '天德地祥，安稳吉庆，繁荣富贵' },
  7:  { luck: '吉', meaning: '刚毅果断，独立权威，精力旺盛' },
  8:  { luck: '吉', meaning: '意志坚定，忍耐努力，必能成功' },
  9:  { luck: '凶', meaning: '兴尽凶始，穷乏困苦，智谋短缺' },
  10: { luck: '凶', meaning: '万事终局，充满损耗，不利前途' },
  11: { luck: '吉', meaning: '草木逢春，枯叶沾露，稳健温和' },
  12: { luck: '凶', meaning: '薄弱无力，孤立无援，难酬壮志' },
  13: { luck: '吉', meaning: '智略超群，博学多才，善于处世' },
  14: { luck: '凶', meaning: '忍得苦难，必有后福，是为无力' },
  15: { luck: '吉', meaning: '福寿拱照，兴家积财，万宝朝宗' },
  16: { luck: '吉', meaning: '贵人相助，兴家兴业，德望高厚' },
  17: { luck: '半吉', meaning: '突破万难，刚柔兼备，权威为上' },
  18: { luck: '半吉', meaning: '权威显达，博得名利，有志竟成' },
  19: { luck: '凶', meaning: '成功虽早，慎防空亡，内外不和' },
  20: { luck: '凶', meaning: '智高志大，历尽艰难，焦心忧劳' },
  21: { luck: '吉', meaning: '光风霁月，万物确立，独立权威' },
  22: { luck: '凶', meaning: '秋草逢霜，怀才不遇，忧愁怨苦' },
  23: { luck: '吉', meaning: '旭日东升，壮丽壮观，权威旺盛' },
  24: { luck: '吉', meaning: '锦绣前程，须靠自力，多用智谋' },
  25: { luck: '半吉', meaning: '天时地利，只欠人和，讲信修睦' },
  26: { luck: '半吉', meaning: '波澜起伏，变幻万端，凌驾万难' },
  27: { luck: '半吉', meaning: '欲望无止，自我强烈，多受毁谤' },
  28: { luck: '凶', meaning: '遭难之数，豪杰气概，终世孤苦' },
  29: { luck: '半吉', meaning: '智谋优秀，财力归集，名闻海内' },
  30: { luck: '半吉', meaning: '沉浮不定，凶吉难变，若明若暗' },
  31: { luck: '吉', meaning: '智仁勇俱，意志坚固，万事如意' },
  32: { luck: '吉', meaning: '侥幸多望，贵人得助，财帛如裕' },
  33: { luck: '吉', meaning: '旭日升天，鸾凤相会，名闻天下' },
  34: { luck: '凶', meaning: '破家之身，多灾多难，见识短小' },
  35: { luck: '吉', meaning: '温和平静，智达通畅，文昌技艺' },
  36: { luck: '半吉', meaning: '波澜重叠，常陷穷困，动不如静' },
  37: { luck: '吉', meaning: '权威显达，热诚忠信，宜着雅量' },
  38: { luck: '半吉', meaning: '磨铁成针，有志竟成，意志薄弱' },
  39: { luck: '吉', meaning: '富贵荣华，财帛丰盈，暗藏险象' },
  40: { luck: '半吉', meaning: '智谋胆力，冒险投机，沉浮不定' },
  41: { luck: '吉', meaning: '纯阳独秀，德高望重，和顺畅达' },
  42: { luck: '半吉', meaning: '博达多能，精通世情，如能专心' },
  43: { luck: '半吉', meaning: '散财破产，诸事不遂，虽有智谋' },
  44: { luck: '凶', meaning: '破家亡身，暗藏惨淡，事不如意' },
  45: { luck: '吉', meaning: '新生泰和，顺风扬帆，智谋经纬' },
  46: { luck: '半吉', meaning: '载宝沉舟，浪里淘金，须防大难' },
  47: { luck: '吉', meaning: '花开之象，万事如意，祯祥吉庆' },
  48: { luck: '吉', meaning: '智谋兼备，德量荣达，有大功业' },
  49: { luck: '半吉', meaning: '吉凶难分，不断辛劳，转凶为吉' },
  50: { luck: '半吉', meaning: '吉凶互见，一成一败，凶中有吉' },
  51: { luck: '半吉', meaning: '盛衰交加，或成或败，晚景凄凉' },
  52: { luck: '吉', meaning: '草木逢春，雨过天晴，渡过难关' },
  53: { luck: '半吉', meaning: '盛衰参半，外祥内苦，先吉后凶' },
  54: { luck: '凶', meaning: '虽倾全力，难望成功，此数大凶' },
  55: { luck: '半吉', meaning: '外美内苦，和顺薄幸，半吉半凶' },
  56: { luck: '凶', meaning: '浪里行舟，历尽艰辛，四周障碍' },
  57: { luck: '吉', meaning: '日照春松，寒雪青松，努力经营' },
  58: { luck: '半吉', meaning: '晚行遇月，先苦后甜，宽宏大量' },
  59: { luck: '凶', meaning: '寒蝉悲风，时运不济，人生难望' },
  60: { luck: '凶', meaning: '无谋之人，漂泊不安，暗黑遮日' },
  61: { luck: '吉', meaning: '牡丹芙蓉，花开富贵，名利双收' },
  62: { luck: '凶', meaning: '衰败之象，内外不和，志望难达' },
  63: { luck: '吉', meaning: '万物化育，繁荣之象，专心一意' },
  64: { luck: '凶', meaning: '见异思迁，十九不成，徒劳无功' },
  65: { luck: '吉', meaning: '吉运自来，能享盛名，和顺富达' },
  66: { luck: '凶', meaning: '岩头步马，进退维谷，内外不和' },
  67: { luck: '吉', meaning: '独营事业，势如破竹，家门隆昌' },
  68: { luck: '吉', meaning: '思虑周详，计划力行，不失先机' },
  69: { luck: '半吉', meaning: '动摇不安，常陷逆境，不得时运' },
  70: { luck: '凶', meaning: '惨淡经营，难免波折，灾难频来' },
  71: { luck: '半吉', meaning: '吉凶参半，惟赖勇气，冒险守成' },
  72: { luck: '凶', meaning: '利害混集，凶多吉少，得而复失' },
  73: { luck: '半吉', meaning: '安乐自来，自然吉祥，力行不懈' },
  74: { luck: '凶', meaning: '利不及费，坐食山空，如无智谋' },
  75: { luck: '半吉', meaning: '守柔保身，进取乏力，安详平稳' },
  76: { luck: '凶', meaning: '倾覆离散，多灾多难，不宜经营' },
  77: { luck: '半吉', meaning: '家庭有福，有先后起落，也可安宁' },
  78: { luck: '半吉', meaning: '先苦后甘，以利有望，平安中庸' },
  79: { luck: '凶', meaning: '挽回乏力，身疲力尽，凶于短命' },
  80: { luck: '凶', meaning: '最极之数，还本归元，能得繁荣' },
  81: { luck: '吉', meaning: '万物回春，还本归元，繁荣富贵' },
};

function getSuLi(n: number): { luck: string; meaning: string } {
  const idx = n <= 0 ? 1 : ((n - 1) % 80) + 1;
  return SULI_TABLE[idx] || { luck: '未知', meaning: '' };
}

// ── 三才配置 (天人地三格五行) → 吉凶 ──
// Simplified: 相生为吉, 相克为凶, 比和为吉
const WUXING_SHENG: Record<string, string> = { '木': '火', '火': '土', '土': '金', '金': '水', '水': '木' };
const WUXING_KE: Record<string, string> = { '木': '土', '土': '水', '水': '火', '火': '金', '金': '木' };

function sanCaiLuck(tian: string, ren: string, di: string): { luck: string; desc: string } {
  const pairs = [[tian, ren], [ren, di]];
  let score = 0;
  const descs: string[] = [];
  for (const [a, b] of pairs) {
    if (a === b) {
      score += 2; descs.push(`${a}${b}比和，和谐`);
    } else if (WUXING_SHENG[a] === b) {
      score += 2; descs.push(`${a}生${b}，顺畅`);
    } else if (WUXING_SHENG[b] === a) {
      score += 1; descs.push(`${b}生${a}，回生`);
    } else if (WUXING_KE[a] === b) {
      score -= 1; descs.push(`${a}克${b}，有阻`);
    } else if (WUXING_KE[b] === a) {
      score -= 2; descs.push(`${b}克${a}，受克`);
    }
  }
  const luck = score >= 3 ? '大吉' : score >= 1 ? '吉' : score >= 0 ? '中' : score >= -1 ? '半凶' : '凶';
  return { luck, desc: descs.join('；') };
}

// ── Main analysis ──

export interface WuGeResult {
  fullName: string;
  surname: string;
  givenName: string;
  surnameStrokes: number[];
  givenStrokes: number[];
  tianGe: { value: number; wuXing: string; luck: string; meaning: string };
  renGe: { value: number; wuXing: string; luck: string; meaning: string };
  diGe: { value: number; wuXing: string; luck: string; meaning: string };
  zongGe: { value: number; wuXing: string; luck: string; meaning: string };
  waiGe: { value: number; wuXing: string; luck: string; meaning: string };
  sanCai: { tian: string; ren: string; di: string; luck: string; desc: string };
  overallLuck: string;
}

/**
 * Analyze a full Chinese name using 五格剖象法.
 * @param surname - The surname (1-2 characters)
 * @param givenName - The given name (1-2 characters)
 */
export function analyzeWuGe(surname: string, givenName: string): WuGeResult {
  const sChars = [...surname];
  const gChars = [...givenName];
  const sStrokes = sChars.map(c => getStrokes(c));
  const gStrokes = gChars.map(c => getStrokes(c));

  const sSum = sStrokes.reduce((a, b) => a + b, 0);
  const gSum = gStrokes.reduce((a, b) => a + b, 0);

  // 天格
  let tianVal: number;
  if (sChars.length === 1) {
    tianVal = sStrokes[0] + 1;
  } else {
    tianVal = sSum;
  }

  // 人格
  const lastSurnameStroke = sStrokes[sStrokes.length - 1];
  const firstGivenStroke = gStrokes[0] || 0;
  const renVal = lastSurnameStroke + firstGivenStroke;

  // 地格
  let diVal: number;
  if (gChars.length === 1) {
    diVal = gStrokes[0] + 1;
  } else {
    diVal = gSum;
  }

  // 总格
  const zongVal = sSum + gSum;

  // 外格
  let waiVal = zongVal - renVal + 1;
  if (waiVal <= 0) waiVal = 1;

  const tianSuLi = getSuLi(tianVal);
  const renSuLi = getSuLi(renVal);
  const diSuLi = getSuLi(diVal);
  const zongSuLi = getSuLi(zongVal);
  const waiSuLi = getSuLi(waiVal);

  const tianWx = numToWuXing(tianVal);
  const renWx = numToWuXing(renVal);
  const diWx = numToWuXing(diVal);

  const sanCai = sanCaiLuck(tianWx, renWx, diWx);

  // Overall score
  const lucks = [tianSuLi.luck, renSuLi.luck, diSuLi.luck, zongSuLi.luck, waiSuLi.luck, sanCai.luck];
  const jiCount = lucks.filter(l => l === '吉' || l === '大吉').length;
  const xiongCount = lucks.filter(l => l === '凶').length;
  const overallLuck = jiCount >= 4 ? '大吉' : jiCount >= 3 ? '吉' : xiongCount >= 3 ? '凶' : '中';

  return {
    fullName: surname + givenName,
    surname,
    givenName,
    surnameStrokes: sStrokes,
    givenStrokes: gStrokes,
    tianGe: { value: tianVal, wuXing: tianWx, ...tianSuLi },
    renGe: { value: renVal, wuXing: renWx, ...renSuLi },
    diGe: { value: diVal, wuXing: diWx, ...diSuLi },
    zongGe: { value: zongVal, wuXing: numToWuXing(zongVal), ...zongSuLi },
    waiGe: { value: waiVal, wuXing: numToWuXing(waiVal), ...waiSuLi },
    sanCai: { tian: tianWx, ren: renWx, di: diWx, ...sanCai },
    overallLuck,
  };
}
