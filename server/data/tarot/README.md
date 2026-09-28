# 塔罗数据

| 文件 | 内容 |
|---|---|
| `major.json` | 大阿卡纳 22 张 |
| `wands.json` / `cups.json` / `swords.json` / `pentacles.json` | 小阿卡纳四个花色，各 14 张（1=首牌 … 10，11=侍从，12=骑士，13=王后，14=国王） |
| `spreads.json` | 牌阵：位置名、位置含义、布局坐标（百分比，x/y 为牌中心），可选 `rotation`（度） |

## 原创声明

所有牌义、关键词、方面解读、建议与牌阵说明文字均为天枢 Arcanum 项目原创撰写，依据的是塔罗牌通行的象征体系（牌名、编号、花色与元素对应、常见牌阵的位置结构属于公共知识），**没有摘录或改写任何塔罗书籍、网站或 App 的文字**。

牌面默认使用 Rider–Waite–Smith（1909，Pamela Colman Smith 绘，公有领域）扫描件，位于 `public/tarot/rws/`，逐张出处见其中的 `credits.json`；图片加载失败时退回 `src/components/tarot/TarotCardFace.vue` 以 SVG 程序化绘制的牌面。

## 校验

运行引擎导出的 `validateTarotData()`（返回问题列表，空数组表示通过），会检查 78 张牌齐全、字段完整、释义长度与牌阵位置编号。
