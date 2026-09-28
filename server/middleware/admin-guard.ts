import type { Request, Response, NextFunction } from 'express';

export function adminGuard(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ success: false, error: '需要管理员权限' });
    return;
  }
  next();
}
