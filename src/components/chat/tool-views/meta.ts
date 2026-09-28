/**
 * Presentation metadata for AI tool calls: category (icon + tone), Chinese title,
 * who the result is about, a one-line summary, and which rich view (if any) renders it.
 *
 * Inputs are the persisted tool message: tool name, args, the YAML/text result (parsed
 * when possible) and the optional structured `display` payload from the server.
 */
import type { Component } from 'vue';
import {
  ScrollText, Orbit, Layers, Map as MapIcon, Hexagon, CalendarDays, Compass, BookOpen, Zap,
} from 'lucide-vue-next';
import type { ToolDisplay } from '../../../../shared/types/tool-display.types';
import { tarotCards } from './tarotRefs';

export type ToolCategory = 'mingli' | 'astro' | 'tarot' | 'acg' | 'divination' | 'almanac' | 'space' | 'records' | 'other';

export const CATEGORY_META: Record<ToolCategory, { label: string; icon: Component; tone: string }> = {
  mingli: { label: '命理', icon: ScrollText, tone: 'var(--color-seal)' },
  astro: { label: '星象', icon: Orbit, tone: 'var(--hua-ke)' },
  tarot: { label: '塔罗', icon: Layers, tone: 'var(--hua-ji)' },
  acg: { label: '地理占星', icon: MapIcon, tone: 'color-mix(in srgb, var(--wx-wood) 55%, var(--wx-water))' },
  divination: { label: '占卜', icon: Hexagon, tone: 'var(--color-gold)' },
  almanac: { label: '择日', icon: CalendarDays, tone: 'var(--color-success)' },
  space: { label: '姓名风水', icon: Compass, tone: 'var(--wx-earth)' },
  records: { label: '天枢资料', icon: BookOpen, tone: 'var(--color-accent)' },
  other: { label: '命理工具', icon: Zap, tone: 'var(--color-accent)' },
};

const TOOL_TITLES: Record<string, string> = {
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

const TOOL_CATEGORY: Record<string, ToolCategory> = {
  get_bazi_chart: 'mingli', get_ziwei_chart: 'mingli', get_bazi_flow_year: 'mingli', get_bazi_flow_month: 'mingli',
  get_bazi_flow_day: 'mingli', get_ziwei_flow_year: 'mingli', get_ziwei_flow_month: 'mingli', get_flow_day_context: 'mingli',
  get_dayun_analysis: 'mingli', get_wuxing_analysis: 'mingli', compare_bazi: 'mingli', get_flying_stars: 'mingli',
  tieban_shenshu: 'mingli',
  get_astro_chart: 'astro', get_astro_transit: 'astro', get_astro_progressed: 'astro', get_astro_solar_return: 'astro',
  get_astro_synastry: 'astro', get_astro_composite: 'astro', get_astro_interpretation: 'astro',
  get_astrocartography: 'acg',
  draw_tarot: 'tarot',
  liu_yao: 'divination', mei_hua: 'divination', qi_men: 'divination',
  get_today_huangli: 'almanac', get_shichen_detail: 'almanac', get_yearly_calendar: 'almanac',
  analyze_name: 'space', analyze_fengshui: 'space', analyze_xuankong: 'space',
  get_natal_analysis: 'records', get_daily_fortune: 'records',
  ze_ri: 'almanac', xun_wu: 'divination', daily_sign: 'divination', ze_ming: 'space',
};

/** Manual (toolbar) tools are persisted with their Chinese name — map those too. */
const MANUAL_CATEGORY: Record<string, ToolCategory> = {
  八字排盘: 'mingli', 紫微排盘: 'mingli', 今日运势: 'records', 择日分析: 'almanac', 时辰吉凶: 'almanac',
  六爻起卦: 'divination', 梅花易数: 'divination', 奇门遁甲: 'divination', 寻物断卦: 'divination',
  合盘分析: 'mingli', 流年大事: 'mingli', 五行分析: 'mingli', 风水分析: 'space', 铁板神数: 'mingli',
  每日一签: 'divination', 择名建议: 'space',
};

export function toolTitle(name?: string): string {
  return (name && TOOL_TITLES[name]) || name || '命理演算';
}

export function toolCategory(name?: string, display?: ToolDisplay | null): ToolCategory {
  if (display) {
    if (display.kind === 'tarot') return 'tarot';
    if (display.kind === 'acg') return 'acg';
    return 'astro';
  }
  if (!name) return 'other';
  return TOOL_CATEGORY[name] || MANUAL_CATEGORY[name] || 'other';
}

type Obj = Record<string, any>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** "信标（本人，2006-01-31 08:00，男）" → "信标" */
function shortName(label: unknown): string {
  if (typeof label !== 'string' || !label) return '';
  return label.split(/[（(]/)[0].trim();
}

/** Who the result is about — shown as a small chip in the card header. */
export function toolSubject(display: ToolDisplay | null | undefined, data: unknown, args?: Record<string, unknown>): string {
  if (display && 'subject' in display && display.subject) return shortName(display.subject) || display.subject;
  if (isObj(data)) {
    if (data['分析对象']) return shortName(data['分析对象']);
    if (isObj(data['甲方']) && isObj(data['乙方'])) {
      return `${shortName(data['甲方']['对象'])} × ${shortName(data['乙方']['对象'])}`;
    }
  }
  if (args && typeof args.name === 'string') return args.name;
  return '';
}


const PILLARS = ['year', 'month', 'day', 'hour'] as const;

/** One-line gist shown under the title, even when the card is collapsed. */
export function toolSummary(name: string | undefined, display: ToolDisplay | null | undefined, data: unknown): string {
  try {
    if (display) return displaySummary(display);
    if (!isObj(data)) return '';
    const d = data;
    switch (name) {
      case 'get_bazi_chart': {
        const p = d.pillars;
        if (!isObj(p)) return '';
        const gz = PILLARS.map((k) => `${p[k]?.gan ?? ''}${p[k]?.zhi ?? ''}`).join(' ');
        return `${gz} · 日主${d.dayMaster ?? ''}${d.dayMasterWuXing ?? ''}${d.wuXingAnalysis?.dayMasterStrength ? ` · ${d.wuXingAnalysis.dayMasterStrength}` : ''}`;
      }
      case 'get_ziwei_chart': {
        const ming = Array.isArray(d.palaces) ? d.palaces.find((x: Obj) => x.name === '命宫') : null;
        const stars = ming?.majorStars?.map((s: Obj) => s.name).join('') || '无主星';
        return `命宫 ${stars} · ${d.fiveElementsClass ?? ''}`;
      }
      case 'liu_yao':
        return `${d.gua64Name ?? ''}${d.bianGua && d.bianGua !== d.gua64Name ? ` → ${d.bianGua}` : ''}${Array.isArray(d.dongYaoList) && d.dongYaoList.length ? ` · 动爻 ${d.dongYaoList.join('、')}` : ' · 静卦'}`;
      case 'mei_hua':
        return `${d.gua64Name ?? ''} → ${d.bianGua ?? ''} · 体用${String(d.tiYongRelation ?? '').replace(/\(.*\)/, '')}`;
      case 'qi_men':
        return `综合 ${d.overallLuck ?? ''} · 方位 ${d.direction ?? ''}`;
      case 'get_today_huangli':
        return `${d.date ?? ''} ${d.dayGanZhi ?? ''}日 · ${d.zhiXing ?? ''}日 · ${d.tianShen ?? ''}（${d.tianShenLuck ?? ''}）`;
      case 'get_shichen_detail': {
        const n = Array.isArray(d.shichen) ? d.shichen.filter((s: Obj) => s.luck === '吉').length : 0;
        return `${d.date ?? ''} · 吉时 ${n} 个`;
      }
      case 'get_bazi_flow_year':
        return `${d.targetYear ?? ''} 流年 ${d.flowYearGanZhi ?? ''}${d.flowYearTenGod ? ` · ${d.flowYearTenGod}` : ''}`;
      case 'get_bazi_flow_month':
        return `${d.targetYear ?? ''}-${String(d.targetMonth ?? '').padStart(2, '0')} 流月 ${d.flowMonthGanZhi ?? ''}${d.flowMonthTenGod ? ` · ${d.flowMonthTenGod}` : ''}`;
      case 'get_bazi_flow_day':
        return `${d.targetDate ?? ''} 流日 ${d.flowDayGanZhi ?? ''}${d.flowDayTenGod ? ` · ${d.flowDayTenGod}` : ''}`;
      case 'get_ziwei_flow_year':
        return `${d.year ?? d.targetYear ?? ''} 紫微流年`;
      case 'get_ziwei_flow_month':
        return `${d.year ?? ''}-${String(d.month ?? '').padStart(2, '0')} 紫微流月`;
      case 'get_flow_day_context':
        return `${d.targetDate ?? d.date ?? ''} 紫微流日`;
      case 'compare_bazi':
        return `${d['甲方']?.['日主'] ?? ''}${d['甲方']?.['五行'] ?? ''} × ${d['乙方']?.['日主'] ?? ''}${d['乙方']?.['五行'] ?? ''}`;
      case 'get_dayun_analysis':
        return d.currentDaYun ? `当前大运 ${d.currentDaYun.gan}${d.currentDaYun.zhi}（${d.currentDaYun.startAge}-${d.currentDaYun.endAge}岁）` : '';
      case 'get_wuxing_analysis':
        return `日主${d.dayMaster ?? ''}${d.dayMasterWuXing ?? ''} · ${d.wuXingAnalysis?.dayMasterStrength ?? ''}${d.wuXingAnalysis?.missing?.length ? ` · 缺${d.wuXingAnalysis.missing.join('')}` : ''}`;
      case 'get_daily_fortune': {
        if (Array.isArray(d['逐日'])) {
          const scores = d['逐日'].map((l: string) => Number(/(\d+)分/.exec(l)?.[1])).filter((n: number) => !Number.isNaN(n));
          const avg = scores.length ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : 0;
          return `${d.month ?? ''} · ${scores.length} 天 · 均分 ${avg}`;
        }
        if (isObj(d['日历'])) return `${d['日历'].date} · ${d['日历'].overallScore}分 ${d['日历'].rating}`;
        return typeof d['状态'] === 'string' ? '尚未生成' : '';
      }
      case 'get_natal_analysis':
        return isObj(d['报告']) ? `${Object.keys(d['报告']).length} 项报告` : '尚未生成';
      case 'ze_ri':
        return `${d.date ?? ''} ${d['日干支'] ?? ''}日 · ${d['值星'] ?? ''}日${d['用途匹配']?.['用途'] ? ` · ${d['用途匹配']['用途']}${d['用途匹配']['在忌中']?.length ? '（忌）' : d['用途匹配']['在宜中']?.length ? '（宜）' : ''}` : ''}`;
      case 'xun_wu':
        return `寻${d['寻物'] ?? ''} · ${d['六爻']?.['本卦'] ?? ''} · 奇门${d['奇门']?.['推荐方位'] ?? ''}`;
      case 'daily_sign':
        return `${d['签号'] ?? ''} · ${d['签等'] ?? ''}`;
      case 'ze_ming':
        return `姓${d['姓氏'] ?? ''} · 日主${d['日主'] ?? ''}${Array.isArray(d['简化喜用五行']) ? ` · 喜${d['简化喜用五行'].join('')}` : ''}`;
      case 'analyze_name':
        return `${d.fullName ?? ''}${d.sanCai?.luck ? ` · 三才${d.sanCai.luck}` : ''}`;
      default:
        return '';
    }
  } catch {
    return '';
  }
}

function displaySummary(d: ToolDisplay): string {
  switch (d.kind) {
    case 'astro-chart': {
      const at = (k: string) => d.chart.planets.find((p) => p.key === k);
      return `太阳${at('sun')?.sign ?? ''} · 月亮${at('moon')?.sign ?? ''} · 上升${d.chart.angles.asc.sign}`;
    }
    case 'astro-biwheel': {
      const w = d.wheel;
      if (w.compatibility) return `匹配度 ${Math.round(w.compatibility.score)} · ${w.compatibility.level}`;
      return `${w.kindName} · ${w.outerMoment.split('（')[0]} · 交互相位 ${w.crossAspects.length}`;
    }
    case 'astro-composite': {
      const at = (k: string) => d.composite.chart.planets.find((p) => p.key === k);
      return `组合太阳${at('sun')?.sign ?? ''} · 上升${d.composite.chart.angles.asc.sign}`;
    }
    case 'astro-interpretation':
      return `${d.interpretation.title} · ${d.interpretation.sections.reduce((n, s) => n + s.items.length, 0)} 条`;
    case 'acg':
      if (d.focus) return `${d.focus.label || '所选地点'} · 附近 ${d.focus.near.length} 条行星线${d.theme ? ` · ${d.theme.name}推荐` : ''}`;
      if (d.theme) return `${d.theme.name} · 推荐 ${d.ranked?.length ?? 0} 座城市`;
      return `${d.result.lines.length} 条行星线`;
    case 'tarot': {
      const r = d.reading;
      // Card names appear once the shared card list has loaded (reactive)
      const names = r.cards.slice(0, 3).map((c) => `${tarotCards.value?.get(c.cardId)?.nameZh ?? ''}${c.reversed ? '【逆】' : ''}`).filter((n) => n && n !== '【逆】');
      return `${r.spreadName}${names.length ? ` · ${names.join(' · ')}${r.cards.length > 3 ? ' …' : ''}` : ` · ${r.cards.length} 张`}`;
    }
  }
}

/** Key of the rich view for this result, or null if only the data view applies. */
export type ToolViewKind =
  | ToolDisplay['kind']
  | 'bazi' | 'ziwei' | 'hexagram' | 'qimen' | 'huangli' | 'shichen' | 'compare-bazi'
  | 'daily-fortune' | 'natal-analysis' | 'key-facts';

const KEY_FACT_TOOLS = new Set([
  'get_bazi_flow_year', 'get_bazi_flow_month', 'get_bazi_flow_day', 'get_dayun_analysis', 'get_wuxing_analysis',
]);

export function toolViewKind(name: string | undefined, display: ToolDisplay | null | undefined, data: unknown): ToolViewKind | null {
  if (display) return display.kind;
  if (!isObj(data)) return null;
  switch (name) {
    case 'get_bazi_chart': return isObj(data.pillars) ? 'bazi' : null;
    case 'get_ziwei_chart': return Array.isArray(data.palaces) ? 'ziwei' : null;
    case 'liu_yao': return Array.isArray(data.yaoLines) ? 'hexagram' : null;
    case 'mei_hua': return data.upperGua && data.lowerGua ? 'hexagram' : null;
    case 'qi_men': return data.timeStar ? 'qimen' : null;
    case 'get_today_huangli': return data.dayGanZhi ? 'huangli' : null;
    case 'get_shichen_detail': return Array.isArray(data.shichen) ? 'shichen' : null;
    case 'compare_bazi': return isObj(data['甲方']) && isObj(data['乙方']) ? 'compare-bazi' : null;
    case 'get_daily_fortune': return Array.isArray(data['逐日']) || isObj(data['日历']) ? 'daily-fortune' : null;
    case 'get_natal_analysis': return isObj(data['报告']) ? 'natal-analysis' : null;
    default: return name && KEY_FACT_TOOLS.has(name) ? 'key-facts' : null;
  }
}

