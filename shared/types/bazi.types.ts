export interface HideGanInfo {
  gan: string;
  wuXing: string;
  tenGod: string;
}

export interface BaziPillar {
  gan: string;
  zhi: string;
  ganWuXing: string;
  zhiWuXing: string;
  ganTenGod: string;
  zhiTenGods: string[];
  hideGan: string[];
  hideGanDetail: HideGanInfo[];
  wuXing: string;
  naYin: string;
  naYinWuXing: string;
  xunKong: string;
  diShi: string;
  shenSha: string[];
  ziZuo: string;
}

export interface NineStar {
  year: string;
  month: string;
  day: string;
  time: string;
}

export interface PositionInfo {
  xi: string;
  xiDesc: string;
  yangGui: string;
  yangGuiDesc: string;
  yinGui: string;
  yinGuiDesc: string;
  fu: string;
  fuDesc: string;
  cai: string;
  caiDesc: string;
}

export interface WuXingCount {
  element: string;
  count: number;
  status: string;
}

export interface WuXingAnalysis {
  counts: WuXingCount[];
  missing: string[];
  dominant: string;
  dayMasterStrength: string;
}

export interface BaziChart {
  birthInfo: {
    solarDate: string;
    lunarDate: string;
    solarTime: string;
    jieQi: string;
    jieQiInfo: string;
    shengXiao: string;
  };
  pillars: {
    year: BaziPillar;
    month: BaziPillar;
    day: BaziPillar;
    hour: BaziPillar;
  };
  dayMaster: string;
  dayMasterWuXing: string;
  wuXingPairs: string[];
  wuXingAnalysis: WuXingAnalysis;
  taiYuan: string;
  taiYuanNaYin: string;
  taiXi: string;
  taiXiNaYin: string;
  mingGong: string;
  mingGongNaYin: string;
  shenGong: string;
  shenGongNaYin: string;
  jiShen: string[];
  xiongSha: string[];
  zhiXing: string;
  tianShen: string;
  tianShenType: string;
  tianShenLuck: string;
  timeTianShen: string;
  timeTianShenType: string;
  timeTianShenLuck: string;
  pengZuGan: string;
  pengZuZhi: string;
  dayChong: string;
  dayChongDesc: string;
  daySha: string;
  timeChong: string;
  timeChongDesc: string;
  timeSha: string;
  dayLu: string;
  dayPosition: PositionInfo;
  nineStar: NineStar;
  xiu: string;
  xiuLuck: string;
  xiuSong: string;
  zheng: string;
  animal: string;
  gong: string;
  shou: string;
  dayYi: string[];
  dayJi: string[];
  timeYi: string[];
  timeJi: string[];
  dayPositionTai: string;
  daYun: DaYunStep[];
  currentDaYun: DaYunStep | null;
}

export interface DaYunStep {
  gan: string;
  zhi: string;
  startAge: number;
  endAge: number;
}
