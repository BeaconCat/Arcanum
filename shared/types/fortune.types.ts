export interface DailyFortune {
  date: string;
  lunarDate: string;
  dayGanZhi: string;
  tenGod: string;
  overallScore: number;
  rating: FortuneRating;
  tagline: string;
  overview: string;
  favorable: string[];
  unfavorable: string[];
  dimensions: FortuneDimensions;
}

export type FortuneRating = '大吉' | '吉' | '平' | '凶' | '大凶';

export type FortuneLevel = 'great' | 'good' | 'neutral' | 'bad' | 'terrible';

export interface FortuneDimensions {
  career: number;
  wealth: number;
  relationship: number;
  health: number;
  study: number;
}

export interface MonthlyCalendar {
  year: number;
  month: number;
  profileId: string;
  generatedAt: string;
  weeks: WeekBatch[];
  days: DailyFortune[];
}

export interface WeekBatch {
  weekIndex: number;
  startDate: string;
  endDate: string;
  dates: string[];
  generated: boolean;
}

export interface DayMetadata {
  zhiXing: string;
  liuYao: string;
  yueXiang: string;
  wuHou: string;
  hou: string;
  season: string;
  yuanYun: string;
  dayNineStar: string;
  taiSuiPos: string;
  monthTaiSuiPos: string;
  pengZuGan: string;
  pengZuZhi: string;
  dayChong: string;
  daySha: string;
  naYin: string;
}

export interface DailyDetail extends DailyFortune {
  flowContext: FlowDayContext;
  events: Record<string, DimensionDetail>;
  hourlyFortune: HourlyFortune[];
  directions: {
    favorable: string[];
    unfavorable: string[];
  };
  luckyColor: string;
  luckyNumber: string;
  detailedFavorable: ActionWithReason[];
  detailedUnfavorable: ActionWithReason[];
  dayMetadata?: DayMetadata;
}

export interface DailyPalaceInfo {
  natalStars: string[];
  flowStars: string[];
  siHua: string[];
  changsheng12: string;
}

export interface FlowDayContext {
  dailyPalaces: Record<string, DailyPalaceInfo>;
  flowMutagen: {
    decadal: string[];
    yearly: string[];
    monthly: string[];
    daily: string[];
  };
  palaceMapping: {
    daily: string[];
  };
}

export interface HourlyFortune {
  hour: string;
  level: 'great' | 'good' | 'neutral' | 'bad' | 'terrible';
  tip: string;
  ganZhi?: string;
  tianShen?: string;
  tianShenType?: string;
  nineStar?: string;
  chong?: string;
  sha?: string;
}

export interface ActionWithReason {
  action: string;
  reason: string;
}

export interface DimensionDetail {
  summary: string;
  details: string;
}

export interface TrendPoint {
  date: string;
  overall: number;
  career: number;
  wealth: number;
  relationship: number;
  health: number;
  study: number;
}

export interface TrendData {
  profileId: string;
  from: string;
  to: string;
  points: TrendPoint[];
}
