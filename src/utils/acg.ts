import type { AcgAngle, AcgBodyKey, AcgTheme } from '../../shared/types/acg.types';

export const ACG_BODY_META: { key: AcgBodyKey; name: string; symbol: string }[] = [
  { key: 'sun', name: '太阳', symbol: '☉︎' },
  { key: 'moon', name: '月亮', symbol: '☽︎' },
  { key: 'mercury', name: '水星', symbol: '☿︎' },
  { key: 'venus', name: '金星', symbol: '♀︎' },
  { key: 'mars', name: '火星', symbol: '♂︎' },
  { key: 'jupiter', name: '木星', symbol: '♃︎' },
  { key: 'saturn', name: '土星', symbol: '♄︎' },
  { key: 'uranus', name: '天王星', symbol: '♅︎' },
  { key: 'neptune', name: '海王星', symbol: '♆︎' },
  { key: 'pluto', name: '冥王星', symbol: '♇︎' },
  { key: 'northNode', name: '北交点', symbol: '☊︎' },
];

export const ACG_ANGLE_META: { key: AcgAngle; name: string; short: string; hint: string }[] = [
  { key: 'MC', name: '天顶线', short: 'MC', hint: '事业 · 公众形象' },
  { key: 'IC', name: '天底线', short: 'IC', hint: '家庭 · 根基' },
  { key: 'AC', name: '上升线', short: 'AC', hint: '自我 · 身体状态' },
  { key: 'DC', name: '下降线', short: 'DC', hint: '关系 · 合作' },
];

/** Stroke styling per angle (widths in screen px; non-scaling strokes) */
export const ACG_ANGLE_STROKE: Record<AcgAngle, { width: number; dash?: string }> = {
  MC: { width: 2.4 },
  AC: { width: 1.7 },
  DC: { width: 1.7, dash: '7 4' },
  IC: { width: 1.2, dash: '2 3' },
};

/** Per-planet colours come from CSS variables defined on the map page (light/dark aware). */
export const acgColorVar = (key: AcgBodyKey) => `var(--acg-${key})`;

export const ACG_THEME_ICONS: Record<AcgTheme, string> = {
  career: '💼', love: '💞', wealth: '💰', healing: '🌿', creativity: '🎨', adventure: '🧭', study: '📚', home: '🏡',
};

export function formatKm(km: number): string {
  return km < 1 ? '线上' : `${Math.round(km)} 公里`;
}

export function formatLatLon(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
}
