import * as yaml from 'js-yaml';
import { getBaziChart } from '../engines/bazi.engine';
import { getZiweiChart } from '../engines/ziwei.engine';
import { chatCompletion, type ChatMessage } from './llm.service';
import { readYaml, writeYaml, getProfileDir } from './storage.service';
import { getProfile } from './profile.service';
import type { BaziChart } from '../../shared/types/bazi.types';
import type { ZiweiChart } from '../../shared/types/ziwei.types';

// ── Types ──

export interface AnalysisSection {
  title: string;
  paragraphs: string[];
  keyPoints: { label: string; value: string }[];
}

export interface NatalAnalysis {
  generatedAt: string;
  profileId: string;
  sections: Record<string, AnalysisSection>;
}

export interface NatalChartData {
  bazi: BaziChart;
  ziwei: ZiweiChart;
  analysis: NatalAnalysis | null;
}

// ── Section definitions for per-tab LLM generation ──

interface SectionDef {
  id: string;
  title: string;
  focus: string;
}

const SECTIONS: SectionDef[] = [
  { id: 'overview', title: '命盘总评', focus: '日主强弱、格局名称与层次、用神喜忌、紫微命宫主星与四化、命盘整体特色与人生基调' },
  { id: 'personality', title: '性格特质', focus: '日主五行性格、十神组合性格倾向、命宫主星性格刻画、辅煞星修正、身宫内在追求、华盖桃花等神煞性格映射' },
  { id: 'career', title: '事业分析', focus: '官杀星状态、印星与学历贵人、食伤生财路径、官禄宫主星与四化、迁移宫外部机遇、适合行业方向、创业vs就职倾向' },
  { id: 'wealth', title: '财运分析', focus: '正财偏财状态与根气、日主能否担财、食伤生财vs官杀护财、财帛宫主星与四化、福德宫理财心态、田宅宫不动产、破财风险' },
  { id: 'relationship', title: '感情分析', focus: '夫妻星状态（男看财女看官）、日支合冲、桃花红鸾天喜、夫妻宫主星与四化、理想伴侣特征、感情优势与挑战' },
  { id: 'health', title: '健康分析', focus: '五行偏枯对应器官（木肝火心土脾金肺水肾）、日主强弱体质、疾厄宫主星与煞星、重点健康领域、养生建议、高风险年龄段' },
  { id: 'dayun', title: '大运走势', focus: '逐步分析每步大运干支与原局作用、对用神帮扶或克泄、每步大运期间事业财运感情趋势、当前大运特点、关键转折点、人生高峰低谷预判' },
];

function natalPath(userId: string, profileId: string): string {
  return `${getProfileDir(userId, profileId)}/natal-chart.yaml`;
}

/**
 * Get cached natal chart data (engine results + LLM analysis).
 * Returns null analysis if not yet generated.
 */
export async function getNatalChart(
  userId: string,
  profileId: string,
): Promise<NatalChartData> {
  const profile = await getProfile(userId, profileId);
  const bazi = getBaziChart(profile.birthDate, profile.birthTime, profile.gender);
  const ziwei = getZiweiChart(profile.birthDate, profile.birthTime, profile.gender);
  const cached = await readYaml<NatalAnalysis>(natalPath(userId, profileId));
  return { bazi, ziwei, analysis: cached };
}

/**
 * Build rich context YAML from engine data
 */
function buildContextYaml(profile: any, bazi: BaziChart, ziwei: ZiweiChart): string {
  const pillar = (k: 'year' | 'month' | 'day' | 'hour') => {
    const p = bazi.pillars[k];
    return {
      gan: p.gan, zhi: p.zhi,
      ganTenGod: p.ganTenGod, zhiTenGods: p.zhiTenGods,
      hideGan: p.hideGan, naYin: p.naYin, diShi: p.diShi,
      shenSha: p.shenSha,
    };
  };
  const ctx = {
    birth: { name: profile.name, gender: profile.gender, date: profile.birthDate, time: profile.birthTime },
    bazi: {
      dayMaster: bazi.dayMaster,
      pillars: { year: pillar('year'), month: pillar('month'), day: pillar('day'), hour: pillar('hour') },
      wuXingPairs: bazi.wuXingPairs,
      taiYuan: `${bazi.taiYuan}(${bazi.taiYuanNaYin})`,
      mingGong: `${bazi.mingGong}(${bazi.mingGongNaYin})`,
      shenGong: `${bazi.shenGong}(${bazi.shenGongNaYin})`,
      jiShen: bazi.jiShen,
      xiongSha: bazi.xiongSha,
      daYun: bazi.daYun?.map((d: any) => `${d.gan}${d.zhi}(${d.startAge}-${d.endAge}岁)`),
    },
    ziwei: {
      fiveElementsClass: ziwei.fiveElementsClass,
      soul: ziwei.soul, body: ziwei.body,
      siHua: ziwei.siHua,
      palaces: ziwei.palaces.map((p: any) => ({
        name: p.name,
        stem: `${p.heavenlyStem}${p.earthlyBranch}`,
        isBody: p.isBodyPalace || undefined,
        major: p.majorStars.map((s: any) => {
          let t = s.name;
          if (s.brightness) t += `(${s.brightness})`;
          if (s.mutagen) t += `[${s.mutagen}]`;
          return t;
        }),
        minor: p.minorStars.map((s: any) => s.name),
      })),
    },
  };
  return yaml.dump(ctx, { indent: 2, noRefs: true, skipInvalid: true });
}

/**
 * Generate a single analysis section via LLM.
 * Returns structured Markdown content + keyPoints cards.
 */
async function generateSection(
  sectionDef: SectionDef,
  contextYaml: string,
): Promise<AnalysisSection> {
  const sysPrompt = `你是"天枢"，一位精通八字命理与紫微斗数的资深命理师。
现在请针对【${sectionDef.title}】进行深入专业分析。

重点关注：${sectionDef.focus}

输出要求（严格遵循 JSON 格式）：
{
  "keyPoints": [
    {"label": "简短标签", "value": "一句话结论"},
    ...（3-6个）
  ],
  "markdown": "完整的 Markdown 分析正文"
}

markdown 正文要求：
- 使用二级标题(##)分小节，使用**加粗**标注关键术语
- 引用具体命盘数据：天干地支名称、星曜名称、宫位名称等
- 适当使用 Markdown 表格对比分析（如五行强弱表、大运对比表）
- 使用有序/无序列表梳理要点
- 每个小节 100-200 字，总计 3-6 个小节
- 语气温和专业，术语需简要解释

示例 markdown 片段：
## 日主分析
此造日元**戊土**生于辰月，得令...

| 五行 | 天干 | 地支 | 强弱 |
|------|------|------|------|
| 木   | 0    | 1    | 偏弱 |

### 用神建议
1. **水**为用神 — 润燥调候
2. **金**为喜神 — 泄土生水

只输出 JSON，不要有 JSON 之外的任何文字。`;

  const messages: ChatMessage[] = [
    { role: 'system', content: sysPrompt },
    { role: 'user', content: contextYaml },
  ];

  const result = await chatCompletion(messages, { maxTokens: 30000, temperature: 0.5, enableThinking: false });

  const raw = result.content.trim();
  if (result.finishReason === 'length') {
    console.warn(`[natal] Section "${sectionDef.id}" truncated (finish_reason=length)`);
  }

  // Parse JSON response
  try {
    // Strip markdown code fences if present
    let text = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

    // Fix truncated JSON — try to close brackets
    if (!text.endsWith('}')) {
      // Find last complete value
      const lastQuote = text.lastIndexOf('"');
      if (lastQuote > 0) {
        text = text.slice(0, lastQuote + 1) + '}';
        // If keyPoints array is open, close it too
        if (text.includes('"keyPoints"') && !text.includes(']')) {
          text = text.slice(0, lastQuote + 1) + '}]}';
        }
      }
    }

    const parsed = JSON.parse(text);

    const keyPoints: { label: string; value: string }[] = Array.isArray(parsed?.keyPoints)
      ? parsed.keyPoints
          .filter((kp: any) => kp && kp.label && kp.value)
          .map((kp: any) => ({ label: String(kp.label), value: String(kp.value) }))
      : [];

    const markdown: string = typeof parsed?.markdown === 'string' ? parsed.markdown.trim() : '';
    const paragraphs = markdown ? [markdown] : [raw];

    return { title: sectionDef.title, paragraphs, keyPoints };
  } catch {
    // JSON parse failed — treat raw content as markdown directly
    console.warn(`[natal] Section "${sectionDef.id}" JSON parse failed, using raw content`);
    return {
      title: sectionDef.title,
      paragraphs: [raw || '生成失败，请重试'],
      keyPoints: [],
    };
  }
}

/**
 * Generate or regenerate full natal chart analysis.
 * Runs 7 independent LLM calls (one per section) for deeper analysis.
 */
export async function generateNatalAnalysis(
  userId: string,
  profileId: string,
): Promise<NatalChartData> {
  const profile = await getProfile(userId, profileId);
  const bazi = getBaziChart(profile.birthDate, profile.birthTime, profile.gender);
  const ziwei = getZiweiChart(profile.birthDate, profile.birthTime, profile.gender);
  const contextYaml = buildContextYaml(profile, bazi, ziwei);

  // Run all sections in parallel
  const results = await Promise.all(
    SECTIONS.map((sec) => generateSection(sec, contextYaml)),
  );

  const sections: Record<string, AnalysisSection> = {};
  for (let i = 0; i < SECTIONS.length; i++) {
    sections[SECTIONS[i].id] = results[i];
  }

  const analysis: NatalAnalysis = {
    generatedAt: new Date().toISOString(),
    profileId,
    sections,
  };

  await writeYaml(natalPath(userId, profileId), analysis);
  return { bazi, ziwei, analysis };
}

/**
 * Generate or regenerate a single section only.
 */
export async function generateSingleSection(
  userId: string,
  profileId: string,
  sectionId: string,
): Promise<NatalChartData> {
  const sectionDef = SECTIONS.find((s) => s.id === sectionId);
  if (!sectionDef) throw new Error(`Unknown section: ${sectionId}`);

  const profile = await getProfile(userId, profileId);
  const bazi = getBaziChart(profile.birthDate, profile.birthTime, profile.gender);
  const ziwei = getZiweiChart(profile.birthDate, profile.birthTime, profile.gender);
  const contextYaml = buildContextYaml(profile, bazi, ziwei);

  const cached = await readYaml<NatalAnalysis>(natalPath(userId, profileId));
  const existing = cached || { generatedAt: new Date().toISOString(), profileId, sections: {} };

  existing.sections[sectionId] = await generateSection(sectionDef, contextYaml);
  existing.generatedAt = new Date().toISOString();

  await writeYaml(natalPath(userId, profileId), existing);
  return { bazi, ziwei, analysis: existing };
}
