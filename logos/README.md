# 天枢 Logo 备选

5 个风格各异的 logo SVG，64×64 viewBox，favicon 友好（在 16/32px 下也能辨识）。

| 文件 | 风格 | 意象 |
|------|------|------|
| `logo-beidou.svg` | 星象/深邃 | 北斗七星，天枢星为首（金色突出），圆形深紫底 |
| `logo-bagua.svg` | 传统/玄学 | 外圈八卦爻线，中心太极阴阳鱼 |
| `logo-chart.svg` | 命盘/几何 | 12 宫格布局 + 中心四芒星，圆角方底 |
| `logo-orbit.svg` | 极简/现代 | 四重椭圆轨道 + 中心核 + 散点星 |
| `logo-tianshu-mark.svg` | 印章/国风 | 朱红方印，"天"字抽象笔画 + 小星点 |

## 转换为 favicon.ico

### 方法 1：在线工具（推荐）
- https://realfavicongenerator.net/ — 上传 SVG，生成多尺寸 ico + PNG + webmanifest
- https://favicon.io/favicon-converter/ — 简单快速

### 方法 2：本地（ImageMagick）

```bash
# 单 SVG → 多尺寸 ico
magick logo-beidou.svg -background none -define icon:auto-resize=16,32,48,64 favicon.ico
```

### 方法 3：sharp (Node)

```bash
pnpm dlx sharp-cli -i logo-beidou.svg -o favicon-32.png resize 32 32
```

## 放置

favicon 生成后放到 `arcanum/public/favicon.ico`（Vite 会自动从 public 发布），并在 `index.html` 里：

```html
<link rel="icon" type="image/svg+xml" href="/logo.svg" />
<link rel="icon" type="image/x-icon" href="/favicon.ico" />
```
