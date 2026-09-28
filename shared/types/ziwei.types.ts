export interface ZiweiStar {
  name: string;
  type: 'major' | 'minor' | 'adjective' | 'flower' | 'helper' | 'tough' | 'lucun' | 'soft' | 'tianma';
  brightness?: string;
  mutagen?: string;
  scope?: string;
}

export interface ZiweiPalace {
  index: number;
  name: string;
  isBodyPalace: boolean;
  heavenlyStem: string;
  earthlyBranch: string;
  majorStars: ZiweiStar[];
  minorStars: ZiweiStar[];
  adjectiveStars: ZiweiStar[];
  changsheng12: string;
  boshi12: string;
  jiangqian12: string;
  suiqian12: string;
  decadal: { range: [number, number]; heavenlyStem: string; earthlyBranch: string };
  ages: number[];
}

export interface SiHua {
  lu: { star: string; palace: string };
  quan: { star: string; palace: string };
  ke: { star: string; palace: string };
  ji: { star: string; palace: string };
}

export interface ZiweiChart {
  // Metadata
  gender: string;
  solarDate: string;
  lunarDate: string;
  chineseDate: string;
  time: string;
  timeRange: string;
  sign: string;
  zodiac: string;
  fiveElementsClass: string;
  soul: string;
  body: string;
  earthlyBranchOfSoulPalace: string;
  earthlyBranchOfBodyPalace: string;
  // Palaces
  palaces: ZiweiPalace[];
  // Si Hua
  siHua: SiHua;
}
