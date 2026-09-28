<div align="center">

<img src="public/favicon.svg" width="88" alt="天枢 Arcanum" />

# 天枢 Arcanum

**观星问命，知时而行**

传统命理 × 西洋占星 × 塔罗 × 大语言模型的个人运势平台

[![License: GPL v3+](https://img.shields.io/badge/License-GPL%20v3%2B-blue.svg)](LICENSE)
![Node](https://img.shields.io/badge/Node.js-%E2%89%A520-339933?logo=node.js&logoColor=white)
![Vue](https://img.shields.io/badge/Vue-3-4FC08D?logo=vue.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)

</div>

---

天枢把八字、紫微斗数、西洋星盘、塔罗、六爻、梅花、奇门等**确定性的排盘演算引擎**和一个**会调用工具的 AI 命理师**放在一起：所有盘面、流年、相位、牌面都由服务端引擎精确计算，AI 只负责在真实数据上解读，不凭空编造。

项目自带完整的账户体系、多档案管理、运势日历、趋势图、管理后台，数据以 YAML 文件存储，无需数据库，单机即可部署。

> ⚠️ 命理、占星与塔罗内容仅供文化娱乐与自我反思参考，不构成任何医疗、法律、投资或人生重大决策建议。

## 目录

- [功能一览](#功能一览)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [配置](#配置)
- [生产部署](#生产部署)
- [项目结构](#项目结构)
- [架构要点](#架构要点)
- [API 概览](#api-概览)
- [安全设计](#安全设计)
- [开发与脚本](#开发与脚本)
- [数据来源与致谢](#数据来源与致谢)
- [许可证](#许可证)

## 功能一览

### 🤖 AI 对话（天枢命理师）

- **工具调用（Function Calling）**：37 个演算工具，AI 按需自动调用，工具结果以富卡片展示（命盘、星盘轮、牌阵、卦象、地图等），也可切换查看原始数据。
- **命理工具面板**：23 个一键快捷工具（本命、运势、占卜、择日、关系、风水与名字六类）。服务端先确定性地运行工具，再交给 AI 解读，参数弹窗可选命主、双人、日期等。
- **可恢复的后台生成**：回复在服务端独立运行，通过 WebSocket 推送。切换页面、刷新、断网重连都会从断点续上；**多个对话可以同时生成**，侧栏实时显示“正在回复”。
- 深度思考模式（推理过程可折叠）、图片理解（多模态）、Markdown 渲染。
- **长期记忆**：自动从对话中提炼事实（分全局 / 会话两级），跨会话保持连续。
- **上下文管理**：估算 token，超长历史自动压缩；历史工具结果持久化并回灌给模型。
- 友好的错误卡片（区分额度不足、鉴权、限流、网络等并给出建议）、一键重试、选择消息导出长图。

### 📜 命盘档案

- 多人档案（本人、家人、朋友、客户…），支持分享码导入导出、手动经纬度。
- **八字**：四柱、十神、藏干、纳音、神煞、大运、五行旺衰与喜用神。
- **紫微斗数**：十二宫、主辅星、四化、飞星。
- **本命详解**：AI 分章节生成的完整命书，可单章重生成；神煞逐条解读。
- 铁板神数、姓名五格、八宅、玄空飞星等专项演算。

### 🪐 西洋星盘

- 本命盘：行星、宫位（多种分宫制）、11 种相位、先天尊贵、图形格局（大三角、T 三角、大十字、风筝等）。
- 凯龙星 + 谷神、智神、婚神、灶神四大小行星（1850–2200 年，基于 NASA/JPL 轨道根数数值积分）、莉莉丝、福点。
- 行运、次限推运、太阳返照、比较盘（含匹配度评分）、组合中点盘。
- **原创中文解读文案库**：星座、宫位、相位、合盘、行运、格局。

### 🗺️ 地理占星（Astrocartography）

离线世界地图上绘制各行星的 ASC / DSC / MC / IC 线；可查询某地受哪些线影响，或按主题（事业、爱情、财富…）推荐城市。

### 🃏 塔罗

Rider–Waite–Smith 1909 公有领域高清牌面；10 种牌阵（单张指引、二选一、恋人牌阵、凯尔特十字、年度十二宫等）、正逆位、占卜历史、AI 解读。

### 📅 运势与可视化

- 运势月历：按周或整月生成每日运势，逐日详情（黄历、时辰吉凶、宜忌、流日分析）。
- 趋势图：综合、事业、财运、健康多维运势曲线。
- 仪表盘：今日概览、快捷入口。

### 🛠️ 管理后台

- LLM 配置：OpenAI 兼容接口，内置 llama.cpp、Ollama、OpenAI、DeepSeek、通义千问、小米 MiMo 预设，支持连接测试。
- SMTP 邮件（找回密码、欢迎邮件）与测试发送。
- 用户管理、注册码生成与回收（注册需邀请码）。

### 🎨 界面

浅色 / 深色 / 跟随系统 / 定时切换主题，移动端适配，璇玑品牌标识，思源宋体排版。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 (`<script setup>`) · Vite · Pinia · Vue Router · ECharts · d3-geo · lucide 图标 |
| 后端 | Node.js · Express 5 · TypeScript（`tsx` 直接运行）· ws（WebSocket） |
| 存储 | YAML 文件（`data/`），无数据库；写入采用临时文件 + 原子重命名 |
| 鉴权 | JWT（httpOnly Cookie，access 2h / refresh 7d）· bcrypt · 注册码 · 邮件找回 |
| 演算 | lunar-javascript · lunisolar · iztro · astronomy-engine · 自研引擎 |
| AI | 任意 OpenAI 兼容 Chat Completions 接口（流式 + 工具调用 + 思考 + 视觉） |

## 快速开始

### 环境要求

- Node.js **20 或更高版本**（开发测试于 Node 24 / 25）
- [pnpm](https://pnpm.io/) 10+
- 一个 OpenAI 兼容的 LLM 接口（可以是本地 llama.cpp / Ollama，也可以是云端服务）

### 本地运行

```bash
git clone <仓库地址> arcanum
cd arcanum
pnpm install
cp .env.example .env        # 开发环境可以不改
pnpm dev
```

- 前端：http://localhost:3000 （Vite，已代理 `/api` 和 WebSocket 到后端）
- 后端：http://localhost:3001

首次启动会自动创建管理员账户。开发环境默认为 **`Admin` / `password`**，首次登录会强制修改密码（可同时改用户名）。登录后进入 **管理后台 → 系统设置** 填写 LLM 接口，AI 对话即可使用。

普通用户注册需要注册码，由管理员在后台生成。

## 配置

### 环境变量（`.env`）

| 变量 | 说明 | 默认 |
|---|---|---|
| `NODE_ENV` | 设为 `production` 时启用 Secure Cookie、强制要求 JWT 密钥、随机管理员初始密码、信任一层反向代理 | — |
| `PORT` | 服务端口 | `3001` |
| `CORS_ORIGIN` | 允许的前端来源，逗号分隔（如 `https://arc.example.com`）；WebSocket 的来源校验也用它 | 开发环境允许所有 |
| `JWT_ACCESS_SECRET` | Access Token 签名密钥，**生产必填**，长随机串（至少 16 字符，建议 48 以上；过短或占位值会拒绝启动） | 开发默认值 |
| `JWT_REFRESH_SECRET` | Refresh Token 签名密钥，**生产必填**，与上面不同 | 开发默认值 |
| `ADMIN_INITIAL_PASSWORD` | 首次启动创建管理员时的初始密码；生产环境不填则随机生成并只在日志里打印一次 | 开发为 `password` |

生成随机密钥：

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### 后台设置（`data/system/settings.yaml`）

LLM（服务商、Base URL、API Key、模型、上下文窗口、温度、思考等级、工具流式）与 SMTP 在**管理后台**里配置，保存在 `data/system/settings.yaml`，接口返回时密钥会打码。

### 数据目录

所有运行数据都在 `data/`（已在 `.gitignore` 中），首次运行自动创建：

```text
data/
├── system/
│   ├── settings.yaml          # LLM / SMTP 设置（含密钥）
│   └── reg-codes.yaml         # 注册码
└── users/<userId>/
    ├── account.yaml           # 账户（bcrypt 哈希）
    ├── memory.yaml            # AI 长期记忆
    ├── chat-history/          # 对话会话
    ├── chat-images/           # 对话上传的图片
    ├── tarot/                 # 塔罗占卜记录
    └── profiles/<profileId>/  # 档案、本命详解、神煞缓存、运势月历 / 每日详情
```

备份时只需备份 `data/` 目录和 `.env`。

## 生产部署

### 1. 构建与启动

```bash
pnpm install
pnpm build                       # 输出前端到 dist/client
NODE_ENV=production pnpm start   # 同一进程提供 API、WebSocket 和前端静态文件
```

建议用 systemd、pm2、Docker 或 1Panel 之类的进程管理器托管 `pnpm start`。服务是**单进程**设计：生成任务、限流计数都在内存中，不要开多实例负载均衡。

### 2. 反向代理（必须 HTTPS）

生产环境的登录 Cookie 带 `Secure` 标记，**必须通过 HTTPS 访问**。WebSocket 路径 `/api/v1/chat/ws` 需要转发升级头。nginx 示例：

```nginx
server {
    listen 443 ssl http2;
    server_name arc.example.com;

    ssl_certificate     /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    client_max_body_size 80m;   # 对话支持上传图片

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;   # WebSocket
        proxy_set_header Connection        "upgrade";
        proxy_read_timeout 300s;
    }
}
```

### 3. 部署检查清单

- [ ] `NODE_ENV=production`，两个 JWT 密钥都是独立的长随机串
- [ ] `CORS_ORIGIN` 设为正式域名
- [ ] 全站 HTTPS
- [ ] 应用端口**只监听 127.0.0.1**，不要直接暴露到公网。生产模式下程序信任一层反向代理的 `X-Forwarded-For`，端口直接暴露会被伪造来源 IP、绕过限流
- [ ] 前面**恰好一层**反向代理（nginx 和 CDN 同时存在时需要调整 `trust proxy`）
- [ ] 首次登录立即修改管理员密码
- [ ] 定期备份 `data/`

## 项目结构

```text
arcanum/
├── src/                        # 前端（Vue 3）
│   ├── views/                  # 页面：仪表盘、对话、档案、本命详解、星盘、地理占星、塔罗、月历、趋势图、设置、后台…
│   ├── components/
│   │   ├── chat/               # 对话：ToolCallCard、ChatErrorCard、SessionList、tool-views/（每种工具的富展示）
│   │   ├── astro/  acg/  tarot/  common/ …
│   ├── stores/                 # Pinia：auth、profile、fortune、chat（对话状态与生成任务跟踪）
│   ├── api/                    # HTTP 客户端、chat-socket.ts（自动重连的 WebSocket 客户端）
│   ├── composables/  utils/  styles/
├── server/                     # 后端（Express 5）
│   ├── index.ts                # 入口：安全头、压缩、CORS、限流、路由、静态文件、WebSocket
│   ├── routes/                 # auth / profile / fortune / chat / chart / astro-interpret / tarot / acg / admin
│   ├── ws/chat-ws.ts           # 对话 WebSocket（鉴权、来源校验、心跳、订阅与重放）
│   ├── services/               # LLM、工具调用、对话生成任务、档案、运势、塔罗、地理、邮件、存储…
│   ├── engines/                # 演算引擎：八字、紫微、飞星、星盘、合盘、小行星、地理占星、塔罗、占卜、铁板、姓名、风水、玄空
│   ├── middleware/             # 鉴权、管理员守卫、限流、错误处理
│   └── data/                   # 随代码发布的静态数据：星历、文案库、塔罗牌义、地名坐标、铁板条文、笔画表
├── shared/                     # 前后端共享的类型与常量（快捷工具定义、WebSocket 协议等）
├── public/                     # 静态资源（RWS 塔罗牌面、主题初始化脚本、favicon）
├── scripts/                    # 数据生成与校验脚本（小行星星历、塔罗牌面处理）
├── logos/                      # 品牌标识设计稿
└── data/                       # 运行数据（不入库）
```

## 架构要点

### 对话生成任务（Chat Runs）

```text
浏览器 ──WebSocket──▶ chat-ws.ts ──▶ startChatTurn() ──▶ chat-runs.service（后台任务）
   ▲                                                         │  LLM 流式 + 工具调用
   └────────── event(seq) / replay(afterSeq) ◀────────────────┘  事件按序号缓存
```

- 每次发送都会创建一个服务端任务，**与连接解耦**：用户消息立即落盘，生成完成后写入会话；页面关闭也会继续生成。
- 每个事件带递增序号并缓存（结束后保留 5 分钟）。客户端重连后用 `subscribe { runId, afterSeq }` 只补拉缺失的事件，不会重复也不会丢。
- 同一会话同时只有一个任务，不同会话可并发。每个账号限制并发数和发送频率。
- 客户端（`src/api/chat-socket.ts` + `src/stores/use-chat-store.ts`）指数退避自动重连，握手连续失败时自动刷新登录态。
- 协议类型定义见 `shared/types/chat-run.types.ts`；为兼容旧客户端，仍保留 SSE 接口 `POST /api/v1/chat`、`/api/v1/chat/fc`。

### 工具调用

- 工具定义与执行在 `server/services/fc-tools.service.ts`。工具返回 `{ text, display }`：`text` 交给模型，`display` 是给前端富卡片用的结构化数据（不发给模型）。
- 分析对象通过 `profileId` 解析，并且**只在当前用户自己的档案中查找**；命主的出生信息始终以档案为准，不信任模型抄写的生日。
- 快捷工具在 `shared/constants/quick-tools.ts` 中声明式定义（占位符 `$profile`、`$today` 等），服务端先运行预设工具，再由模型解读。
- 历史工具结果以“系统附注”的形式随后续轮次回灌给模型；失败的轮次以结构化 `error` 存储，不会作为回答发给模型。

### 存储

- `server/services/storage.service.ts` 统一做路径安全检查：所有路径限制在 `data/` 内，用户、档案、会话、塔罗记录的 ID 都经过正则校验。
- 写入采用“写临时文件 → 原子重命名”，避免中途崩溃留下半个文件。

## API 概览

所有接口前缀为 `/api/v1`，除 `auth` 的登录类接口外都需要登录（Cookie）。

| 模块 | 路径 | 说明 |
|---|---|---|
| 认证 | `/auth/*` | 注册（需注册码）、登录、登出、刷新、找回 / 重置密码、修改密码 / 邮箱 / 用户名、`/me` |
| 档案 | `/profiles/*` | 档案增删改查、分享 / 导入、本命详解生成、神煞解读 |
| 运势 | `/fortunes/*` | 月历（按周 / 整月生成）、每日详情、趋势 |
| 排盘 | `/charts/*` | 八字、紫微、星盘、行运、推运、返照、合盘、组合盘、出生地解析 |
| 星盘解读 | `/astro-interpret/*` | 文案库解读 |
| 地理占星 | `/acg/*` | 行星线、某地影响、主题推荐、地名搜索 |
| 塔罗 | `/tarot/*` | 牌组、牌阵、抽牌、历史记录、AI 解读 |
| 对话 | `/chat/*` | 会话列表 / 详情 / 重命名 / 删除、生成任务列表与停止、SSE 兼容接口 |
| 对话 WS | `/chat/ws` | WebSocket：`start` / `subscribe` / `stop` / `ping` |
| 管理 | `/admin/*` | 系统设置、LLM / SMTP 测试、用户管理、注册码（仅管理员） |

## 安全设计

- **认证**：JWT 放在 httpOnly、`SameSite=Strict` 的 Cookie 中，生产环境带 `Secure`，固定使用 HS256。修改密码、找回密码、管理员重置密码都会让该账户**所有旧令牌失效**。
- **授权**：所有数据按登录用户隔离；档案、会话、生成任务、工具调用对象都只在本人数据内解析。管理接口需要管理员角色。
- **输入校验**：路径参数白名单校验；档案字段、日期、消息长度、图片数量和格式都有校验；匿名请求体上限 1MB，只有登录后的对话接口允许上传大图。
- **限流**：按 IP 的全局限流和登录类接口的严格限流；对话按账号限制发送频率、并发生成数和 WebSocket 连接数。
- **WebSocket**：握手时校验 Cookie 和 Origin（防跨站 WebSocket 劫持），有心跳和消息频率限制。
- **前端**：所有 Markdown / HTML 输出经 DOMPurify 消毒；helmet 默认 CSP、HSTS 等安全头。
- **注册**：注册码原子占用，防止并发复用；生产环境管理员初始密码随机生成。

发现安全问题请通过私下渠道联系维护者，不要直接公开提交 Issue。

## 开发与脚本

```bash
pnpm dev          # 同时启动 Vite（3000）和 tsx watch 后端（3001）
pnpm build        # 构建前端
pnpm start        # 以当前 NODE_ENV 启动后端（生产模式同时提供前端）
pnpm type-check   # vue-tsc 类型检查
npx tsc --noEmit -p tsconfig.server.json   # 后端类型检查

# 数据生成（一般无需运行，结果已随仓库提供）
npx tsx scripts/gen-asteroid-ephemeris.ts      # 小行星星历（NASA/JPL 根数 + 数值积分）
npx tsx scripts/verify-asteroid-ephemeris.ts   # 星历精度校验
ARCANUM_CONTACT=<你的联系方式> python scripts/gen-tarot-rws.py   # 下载并处理 RWS 牌面（需 Pillow）
```

各数据目录下的 README 说明了格式、来源与生成方式：`server/data/ephemeris/`、`server/data/astro-texts/`、`server/data/tarot/`、`server/data/geo/`。

## 数据来源与致谢

- **塔罗牌面**：Rider–Waite–Smith（1909），Pamela Colman Smith 绘，公有领域；扫描件来自 Wikimedia Commons，逐张出处见 `public/tarot/rws/credits.json`。
- **地理坐标**：[GeoNames](https://www.geonames.org)（CC BY 4.0）；中国行政区划来自 [province-city-china](https://github.com/uiwjs/province-city-china)（MIT）。
- **小行星**：This work uses data from the NASA/JPL Small-Body Database, provided by the Jet Propulsion Laboratory, California Institute of Technology.
- **世界地图**：Natural Earth（公有领域），经 [world-atlas](https://github.com/topojson/world-atlas) 提供。
- **演算库**：[lunar-javascript](https://github.com/6tail/lunar-javascript)、[lunisolar](https://github.com/waterbeside/lunisolar)、[iztro](https://github.com/SylarLong/iztro)、[astronomy-engine](https://github.com/cosinekitty/astronomy)。
- **字体**：思源宋体 Noto Serif SC（SIL OFL 1.1）。

星盘解读、塔罗牌义、地理占星文案均为本项目原创。完整的第三方许可证列表见 [NOTICE](NOTICE)。

## 许可证

Copyright © 2026 BeaconCat

本项目以 **[GNU 通用公共许可证 v3.0 或更高版本](LICENSE)**（GPL-3.0-or-later）发布，并依据 GPLv3 第 7 条 (b) 款附加了**署名要求**：

- 你可以自由使用、学习、修改和分发本项目，包括商业用途；
- 分发本项目或其修改版本时，必须以同一许可证开源全部源代码，并保留版权声明与 [NOTICE](NOTICE) 中的作者署名 **“天枢 Arcanum，作者 BeaconCat”**；
- 修改版本必须标明已修改；若其界面显示法律声明，须保留“基于 天枢 Arcanum（作者 BeaconCat）”的字样。

具体以 [LICENSE](LICENSE) 与 [NOTICE](NOTICE) 原文为准。
