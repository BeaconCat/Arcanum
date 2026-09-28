# china-places.json

离线出生地 → 经纬度数据，供 `server/services/geo.service.ts` 使用（星盘上升点/宫位计算）。

- 行政区划名称与层级：[province-city-china](https://github.com/uiwjs/province-city-china)（MIT，GB/T 2260）
- 坐标：[GeoNames](https://www.geonames.org) `cities1000`（CC BY 4.0）

生成方式：按省份内的中文别名或拼音匹配 GeoNames 地名；区县距所属地级市 >220km（新疆/西藏/内蒙古/青海 >450km）视为同名误配并丢弃；无可靠坐标的区县在运行时退回所属地级市坐标。
行格式：`[code, name, level(p|c|a), lat?, lon?]`
