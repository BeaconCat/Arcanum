# 铁板神数 (Tie Ban Shen Shu) — 研究与实现记录

> **状态**: 已完成完整实现（基于 xaminxan/tiebanshenshu 参考项目）
> - 引擎: `server/engines/tieban.engine.ts`
> - 数据: `server/data/tieban/` (16 CSV + 12000条断词)
> - FC工具: `tieban_shenshu` (chat.routes.ts)
> - 前端: `tiebanShenshu` quick tool (settings.types.ts, ChatView.vue)

## 一、概述

铁板神数（又称"铁版神数"）是中国传统命理学中最精密的预测体系之一，相传为宋代邵雍所创。其核心通过八字四柱推算出"条文号码"，再从12000条（或更多版本）的条文库中查出对应的命理断语。

## 二、核心算法

### 2.1 取数法 (Number Derivation)
- **四柱纳甲**: 年月日时各柱的天干地支转换为数字
- **配卦法**: 将四柱数字配成六爻卦象
- **加减法**: 根据特定规则对卦数进行加减运算
- **考刻法**: 精确到"刻"（15分钟）的出生时间校正

### 2.2 干支数表 (Stem-Branch Number Table)
```
天干: 甲=1, 乙=2, 丙=3, 丁=4, 戊=5, 己=6, 庚=7, 辛=8, 壬=9, 癸=10
地支: 子=1, 丑=2, 寅=3, 卯=4, 辰=5, 巳=6, 午=7, 未=8, 申=9, 酉=10, 戌=11, 亥=12

纳甲配数 (另一套):
甲己子午 = 9
乙庚丑未 = 8
丙辛寅申 = 7
丁壬卯酉 = 6
戊癸辰戌 = 5
巳亥 = 4
```

### 2.3 六亲定位
通过不同的取数组合确定:
- **父亲**: 年柱 + 月柱组合
- **母亲**: 年柱 + 日柱组合
- **兄弟**: 月柱 + 日柱组合
- **配偶**: 日柱 + 时柱组合
- **子女**: 时柱相关组合

### 2.4 条文系统
- 传统版: 12000条断语
- 扩展版: 部分版本有数万条
- 分类: 总论、父母、兄弟、婚姻、子女、财运、官运、寿元等

## 三、实现挑战

### 3.1 数据难点
- **条文库**: 完整的铁板神数条文库属于珍贵古籍资料，数字化程度低
- **版本差异**: 多个版本（邵子版、铁关刀版、钱大昕版等），算法细节不同
- **考刻争议**: "考刻"环节需要反复验证，传统上需要已知事实来校正出生时间

### 3.2 算法复杂度
- 取数规则繁多，不同门派有不同的加减法
- 部分环节依赖师傅口传，缺乏公开的完整文档
- 考刻过程本质上是一个校验/调参过程，可能需要用户交互

## 四、实现方案

### Phase 1: 基础取数引擎 (可立即实现)
```typescript
// tieban.engine.ts

interface TiebanInput {
  birthDate: string;     // YYYY-MM-DD
  birthTime: string;     // HH:MM
  gender: 'male' | 'female';
  knownFacts?: string[];  // 已知事实用于考刻验证
}

interface TiebanResult {
  fourPillars: {
    year: { gan: string; zhi: string; ganNum: number; zhiNum: number };
    month: { gan: string; zhi: string; ganNum: number; zhiNum: number };
    day: { gan: string; zhi: string; ganNum: number; zhiNum: number };
    hour: { gan: string; zhi: string; ganNum: number; zhiNum: number };
  };
  naJiaNumbers: number[];   // 纳甲配数
  hexagram: string;         // 配卦结果
  conditionNumbers: number[]; // 推算出的条文号
  entries: TiebanEntry[];   // 匹配到的条文
}

interface TiebanEntry {
  number: number;
  category: string;  // 总论/父母/兄弟/婚姻/子女/财运/寿元
  text: string;
}
```

### Phase 2: 条文库构建
- 收集公开可用的铁板神数条文
- 建立 JSON/YAML 格式的条文数据库
- 按类别索引: `data/tieban-entries.json`

### Phase 3: 考刻交互
- 前端: 交互式问答界面，展示可能的条文让用户确认
- 后端: 根据用户反馈调整出生时间精度
- LLM辅助: 使用AI解释条文含义

### Phase 4: FC 工具集成
```typescript
// chat.routes.ts 中添加
{
  name: 'tieban_shenshu',
  description: '铁板神数推算：根据精确生辰推算条文号码，查询命理断语',
  parameters: {
    birthDate, birthTime, gender, category
  }
}
```

## 五、数据来源

### 可用资源
1. **公开古籍**: 部分铁板神数条文已在各命理论坛公开
2. **学术论文**: 有关铁板神数算法的研究论文
3. **开源项目**: GitHub 上有少量铁板神数相关项目（多为不完整实现）
4. **书籍**: 《铁版神数精解》《邵子神数》等

### 推荐数据格式
```json
{
  "entries": [
    {
      "number": 1,
      "category": "总论",
      "text": "此命为人性情刚直..."
    },
    ...
  ]
}
```

## 六、优先级建议

| 阶段 | 内容 | 难度 | 依赖 |
|------|------|------|------|
| Phase 1 | 基础取数算法（干支→数字→配卦） | 中 | 无 |
| Phase 2 | 条文库收集与数字化 | 高 | 数据源 |
| Phase 3 | 考刻交互系统 | 高 | Phase 1+2 |
| Phase 4 | FC 工具集成 | 低 | Phase 1+2 |

**建议**: 先实现 Phase 1 的基础取数引擎，同时并行收集条文数据。考刻系统可以先用LLM辅助方式简化实现。

## 七、与现有系统的集成

铁板神数与八字系统共享底层干支数据，可复用:
- `bazi.engine.ts` 的四柱排盘结果
- `lunar-javascript` 的干支转换
- `lunisolar` 的精确时辰计算

FC 工具可以自动从 profile 获取生辰数据，降低用户输入门槛。
