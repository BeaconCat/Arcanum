/**
 * Quick tools shown in the chat (welcome grid + composer toolbar).
 *
 * Every quick tool runs through the main function-calling chat: the listed backend tools
 * (`run`) are executed on the server first — so their result cards appear immediately —
 * and 天枢 then interprets them in the conversation, calling more tools if needed.
 *
 * Placeholders in `run[].args` and `prompt`:
 *   {key}       value of param `key`
 *   $profile    selected 命主's profileId      $profileName   their name
 *   $profile2   second person (relation tools) $profile2Name
 *   $today      today YYYY-MM-DD               $thisYear      e.g. 2026
 *   $thisMonth  current month number (param defaults only)
 *   {key.label} display label of a select param's value
 * An arg whose placeholder resolves to '' is dropped (server defaults apply).
 * In prompts, [[ … ]] is an optional segment, removed when any param it references is empty.
 */

export type QuickToolCategory = 'natal' | 'fortune' | 'divination' | 'almanac' | 'relation' | 'space';

export const QUICK_TOOL_CATEGORIES: { id: QuickToolCategory; name: string }[] = [
  { id: 'natal', name: '本命' },
  { id: 'fortune', name: '运势' },
  { id: 'divination', name: '占卜' },
  { id: 'almanac', name: '择日' },
  { id: 'relation', name: '关系' },
  { id: 'space', name: '风水与名字' },
];

export interface QuickToolParam {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'year';
  required?: boolean;
  placeholder?: string;
  options?: { label: string; value: string }[];
  /** Literal default, or '$today' / '$thisYear' / '$thisMonth' */
  default?: string | number;
  hint?: string;
}

export interface QuickToolDef {
  id: string;
  name: string;
  description: string;
  /** lucide icon name, resolved in the UI */
  icon: string;
  category: QuickToolCategory;
  /** Shown in the welcome grid's 常用 tab */
  popular?: boolean;
  /** Needs a 命主 picker ('pair' = two people) */
  subject?: 'single' | 'pair';
  params?: QuickToolParam[];
  run: { tool: string; args?: Record<string, string | number | boolean> }[];
  /** The user message sent to 天枢 */
  prompt: string;
}

const TAROT_SPREADS = [
  { label: '时间之流（过去·现在·未来）', value: 'three-time' },
  { label: '单张指引', value: 'single' },
  { label: '解局三张（现状·阻碍·建议）', value: 'three-advice' },
  { label: '二选一', value: 'two-choices' },
  { label: '恋人牌阵', value: 'lovers' },
  { label: '凯尔特十字', value: 'celtic-cross' },
  { label: '马蹄牌阵', value: 'horseshoe' },
  { label: '身心灵', value: 'mind-body-spirit' },
  { label: '四元素', value: 'four-elements' },
  { label: '年度十二宫', value: 'year-ahead' },
];

const RELATION_TYPES = [
  { label: '婚恋', value: '婚恋' },
  { label: '合作', value: '合作' },
  { label: '朋友', value: '朋友' },
  { label: '亲子', value: '亲子' },
];

const MONTHS = Array.from({ length: 12 }, (_, i) => ({ label: `${i + 1}月`, value: String(i + 1) }));

const ACG_THEMES = [
  { label: '不指定', value: '' },
  { label: '事业', value: 'career' },
  { label: '感情', value: 'love' },
  { label: '财富', value: 'wealth' },
  { label: '疗愈', value: 'healing' },
  { label: '创意', value: 'creativity' },
  { label: '冒险', value: 'adventure' },
  { label: '学业', value: 'study' },
  { label: '安家', value: 'home' },
];

export const QUICK_TOOLS: QuickToolDef[] = [
  // ── 本命 ──
  {
    id: 'bazi', name: '八字排盘', description: '四柱十神、五行旺衰、神煞与大运', icon: 'star',
    category: 'natal', popular: true, subject: 'single',
    run: [{ tool: 'get_bazi_chart', args: { profileId: '$profile' } }],
    prompt: '请为$profileName排八字命盘，分析日主强弱、格局、五行喜忌，以及事业、财运、感情方面的特点。',
  },
  {
    id: 'ziwei', name: '紫微排盘', description: '十二宫主星、四化与大限', icon: 'compass',
    category: 'natal', popular: true, subject: 'single',
    run: [{ tool: 'get_ziwei_chart', args: { profileId: '$profile' } }],
    prompt: '请为$profileName排紫微斗数命盘，分析命宫主星、四化落宫与各宫要点，以及当前大限。',
  },
  {
    id: 'astro', name: '西洋星盘', description: '行星落座落宫、相位、格局与解读', icon: 'orbit',
    category: 'natal', popular: true, subject: 'single',
    run: [
      { tool: 'get_astro_chart', args: { profileId: '$profile' } },
      { tool: 'get_astro_interpretation', args: { profileId: '$profile', kind: 'natal', maxItems: 20 } },
    ],
    prompt: '请解读$profileName的西洋本命星盘：日月升、命主星、重要相位与格局，以及性格与人生主题。',
  },
  {
    id: 'wuxing', name: '五行喜忌', description: '五行分布、日主旺衰与喜用神', icon: 'flame',
    category: 'natal', subject: 'single',
    run: [{ tool: 'get_wuxing_analysis', args: { profileId: '$profile' } }],
    prompt: '请详细分析$profileName的五行分布、日主旺衰、喜用神与忌神，并给出日常生活中的调理建议。',
  },
  {
    id: 'feixing', name: '紫微飞星', description: '宫干飞化、自化、双忌与禄忌交驰', icon: 'sparkles',
    category: 'natal', subject: 'single',
    run: [{ tool: 'get_flying_stars', args: { profileId: '$profile' } }],
    prompt: '请用紫微飞星技法分析$profileName的命盘：重要的宫干飞化、自化、双忌与禄忌交驰分别意味着什么。',
  },
  {
    id: 'tieban', name: '铁板神数', description: '先天命数、本命条文与流年断语', icon: 'book-open',
    category: 'natal', subject: 'single',
    run: [{ tool: 'tieban_shenshu', args: { profileId: '$profile' } }],
    prompt: '请为$profileName排铁板神数，解读先天命数、本命条文，以及流年断语中值得关注的年份。',
  },
  {
    id: 'natalReport', name: '本命详解', description: '读取已生成的本命深度解析', icon: 'scroll-text',
    category: 'natal', subject: 'single',
    run: [{ tool: 'get_natal_analysis', args: { profileId: '$profile' } }],
    prompt: '请根据$profileName已生成的本命详解，给我一份提纲挈领的总结，并指出最值得注意的三点。',
  },

  // ── 运势 ──
  {
    id: 'today', name: '今日运势', description: '八字流日 + 紫微流日 + 黄历', icon: 'sun',
    category: 'fortune', popular: true, subject: 'single',
    run: [
      { tool: 'get_bazi_flow_day', args: { profileId: '$profile', targetDate: '$today' } },
      { tool: 'get_flow_day_context', args: { profileId: '$profile', targetDate: '$today' } },
      { tool: 'get_today_huangli', args: { date: '$today' } },
    ],
    prompt: '请结合八字流日、紫微流日与黄历，分析$profileName今天的运势：事业、财运、感情、健康，以及宜忌与最佳时辰。',
  },
  {
    id: 'yearEvents', name: '流年大事', description: '全年重点月份与运势起伏', icon: 'calendar-range',
    category: 'fortune', popular: true, subject: 'single',
    params: [{ key: 'year', label: '年份', type: 'year', default: '$thisYear' }],
    run: [
      { tool: 'get_bazi_flow_year', args: { profileId: '$profile', targetYear: '{year}' } },
      { tool: 'get_ziwei_flow_year', args: { profileId: '$profile', targetYear: '{year}' } },
    ],
    prompt: '请结合八字流年与紫微流年，分析$profileName在{year}年的流年大事：重点月份、机遇与挑战、需要注意的事项。',
  },
  {
    id: 'monthFortune', name: '流月运势', description: '八字流月 + 紫微流月', icon: 'calendar-days',
    category: 'fortune', subject: 'single',
    params: [
      { key: 'year', label: '年份', type: 'year', default: '$thisYear' },
      { key: 'month', label: '月份', type: 'select', options: MONTHS, default: '$thisMonth' },
    ],
    run: [
      { tool: 'get_bazi_flow_month', args: { profileId: '$profile', targetYear: '{year}', targetMonth: '{month}' } },
      { tool: 'get_ziwei_flow_month', args: { profileId: '$profile', targetYear: '{year}', targetMonth: '{month}' } },
    ],
    prompt: '请结合八字流月与紫微流月，分析$profileName在{year}年{month.label}的运势：事业、财运、感情、健康各方面的重点与建议。',
  },
  {
    id: 'dayFortune', name: '某日运势', description: '指定日期的流日与黄历', icon: 'calendar',
    category: 'fortune', subject: 'single',
    params: [{ key: 'date', label: '日期', type: 'date', required: true, default: '$today' }],
    run: [
      { tool: 'get_bazi_flow_day', args: { profileId: '$profile', targetDate: '{date}' } },
      { tool: 'get_flow_day_context', args: { profileId: '$profile', targetDate: '{date}' } },
      { tool: 'get_today_huangli', args: { date: '{date}' } },
    ],
    prompt: '请结合八字流日、紫微流日与黄历，分析$profileName在{date}这一天的运势，以及当天的宜忌与吉时。',
  },
  {
    id: 'progressed', name: '次限推运', description: '一日一年，看人生阶段主题', icon: 'orbit',
    category: 'fortune', subject: 'single',
    params: [{ key: 'date', label: '推运到', type: 'date', default: '$today' }],
    run: [
      { tool: 'get_astro_progressed', args: { profileId: '$profile', date: '{date}' } },
      { tool: 'get_astro_interpretation', args: { profileId: '$profile', kind: 'progressed', date: '{date}', maxItems: 15 } },
    ],
    prompt: '请解读$profileName推运到{date}的次限推运盘：当前人生阶段的主题、内在变化与可以把握的方向。',
  },
  {
    id: 'transit', name: '星象行运', description: '当下天象对本命盘的影响', icon: 'orbit',
    category: 'fortune', subject: 'single',
    params: [{ key: 'date', label: '日期', type: 'date', default: '$today' }],
    run: [
      { tool: 'get_astro_transit', args: { profileId: '$profile', date: '{date}' } },
      { tool: 'get_astro_interpretation', args: { profileId: '$profile', kind: 'transit', date: '{date}', maxItems: 15 } },
    ],
    prompt: '请分析{date}前后的星象行运对$profileName的影响：最重要的几个行运相位分别意味着什么，这段时间该如何把握。',
  },
  {
    id: 'solarReturn', name: '太阳返照', description: '生日年度的主题与重点', icon: 'sun-medium',
    category: 'fortune', subject: 'single',
    params: [{ key: 'year', label: '年份', type: 'year', default: '$thisYear' }],
    run: [{ tool: 'get_astro_solar_return', args: { profileId: '$profile', year: '{year}' } }],
    prompt: '请解读$profileName{year}年的太阳返照盘：这一生日年度的核心主题、重点领域与建议。',
  },
  {
    id: 'fortuneCalendar', name: '运势日历', description: '读取本月已生成的逐日运势', icon: 'calendar-days',
    category: 'fortune', subject: 'single',
    run: [{ tool: 'get_daily_fortune', args: { profileId: '$profile' } }],
    prompt: '请根据$profileName本月已生成的运势日历，总结这个月的整体走势，并挑出最适合行动和需要谨慎的几天。',
  },

  // ── 占卜 ──
  {
    id: 'tarot', name: '塔罗占卜', description: '选择牌阵抽牌，天枢为你解牌', icon: 'layers',
    category: 'divination', popular: true,
    params: [
      { key: 'question', label: '所问之事', type: 'text', required: true, placeholder: '例如：这次换工作会顺利吗？' },
      { key: 'spreadId', label: '牌阵', type: 'select', options: TAROT_SPREADS, default: 'three-time' },
    ],
    run: [{ tool: 'draw_tarot', args: { question: '{question}', spreadId: '{spreadId}' } }],
    prompt: '我想用塔罗（{spreadId.label}）问：{question}。请结合牌阵中每个位置的含义为我解牌，并给出建议。',
  },
  {
    id: 'tarotDaily', name: '今日一牌', description: '抽一张牌作为今天的指引', icon: 'layers',
    category: 'divination',
    run: [{ tool: 'draw_tarot', args: { question: '今天需要留意什么', spreadId: 'single' } }],
    prompt: '请为我抽一张今日指引牌，告诉我今天需要留意什么，并给一句行动建议。',
  },
  {
    id: 'tarotChoice', name: '塔罗二选一', description: '两个选项各自的走向对比', icon: 'layers',
    category: 'divination',
    params: [
      { key: 'optionA', label: '选项 A', type: 'text', required: true, placeholder: '例如：留在现在的公司' },
      { key: 'optionB', label: '选项 B', type: 'text', required: true, placeholder: '例如：接受新的 offer' },
    ],
    run: [{ tool: 'draw_tarot', args: { question: '在「{optionA}」和「{optionB}」之间该如何选择', spreadId: 'two-choices' } }],
    prompt: '我在「{optionA}」和「{optionB}」之间犹豫，请用塔罗二选一牌阵分析两条路各自的走向，并给出建议。',
  },
  {
    id: 'liuYao', name: '六爻起卦', description: '铜钱法起卦，断事问吉凶', icon: 'hexagon',
    category: 'divination', popular: true,
    params: [{ key: 'question', label: '所问之事', type: 'text', required: true, placeholder: '请输入你想问的事情' }],
    run: [{ tool: 'liu_yao', args: { question: '{question}' } }],
    prompt: '我想用六爻问：{question}。请取用神，结合世应、动变与月建日辰为我断卦，并给出建议。',
  },
  {
    id: 'meiHua', name: '梅花易数', description: '时间或报数起卦，看体用生克', icon: 'flower-2',
    category: 'divination',
    params: [
      { key: 'question', label: '所问之事', type: 'text', required: true, placeholder: '请输入你想问的事情' },
      { key: 'num1', label: '上卦数（可选）', type: 'number', placeholder: '1-999 任意数' },
      { key: 'num2', label: '下卦数（可选）', type: 'number', placeholder: '1-999 任意数', hint: '两个数都填则用报数起卦，否则按当下时间起卦' },
    ],
    run: [{ tool: 'mei_hua', args: { question: '{question}', num1: '{num1}', num2: '{num2}' } }],
    prompt: '我想用梅花易数问：{question}[[（报数 {num1}、{num2}）]]。请结合体用生克与变卦为我断卦。',
  },
  {
    id: 'qiMen', name: '奇门遁甲', description: '当下时空的九星八门与方位', icon: 'shield',
    category: 'divination',
    params: [{ key: 'question', label: '所问之事（可选）', type: 'text', placeholder: '例如：出行方位、投资方向…' }],
    run: [{ tool: 'qi_men', args: { question: '{question}' } }],
    prompt: '请用奇门遁甲分析此刻的时空格局[[（所问：{question}）]]，给出吉凶判断与方位建议。',
  },
  {
    id: 'xunWu', name: '寻物断卦', description: '奇门 + 六爻判断失物方位', icon: 'search',
    category: 'divination',
    params: [{ key: 'item', label: '丢失物品', type: 'text', required: true, placeholder: '如：钥匙、手机、钱包…' }],
    run: [{ tool: 'xun_wu', args: { item: '{item}' } }],
    prompt: '我的{item}找不到了，请帮我判断能否找回、大概在什么方位和什么样的地方，以及什么时候去找比较好。',
  },
  {
    id: 'dailySign', name: '每日一签', description: '今日灵签，签诗与解签', icon: 'scroll',
    category: 'divination',
    run: [{ tool: 'daily_sign' }],
    prompt: '请为我抽今日一签，写出签诗、解曰、宜忌和一句贴心的提醒。',
  },

  // ── 择日 ──
  {
    id: 'zeRi', name: '择日分析', description: '某天的宜忌与是否适合所办之事', icon: 'calendar',
    category: 'almanac', subject: 'single',
    params: [
      { key: 'date', label: '候选日期', type: 'date', required: true, default: '$today' },
      { key: 'purpose', label: '用途', type: 'text', placeholder: '如：搬家、开业、结婚、签约…' },
    ],
    run: [
      { tool: 'ze_ri', args: { profileId: '$profile', date: '{date}', purpose: '{purpose}' } },
      { tool: 'get_shichen_detail', args: { date: '{date}' } },
    ],
    prompt: '请帮我看{date}这天[[是否适合{purpose}]]，结合黄历宜忌、冲煞以及与$profileName命盘的关系，并推荐当天的吉时。',
  },
  {
    id: 'shichen', name: '时辰吉凶', description: '某日十二时辰的吉凶宜忌', icon: 'clock',
    category: 'almanac',
    params: [{ key: 'date', label: '日期', type: 'date', default: '$today' }],
    run: [{ tool: 'get_shichen_detail', args: { date: '{date}' } }],
    prompt: '请帮我看{date}这天十二个时辰的吉凶宜忌，并指出最适合办事的时段。',
  },
  {
    id: 'huangli', name: '黄历查询', description: '日干支、值星、天神与宜忌', icon: 'book-marked',
    category: 'almanac',
    params: [{ key: 'date', label: '日期', type: 'date', default: '$today' }],
    run: [{ tool: 'get_today_huangli', args: { date: '{date}' } }],
    prompt: '请帮我解读{date}的黄历：值星天神、宜忌、冲煞与彭祖百忌分别是什么意思。',
  },
  {
    id: 'yearCalendar', name: '全年月令', description: '一年十二个月的干支九星概要', icon: 'calendar-range',
    category: 'almanac',
    params: [{ key: 'year', label: '年份', type: 'year', default: '$thisYear' }],
    run: [{ tool: 'get_yearly_calendar', args: { year: '{year}' } }],
    prompt: '请概述{year}年十二个月的月令特点，哪些月份适合开展新事项、哪些月份宜守。',
  },

  // ── 关系 ──
  {
    id: 'hePan', name: '八字合盘', description: '双方八字的合冲与五行互补', icon: 'heart',
    category: 'relation', popular: true, subject: 'pair',
    params: [{ key: 'relationType', label: '关系类型', type: 'select', options: RELATION_TYPES, default: '婚恋' }],
    run: [{ tool: 'compare_bazi', args: { profileId1: '$profile', profileId2: '$profile2' } }],
    prompt: '请从{relationType.label}的角度分析$profileName与$profile2Name的八字合盘：日主关系、属相合冲、五行互补，以及相处建议。',
  },
  {
    id: 'synastry', name: '星盘合盘', description: '比较盘交互相位与匹配度', icon: 'heart-handshake',
    category: 'relation', subject: 'pair',
    run: [
      { tool: 'get_astro_synastry', args: { profileId1: '$profile', profileId2: '$profile2' } },
      { tool: 'get_astro_interpretation', args: { profileId: '$profile', profileId2: '$profile2', kind: 'synastry', maxItems: 15 } },
    ],
    prompt: '请解读$profileName与$profile2Name的星盘比较盘：吸引与契合之处、潜在摩擦，以及让关系更好的建议。',
  },
  {
    id: 'composite', name: '组合中点盘', description: '把这段关系本身当作一张盘', icon: 'orbit',
    category: 'relation', subject: 'pair',
    run: [{ tool: 'get_astro_composite', args: { profileId1: '$profile', profileId2: '$profile2' } }],
    prompt: '请解读$profileName与$profile2Name的组合中点盘：这段关系的核心性质、共同课题与发展方向。',
  },
  {
    id: 'relationAll', name: '关系全景', description: '八字合盘与星盘比较盘合参', icon: 'users',
    category: 'relation', subject: 'pair',
    params: [{ key: 'relationType', label: '关系类型', type: 'select', options: RELATION_TYPES, default: '婚恋' }],
    run: [
      { tool: 'compare_bazi', args: { profileId1: '$profile', profileId2: '$profile2' } },
      { tool: 'get_astro_synastry', args: { profileId1: '$profile', profileId2: '$profile2' } },
    ],
    prompt: '请从{relationType.label}的角度，把八字合盘与星盘比较盘结合起来，全面分析$profileName与$profile2Name的关系：互相吸引与契合之处、主要矛盾，以及相处之道。',
  },

  // ── 风水与名字 ──
  {
    id: 'fengshui', name: '八宅风水', description: '坐山朝向、宅卦与八方吉凶', icon: 'navigation',
    category: 'space', subject: 'single',
    params: [{ key: 'facingDegree', label: '朝向度数', type: 'number', required: true, placeholder: '0-360（0=北，90=东，180=南，270=西）' }],
    run: [{ tool: 'analyze_fengshui', args: { facingDegree: '{facingDegree}', profileId: '$profile' } }],
    prompt: '我家朝向{facingDegree}度，请结合$profileName的命卦分析宅卦与八方吉凶，并给出布局建议。',
  },
  {
    id: 'xuankong', name: '玄空飞星', description: '运盘山向星与旺衰格局', icon: 'grid-3x3',
    category: 'space',
    params: [
      { key: 'facingDegree', label: '朝向度数', type: 'number', required: true, placeholder: '0-360' },
      { key: 'year', label: '建造或入住年份', type: 'year', required: true, default: '$thisYear' },
    ],
    run: [{ tool: 'analyze_xuankong', args: { facingDegree: '{facingDegree}', year: '{year}' } }],
    prompt: '请用玄空飞星分析朝向{facingDegree}度、{year}年入住的房子：旺衰格局、各方位吉凶与化解建议。',
  },
  {
    id: 'acg', name: '地理占星', description: '行星线与适合你的城市', icon: 'map',
    category: 'natal', subject: 'single',
    params: [
      { key: 'place', label: '想了解的城市（可选）', type: 'text', placeholder: '如：上海、成都、东京' },
      { key: 'theme', label: '按主题推荐', type: 'select', options: ACG_THEMES, default: '' },
    ],
    run: [{ tool: 'get_astrocartography', args: { profileId: '$profile', place: '{place}', theme: '{theme}' } }],
    prompt: '请用地理占星为$profileName分析行星线分布[[，重点看{place}会受到哪些行星线影响]][[，并按「{theme.label}」主题推荐适合的城市]]。',
  },
  {
    id: 'nameTest', name: '姓名测评', description: '五格剖象与三才配置', icon: 'type',
    category: 'space',
    params: [
      { key: 'surname', label: '姓氏', type: 'text', required: true, placeholder: '如：王、欧阳' },
      { key: 'givenName', label: '名字', type: 'text', required: true, placeholder: '如：明轩' },
    ],
    run: [{ tool: 'analyze_name', args: { surname: '{surname}', givenName: '{givenName}' } }],
    prompt: '请测评「{surname}{givenName}」这个名字：五格数理、三才配置与整体寓意。',
  },
  {
    id: 'zeMing', name: '择名建议', description: '结合八字喜用的取名方向', icon: 'pen-tool',
    category: 'space', subject: 'single',
    params: [
      { key: 'surname', label: '姓氏', type: 'text', required: true, placeholder: '如：李、王、张…' },
      { key: 'babyGender', label: '取名对象性别', type: 'select', options: [{ label: '男', value: 'male' }, { label: '女', value: 'female' }], default: 'male' },
    ],
    run: [{ tool: 'ze_ming', args: { profileId: '$profile', surname: '{surname}', babyGender: '{babyGender}' } }],
    prompt: '请结合$profileName的八字喜用，给出姓{surname}的取名方向，并推荐几个候选名字（可用姓名测评验证）。',
  },
];
