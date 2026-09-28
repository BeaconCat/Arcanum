import { astro } from 'iztro';
import type { ZiweiChart, ZiweiPalace, ZiweiStar, SiHua } from '../../shared/types/ziwei.types';
import type { FlowDayContext, DailyPalaceInfo } from '../../shared/types/fortune.types';

// ── Helpers ──

function hourToTimeIndex(hour: number): number {
  if (hour === 23 || hour === 0) return 0;
  return Math.floor((hour + 1) / 2);
}

function mapStar(s: any): ZiweiStar {
  return {
    name: s.name,
    type: s.type || 'adjective',
    brightness: s.brightness || undefined,
    mutagen: s.mutagen || undefined,
    scope: s.scope || undefined,
  };
}

function mapPalace(p: any): ZiweiPalace {
  return {
    index: p.index ?? 0,
    name: p.name,
    isBodyPalace: !!p.isBodyPalace,
    heavenlyStem: p.heavenlyStem || '',
    earthlyBranch: p.earthlyBranch || '',
    majorStars: (p.majorStars || []).map(mapStar),
    minorStars: (p.minorStars || []).map(mapStar),
    adjectiveStars: (p.adjectiveStars || []).map(mapStar),
    changsheng12: p.changsheng12 || '',
    boshi12: p.boshi12 || '',
    jiangqian12: p.jiangqian12 || '',
    suiqian12: p.suiqian12 || '',
    decadal: p.decadal
      ? { range: p.decadal.range, heavenlyStem: p.decadal.heavenlyStem, earthlyBranch: p.decadal.earthlyBranch }
      : { range: [0, 0], heavenlyStem: '', earthlyBranch: '' },
    ages: p.ages || [],
  };
}

function extractSiHua(result: any): SiHua {
  const empty = { star: '', palace: '' };
  const siHua: SiHua = { lu: { ...empty }, quan: { ...empty }, ke: { ...empty }, ji: { ...empty } };
  const map: Record<string, keyof SiHua> = { '禄': 'lu', '权': 'quan', '科': 'ke', '忌': 'ji' };

  for (const palace of result.palaces || []) {
    const allStars = [
      ...(palace.majorStars || []),
      ...(palace.minorStars || []),
      ...(palace.adjectiveStars || []),
    ];
    for (const star of allStars) {
      if (star.mutagen && map[star.mutagen]) {
        siHua[map[star.mutagen]] = { star: star.name, palace: palace.name };
      }
    }
  }
  return siHua;
}

// ── Main exports ──

export function getZiweiChart(
  birthDate: string,
  birthTime: string,
  gender: 'male' | 'female',
): ZiweiChart {
  const hour = parseInt(birthTime.split(':')[0], 10);
  const timeIndex = hourToTimeIndex(hour);
  const genderStr = gender === 'male' ? '男' : '女';

  const result = (astro as any).bySolar(birthDate, timeIndex, genderStr);

  return {
    gender: result.gender || genderStr,
    solarDate: result.solarDate || birthDate,
    lunarDate: result.lunarDate || '',
    chineseDate: result.chineseDate || '',
    time: result.time || '',
    timeRange: result.timeRange || '',
    sign: result.sign || '',
    zodiac: result.zodiac || '',
    fiveElementsClass: result.fiveElementsClass || '',
    soul: result.soul || '',
    body: result.body || '',
    earthlyBranchOfSoulPalace: result.earthlyBranchOfSoulPalace || '',
    earthlyBranchOfBodyPalace: result.earthlyBranchOfBodyPalace || '',
    palaces: (result.palaces || []).map(mapPalace),
    siHua: extractSiHua(result),
  };
}

export function getZiweiDailyChart(
  birthDate: string,
  birthTime: string,
  gender: 'male' | 'female',
  targetDate: string,
): ZiweiChart {
  const chart = getZiweiChart(birthDate, birthTime, gender);

  // Attach horoscope overlay — enrich with flow stars if available
  try {
    const hour = parseInt(birthTime.split(':')[0], 10);
    const timeIndex = hourToTimeIndex(hour);
    const genderStr = gender === 'male' ? '男' : '女';
    const result = (astro as any).bySolar(birthDate, timeIndex, genderStr);
    const horoscope = result.horoscope(targetDate);

    // Merge yearly/monthly/daily flow stars into palaces
    if (horoscope) {
      const layers = [
        { scope: 'yearly', data: horoscope.yearly },
        { scope: 'monthly', data: horoscope.monthly },
        { scope: 'daily', data: horoscope.daily },
      ];

      for (const { scope, data } of layers) {
        if (!data?.stars) continue;
        for (let i = 0; i < data.stars.length && i < chart.palaces.length; i++) {
          const flowStars: ZiweiStar[] = (data.stars[i] || []).map((s: any) => ({
            name: s.name,
            type: s.type || 'flower',
            scope,
          }));
          chart.palaces[i].adjectiveStars.push(...flowStars);
        }
      }
    }
  } catch {
    // Fallback to base chart
  }

  return chart;
}

// ── Flow Day Context for daily detail generation ──

const KEY_PALACE_NAMES = ['命宫', '官禄', '财帛', '夫妻', '疾厄', '迁移', '父母', '福德', '田宅'];

function formatStar(s: any): string {
  let name = s.name || '';
  if (s.brightness) name += `(${s.brightness})`;
  if (s.mutagen) name += ` 化${s.mutagen}`;
  return name;
}

export function getFlowDayContext(
  birthDate: string,
  birthTime: string,
  gender: 'male' | 'female',
  targetDate: string,
): FlowDayContext {
  const hour = parseInt(birthTime.split(':')[0], 10);
  const timeIndex = hourToTimeIndex(hour);
  const genderStr = gender === 'male' ? '男' : '女';

  const result = (astro as any).bySolar(birthDate, timeIndex, genderStr);
  const horoscope = result.horoscope(targetDate);

  const dailyPalaces: Record<string, DailyPalaceInfo> = {};

  for (const palaceName of KEY_PALACE_NAMES) {
    try {
      // Get natal palace info at this position
      const natalPalace = result.palaces?.find((p: any) => p.name === palaceName);

      const natalStars: string[] = [];
      if (natalPalace) {
        for (const s of natalPalace.majorStars || []) {
          if (s.name) natalStars.push(formatStar(s));
        }
        for (const s of natalPalace.minorStars || []) {
          if (s.name && (s.type === 'soft' || s.type === 'tough' || s.type === 'lucun' || s.type === 'tianma')) {
            natalStars.push(formatStar(s));
          }
        }
      }

      // Collect flow stars from all scopes for this palace
      const flowStars: string[] = [];
      const siHua: string[] = [];

      const scopes: Array<{ scope: string; label: string }> = [
        { scope: 'decadal', label: '大限' },
        { scope: 'yearly', label: '流年' },
        { scope: 'monthly', label: '流月' },
        { scope: 'daily', label: '流日' },
      ];

      for (const { scope, label } of scopes) {
        try {
          const fp = horoscope.palace(palaceName, scope);
          if (!fp) continue;

          // Flow stars in this palace for this scope
          const fpData = fp as any;
          // Check if palace has flow stars via the raw data
          if (fpData.adjectiveStars) {
            for (const s of fpData.adjectiveStars) {
              if (s.scope === scope && s.name) {
                flowStars.push(`[${label}]${s.name}`);
              }
            }
          }

          // Check for mutagens from this scope's stars in this palace
          for (const s of [...(fpData.majorStars || []), ...(fpData.minorStars || [])]) {
            if (s.mutagen) {
              siHua.push(`[${label}]${s.name}化${s.mutagen}`);
            }
          }
        } catch {
          // Some scopes may not work for all palaces
        }
      }

      // Also include adjectiveStars from natal that might be relevant
      if (natalPalace) {
        for (const s of natalPalace.adjectiveStars || []) {
          if (s.name && s.type !== 'flower') {
            natalStars.push(s.name);
          }
        }
      }

      dailyPalaces[palaceName] = {
        natalStars,
        flowStars,
        siHua,
        changsheng12: natalPalace?.changsheng12 || '',
      };
    } catch {
      dailyPalaces[palaceName] = { natalStars: [], flowStars: [], siHua: [], changsheng12: '' };
    }
  }

  // Flow mutagen for each scope
  const flowMutagen = {
    decadal: (horoscope.decadal?.mutagen || []).map((s: string) => s),
    yearly: (horoscope.yearly?.mutagen || []).map((s: string) => s),
    monthly: (horoscope.monthly?.mutagen || []).map((s: string) => s),
    daily: (horoscope.daily?.mutagen || []).map((s: string) => s),
  };

  // Palace name mapping for daily scope
  const palaceMapping = {
    daily: horoscope.daily?.palaceNames || [],
  };

  return { dailyPalaces, flowMutagen, palaceMapping };
}

/**
 * Get flow-year context: natal + decadal + yearly flow stars for 12 palaces.
 */
export function getFlowYearContext(
  birthDate: string,
  birthTime: string,
  gender: 'male' | 'female',
  targetYear: number,
): Record<string, unknown> {
  const hour = parseInt(birthTime.split(':')[0], 10);
  const timeIndex = hourToTimeIndex(hour);
  const genderStr = gender === 'male' ? '男' : '女';

  const result = (astro as any).bySolar(birthDate, timeIndex, genderStr);
  // Use Jan 15 of target year for horoscope
  const horoscope = result.horoscope(`${targetYear}-01-15`);

  const ALL_PALACES = ['命宫', '兄弟', '夫妻', '子女', '财帛', '疾厄', '迁移', '交友', '官禄', '田宅', '福德', '父母'];
  const palaces: Record<string, any> = {};

  for (const palaceName of ALL_PALACES) {
    try {
      const natalPalace = result.palaces?.find((p: any) => p.name === palaceName);
      const natalStars: string[] = [];
      if (natalPalace) {
        for (const s of [...(natalPalace.majorStars || []), ...(natalPalace.minorStars || [])]) {
          if (s.name) natalStars.push(formatStar(s));
        }
      }

      const flowStars: string[] = [];
      const siHua: string[] = [];
      for (const { scope, label } of [{ scope: 'decadal', label: '大限' }, { scope: 'yearly', label: '流年' }]) {
        try {
          const fp = horoscope.palace(palaceName, scope) as any;
          if (!fp) continue;
          if (fp.adjectiveStars) for (const s of fp.adjectiveStars) { if (s.scope === scope && s.name) flowStars.push(`[${label}]${s.name}`); }
          for (const s of [...(fp.majorStars || []), ...(fp.minorStars || [])]) { if (s.mutagen) siHua.push(`[${label}]${s.name}化${s.mutagen}`); }
        } catch { /* ok */ }
      }

      palaces[palaceName] = {
        natalStars,
        flowStars,
        siHua,
        changsheng12: natalPalace?.changsheng12 || '',
        isBody: !!natalPalace?.isBodyPalace,
      };
    } catch {
      palaces[palaceName] = { natalStars: [], flowStars: [], siHua: [], changsheng12: '' };
    }
  }

  const flowMutagen = {
    decadal: (horoscope.decadal?.mutagen || []).map((s: string) => s),
    yearly: (horoscope.yearly?.mutagen || []).map((s: string) => s),
  };

  return { year: targetYear, palaces, flowMutagen };
}

/**
 * Get flow-month context: natal + decadal + yearly + monthly flow stars for key palaces.
 */
export function getFlowMonthContext(
  birthDate: string,
  birthTime: string,
  gender: 'male' | 'female',
  targetYear: number,
  targetMonth: number,
): Record<string, unknown> {
  const hour = parseInt(birthTime.split(':')[0], 10);
  const timeIndex = hourToTimeIndex(hour);
  const genderStr = gender === 'male' ? '男' : '女';

  const result = (astro as any).bySolar(birthDate, timeIndex, genderStr);
  const mm = String(targetMonth).padStart(2, '0');
  const horoscope = result.horoscope(`${targetYear}-${mm}-15`);

  const palaces: Record<string, any> = {};
  for (const palaceName of KEY_PALACE_NAMES) {
    try {
      const natalPalace = result.palaces?.find((p: any) => p.name === palaceName);
      const natalStars: string[] = [];
      if (natalPalace) {
        for (const s of [...(natalPalace.majorStars || []), ...(natalPalace.minorStars || [])]) {
          if (s.name) natalStars.push(formatStar(s));
        }
      }

      const flowStars: string[] = [];
      const siHua: string[] = [];
      for (const { scope, label } of [
        { scope: 'decadal', label: '大限' },
        { scope: 'yearly', label: '流年' },
        { scope: 'monthly', label: '流月' },
      ]) {
        try {
          const fp = horoscope.palace(palaceName, scope) as any;
          if (!fp) continue;
          if (fp.adjectiveStars) for (const s of fp.adjectiveStars) { if (s.scope === scope && s.name) flowStars.push(`[${label}]${s.name}`); }
          for (const s of [...(fp.majorStars || []), ...(fp.minorStars || [])]) { if (s.mutagen) siHua.push(`[${label}]${s.name}化${s.mutagen}`); }
        } catch { /* ok */ }
      }

      palaces[palaceName] = {
        natalStars,
        flowStars,
        siHua,
        changsheng12: natalPalace?.changsheng12 || '',
      };
    } catch {
      palaces[palaceName] = { natalStars: [], flowStars: [], siHua: [], changsheng12: '' };
    }
  }

  const flowMutagen = {
    decadal: (horoscope.decadal?.mutagen || []).map((s: string) => s),
    yearly: (horoscope.yearly?.mutagen || []).map((s: string) => s),
    monthly: (horoscope.monthly?.mutagen || []).map((s: string) => s),
  };

  return { year: targetYear, month: targetMonth, palaces, flowMutagen };
}
