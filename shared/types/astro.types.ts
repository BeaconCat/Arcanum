// 西洋占星本命盘（星盘）

export type AstroHouseSystem = 'placidus' | 'whole-sign' | 'equal' | 'porphyry';

export type AstroElement = 'fire' | 'earth' | 'air' | 'water';
export type AstroModality = 'cardinal' | 'fixed' | 'mutable';

export type AstroBodyKey =
  | 'sun' | 'moon' | 'mercury' | 'venus' | 'mars'
  | 'jupiter' | 'saturn' | 'uranus' | 'neptune' | 'pluto'
  | 'northNode' | 'southNode'
  // 小行星（星历表插值）与虚点（计算点）
  | 'chiron' | 'ceres' | 'pallas' | 'juno' | 'vesta'
  | 'lilith' | 'fortune';

/** Optional bodies that can be switched on/off in the chart settings */
export type AstroExtraBodyKey = 'chiron' | 'ceres' | 'pallas' | 'juno' | 'vesta' | 'lilith' | 'fortune';

/** planet = 十大行星；node = 南北交点；asteroid = 凯龙与四大小行星；point = 莉莉丝、福点等计算点 */
export type AstroBodyCategory = 'planet' | 'node' | 'asteroid' | 'point';

export type AstroPointKey = AstroBodyKey | 'asc' | 'mc';

export type AstroAspectType =
  | 'conjunction'      // 合 0°
  | 'semisextile'      // 十二分 30°
  | 'semisquare'       // 八分 45°
  | 'sextile'          // 六合 60°
  | 'quintile'         // 五分 72°
  | 'square'           // 刑 90°
  | 'trine'            // 拱 120°
  | 'sesquiquadrate'   // 补八分 135°
  | 'biquintile'       // 倍五分 144°
  | 'quincunx'         // 梅花 150°
  | 'opposition';      // 冲 180°

export type AstroAspectClass = 'major' | 'minor';

/** 庙 / 旺 / 陷 / 落 / 游走（无尊贵） */
export type AstroDignity = 'domicile' | 'exaltation' | 'detriment' | 'fall' | 'peregrine';

/** Resolved birth location (from free-text 出生地 or a manual override). */
export interface BirthPlaceResolution {
  lat: number;
  lon: number;
  /** Human readable matched place, e.g. "吉林省 长春市 公主岭市" */
  matched: string;
  precision: 'manual' | 'county' | 'city' | 'province' | 'default';
  note?: string;
}

export interface AstroSignPosition {
  /** 0–360 ecliptic longitude (tropical, true equinox of date) */
  longitude: number;
  signIndex: number;     // 0 = 白羊 … 11 = 双鱼
  sign: string;          // 中文星座名，如「白羊」
  signSymbol: string;    // ♈ …
  degree: number;        // 0–29 within the sign
  minute: number;        // 0–59
}

export interface AstroPlanet extends AstroSignPosition {
  key: AstroBodyKey;
  category: AstroBodyCategory;
  name: string;          // 中文名，如「太阳」
  symbol: string;        // ☉ …
  house: number;         // 1–12
  /** Longitude speed in degrees/day (negative = retrograde) */
  speed: number;
  retrograde: boolean;
  /** Essential dignity by sign (modern rulerships for outer planets); undefined for nodes */
  dignity?: AstroDignity;
  dignityName?: string;  // 庙 / 旺 / 陷 / 落 / ''
}

export interface AstroAngle extends AstroSignPosition {
  key: 'asc' | 'mc' | 'dsc' | 'ic';
  name: string;          // 上升 / 天顶 / 下降 / 天底
}

export interface AstroHouseCusp extends AstroSignPosition {
  house: number;         // 1–12
}

export interface AstroAspect {
  a: AstroPointKey;
  b: AstroPointKey;
  aName: string;
  bName: string;
  type: AstroAspectType;
  typeName: string;      // 合 / 六合 / 刑 / 拱 / 冲
  angle: number;         // exact aspect angle (0/30/45/60/72/90/120/135/144/150/180)
  class: AstroAspectClass;
  orb: number;           // deviation from exact, degrees
  applying: boolean;     // true = 入相位, false = 出相位
  harmony: 'harmonious' | 'challenging' | 'neutral';
}

export interface AstroDistribution {
  elements: Record<AstroElement, number>;
  modalities: Record<AstroModality, number>;
  /** 阳性（火风）/ 阴性（土水） */
  polarity: { yang: number; yin: number };
  /** Planet counts by hemisphere (east = houses 10–3 via ASC side, etc.) */
  hemispheres: { east: number; west: number; north: number; south: number };
  /** Which bodies were counted (the 10 planets) */
  counted: AstroBodyKey[];
}

export interface AstroChart {
  input: {
    birthDate: string;
    birthTime: string;
    timezone: string;
    lat: number;
    lon: number;
    houseSystem: AstroHouseSystem;
  };
  /** Birth instant in UTC (ISO) and the UTC offset used, e.g. "+08:00" (DST aware) */
  utc: string;
  utcOffset: string;
  julianDayUT: number;
  /** House system actually used (Placidus falls back to Porphyry at |lat| > 66°) */
  houseSystemUsed: AstroHouseSystem;
  houseSystemNote?: string;
  obliquity: number;
  /** Local apparent sidereal time in hours */
  localSiderealTime: number;
  planets: AstroPlanet[];
  angles: { asc: AstroAngle; mc: AstroAngle; dsc: AstroAngle; ic: AstroAngle };
  houses: AstroHouseCusp[];
  aspects: AstroAspect[];
  distribution: AstroDistribution;
  /** Traditional ruler of the Ascendant sign (命主星) */
  chartRuler: { key: AstroBodyKey; name: string };
  place?: BirthPlaceResolution;
  /** Recognised configurations (大三角、大十字、T三角、风筝、上帝之指、神秘长方形、星群) */
  patterns: AstroPattern[];
  /** Aspect settings actually applied */
  settings: AstroChartSettings;
  /** Why some enabled extra bodies are missing (e.g. date outside the asteroid ephemeris range) */
  extraBodiesNote?: string;
}

export type AstroPatternType =
  | 'grand-trine' | 'grand-cross' | 't-square' | 'kite' | 'yod' | 'mystic-rectangle' | 'stellium';

export interface AstroPattern {
  type: AstroPatternType;
  name: string;              // 大三角 / 大十字 / T三角 / 风筝 / 上帝之指 / 神秘长方形 / 星群
  bodies: AstroPointKey[];
  bodyNames: string[];
  /** e.g. 火象大三角, 固定大十字, 天蝎座星群, 第10宫星群 */
  detail: string;
  /** Apex / focal point where meaningful (T三角顶点、上帝之指顶点、风筝尾) */
  apex?: AstroPointKey;
}

/** User-adjustable aspect settings. Missing orbs fall back to engine defaults. */
export interface AstroChartSettings {
  houseSystem: AstroHouseSystem;
  aspects: AstroAspectType[];
  orbs: Partial<Record<AstroAspectType, number>>;
  /** Extra orb added when the Sun or Moon is involved */
  luminaryBonus: number;
  /** Asteroids / points to include (default: chiron, lilith, fortune) */
  extraBodies: AstroExtraBodyKey[];
  /** Orb for aspects involving asteroids / points — they only take major aspects */
  minorBodyOrb: number;
}

// ── Multi-chart techniques ──

export type AstroOverlayKind = 'transit' | 'progressed' | 'solar-return' | 'synastry';

/**
 * Two charts shown as a bi-wheel: `inner` is the natal chart (or person A),
 * `outer` is transits / progressions / solar return / person B.
 */
export interface AstroBiWheel {
  kind: AstroOverlayKind;
  kindName: string;            // 行运 / 次限推运 / 太阳返照 / 比较盘
  innerLabel: string;
  outerLabel: string;
  inner: AstroChart;
  outer: AstroChart;
  /** Aspects between an inner point (a) and an outer point (b) */
  crossAspects: AstroAspect[];
  /** Where outer planets fall in the inner chart's houses */
  outerInInnerHouses: { key: AstroBodyKey; name: string; house: number }[];
  /** Synastry only: where inner planets fall in the outer chart's houses */
  innerInOuterHouses?: { key: AstroBodyKey; name: string; house: number }[];
  /** Synastry only */
  compatibility?: AstroCompatibility;
  /** Moment of the outer chart, e.g. transit date, exact solar return time, progressed date */
  outerMoment: string;
  note?: string;
}

export interface AstroCompatibilityDimension {
  key: 'attraction' | 'emotion' | 'communication' | 'stability' | 'growth';
  name: string;                // 吸引力 / 情感 / 沟通 / 稳定 / 成长
  score: number;               // 0–100
  notes: string[];
}

export interface AstroCompatibility {
  score: number;               // 0–100 overall
  level: string;               // e.g. 天作之合 / 相处融洽 / 需要磨合 / 挑战较多
  dimensions: AstroCompatibilityDimension[];
  /** Most influential contacts, strongest first */
  highlights: { text: string; effect: 'positive' | 'negative' | 'mixed'; weight: number }[];
}

/** Midpoint composite chart for two people (组合中点盘) */
export interface AstroCompositeResponse {
  kind: 'composite';
  labelA: string;
  labelB: string;
  chart: AstroChart;
  note?: string;
}

export interface AstroBiWheelResponse extends AstroBiWheel {
  places: { inner: BirthPlaceResolution; outer?: BirthPlaceResolution };
}

export interface AstroChartResponse {
  chart: AstroChart;
  place: BirthPlaceResolution;
}
