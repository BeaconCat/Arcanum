import type { FortuneLevel, FortuneRating } from '../../shared/types/fortune.types';

export function ratingToLevel(rating: FortuneRating | string | undefined | null): FortuneLevel {
  switch (rating) {
    case '大吉': return 'great';
    case '吉': return 'good';
    case '凶': return 'bad';
    case '大凶': return 'terrible';
    default: return 'neutral';
  }
}

/** YYYY-MM-DD in the browser's local timezone (toISOString() is UTC and shifts the day). */
export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** "4月21日 周二" style label for a YYYY-MM-DD string. */
export function formatDateCn(dateStr: string, withWeekday = true): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const wd = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${m}月${d}日${withWeekday ? ` 周${wd}` : ''}`;
}

const GAN_WX: Record<string, string> = {
  甲: 'wood', 乙: 'wood', 丙: 'fire', 丁: 'fire', 戊: 'earth',
  己: 'earth', 庚: 'metal', 辛: 'metal', 壬: 'water', 癸: 'water',
};
const ZHI_WX: Record<string, string> = {
  子: 'water', 丑: 'earth', 寅: 'wood', 卯: 'wood', 辰: 'earth', 巳: 'fire',
  午: 'fire', 未: 'earth', 申: 'metal', 酉: 'metal', 戌: 'earth', 亥: 'water',
};
const EL_WX: Record<string, string> = { 木: 'wood', 火: 'fire', 土: 'earth', 金: 'metal', 水: 'water' };

/** 五行 key ('wood' | 'fire' | ...) for a 天干, 地支 or 五行 character. */
export function wuxingOf(ch: string | undefined | null): string {
  if (!ch) return '';
  return GAN_WX[ch] || ZHI_WX[ch] || EL_WX[ch] || '';
}
