import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getTokenUser } from '../services/auth.service';

const IS_PROD = process.env.NODE_ENV === 'production';
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || (IS_PROD ? (() => { throw new Error('JWT_ACCESS_SECRET is required in production'); })() as never : 'dev-access-secret');

export interface AuthPayload {
  userId: string;
  role: 'user' | 'admin';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token =
    req.cookies?.accessToken ||
    req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    res.status(401).json({ success: false, error: '未登录' });
    return;
  }

  try {
    const payload = jwt.verify(token, ACCESS_SECRET, { algorithms: ['HS256'] }) as AuthPayload & { tv?: number };
    // Account must still exist and the token must predate no password change
    const currentUser = await getTokenUser(payload);
    if (!currentUser) {
      res.status(401).json({ success: false, error: '登录已失效，请重新登录' });
      return;
    }
    const passwordChangeRoute = req.baseUrl === '/api/v1/auth' && ['/change-password', '/me', '/logout'].includes(req.path);
    if (currentUser.forcePasswordChange && !passwordChangeRoute) {
      res.status(403).json({ success: false, error: '请先修改初始密码' });
      return;
    }
    req.user = { userId: currentUser.userId, role: currentUser.role };
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Token 无效或已过期' });
  }
}

/**
 * Verify an access token outside of Express (WebSocket upgrades). Applies the same checks as
 * `authenticate`: valid signature, account still exists, no pending forced password change.
 */
export async function verifyAccessToken(token: string | undefined): Promise<AuthPayload | null> {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, ACCESS_SECRET, { algorithms: ['HS256'] }) as AuthPayload & { tv?: number };
    const currentUser = await getTokenUser(payload);
    if (!currentUser || currentUser.forcePasswordChange) return null;
    return { userId: currentUser.userId, role: currentUser.role };
  } catch {
    return null;
  }
}
