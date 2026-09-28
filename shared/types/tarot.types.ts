// 塔罗

export type TarotSuit = 'wands' | 'cups' | 'swords' | 'pentacles';
export type TarotArcana = 'major' | 'minor';

export interface TarotAspects {
  love: string;
  career: string;
  wealth: string;
  growth: string;
}

export interface TarotCard {
  /** major-00 … major-21, wands-01 … pentacles-14 */
  id: string;
  /** 0–77, deck order: majors, wands, cups, swords, pentacles */
  index: number;
  arcana: TarotArcana;
  /** Major: 0–21. Minor: 1 (首牌) … 10, 11 侍从, 12 骑士, 13 王后, 14 国王 */
  number: number;
  suit?: TarotSuit;
  suitName?: string;       // 权杖 / 圣杯 / 宝剑 / 星币
  element?: string;        // 火 / 水 / 风 / 土
  correspondence?: string; // 大阿卡纳的星象/元素对应
  nameZh: string;
  nameEn: string;
  keywordsUpright: string[];
  keywordsReversed: string[];
  upright: string;
  reversed: string;
  aspects: TarotAspects;
  advice: string;
}

export type TarotSpreadCategory = 'quick' | 'timeline' | 'relationship' | 'decision' | 'holistic';

export interface TarotSpreadPosition {
  id: number;
  name: string;
  meaning: string;
  /** Card centre, percent of layout box */
  x: number;
  y: number;
  rotation?: number;
}

export interface TarotSpread {
  id: string;
  name: string;
  category: TarotSpreadCategory;
  categoryName: string;
  description: string;
  suitableFor: string[];
  /** Layout box width / height */
  aspect: number;
  positions: TarotSpreadPosition[];
}

/** Card art: 'rws' = Rider–Waite–Smith (Pamela Colman Smith, 1909, public domain); 'arcanum' = 天枢自绘 SVG */
export type TarotDeckId = 'rws' | 'arcanum';

export interface TarotDrawnCard {
  positionId: number;
  cardId: string;
  reversed: boolean;
}

export interface TarotReading {
  readingId: string;
  spreadId: string;
  spreadName: string;
  question: string;
  allowReversed: boolean;
  majorOnly: boolean;
  /** Deck the reading was drawn with; older readings lack it and follow the viewer's current deck */
  deck?: TarotDeckId;
  profileId?: string;
  profileName?: string;
  cards: TarotDrawnCard[];
  interpretation?: string;
  note?: string;
  favorite?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TarotReadingMeta {
  readingId: string;
  spreadName: string;
  question: string;
  cardCount: number;
  /** First few cards, for list previews */
  preview: TarotDrawnCard[];
  hasInterpretation: boolean;
  deck?: TarotDeckId;
  favorite?: boolean;
  createdAt: string;
}

export interface TarotReadingPage {
  items: TarotReadingMeta[];
  total: number;
  offset: number;
  limit: number;
}

export interface TarotDrawOptions {
  spreadId: string;
  question?: string;
  allowReversed?: boolean;
  majorOnly?: boolean;
  deck?: TarotDeckId;
  profileId?: string;
  /**
   * Optional deck indices chosen by the user from the shuffled fan (0-based, one per position).
   * The server shuffles independently; picks select positions in that shuffled deck.
   */
  picks?: number[];
}
