// 星盘解读（原创文案库 + 盘面数据组合而成）

export interface AstroInterpretationItem {
  /** Text library key, e.g. "sign.sun.4" / "aspect.sun.moon.tens" */
  key: string;
  /** e.g. "太阳在狮子" / "太阳刑月亮（容许度 1.2°）" */
  title: string;
  keywords: string[];
  text: string;
  advice?: string;
  /** Chart points this item is about (for highlighting), e.g. ["sun", "moon"] */
  refs?: string[];
  /** Optional small label, e.g. "次要相位" / "推运按行运文案解读" */
  note?: string;
}

export interface AstroInterpretationSection {
  key: string;      // core / signs / houses / aspects / patterns / points / cross / overlay ...
  title: string;
  items: AstroInterpretationItem[];
}

export interface AstroInterpretation {
  kind: 'natal' | 'transit' | 'progressed' | 'solar-return' | 'synastry' | 'composite';
  title: string;
  /** One-line context, e.g. "本命盘 · 信标" */
  subtitle?: string;
  sections: AstroInterpretationSection[];
  disclaimer: string;
}
