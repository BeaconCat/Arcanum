import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { adminGuard } from '../middleware/admin-guard';
import { getSettings, updateSettings, testConnection } from '../services/llm.service';
import { sendTestEmail } from '../services/mail.service';
import {
  listAllUsers,
  adminCreateUser,
  adminDeleteUser,
  adminResetPassword,
  generateRegCodes,
  listRegCodes,
  deleteRegCode,
} from '../services/auth.service';
import type { Request, Response, NextFunction } from 'express';

export const adminRouter = Router();

adminRouter.use(authenticate);
adminRouter.use(adminGuard);

// ── System Settings ──

adminRouter.get(
  '/settings',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await getSettings();
      // Mask secrets for security
      const masked = {
        ...settings,
        llm: {
          ...settings.llm,
          apiKey: settings.llm.apiKey ? '***' + settings.llm.apiKey.slice(-4) : '',
        },
        smtp: {
          ...settings.smtp,
          pass: settings.smtp.pass ? '***' + settings.smtp.pass.slice(-4) : '',
        },
      };
      res.json({ success: true, data: masked });
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.put(
  '/settings',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Don't overwrite real secrets with masked placeholder
      const patch = { ...req.body };
      if (patch.llm?.apiKey?.startsWith('***')) delete patch.llm.apiKey;
      if (patch.smtp?.pass?.startsWith('***')) delete patch.smtp.pass;
      const updated = await updateSettings(patch);
      const masked = {
        ...updated,
        llm: {
          ...updated.llm,
          apiKey: updated.llm.apiKey ? '***' + updated.llm.apiKey.slice(-4) : '',
        },
        smtp: {
          ...updated.smtp,
          pass: updated.smtp.pass ? '***' + updated.smtp.pass.slice(-4) : '',
        },
      };
      res.json({ success: true, data: masked });
    } catch (err) {
      next(err);
    }
  },
);

// ── LLM Test Connection ──

adminRouter.post(
  '/settings/test-llm',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await testConnection(req.body.llm);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ── SMTP Test ──

adminRouter.post(
  '/settings/test-smtp',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { to } = req.body;
      await sendTestEmail(to);
      res.json({ success: true, message: '测试邮件已发送' });
    } catch (err: any) {
      res.json({ success: false, error: err.message || '发送失败' });
    }
  },
);

// ── User Management ──

adminRouter.get(
  '/users',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const users = await listAllUsers();
      res.json({ success: true, data: users });
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.post(
  '/users',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { username, email, password, role } = req.body;
      const user = await adminCreateUser(username, email, password, role);
      res.status(201).json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.delete(
  '/users/:userId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await adminDeleteUser(req.params.userId as string);
      res.json({ success: true, message: '用户已删除' });
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.put(
  '/users/:userId/reset-password',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await adminResetPassword(req.params.userId as string, req.body.password);
      res.json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  },
);

// ── Registration Codes ──

adminRouter.get(
  '/reg-codes',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const codes = await listRegCodes();
      res.json({ success: true, data: codes });
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.post(
  '/reg-codes',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const count = Math.min(Number(req.body.count) || 1, 50);
      const codes = await generateRegCodes(count);
      res.json({ success: true, data: codes });
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.delete(
  '/reg-codes/:code',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await deleteRegCode(req.params.code as string);
      res.json({ success: true, message: '注册码已删除' });
    } catch (err) {
      next(err);
    }
  },
);
