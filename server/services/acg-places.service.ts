/**
 * Candidate places for 地理占星: Chinese prefecture-level cities (plus municipalities / SARs /
 * Taiwan) from china-places.json, and ~240 major world cities from world-cities.json.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { haversineKm } from '../engines/acg.engine';
import type { AcgPlace } from '../../shared/types/acg.types';

type ChinaRow = [string, string, 'p' | 'c' | 'a', number?, number?];

// Province-level units without prefecture rows of their own
const STANDALONE = new Set(['11', '12', '31', '50', '71', '81', '82']);

let cache: { rank: AcgPlace[]; search: AcgPlace[] } | null = null;

function load() {
  if (cache) return cache;
  const here = dirname(fileURLToPath(import.meta.url));
  const china = JSON.parse(readFileSync(resolve(here, '../data/geo/china-places.json'), 'utf8')).rows as ChinaRow[];
  const world = JSON.parse(readFileSync(resolve(here, '../data/geo/world-cities.json'), 'utf8')).rows as [string, string, string, number, number][];

  const provinces = new Map(china.filter((r) => r[2] === 'p').map((r) => [r[0].slice(0, 2), r[1]]));
  const cityName = new Map(china.filter((r) => r[2] === 'c').map((r) => [r[0].slice(0, 4), r[1]]));
  const withCoord = (r: ChinaRow) => typeof r[3] === 'number' && typeof r[4] === 'number';

  const rank: AcgPlace[] = [];
  const search: AcgPlace[] = [];
  for (const r of china) {
    if (!withCoord(r)) continue;
    const pc = r[0].slice(0, 2);
    const region = provinces.get(pc);
    const place: AcgPlace = { name: r[1], country: '中国', region: r[2] === 'p' ? undefined : region, lat: r[3]!, lon: r[4]! };
    if (r[2] === 'c' || (r[2] === 'p' && STANDALONE.has(pc))) rank.push(place);
    if (r[2] === 'a') {
      const parent = cityName.get(r[0].slice(0, 4));
      search.push({ ...place, region: [region, parent].filter(Boolean).join(' ') });
    } else {
      search.push(place);
    }
  }
  for (const [zh, en, country, lat, lon] of world) {
    const p: AcgPlace = { name: zh, country, lat, lon, region: en };
    rank.push(p);
    search.push(p);
  }
  cache = { rank, search };
  return cache;
}

export function rankCandidates(): AcgPlace[] {
  return load().rank;
}

/** Simple name search over Chinese places (incl. counties) and world cities (Chinese or English names). */
export function searchPlaces(q: string, limit = 12): AcgPlace[] {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  const { search } = load();
  const scored: { p: AcgPlace; s: number }[] = [];
  for (const p of search) {
    const name = p.name.toLowerCase();
    const alt = (p.region || '').toLowerCase();
    let s = -1;
    if (name === query) s = 100;
    else if (name.startsWith(query)) s = 80;
    else if (name.includes(query)) s = 60;
    else if (alt.includes(query) && p.country !== '中国') s = 50;
    else if (`${alt}${name}`.replace(/\s/g, '').includes(query)) s = 40;
    if (s < 0) continue;
    // Prefer larger units (prefecture cities / world cities) on ties
    if (p.country !== '中国' || !p.region || !p.region.includes(' ')) s += 5;
    scored.push({ p, s });
  }
  return scored.sort((a, b) => b.s - a.s || a.p.name.length - b.p.name.length).slice(0, limit).map((x) => x.p);
}

/** Nearest known place to a point, within maxKm. */
export function nearestPlace(lat: number, lon: number, maxKm = 150): (AcgPlace & { distanceKm: number }) | undefined {
  let best: AcgPlace | undefined;
  let bestD = Infinity;
  for (const p of load().search) {
    const d = haversineKm(lat, lon, p.lat, p.lon);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best && bestD <= maxKm ? { ...best, distanceKm: Math.round(bestD) } : undefined;
}
