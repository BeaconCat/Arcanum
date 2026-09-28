import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { getTarotDeck, getTarotSpreads } from '../engines/tarot.engine';
import {
  drawTarotReading, getTarotReading, listTarotReadings, deleteTarotReading,
  updateTarotReading, streamTarotInterpretation,
} from '../services/tarot.service';
import type { TarotDrawOptions } from '../../shared/types/tarot.types';

export const tarotRouter = Router();
tarotRouter.use(authenticate);

tarotRouter.get('/cards', (_req: Request, res: Response) => {
  res.json({ success: true, data: getTarotDeck() });
});

tarotRouter.get('/spreads', (_req: Request, res: Response) => {
  res.json({ success: true, data: getTarotSpreads() });
});

tarotRouter.get('/readings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = req.query as Record<string, string | undefined>;
    res.json({
      success: true,
      data: await listTarotReadings(req.user!.userId, {
        offset: Number(q.offset) || 0,
        limit: Number(q.limit) || 20,
        favorite: q.favorite === '1' || q.favorite === 'true',
      }),
    });
  } catch (err) { next(err); }
});

tarotRouter.post('/readings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = (req.body || {}) as Partial<TarotDrawOptions>;
    if (typeof b.spreadId !== 'string') {
      res.status(400).json({ success: false, error: '请选择牌阵' });
      return;
    }
    const reading = await drawTarotReading(req.user!.userId, {
      spreadId: b.spreadId,
      question: typeof b.question === 'string' ? b.question : '',
      allowReversed: b.allowReversed !== false,
      majorOnly: b.majorOnly === true,
      deck: b.deck === 'arcanum' || b.deck === 'rws' ? b.deck : undefined,
      profileId: typeof b.profileId === 'string' && b.profileId ? b.profileId : undefined,
      picks: Array.isArray(b.picks) ? b.picks.filter((n) => Number.isInteger(n)).slice(0, 20) : undefined,
    });
    res.json({ success: true, data: reading });
  } catch (err) { next(err); }
});

tarotRouter.get('/readings/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await getTarotReading(req.user!.userId, req.params.id as string) });
  } catch (err) { next(err); }
});

tarotRouter.patch('/readings/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { note, favorite } = (req.body || {}) as { note?: unknown; favorite?: unknown };
    const data = await updateTarotReading(req.user!.userId, req.params.id as string, {
      note: typeof note === 'string' ? note : undefined,
      favorite: typeof favorite === 'boolean' ? favorite : undefined,
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

tarotRouter.delete('/readings/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await deleteTarotReading(req.user!.userId, req.params.id as string);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// AI interpretation (SSE): data: {content} … data: {done: true} … data: [DONE]
tarotRouter.post('/readings/:id/interpret', async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user!.userId;
  const readingId = req.params.id as string;
  let stream: AsyncGenerator<string, void, unknown>;
  try {
    // Validate existence before switching to SSE so errors return proper JSON
    await getTarotReading(userId, readingId);
    stream = streamTarotInterpretation(userId, readingId);
  } catch (err) {
    next(err);
    return;
  }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const send = (data: Record<string, unknown>) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  try {
    for await (const text of stream) send({ content: text });
    send({ done: true });
  } catch (err: any) {
    send({ error: err?.message || 'AI 解读失败' });
  }
  res.write('data: [DONE]\n\n');
  res.end();
});
