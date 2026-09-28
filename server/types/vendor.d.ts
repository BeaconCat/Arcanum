declare module 'lunar-javascript' {
  export class Solar {
    static fromYmd(year: number, month: number, day: number): Solar;
    static fromYmdHms(
      year: number,
      month: number,
      day: number,
      hour: number,
      minute: number,
      second: number,
    ): Solar;
    getLunar(): Lunar;
  }

  export class Lunar {
    getEightChar(): EightChar;
    getDayInGanZhi(): string;
    getYearInChinese(): string;
    getMonthInChinese(): string;
    getDayInChinese(): string;
    getPrevJieQi(): JieQi | null;
    getNextJieQi(): JieQi | null;
  }

  export class JieQi {
    getName(): string;
    getSolar(): Solar;
  }

  export class EightChar {
    getYearGan(): string;
    getYearZhi(): string;
    getMonthGan(): string;
    getMonthZhi(): string;
    getDayGan(): string;
    getDayZhi(): string;
    getTimeGan(): string;
    getTimeZhi(): string;
    getYearShiShenGan(): string;
    getMonthShiShenGan(): string;
    getTimeShiShenGan(): string;
    getYun(gender: number): Yun;
  }

  export class Yun {
    getDaYun(): DaYunItem[];
  }

  export class DaYunItem {
    getGanZhi(): string;
    getStartAge(): number;
    getEndAge(): number;
  }
}
