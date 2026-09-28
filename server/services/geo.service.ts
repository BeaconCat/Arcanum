/**
 * 出生地文本 → 经纬度（离线）
 *
 * 数据：server/data/geo/china-places.json
 *   - 名称与层级：province-city-china（MIT，GB/T 2260 行政区划）
 *   - 坐标：GeoNames cities1000（CC BY 4.0，https://www.geonames.org）
 * 区县若无可靠坐标则退回所属地级市坐标（精度标记为 city），不做臆造。
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { BirthPlaceResolution } from '../../shared/types/astro.types';

type Row = [code: string, name: string, level: 'p' | 'c' | 'a', lat?: number, lon?: number];

interface Place {
  code: string;
  name: string;
  core: string;
  level: 'p' | 'c' | 'a';
  lat?: number;
  lon?: number;
}

const DEFAULT: BirthPlaceResolution = { lat: 39.907, lon: 116.397, matched: '北京（默认）', precision: 'default' };

const SUFFIX = /(维吾尔自治区|壮族自治区|回族自治区|自治区|特别行政区|省|市|自治州|地区|盟|自治县|自治旗|林区|特区|新区|区|县|旗)$/;
const ETHNIC = '朝鲜|满|蒙古|回|藏|维吾尔|彝|苗|土家|壮|瑶|侗|布依|白|哈尼|傣|傈僳|佤|拉祜|纳西|景颇|羌|黎|畲|水|仡佬|仫佬|毛南|土|撒拉|保安|东乡|裕固|哈萨克|柯尔克孜|塔吉克|锡伯|达斡尔|鄂温克|鄂伦春|怒|独龙|普米|阿昌|德昂|布朗|基诺|京|各';
const ETHNIC_SUFFIX = new RegExp(`((${ETHNIC})族)+自治(州|县|旗)$`);
function coreName(name: string): string {
  let n = name.replace(ETHNIC_SUFFIX, '');
  if (n === name) n = name.replace(SUFFIX, '');
  return n || name;
}

// Common short forms that coreName() can't derive
const PROVINCE_ALIAS: Record<string, string> = {
  内蒙: '15', 广西: '45', 西藏: '54', 宁夏: '64', 新疆: '65', 香港: '81', 澳门: '82', 台湾: '71', 台北: '71',
};

let cache: { places: Place[]; byCode: Map<string, Place> } | null = null;

function load() {
  if (cache) return cache;
  const here = dirname(fileURLToPath(import.meta.url));
  const raw = JSON.parse(readFileSync(resolve(here, '../data/geo/china-places.json'), 'utf8')) as { rows: Row[] };
  const places: Place[] = raw.rows.map(([code, name, level, lat, lon]) => ({ code, name, core: coreName(name), level, lat, lon }));
  cache = { places, byCode: new Map(places.map((p) => [p.code, p])) };
  return cache;
}

const provinceCode = (p: Place) => `${p.code.slice(0, 2)}0000`;
const cityCode = (p: Place) => `${p.code.slice(0, 4)}00`;

/** Find the longest place name (full or core ≥ 2 chars) contained in text. */
function findIn(text: string, pool: Place[]): { place: Place; hit: string } | null {
  let best: { place: Place; hit: string } | null = null;
  for (const p of pool) {
    for (const cand of [p.name, p.core]) {
      if (cand.length < 2 || !text.includes(cand)) continue;
      if (!best || cand.length > best.hit.length) best = { place: p, hit: cand };
      break;
    }
  }
  return best;
}

function withCoord(p: Place | undefined): p is Place & { lat: number; lon: number } {
  return !!p && typeof p.lat === 'number' && typeof p.lon === 'number';
}

export function resolveBirthPlace(text: string | undefined | null): BirthPlaceResolution {
  const input = (text || '').replace(/\s+/g, '');
  if (!input) return { ...DEFAULT, note: '未填写出生地' };
  const { places, byCode } = load();

  const provinces = places.filter((p) => p.level === 'p');
  const cities = places.filter((p) => p.level === 'c');
  const areas = places.filter((p) => p.level === 'a');

  // 1) Province (strip it from the text so e.g. "吉林省" doesn't also match 吉林市)
  let prov = findIn(input, provinces)?.place;
  let rest = input;
  if (prov) rest = input.replace(prov.name, '').replace(prov.core, '');
  if (!prov) {
    const alias = Object.keys(PROVINCE_ALIAS).find((k) => input.startsWith(k));
    if (alias) { prov = byCode.get(`${PROVINCE_ALIAS[alias]}0000`); rest = input.slice(alias.length); }
  }

  const inProv = (p: Place) => !prov || provinceCode(p) === prov.code;

  // 2) City within province (or nationwide)
  const cityHit = findIn(rest, cities.filter(inProv));
  let city = cityHit?.place;
  let afterCity = cityHit ? rest.slice(rest.indexOf(cityHit.hit) + cityHit.hit.length) : rest;

  // 3) County/district: under the matched city, else within the province;
  //    nationwide only when the name is unique (朝阳区 exists in many cities)
  let area: Place | undefined;
  if (city) {
    area = findIn(afterCity, areas.filter((a) => cityCode(a) === city!.code))?.place;
  } else {
    const pool = areas.filter(inProv);
    const hit = findIn(rest, pool);
    if (hit) {
      const same = pool.filter((a) => a.name === hit.place.name || a.core === hit.hit);
      if (prov || same.length === 1) {
        area = hit.place;
        city = byCode.get(cityCode(area));
        afterCity = '';
      }
    }
  }
  if (!prov && (city || area)) prov = byCode.get(provinceCode((area || city)!));

  const label = [prov?.name, city && city.name !== '市辖区' ? city.name : undefined, area?.name]
    .filter((x, i, arr) => x && arr.indexOf(x) === i).join(' ');

  if (withCoord(area)) return { lat: area.lat, lon: area.lon, matched: label, precision: 'county' };
  if (area && withCoord(city)) {
    return { lat: city.lat, lon: city.lon, matched: label, precision: 'city', note: `${area.name}暂无独立坐标，按${city.name}估算` };
  }
  if (withCoord(city)) return { lat: city.lat, lon: city.lon, matched: label, precision: 'city' };
  // Municipalities (北京/上海/天津/重庆) have no city-level coordinate row; province row is the city itself
  if (withCoord(prov)) {
    const municipality = ['11', '12', '31', '50', '81', '82'].includes(prov.code.slice(0, 2));
    return {
      lat: prov.lat, lon: prov.lon, matched: label || prov.name,
      precision: municipality ? 'city' : 'province',
      note: municipality ? undefined : `仅识别到省份，按省会估算`,
    };
  }
  return { ...DEFAULT, note: `未能识别出生地「${input.slice(0, 20)}」，按北京估算` };
}

/** Profile-aware resolution: manual lat/lon override wins over parsing birthPlace. */
export function resolveProfilePlace(profile: { birthPlace?: string; birthLat?: number | null; birthLon?: number | null }): BirthPlaceResolution {
  const { birthLat: lat, birthLon: lon } = profile;
  if (typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon)) {
    return { lat, lon, matched: profile.birthPlace ? `${profile.birthPlace}（手动经纬度）` : '手动经纬度', precision: 'manual' };
  }
  return resolveBirthPlace(profile.birthPlace);
}
