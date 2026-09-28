import { Router } from 'express';
import {
  register,
  login,
  changePassword,
  forgotPassword,
  resetPassword,
  generateTokens,
  verifyRefreshToken,
  getUserById,
  getTokenUser,
  updateEmail,
  updateUsername,
  consumeRegCode,
  rollbackRegCode,
} from '../services/auth.service';
import { authenticate } from '../middleware/auth';
import type { Request, Response, NextFunction } from 'express';

export const authRouter = Router();

authRouter.post(
  '/register',
  async (req: Request, res: Response, next: NextFunction) => {
    const regCode = typeof req.body.regCode === 'string' ? req.body.regCode.trim() : undefined;
    let claimed = false;
    try {
      const { username, email, password } = req.body;
      if (typeof username !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
        res.status(400).json({ success: false, error: '注册参数格式不正确' });
        return;
      }
      if (!regCode) {
        res.status(400).json({ success: false, error: '请输入注册码' });
        return;
      }
      // Claim the code atomically first, so concurrent requests can't turn one code into
      // several accounts; give it back if registration then fails
      claimed = await consumeRegCode(regCode, username);
      if (!claimed) {
        res.status(400).json({ success: false, error: '注册码无效或已使用' });
        return;
      }
      let user;
      try {
        user = await register(username, email, password);
      } catch (regErr: any) {
        await rollbackRegCode(regCode).catch(() => {});
        claimed = false;
        res.status(regErr?.statusCode === 409 ? 409 : 400).json({ success: false, error: regErr.message || '注册失败' });
        return;
      }
      const tokens = await generateTokens(user.userId, user.role);
      setTokenCookies(res, tokens.accessToken, tokens.refreshToken);
      res.status(201).json({ success: true, data: user });
    } catch (err) {
      // If anything fails after the claim (before the account exists), give the code back
      if (claimed && regCode) await rollbackRegCode(regCode).catch(() => {});
      next(err);
    }
  },
);

authRouter.post(
  '/login',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { username, password } = req.body;
      if (typeof username !== 'string' || typeof password !== 'string' || username.length > 100 || password.length > 1000) {
        res.status(400).json({ success: false, error: '登录参数格式不正确' });
        return;
      }
      const { user, tokens } = await login(username, password);
      setTokenCookies(res, tokens.accessToken, tokens.refreshToken);
      res.json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
  res.json({ success: true, message: '已登出' });
});

authRouter.post(
  '/refresh',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refreshToken = req.cookies?.refreshToken;
      if (!refreshToken) {
        res.status(401).json({ success: false, error: '无 Refresh Token' });
        return;
      }
      const payload = verifyRefreshToken(refreshToken);
      // Also rejects refresh tokens issued before a password change
      const user = await getTokenUser(payload);
      if (!user) {
        res.status(401).json({ success: false, error: '登录已失效，请重新登录' });
        return;
      }
      const tokens = await generateTokens(user.userId, user.role);
      setTokenCookies(res, tokens.accessToken, tokens.refreshToken);
      res.json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post(
  '/forgot-password',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.body;
      if (typeof email !== 'string' || email.length > 254) {
        res.status(400).json({ success: false, error: '邮箱格式不正确' });
        return;
      }
      await forgotPassword(email);
      res.json({ success: true, message: '如果邮箱存在，重置链接已发送' });
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post(
  '/reset-password',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token, newPassword } = req.body;
      if (typeof token !== 'string' || !/^[0-9a-f-]{36}$/i.test(token) || typeof newPassword !== 'string') {
        res.status(400).json({ success: false, error: '重置参数格式不正确' });
        return;
      }
      await resetPassword(token, newPassword);
      res.json({ success: true, message: '密码已重置' });
    } catch (err) {
      next(err);
    }
  },
);

authRouter.put(
  '/change-password',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { oldPassword, newPassword, newUsername } = req.body;
      const user = await changePassword(
        req.user!.userId,
        oldPassword,
        newPassword,
        newUsername,
      );
      // Older tokens were just revoked; keep this device signed in with fresh ones
      const tokens = await generateTokens(user.userId, user.role);
      setTokenCookies(res, tokens.accessToken, tokens.refreshToken);
      res.json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  },
);

authRouter.get(
  '/me',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await getUserById(req.user!.userId);
      res.json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  },
);

// ── Update email ──
authRouter.put(
  '/update-email',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await updateEmail(req.user!.userId, req.body.email);
      res.json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  },
);

// ── Update username ──
authRouter.put(
  '/update-username',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await updateUsername(req.user!.userId, req.body.username);
      res.json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  },
);

const IS_PROD = process.env.NODE_ENV === 'production';

function setTokenCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
): void {
  const base = {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: IS_PROD,
  };
  res.cookie('accessToken', accessToken, {
    ...base,
    maxAge: 2 * 60 * 60 * 1000, // 2 hours
  });
  res.cookie('refreshToken', refreshToken, {
    ...base,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}
