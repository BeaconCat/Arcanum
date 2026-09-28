/**
 * Generate the compact asteroid ephemeris used by the astrology engine.
 *
 *   npx tsx scripts/gen-asteroid-ephemeris.ts            # fetch elements from JPL SBDB, then integrate
 *   npx tsx scripts/gen-asteroid-ephemeris.ts --offline  # reuse server/data/ephemeris/sbdb-elements.json
 *   npx tsx scripts/gen-asteroid-ephemeris.ts --offline --start=1850-01-01 --end=2150-12-31   # custom range
 *
 * Method: osculating heliocentric elements (J2000 ecliptic, DE441-based JPL orbit solutions)
 * from the NASA/JPL Small-Body Database API are converted to state vectors and integrated
 * backward/forward with astronomy-engine's GravitySimulator (Sun + all major planets).
 * At each sample we compute the apparent geocentric longitude on the true ecliptic of date
 * (light-time + aberration, same convention as Astronomy.GeoVector(..., true)).
 *
 * Output: server/data/ephemeris/asteroids.json — per body, longitudes sampled every `step`
 * days (UT) from `startJd`, stored as a start value + first difference + second differences
 * in units of 1e-5 degree.
 */
import * as AstronomyNs from 'astronomy-engine';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// tsx resolves the package's CJS build, whose namespace only exposes `default`
const Astronomy = ((AstronomyNs as { Body?: unknown }).Body ? AstronomyNs : (AstronomyNs as unknown as { default: typeof AstronomyNs }).default) as typeof AstronomyNs;
// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace Astronomy { type AstroTime = AstronomyNs.AstroTime; type StateVector = AstronomyNs.StateVector; type Vector = AstronomyNs.Vector }

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'server/data/ephemeris');
const ELEMENTS_FILE = resolve(OUT_DIR, 'sbdb-elements.json');
const OUT_FILE = resolve(OUT_DIR, 'asteroids.json');

const argValue = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
/** Covered range (UT dates). Defaults to 1850–2200 (1800–1850 exceeded 1′ for Pallas/Vesta, see ACCURACY.md); override with --start= / --end=. */
export const START = argValue('start') || '1850-01-01';
export const END = argValue('end') || '2200-12-31';
if (!/^\d{4}-\d{2}-\d{2}$/.test(START) || !/^\d{4}-\d{2}-\d{2}$/.test(END) || START >= END) {
  throw new Error(`Invalid range ${START} – ${END}`);
}
/**
 * Integrator step (days). GravitySimulator's integrator is low order: at 0.5 d the error for
 * Pallas reached ~1′ a century from the element epoch; 0.05 d brings it below 1″
 * (see scripts/verify-asteroid-ephemeris.ts).
 */
export const DT = 0.05;
const SCALE = 1e5; // stored unit = 1e-5 degree (0.036″)

interface BodySpec { key: string; sstr: string; name: string; step: number }
export const BODIES: BodySpec[] = [
  { key: 'chiron', sstr: '2060', name: '(2060) Chiron', step: 8 },
  { key: 'ceres', sstr: '1', name: '1 Ceres', step: 4 },
  { key: 'pallas', sstr: '2', name: '2 Pallas', step: 4 },
  { key: 'juno', sstr: '3', name: '3 Juno', step: 4 },
  { key: 'vesta', sstr: '4', name: '4 Vesta', step: 4 },
];

export interface Elements {
  key: string; name: string; epochJdTdb: number;
  e: number; a: number; i: number; om: number; w: number; ma: number;
  orbitId: string; solutionDate: string; source: string;
}

async function fetchElements(): Promise<Elements[]> {
  const out: Elements[] = [];
  for (const b of BODIES) {
    const url = `https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=${encodeURIComponent(b.sstr)}&full-prec=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`SBDB ${b.sstr}: HTTP ${res.status}`);
    const j = await res.json() as any;
    const el = Object.fromEntries((j.orbit.elements as any[]).map((x) => [x.name, Number(x.value)]));
    out.push({
      key: b.key, name: j.object?.fullname || b.name, epochJdTdb: Number(j.orbit.epoch),
      e: el.e, a: el.a, i: el.i, om: el.om, w: el.w, ma: el.ma,
      orbitId: String(j.orbit.orbit_id), solutionDate: String(j.orbit.soln_date), source: String(j.orbit.pe_used || j.orbit.source),
    });
  }
  return out;
}

const GM_SUN = 0.2959122082855911e-3; // au^3/day^2 (DE441, = k^2)
const DEG = Math.PI / 180;

/** Heliocentric J2000 ecliptic state from osculating elements. */
function stateFromElements(el: Elements, time: Astronomy.AstroTime): Astronomy.StateVector {
  const M = el.ma * DEG;
  let E = M;
  for (let k = 0; k < 50; k++) E -= (E - el.e * Math.sin(E) - M) / (1 - el.e * Math.cos(E));
  const cosE = Math.cos(E), sinE = Math.sin(E);
  const b = el.a * Math.sqrt(1 - el.e * el.e);
  const r = el.a * (1 - el.e * cosE);
  const n = Math.sqrt(GM_SUN / el.a ** 3);
  const xp = el.a * (cosE - el.e), yp = b * sinE;
  const vxp = -el.a * n * sinE / (1 - el.e * cosE), vyp = b * n * cosE / (1 - el.e * cosE);
  void r;
  const [cw, sw, ci, si, co, so] = [Math.cos(el.w * DEG), Math.sin(el.w * DEG), Math.cos(el.i * DEG), Math.sin(el.i * DEG), Math.cos(el.om * DEG), Math.sin(el.om * DEG)];
  const rot = (x: number, y: number) => [
    (co * cw - so * sw * ci) * x + (-co * sw - so * cw * ci) * y,
    (so * cw + co * sw * ci) * x + (-so * sw + co * cw * ci) * y,
    (sw * si) * x + (cw * si) * y,
  ];
  const [x, y, z] = rot(xp, yp);
  const [vx, vy, vz] = rot(vxp, vyp);
  return new Astronomy.StateVector(x, y, z, vx, vy, vz, time);
}

const ECL_TO_EQJ = Astronomy.Rotation_ECL_EQJ();

/**
 * Geocentric EQJ vector of the body from its heliocentric EQJ state at UT `t`, light-time corrected.
 *  - apparent=true: observer also back-dated (= Astronomy.GeoVector(..., aberration=true)), used for charts;
 *  - apparent=false: astrometric (observer at t), comparable with JPL astrometric RA/Dec.
 */
export function geocentric(s: Astronomy.StateVector, t: Astronomy.AstroTime, apparent: boolean): Astronomy.Vector {
  let lt = 0;
  let g = new Astronomy.Vector(0, 0, 0, t);
  for (let k = 0; k < 4; k++) {
    const earth = Astronomy.HelioVector(Astronomy.Body.Earth, apparent ? t.AddDays(-lt) : t);
    // body at t - lt (linear back-shift is ample for light-times of minutes to hours)
    g = new Astronomy.Vector(s.x - s.vx * lt - earth.x, s.y - s.vy * lt - earth.y, s.z - s.vz * lt - earth.z, t);
    lt = g.Length() / Astronomy.C_AUDAY;
  }
  return g;
}

export function loadElements(): Elements[] {
  return JSON.parse(readFileSync(ELEMENTS_FILE, 'utf8')).elements;
}

/** Heliocentric EQJ states of the body at the given UT day numbers (any order), by n-body integration from the element epoch. */
export function statesAt(el: Elements, uts: number[], dt = DT): Astronomy.StateVector[] {
  const epoch = Astronomy.AstroTime.FromTerrestrialTime(el.epochJdTdb - 2451545.0);
  const state0 = Astronomy.RotateState(ECL_TO_EQJ, stateFromElements(el, epoch));
  const out = new Array<Astronomy.StateVector>(uts.length);
  for (const dir of [1, -1] as const) {
    const order = uts.map((u, i) => ({ u, i }))
      .filter(({ u }) => (dir > 0 ? u >= epoch.ut : u < epoch.ut))
      .sort((a, b) => (a.u - b.u) * dir);
    const sim = new Astronomy.GravitySimulator(Astronomy.Body.Sun, epoch, [state0]);
    let cur = epoch.ut;
    for (const { u, i } of order) {
      while ((u - cur) * dir > 1e-9) {
        cur = dir > 0 ? Math.min(cur + dt, u) : Math.max(cur - dt, u);
        sim.Update(cur);
      }
      out[i] = sim.Update(u)[0];
    }
  }
  return out;
}

function utDays(iso: string): number {
  return Astronomy.MakeTime(new Date(`${iso}T00:00:00Z`)).ut;
}

/** Integrate one body over the full range and return apparent longitudes on the sample grid. */
export function integrateBody(el: Elements, step: number, dt = DT): { startJd: number; step: number; lon: number[] } {
  const startUt = utDays(START);
  // One sample beyond END so interpolation covers the full stated range (last interval needs both ends)
  const n = Math.ceil((utDays(END) + 1 - startUt) / step) + 1;
  const uts = Array.from({ length: n }, (_, k) => startUt + k * step);
  const states = statesAt(el, uts, dt);
  const lon = states.map((s, k) => Astronomy.Ecliptic(geocentric(s, Astronomy.MakeTime(uts[k]), true)).elon);
  return { startJd: startUt + 2451545.0, step, lon };
}

function encode(lon: number[]): { v0: number; d0: number; dd: number[] } {
  // unwrap, then quantise
  const u: number[] = [];
  let off = 0;
  for (let k = 0; k < lon.length; k++) {
    if (k > 0) {
      const d = lon[k] + off - u[k - 1];
      if (d > 180) off -= 360; else if (d < -180) off += 360;
    }
    u.push(lon[k] + off);
  }
  const q = u.map((x) => Math.round(x * SCALE));
  const dd: number[] = [];
  for (let k = 2; k < q.length; k++) dd.push(q[k] - 2 * q[k - 1] + q[k - 2]);
  return { v0: q[0], d0: q[1] - q[0], dd };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  let elements: Elements[];
  if (process.argv.includes('--offline') && existsSync(ELEMENTS_FILE)) {
    elements = JSON.parse(readFileSync(ELEMENTS_FILE, 'utf8')).elements;
  } else {
    elements = await fetchElements();
    writeFileSync(ELEMENTS_FILE, JSON.stringify({
      source: 'NASA/JPL Small-Body Database API (https://ssd-api.jpl.nasa.gov/sbdb.api), heliocentric osculating elements, J2000 ecliptic',
      retrieved: new Date().toISOString(),
      elements,
    }, null, 2));
  }

  const bodies: Record<string, unknown> = {};
  for (const b of BODIES) {
    const el = elements.find((x) => x.key === b.key)!;
    const t0 = Date.now();
    const { startJd, step, lon } = integrateBody(el, b.step);
    bodies[b.key] = { name: el.name, startJd, step, count: lon.length, ...encode(lon) };
    console.log(`${b.key}: ${lon.length} samples (${START} – ${END}), ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  writeFileSync(OUT_FILE, JSON.stringify({
    format: 'arcanum-asteroid-ephemeris/1',
    description: 'Apparent geocentric ecliptic longitude (true ecliptic & equinox of date), degrees × 1e5; v0 = first sample, d0 = first difference, dd = second differences. Sample times are UT Julian days startJd + k·step.',
    source: 'Integrated with astronomy-engine GravitySimulator from NASA/JPL SBDB osculating elements; see README.md',
    range: [START, END],
    scale: SCALE,
    bodies,
  }));
  console.log('wrote', OUT_FILE);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
