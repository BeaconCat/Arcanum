import { chatCompletion, type ChatMessage } from './llm.service';
import { readYaml, writeYaml, getProfileDir } from './storage.service';
import { getProfile } from './profile.service';
import { getBaziChart } from '../engines/bazi.engine';

// ── Types ──

export interface ShenshaExplanation {
  name: string;
  overview: string;
  pillarDetails: { pillar: string; detail: string }[];
  generatedAt: string;
}

interface ShenshaCache {
  entries: Record<string, ShenshaExplanation>;
}

function cachePath(userId: string, profileId: string): string {
  return `${getProfileDir(userId, profileId)}/shensha-cache.yaml`;
}

// ── Public API ──

/**
 * Get a cached shensha explanation. Returns null if not yet generated.
 */
export async function getShenshaExplanation(
  userId: string,
  profileId: string,
  name: string,
): Promise<ShenshaExplanation | null> {
  const cache = await readYaml<ShenshaCache>(cachePath(userId, profileId));
  return cache?.entries?.[name] ?? null;
}

/**
 * Generate (or return cached) shensha explanation via LLM.
 * The result is a two-section structure:
 *   1. overview — what this shensha is in general (50-80 chars)
 *   2. pillarDetails — what it means on each pillar where it appears (30-60 chars each)
 * Results are cached per profile so subsequent calls are instant.
 */
export async function generateShenshaExplanation(
  userId: string,
  profileId: string,
  name: string,
): Promise<ShenshaExplanation> {
  // Check cache first
  const existing = await getShenshaExplanation(userId, profileId, name);
  if (existing) return existing;

  // Build context
  const profile = await getProfile(userId, profileId);
  const chart = getBaziChart(profile.birthDate, profile.birthTime, profile.gender);

  const pillarLabels = ['年柱', '月柱', '日柱', '时柱'] as const;
  const pillarKeys = ['year', 'month', 'day', 'hour'] as const;

  const dayMasterInfo = `日主${chart.dayMaster}（${chart.dayMasterWuXing}），${chart.wuXingAnalysis?.dayMasterStrength || ''}`;
  const pillarDesc = pillarKeys.map((k, i) => {
    const p = chart.pillars[k];
    return `${pillarLabels[i]}:${p.gan}${p.zhi}(${p.naYin})`;
  }).join('，');

  // Detect dayun key pattern: 大运_甲子_1-8
  const dayunMatch = name.match(/^大运_(.{2})_(\d+-\d+)$/);
  const isDayun = !!dayunMatch;

  let userPrompt: string;
  let systemPrompt: string;

  if (isDayun) {
    const dyGanZhi = dayunMatch![1];
    const dyAgeRange = dayunMatch![2];
    const dyGan = dyGanZhi[0];
    const dyZhi = dyGanZhi[1];

    // Find this dayun's full data
    const dyData = chart.daYun?.find(d => `${d.gan}${d.zhi}` === dyGanZhi && `${d.startAge}-${d.endAge}` === dyAgeRange);
    const isCurrent = dyData && chart.currentDaYun && dyData === chart.currentDaYun;

    systemPrompt = `你是命理学专家。用户会提供一个八字和一步大运，请按要求的YAML格式输出解析。
要求：语言精练，有深度，结合八字原局分析大运干支与日主的生克关系、对用神的帮扶或克泄。直接输出YAML，不要代码块标记。`;

    userPrompt = `请解析以下大运在此八字中的作用：
${dayMasterInfo}
四柱：${pillarDesc}
大运：${dyGan}${dyZhi}（${dyAgeRange}岁）${isCurrent ? '【当前大运】' : ''}
请按以下YAML格式输出：
overview: "（100字以内，介绍此步大运干支特征及与日主的关系）"
pillars:
  - pillar: "事业"
    detail: "（60字以内，此大运对事业的影响）"
  - pillar: "财运"
    detail: "（60字以内，此大运对财运的影响）"
  - pillar: "感情"
    detail: "（60字以内，此大运对感情的影响）"`;
  } else {
    // Shensha logic
    const appearances: { pillar: string; gan: string; zhi: string }[] = [];
    for (let i = 0; i < pillarKeys.length; i++) {
      const p = chart.pillars[pillarKeys[i]];
      if (p.shenSha.includes(name)) {
        appearances.push({ pillar: pillarLabels[i], gan: p.gan, zhi: p.zhi });
      }
    }

    const isJiShen = chart.jiShen?.includes(name);
    const isXiongSha = chart.xiongSha?.includes(name);
    const isDayLevel = (isJiShen || isXiongSha) && appearances.length === 0;

    systemPrompt = `你是命理学专家。用户会提供一个八字和一个神煞名称，请按要求的YAML格式输出解析。
要求：语言精练，有深度，结合八字原局分析，不要泛泛而谈。直接输出YAML，不要代码块标记。`;

    if (isDayLevel) {
      userPrompt = `请解析"${name}"在以下八字中的含义：
${dayMasterInfo}
四柱：${pillarDesc}
此神煞为日级${isJiShen ? '吉神' : '凶煞'}。
请按以下YAML格式输出：
overview: "（80字以内，介绍此神煞的含义和一般作用）"
dayLevel: "（80字以内，解析此神煞在这个八字中的具体影响）"`;
    } else {
      const appDesc = appearances.map(a => `${a.pillar}(${a.gan}${a.zhi})`).join('、');
      userPrompt = `请解析"${name}"在以下八字中的含义：
${dayMasterInfo}
四柱：${pillarDesc}
"${name}"出现在：${appDesc}
请按以下YAML格式输出：
overview: "（80字以内，介绍此神煞的含义和一般作用）"
pillars:
${appearances.map(a => `  - pillar: "${a.pillar}"
    detail: "（60字以内，解析${name}在${a.pillar}的具体影响）"`).join('\n')}`;
    }
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const result = await chatCompletion(messages, {
    maxTokens: isDayun ? 768 : 512,
    temperature: 0.4,
    enableThinking: false,
  });

  // Parse LLM response
  let overview = '';
  const pillarDetails: { pillar: string; detail: string }[] = [];

  const content = result.content.replace(/^```[\s\S]*?\n/, '').replace(/\n```$/, '').trim();

  // Extract overview
  const ovMatch = content.match(/overview:\s*"?([^"\n]+)"?/);
  if (ovMatch) overview = ovMatch[1].trim();

  if (!isDayun && !name.match(/^大运_/)) {
    // Shensha parsing
    const isJiShen = chart.jiShen?.includes(name);
    const isXiongSha = chart.xiongSha?.includes(name);
    const appearances: { pillar: string }[] = [];
    for (let i = 0; i < pillarKeys.length; i++) {
      if (chart.pillars[pillarKeys[i]].shenSha.includes(name)) {
        appearances.push({ pillar: pillarLabels[i] });
      }
    }
    const isDayLevel = (isJiShen || isXiongSha) && appearances.length === 0;

    if (isDayLevel) {
      const dlMatch = content.match(/dayLevel:\s*"?([^"\n]+)"?/);
      if (dlMatch) {
        pillarDetails.push({ pillar: '日级', detail: dlMatch[1].trim() });
      }
    } else {
      const pillarRegex = /- pillar:\s*"?([^"\n]+)"?\s*\n\s*detail:\s*"?([^"\n]+)"?/g;
      let m;
      while ((m = pillarRegex.exec(content)) !== null) {
        pillarDetails.push({ pillar: m[1].trim(), detail: m[2].trim() });
      }
    }
  } else {
    // Dayun or general: extract pillar details
    const pillarRegex = /- pillar:\s*"?([^"\n]+)"?\s*\n\s*detail:\s*"?([^"\n]+)"?/g;
    let m;
    while ((m = pillarRegex.exec(content)) !== null) {
      pillarDetails.push({ pillar: m[1].trim(), detail: m[2].trim() });
    }
  }

  // Fallback: if parsing failed, use full content as overview
  if (!overview && content) {
    overview = content.slice(0, 200);
  }

  const explanation: ShenshaExplanation = {
    name,
    overview,
    pillarDetails,
    generatedAt: new Date().toISOString(),
  };

  // Save to cache
  const cPath = cachePath(userId, profileId);
  const cache = (await readYaml<ShenshaCache>(cPath)) ?? { entries: {} };
  cache.entries[name] = explanation;
  await writeYaml(cPath, cache);

  return explanation;
}
