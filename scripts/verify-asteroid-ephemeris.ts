/**
 * Accuracy checks for server/data/ephemeris/asteroids.json
 *
 *   npx tsx scripts/verify-asteroid-ephemeris.ts   (needs curl and network access to ssd-api.jpl.nasa.gov)
 *
 * 1. Integration vs JPL: astrometric J2000 RA/Dec from our integration compared with the
 *    NASA/JPL Small-Body Identification API (JPL's own n-body propagation), 1800–2200.
 *    The MPC ephemeris service is used as a second reference where it is available (1900–2099).
 * 2. Integrator step: DT vs DT/2 at the ends of the range (1800, 2200).
 * 3. Interpolation: stored/interpolated longitude vs direct integration at off-grid times.
 */
import * as AstronomyNs from 'astronomy-engine';
import { execFileSync } from 'node:child_process';
import { BODIES, DT, START, END, loadElements, statesAt, geocentric } from './gen-asteroid-ephemeris';
import { asteroidPosition, type AsteroidKey } from '../server/engines/asteroid.engine';

const Astronomy = ((AstronomyNs as { Body?: unknown }).Body ? AstronomyNs : (AstronomyNs as unknown as { default: typeof AstronomyNs }).default) as typeof AstronomyNs;

const DATES = [
  '1800-06-01', '1825-03-15', '1850-08-01', '1875-01-01', '1900-06-01', '1950-08-01', '2000-07-15',
  '2020-11-20', '2070-09-09', '2100-12-01', '2125-05-05', '2150-06-01', '2175-09-09', '2200-12-01',
];
/** The MPC ephemeris service only accepts dates in 1900–2099 */
const mpcSupports = (iso: string) => iso >= '1900-01-01' && iso < '2100-01-01';
const JPL_NAMES: Record<string, string> = { chiron: '2060 Chiron', ceres: '1 Ceres', pallas: '2 Pallas', juno: '3 Juno', vesta: '4 Vesta' };

const ut = (iso: string) => Astronomy.MakeTime(new Date(`${iso}T00:00:00Z`)).ut;
const sepArcsec = (ra1: number, de1: number, ra2: number, de2: number) => {
  const r = Math.PI / 180;
  const c = Math.sin(de1 * r) * Math.sin(de2 * r) + Math.cos(de1 * r) * Math.cos(de2 * r) * Math.cos((ra1 - ra2) * 15 * r);
  return Math.acos(Math.min(1, c)) / r * 3600;
};
const parseRa = (s: string) => { const [h, m, x] = s.split(':').map(Number); return h + m / 60 + x / 3600; };
const parseDec = (s: string) => {
  const m = /([+-]?)(\d+) (\d+)'([\d.]+)"/.exec(s)!;
  const v = Number(m[2]) + Number(m[3]) / 60 + Number(m[4]) / 3600;
  return m[1] === '-' ? -v : v;
};
/** Run a URL through curl (honours proxy settings, tolerates slow responses), with retries. */
function curl(url: string, timeoutSec = 180): string | null {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return execFileSync('curl', ['-sS', '-m', String(timeoutSec), url], { encoding: 'utf8' });
    } catch { /* retry */ }
  }
  return null;
}

/**
 * JPL Small-Body Identification API, whole sky, bright objects only (fast): astrometric J2000
 * RA/Dec from JPL's n-body propagation for Ceres, Pallas, Juno and Vesta at once.
 * (Chiron is too faint for a whole-sky query — it is checked against the MPC instead.)
 */
function jplBright(iso: string): Map<string, [number, number]> {
  const url = `https://ssd-api.jpl.nasa.gov/sb_ident.api?sb-kind=a&mpc-code=500&obs-time=${iso}_00:00:00`
    + '&fov-ra-center=00-00-00&fov-dec-center=00-00-00&fov-ra-hwidth=180&fov-dec-hwidth=90'
    + '&two-pass=true&suppress-first-pass=true&vmag-lim=12.5';
  const out = new Map<string, [number, number]>();
  const txt = curl(url);
  if (!txt) return out;
  const j = JSON.parse(txt);
  for (const row of j.data_second_pass || []) {
    for (const [key, name] of Object.entries(JPL_NAMES)) {
      if ((row[0] as string).startsWith(name)) out.set(key, [parseRa(row[1]), parseDec(row[2])]);
    }
  }
  return out;
}

const MPC_DESIG: Record<string, string> = { chiron: '2060', ceres: '1', pallas: '2', juno: '3', vesta: '4' };

/** Minor Planet Center ephemeris service: geocentric astrometric J2000 RA/Dec (0.1s / 1″ resolution). */
function mpc(key: string, iso: string): [number, number] | null {
  const url = `https://minorplanetcenter.net/cgi-bin/mpeph2.cgi?ty=e&TextArea=${MPC_DESIG[key]}&d=${iso}&l=1&i=1&u=d&uto=0&c=500`
    + '&long=&lat=&alt=&raty=a&s=t&m=m&adir=S&oed=&e=-2&resoc=&tit=&bu=&ch=c&ce=f&js=f';
  const html = curl(url, 90);
  const m = html && /\n\d{4} \d\d \d\d \d{6} (\d\d) (\d\d) ([\d.]+) ([+-]\d\d) (\d\d) ([\d.]+)/.exec(html);
  if (!m) return null;
  const ra = Number(m[1]) + Number(m[2]) / 60 + Number(m[3]) / 3600;
  const d = Math.abs(Number(m[4])) + Number(m[5]) / 60 + Number(m[6]) / 3600;
  return [ra, m[4].startsWith('-') ? -d : d];
}

async function main() {
  const elements = loadElements();
  console.log('1) Integration vs JPL sb_ident / MPC (astrometric J2000, arcsec)   format: JPL/MPC');
  const jpl = new Map<string, Map<string, [number, number]>>();
  for (const d of DATES) jpl.set(d, jplBright(d));
  let worst = 0;
  for (const b of BODIES) {
    const el = elements.find((e) => e.key === b.key)!;
    const uts = DATES.map(ut);
    const states = statesAt(el, uts);
    const cells: string[] = [];
    for (let k = 0; k < DATES.length; k++) {
      const eq = Astronomy.EquatorFromVector(geocentric(states[k], Astronomy.MakeTime(uts[k]), false));
      // Chiron is too faint for JPL's whole-sky query (small-field faint queries time out at the JPL gateway),
      // so outside the MPC's 1900–2099 window it has no external reference — see ACCURACY.md.
      const refs = [jpl.get(DATES[k])!.get(b.key) ?? null, mpcSupports(DATES[k]) ? mpc(b.key, DATES[k]) : null];
      const errs = refs.map((r) => (r ? sepArcsec(eq.ra, eq.dec, r[0], r[1]) : null));
      for (const e of errs) if (e !== null) worst = Math.max(worst, e);
      cells.push(`${DATES[k].slice(0, 4)}:${errs.map((e) => (e === null ? '-' : e.toFixed(1))).join('/')}`);
    }
    console.log(`  ${b.key.padEnd(7)} ${cells.join('  ')}`);
  }
  console.log(`  worst: ${worst.toFixed(1)}″  (MPC resolution ≈1–1.5″)`);

  console.log(`2) Integrator step ${DT} d vs ${DT / 2} d (apparent longitude, arcsec)`);
  for (const b of BODIES) {
    const el = elements.find((e) => e.key === b.key)!;
    const uts = [ut(DATES[0]), ut(DATES[DATES.length - 1])];
    const a = statesAt(el, uts, DT), c = statesAt(el, uts, DT / 2);
    const d = uts.map((u, i) => {
      const t = Astronomy.MakeTime(u);
      const l1 = Astronomy.Ecliptic(geocentric(a[i], t, true)).elon;
      const l2 = Astronomy.Ecliptic(geocentric(c[i], t, true)).elon;
      return (Math.abs(((l1 - l2 + 540) % 360) - 180) * 3600).toFixed(2);
    });
    console.log(`  ${b.key.padEnd(7)} ${DATES[0].slice(0, 4)}: ${d[0]}  ${DATES[DATES.length - 1].slice(0, 4)}: ${d[1]}`);
  }

  console.log('3) Interpolation vs direct integration at off-grid times (arcsec)');
  const rnd = (() => { let s = 12345; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; })();
  for (const b of BODIES) {
    const el = elements.find((e) => e.key === b.key)!;
    const lo = ut(START) + 10, hi = ut(END) - 10;
    const uts = Array.from({ length: 300 }, () => lo + rnd() * (hi - lo));
    const states = statesAt(el, uts);
    let max = 0, sum = 0;
    uts.forEach((u, i) => {
      const direct = Astronomy.Ecliptic(geocentric(states[i], Astronomy.MakeTime(u), true)).elon;
      const interp = asteroidPosition(b.key as AsteroidKey, u + 2451545.0)!.longitude;
      const e = Math.abs(((direct - interp + 540) % 360) - 180) * 3600;
      max = Math.max(max, e); sum += e;
    });
    console.log(`  ${b.key.padEnd(7)} mean ${(sum / uts.length).toFixed(2)}  max ${max.toFixed(2)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
