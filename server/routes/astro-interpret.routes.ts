import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/error-handler';
import { getAstroChart } from '../engines/astro.engine';
import {
  getTransitWheel, getProgressedWheel, getSolarReturnWheel, getSynastryWheel, getCompositeChart,
} from '../engines/astro-overlay.engine';
import { interpretNatal, interpretBiWheel, interpretComposite } from '../services/astro-interpret.service';
import { parseAstroSettings, astroInputFor, engine, todayLocal, pairInputs } from './chart.routes';

export const astroInterpretRouter = Router();

astroInterpretRouter.use(authenticate);

type Handler = (req: Request) => Promise<unknown>;
const route = (fn: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await fn(req) });
  } catch (err) {
    next(err);
  }
};

// 本命盘解读
astroInterpretRouter.get('/natal/:profileId', route(async (req) => {
  const settings = parseAstroSettings(req);
  const { profile, input } = await astroInputFor(req.user!.userId, req.params.profileId as string);
  const chart = engine(() => getAstroChart({ ...input, settings }));
  return interpretNatal(chart, `本命盘 · ${profile.name}`);
}));

// 行运解读
astroInterpretRouter.get('/transit/:profileId', route(async (req) => {
  const settings = parseAstroSettings(req);
  const { input } = await astroInputFor(req.user!.userId, req.params.profileId as string);
  const date = (req.query.date as string) || todayLocal();
  const time = (req.query.time as string) || undefined;
  if (time && !/^\d{1,2}:\d{2}$/.test(time)) throw new AppError(400, '时间格式应为 HH:mm');
  return interpretBiWheel(engine(() => getTransitWheel(input, { date, time }, settings)));
}));

// 次限推运解读
astroInterpretRouter.get('/progressed/:profileId', route(async (req) => {
  const settings = parseAstroSettings(req);
  const { input } = await astroInputFor(req.user!.userId, req.params.profileId as string);
  const date = (req.query.date as string) || todayLocal();
  return interpretBiWheel(engine(() => getProgressedWheel(input, date, settings)));
}));

// 太阳返照解读
astroInterpretRouter.get('/solar-return/:profileId', route(async (req) => {
  const settings = parseAstroSettings(req);
  const { input } = await astroInputFor(req.user!.userId, req.params.profileId as string);
  const year = req.query.year ? Number(req.query.year) : Number(todayLocal().slice(0, 4));
  if (!Number.isInteger(year)) throw new AppError(400, '年份格式不正确');
  return interpretBiWheel(engine(() => getSolarReturnWheel(input, year, undefined, settings)));
}));

// 比较盘解读
astroInterpretRouter.get('/synastry', route(async (req) => {
  const settings = parseAstroSettings(req);
  const { pa, pb, labels } = await pairInputs(req);
  return interpretBiWheel(engine(() => getSynastryWheel(pa.input, pb.input, labels, settings)));
}));

// 组合中点盘解读
astroInterpretRouter.get('/composite', route(async (req) => {
  const settings = parseAstroSettings(req);
  const { pa, pb, labels } = await pairInputs(req);
  return interpretComposite(engine(() => getCompositeChart(pa.input, pb.input, labels, settings)));
}));
