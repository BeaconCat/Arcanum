/**
 * Chiron and the four major asteroids from the precomputed ephemeris
 * (server/data/ephemeris/asteroids.json, see its README), plus the computed points
 * Lilith (mean lunar apogee) and the Part of Fortune.
 *
 * Longitudes are apparent geocentric, true ecliptic & equinox of date — the same
 * convention as the planets in astro.engine.ts.
 */
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

export type AsteroidKey = 'chiron' | 'ceres' | 'pallas' | 'juno' | 'vesta';
export const ASTEROID_KEYS: AsteroidKey[] = ['chiron', 'ceres', 'pallas', 'juno', 'vesta'];

interface EncodedBody { name: string; startJd: number; step: number; count: number; v0: number; d0: number; dd: number[] }
interface Decoded { startJd: number; step: number; lon: Float64Array } // unwrapped degrees

let cache: { range: [string, string]; bodies: Record<AsteroidKey, Decoded> } | null = null;

function load() {
  if (cache) return cache;
  const here = dirname(fileURLToPath(import.meta.url));
  const raw = JSON.parse(readFileSync(resolve(here, '../data/ephemeris/asteroids.json'), 'utf8')) as {
    range: [string, string]; scale: number; bodies: Record<AsteroidKey, EncodedBody>;
  };
  const bodies = {} as Record<AsteroidKey, Decoded>;
  for (const key of ASTEROID_KEYS) {
    const b = raw.bodies[key];
    const q = new Float64Array(b.count);
    q[0] = b.v0;
    q[1] = b.v0 + b.d0;
    let d = b.d0;
    for (let k = 2; k < b.count; k++) {
      d += b.dd[k - 2];
      q[k] = q[k - 1] + d;
    }
    for (let k = 0; k < b.count; k++) q[k] /= raw.scale;
    bodies[key] = { startJd: b.startJd, step: b.step, lon: q };
  }
  cache = { range: raw.range, bodies };
  return cache;
}

/** Supported date range of the asteroid ephemeris, e.g. ['1850-01-01', '2200-12-31']. */
export function asteroidRange(): [string, string] {
  return load().range;
}

const norm = (x: number) => ((x % 360) + 360) % 360;

/**
 * Longitude (deg, 0–360) and speed (deg/day) of an asteroid at a UT Julian day,
 * by cubic Hermite interpolation with Catmull-Rom tangents. Returns null outside the data range.
 */
export function asteroidPosition(key: AsteroidKey, jdUT: number): { longitude: number; speed: number } | null {
  const b = load().bodies[key];
  const x = (jdUT - b.startJd) / b.step;
  const i = Math.floor(x);
  if (!Number.isFinite(x) || i < 0 || i > b.lon.length - 2) return null;
  // First/last interval use one-sided tangents
  const p = (k: number) => b.lon[Math.min(Math.max(k, 0), b.lon.length - 1)];
  const p0 = p(i - 1), p1 = p(i), p2 = p(i + 1), p3 = p(i + 2);
  const m1 = i >= 1 ? (p2 - p0) / 2 : p2 - p1;
  const m2 = i + 2 < b.lon.length ? (p3 - p1) / 2 : p2 - p1;
  const t = x - i;
  const t2 = t * t, t3 = t2 * t;
  const value = (2 * t3 - 3 * t2 + 1) * p1 + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2 + (t3 - t2) * m2;
  const deriv = (6 * t2 - 6 * t) * p1 + (3 * t2 - 4 * t + 1) * m1 + (-6 * t2 + 6 * t) * p2 + (3 * t2 - 2 * t) * m2;
  return { longitude: norm(value), speed: deriv / b.step };
}

/**
 * Mean lunar apogee ("Black Moon Lilith", mean), Meeus ch. 50: mean perigee longitude + 180°,
 * referred to the mean equinox of date. `jdTT` is a TT Julian day.
 */
export function meanLilith(jdTT: number): { longitude: number; speed: number } {
  const T = (jdTT - 2451545.0) / 36525;
  const perigee = 83.3532465 + 4069.0137287 * T - 0.0103200 * T * T - T * T * T / 80053 + T ** 4 / 18999000;
  const speedPerCentury = 4069.0137287 - 2 * 0.0103200 * T - 3 * T * T / 80053 + 4 * T ** 3 / 18999000;
  return { longitude: norm(perigee + 180), speed: speedPerCentury / 36525 };
}

/**
 * Part of Fortune (福点). Day chart (Sun above the horizon): ASC + Moon − Sun;
 * night chart: ASC + Sun − Moon.
 */
export function partOfFortune(asc: number, sun: number, moon: number, isDayChart: boolean): number {
  return norm(isDayChart ? asc + moon - sun : asc + sun - moon);
}
