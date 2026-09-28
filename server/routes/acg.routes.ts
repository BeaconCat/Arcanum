import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/error-handler';
import { getProfile } from '../services/profile.service';
import { resolveProfilePlace } from '../services/geo.service';
import { getAcgLines, nearestAcgLines, rankPlacesForTheme, ACG_THEMES } from '../engines/acg.engine';
import { rankCandidates, searchPlaces, nearestPlace } from '../services/acg-places.service';
import type { AcgResult, AcgTheme } from '../../shared/types/acg.types';

export const acgRouter = Router();
acgRouter.use(authenticate);

async function acgFor(userId: string, profileId: string): Promise<AcgResult> {
  if (!profileId) throw new AppError(400, '缺少档案 ID');
  const profile = await getProfile(userId, profileId).catch((err) => {
    throw err instanceof AppError ? err : new AppError(404, `档案不存在：${profileId}`);
  });
  const place = resolveProfilePlace(profile);
  return getAcgLines({
    birthDate: profile.birthDate,
    birthTime: profile.birthTime,
    timezone: profile.timezone || 'Asia/Shanghai',
    lat: place.lat,
    lon: place.lon,
    place,
  });
}

function num(v: unknown, name: string, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new AppError(400, `参数 ${name} 应为 ${min}~${max} 之间的数字`);
  return n;
}

// Static paths first so they aren't captured by :profileId
acgRouter.get('/themes', (_req: Request, res: Response) => {
  res.json({ success: true, data: ACG_THEMES });
});

acgRouter.get('/places/search', (req: Request, res: Response) => {
  const q = String(req.query.q || '').slice(0, 40);
  res.json({ success: true, data: searchPlaces(q) });
});

acgRouter.get('/:profileId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await acgFor(req.user!.userId, req.params.profileId as string) });
  } catch (err) { next(err); }
});

acgRouter.get('/:profileId/near', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lat = num(req.query.lat, 'lat', -90, 90);
    const lon = num(req.query.lon, 'lon', -180, 180);
    const radiusKm = req.query.radius === undefined ? 600 : num(req.query.radius, 'radius', 50, 2000);
    const result = await acgFor(req.user!.userId, req.params.profileId as string);
    res.json({
      success: true,
      data: { lat, lon, radiusKm, nearestPlace: nearestPlace(lat, lon), hits: nearestAcgLines(result, lat, lon, radiusKm) },
    });
  } catch (err) { next(err); }
});

acgRouter.get('/:profileId/rank', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const theme = ACG_THEMES.find((t) => t.key === req.query.theme);
    if (!theme) throw new AppError(400, `未知主题，可选：${ACG_THEMES.map((t) => t.key).join(', ')}`);
    const result = await acgFor(req.user!.userId, req.params.profileId as string);
    res.json({ success: true, data: { theme, places: rankPlacesForTheme(result, rankCandidates(), theme.key as AcgTheme, 20) } });
  } catch (err) { next(err); }
});
