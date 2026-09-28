// 地理占星（Astrocartography, ACG）

import type { BirthPlaceResolution } from './astro.types';

export type AcgBodyKey =
  | 'sun' | 'moon' | 'mercury' | 'venus' | 'mars'
  | 'jupiter' | 'saturn' | 'uranus' | 'neptune' | 'pluto'
  | 'northNode';

/** AC = 上升（行星在东方地平线升起），DC = 下降，MC = 上中天，IC = 下中天 */
export type AcgAngle = 'AC' | 'DC' | 'MC' | 'IC';

export interface AcgBody {
  key: AcgBodyKey;
  name: string;         // 太阳 …
  symbol: string;       // ☉︎ …
  /** Geocentric apparent right ascension / declination of date, degrees */
  ra: number;
  dec: number;
}

export interface AcgLine {
  body: AcgBodyKey;
  bodyName: string;
  angle: AcgAngle;
  angleName: string;    // 上升线 / 下降线 / 天顶线 / 天底线
  /**
   * Polyline pieces as [lon, lat] (lon east-positive, −180..180).
   * A line breaks where it has no solution (AC/DC near the poles). Consecutive points may cross
   * the ±180° meridian; renderers using spherical interpolation (d3-geo) handle that directly.
   */
  segments: [number, number][][];
  /** MC / IC lines are meridians: their longitude */
  longitude?: number;
}

export interface AcgResult {
  input: { birthDate: string; birthTime: string; timezone: string; lat: number; lon: number };
  utc: string;
  /** Greenwich apparent sidereal time at birth, degrees */
  gastDeg: number;
  bodies: AcgBody[];
  lines: AcgLine[];
  place?: BirthPlaceResolution;
}

export interface AcgText {
  title: string;        // e.g. 金星上升线
  subtitle: string;     // short original tagline
  text: string;         // 60–120 字
  good: string;         // 适合
  caution: string;      // 注意
}

export interface AcgNearHit {
  body: AcgBodyKey;
  bodyName: string;
  angle: AcgAngle;
  angleName: string;
  distanceKm: number;
  /** 1 = on the line, fades to 0 at the influence radius */
  strength: number;
  text?: AcgText;
}

export type AcgTheme = 'career' | 'love' | 'wealth' | 'healing' | 'creativity' | 'adventure' | 'study' | 'home';

export interface AcgThemeDef {
  key: AcgTheme;
  name: string;
  description: string;
}

export interface AcgPlace {
  name: string;
  country: string;      // 中国 / 日本 …
  region?: string;      // 省份（中国城市）
  lat: number;
  lon: number;
}

export interface AcgRankedPlace extends AcgPlace {
  score: number;
  hits: { body: AcgBodyKey; bodyName: string; angle: AcgAngle; angleName: string; distanceKm: number; weight: number }[];
}

export interface AcgNearResponse {
  lat: number;
  lon: number;
  radiusKm: number;
  /** Nearest known place to the clicked point, if any within ~150 km */
  nearestPlace?: AcgPlace & { distanceKm: number };
  hits: AcgNearHit[];
}

export interface AcgRankResponse {
  theme: AcgThemeDef;
  places: AcgRankedPlace[];
}
