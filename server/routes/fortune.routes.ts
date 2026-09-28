import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getMonthlyCalendar, generateWeekBatch, generateFullMonth, getDailyDetail, generateDailyDetail, getFortuneTrend } from '../services/fortune.service';
import type { Request, Response, NextFunction } from 'express';

export const fortuneRouter = Router();

fortuneRouter.use(authenticate);

/**
 * GET /monthly?profileId=xxx&year=2026&month=4
 * Fetch monthly calendar (may contain partial week data).
 */
fortuneRouter.get(
  '/monthly',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { profileId, year, month } = req.query;
      if (!profileId || !year || !month) {
        res.status(400).json({ success: false, message: 'profileId, year, month required' });
        return;
      }
      const data = await getMonthlyCalendar(
        req.user!.userId,
        profileId as string,
        Number(year),
        Number(month),
      );
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /monthly
 * Generate weekly batch or full month.
 * Body: { profileId, year, month, weekIndex? }
 * If weekIndex is provided, generate that single week.
 * If weekIndex is omitted, generate all ungenerated weeks.
 */
fortuneRouter.post(
  '/monthly',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { profileId, year, month, weekIndex, force } = req.body;
      if (!profileId || !year || !month) {
        res.status(400).json({ success: false, message: 'profileId, year, month required' });
        return;
      }

      let data;
      if (typeof weekIndex === 'number') {
        data = await generateWeekBatch(
          req.user!.userId,
          profileId,
          Number(year),
          Number(month),
          weekIndex,
        );
      } else {
        data = await generateFullMonth(
          req.user!.userId,
          profileId,
          Number(year),
          Number(month),
          !!force,
        );
      }

      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /daily?profileId=xxx&date=2026-04-14
 * Fetch cached daily detail (null if not generated).
 */
fortuneRouter.get(
  '/daily',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { profileId, date } = req.query;
      if (!profileId || !date) {
        res.status(400).json({ success: false, message: 'profileId, date required' });
        return;
      }
      const data = await getDailyDetail(req.user!.userId, profileId as string, date as string);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /daily
 * Generate daily detail for a specific date.
 * Body: { profileId, date }
 */
fortuneRouter.post(
  '/daily',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { profileId, date } = req.body;
      if (!profileId || !date) {
        res.status(400).json({ success: false, message: 'profileId, date required' });
        return;
      }
      const data = await generateDailyDetail(req.user!.userId, profileId, date);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /trend?profileId=xxx&from=2026-04-01&to=2026-04-30
 * Aggregate trend data from monthly YAML files.
 */
fortuneRouter.get(
  '/trend',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { profileId, from, to } = req.query;
      if (!profileId || !from || !to) {
        res.status(400).json({ success: false, message: 'profileId, from, to required' });
        return;
      }
      const data = await getFortuneTrend(
        req.user!.userId,
        profileId as string,
        from as string,
        to as string,
      );
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
);
