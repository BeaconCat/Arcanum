# 小行星星历（凯龙星与四大小行星）

`asteroids.json` 为星盘引擎（`server/engines/asteroid.engine.ts`）提供 **2060 凯龙星、1 谷神星、2 智神星、3 婚神星、4 灶神星** 在 **1850-01-01 至 2200-12-31** 的地心视黄经（真黄道、真春分点，含光行时与光行差，与引擎中十大行星的口径一致）。

## 数据来源与致谢

- 轨道根数：**NASA/JPL Small-Body Database API**（<https://ssd-api.jpl.nasa.gov/sbdb.api>），日心吻切根数（J2000 黄道，基于 DE441 的 JPL 轨道解）。原始根数与获取时间保存在 `sbdb-elements.json`。
  致谢：*This work uses data from the NASA/JPL Small-Body Database, provided by the Jet Propulsion Laboratory, California Institute of Technology.*
- 数值积分：[astronomy-engine](https://github.com/cosinekitty/astronomy)（MIT）的 `GravitySimulator`（太阳与八大行星引力），步长 0.05 天，由根数历元分别向前、向后积分。

> 说明：原计划直接从 JPL Horizons 拉取星历，但生成时所在网络无法访问 `ssd.jpl.nasa.gov`，因此改为「JPL 根数 + 数值积分」，再用 JPL 自己的 n 体结果（Small-Body Identification API）与国际小行星中心（MPC）星历服务独立校验精度：1900–2100 年误差 ≤ 17″，详见 `ACCURACY.md`。

## 文件格式（`arcanum-asteroid-ephemeris/1`）

每个天体：`startJd`（首个采样的 UT 儒略日）、`step`（采样间隔，天：凯龙 8，其余 4）、`count`、`v0`（首值）、`d0`（一阶差分）、`dd`（二阶差分数组）。数值单位为 1e-5 度（0.036″），黄经已展开（跨 360° 不回绕）。运行时累加还原，再用三次 Hermite（Catmull-Rom 切线）插值求任意时刻的黄经与速度。文件约 760 KB（1850–2200）。

## 复现与校验

```bash
npx tsx scripts/gen-asteroid-ephemeris.ts            # 重新获取 JPL 根数并生成
npx tsx scripts/gen-asteroid-ephemeris.ts --offline  # 复用 sbdb-elements.json
npx tsx scripts/verify-asteroid-ephemeris.ts         # 精度校验（需访问 ssd-api.jpl.nasa.gov）
```

校验内容：① 积分结果与 JPL Small-Body Identification API（JPL 的 n 体传播）在 1900–2100 多个日期的天体测量赤经赤纬对比；② 积分步长 0.5 天与 0.25 天的差异；③ 存储插值值与直接积分值在随机非采样时刻的差异。结果见 `ACCURACY.md`。

## 范围与局限

- 超出 1850–2200 年时，引擎不输出这些小行星，并在星盘中注明原因（莉莉丝、福点为计算点，不受此限）。
- 积分模型只含太阳与八大行星引力（未计小行星间相互摄动、相对论修正），远离根数历元的年代误差会逐渐增大。
