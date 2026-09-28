import { Router } from 'express';
import {
  listProfiles,
  getProfile,
  createProfile,
  updateProfile,
  deleteProfile,
  getShareData,
  importProfile,
} from '../services/profile.service';
import { getNatalChart, generateNatalAnalysis, generateSingleSection } from '../services/natal.service';
import { getShenshaExplanation, generateShenshaExplanation } from '../services/shensha.service';
import { authenticate } from '../middleware/auth';
import type { Request, Response, NextFunction } from 'express';

export const profileRouter = Router();

// All profile routes require authentication
profileRouter.use(authenticate);

profileRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profiles = await listProfiles(req.user!.userId);
      res.json({ success: true, data: profiles });
    } catch (err) {
      next(err);
    }
  },
);

profileRouter.post(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profile = await createProfile(req.user!.userId, req.body);
      res.status(201).json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  },
);

profileRouter.get(
  '/:profileId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profileId = req.params.profileId as string;
      const profile = await getProfile(req.user!.userId, profileId);
      res.json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  },
);

profileRouter.put(
  '/:profileId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profileId = req.params.profileId as string;
      const profile = await updateProfile(
        req.user!.userId,
        profileId,
        req.body,
      );
      res.json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  },
);

profileRouter.delete(
  '/:profileId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profileId = req.params.profileId as string;
      await deleteProfile(req.user!.userId, profileId);
      res.json({ success: true, message: '档案已删除' });
    } catch (err) {
      next(err);
    }
  },
);

profileRouter.get(
  '/:profileId/share',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profileId = req.params.profileId as string;
      const data = await getShareData(req.user!.userId, profileId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
);

profileRouter.post(
  '/import',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profile = await importProfile(req.user!.userId, req.body);
      res.status(201).json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  },
);

// ── Natal chart endpoints ──

profileRouter.get(
  '/:profileId/natal-chart',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profileId = req.params.profileId as string;
      const data = await getNatalChart(req.user!.userId, profileId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
);

profileRouter.post(
  '/:profileId/natal-chart',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profileId = req.params.profileId as string;
      const data = await generateNatalAnalysis(req.user!.userId, profileId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
);

profileRouter.post(
  '/:profileId/natal-chart/:sectionId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profileId = req.params.profileId as string;
      const sectionId = req.params.sectionId as string;
      const data = await generateSingleSection(req.user!.userId, profileId, sectionId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
);

// ── Shensha explanation endpoints ──

profileRouter.get(
  '/:profileId/shensha/:name',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profileId = req.params.profileId as string;
      const name = req.params.name as string;
      const data = await getShenshaExplanation(req.user!.userId, profileId, name);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
);

profileRouter.post(
  '/:profileId/shensha/:name',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profileId = req.params.profileId as string;
      const name = req.params.name as string;
      // Each call spends model tokens and adds a cache entry: only plausible 神煞 names
      if (!/^[一-鿿]{1,8}$/.test(name)) {
        res.status(400).json({ success: false, error: '神煞名称不正确' });
        return;
      }
      const data = await generateShenshaExplanation(req.user!.userId, profileId, name);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
);
