import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getProfile } from '../services/profile.service';
import { getBaziChart, getDayGanZhi, getLunarDateString } from '../engines/bazi.engine';
import { getZiweiChart, getZiweiDailyChart } from '../engines/ziwei.engine';
import { getAstroChart, utcToLocal, type AstroInput } from '../engines/astro.engine';
import {
  getTransitWheel, getProgressedWheel, getSolarReturnWheel, getSynastryWheel, getCompositeChart,
} from '../engines/astro-overlay.engine';
import { resolveBirthPlace, resolveProfilePlace } from '../services/geo.service';
import { AppError } from '../middleware/error-handler';
import type { AstroChartSettings, AstroHouseSystem } from '../../shared/types/astro.types';
import type { Request, Response, NextFunction } from 'express';

export const chartRouter = Router();

chartRouter.use(authenticate);

// Get Bazi natal chart for a profile
chartRouter.get(
  '/bazi/:profileId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profileId = req.params.profileId as string;
      const profile = await getProfile(req.user!.userId, profileId);
      const chart = getBaziChart(profile.birthDate, profile.birthTime, profile.gender);
      res.json({ success: true, data: chart });
    } catch (err) {
      next(err);
    }
  },
);

// Get Ziwei natal chart for a profile
chartRouter.get(
  '/ziwei/:profileId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profileId = req.params.profileId as string;
      const profile = await getProfile(req.user!.userId, profileId);
      const chart = getZiweiChart(profile.birthDate, profile.birthTime, profile.gender);
      res.json({ success: true, data: chart });
    } catch (err) {
      next(err);
    }
  },
);

const HOUSE_SYSTEMS: AstroHouseSystem[] = ['placidus', 'whole-sign', 'equal', 'porphyry'];

/** `settings` query param (JSON of Partial<AstroChartSettings>) + legacy `houseSystem` param. */
export function parseAstroSettings(req: Request): Partial<AstroChartSettings> {
  let settings: Partial<AstroChartSettings> = {};
  const raw = req.query.settings;
  if (typeof raw === 'string' && raw.length < 4000) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') settings = parsed;
    } catch { /* ignore malformed settings */ }
  }
  const hs = req.query.houseSystem as string | undefined;
  if (hs) {
    if (!HOUSE_SYSTEMS.includes(hs as AstroHouseSystem)) throw new AppError(400, '不支持的宫制');
    if (!settings.houseSystem) settings.houseSystem = hs as AstroHouseSystem;
  }
  return settings;
}

export async function astroInputFor(userId: string, profileId: string) {
  if (!profileId) throw new AppError(400, '缺少档案 ID');
  const profile = await getProfile(userId, profileId).catch((err) => {
    throw err instanceof AppError ? err : new AppError(404, `档案不存在：${profileId}`);
  });
  const place = resolveProfilePlace(profile);
  const input: AstroInput = {
    birthDate: profile.birthDate,
    birthTime: profile.birthTime,
    timezone: profile.timezone || 'Asia/Shanghai',
    lat: place.lat,
    lon: place.lon,
    place,
  };
  return { profile, place, input };
}

/** Engine validation errors are plain Errors with Chinese messages → 400 */
export function engine<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(400, (err as Error)?.message || '星盘计算失败');
  }
}

export const todayLocal = () => utcToLocal(new Date(), 'Asia/Shanghai').date;

// Get Western astrology natal chart (星盘) for a profile
chartRouter.get(
  '/astro/:profileId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = parseAstroSettings(req);
      const { place, input } = await astroInputFor(req.user!.userId, req.params.profileId as string);
      const chart = engine(() => getAstroChart({ ...input, settings }));
      res.json({ success: true, data: { chart, place } });
    } catch (err) {
      next(err);
    }
  },
);

// 行运：本命 × 某日某时的天象
chartRouter.get(
  '/astro/:profileId/transit',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = parseAstroSettings(req);
      const { place, input } = await astroInputFor(req.user!.userId, req.params.profileId as string);
      const date = (req.query.date as string) || todayLocal();
      const time = (req.query.time as string) || undefined;
      if (time && !/^\d{1,2}:\d{2}$/.test(time)) throw new AppError(400, '时间格式应为 HH:mm');
      const wheel = engine(() => getTransitWheel(input, { date, time }, settings));
      res.json({ success: true, data: { ...wheel, places: { inner: place } } });
    } catch (err) {
      next(err);
    }
  },
);

// 次限推运
chartRouter.get(
  '/astro/:profileId/progressed',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = parseAstroSettings(req);
      const { place, input } = await astroInputFor(req.user!.userId, req.params.profileId as string);
      const date = (req.query.date as string) || todayLocal();
      const wheel = engine(() => getProgressedWheel(input, date, settings));
      res.json({ success: true, data: { ...wheel, places: { inner: place } } });
    } catch (err) {
      next(err);
    }
  },
);

// 太阳返照
chartRouter.get(
  '/astro/:profileId/solar-return',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = parseAstroSettings(req);
      const { place, input } = await astroInputFor(req.user!.userId, req.params.profileId as string);
      const year = req.query.year ? Number(req.query.year) : Number(todayLocal().slice(0, 4));
      if (!Number.isInteger(year)) throw new AppError(400, '年份格式不正确');
      const wheel = engine(() => getSolarReturnWheel(input, year, undefined, settings));
      res.json({ success: true, data: { ...wheel, places: { inner: place } } });
    } catch (err) {
      next(err);
    }
  },
);

export async function pairInputs(req: Request) {
  const a = String(req.query.a || '');
  const b = String(req.query.b || '');
  if (!a || !b) throw new AppError(400, '请提供两个档案 ID（a 与 b）');
  const userId = req.user!.userId;
  const [pa, pb] = await Promise.all([astroInputFor(userId, a), astroInputFor(userId, b)]);
  return { pa, pb, labels: { a: pa.profile.name, b: pb.profile.name } };
}

// 比较盘（含匹配度）
chartRouter.get(
  '/astro-synastry',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = parseAstroSettings(req);
      const { pa, pb, labels } = await pairInputs(req);
      const wheel = engine(() => getSynastryWheel(pa.input, pb.input, labels, settings));
      res.json({ success: true, data: { ...wheel, places: { inner: pa.place, outer: pb.place } } });
    } catch (err) {
      next(err);
    }
  },
);

// 组合中点盘
chartRouter.get(
  '/astro-composite',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = parseAstroSettings(req);
      const { pa, pb, labels } = await pairInputs(req);
      const composite = engine(() => getCompositeChart(pa.input, pb.input, labels, settings));
      res.json({ success: true, data: { ...composite, places: { a: pa.place, b: pb.place } } });
    } catch (err) {
      next(err);
    }
  },
);

// Preview how a free-text 出生地 resolves to coordinates (used by the profile form)
chartRouter.get(
  '/place-resolve',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const text = String(req.query.place || '').slice(0, 100);
      res.json({ success: true, data: resolveBirthPlace(text) });
    } catch (err) {
      next(err);
    }
  },
);

// Get Ziwei daily chart (with horoscope overlay)
chartRouter.get(
  '/ziwei/:profileId/daily',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profileId = req.params.profileId as string;
      const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
      const profile = await getProfile(req.user!.userId, profileId);
      const chart = getZiweiDailyChart(
        profile.birthDate,
        profile.birthTime,
        profile.gender,
        date,
      );
      res.json({ success: true, data: chart });
    } catch (err) {
      next(err);
    }
  },
);

// Get day's Gan-Zhi + lunar date
chartRouter.get(
  '/day-info',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
      const ganZhi = getDayGanZhi(date);
      const lunarDate = getLunarDateString(date);
      res.json({ success: true, data: { ...ganZhi, lunarDate, date } });
    } catch (err) {
      next(err);
    }
  },
);
