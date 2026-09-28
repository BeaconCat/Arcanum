import type { Request, Response, NextFunction } from 'express';
import { AppError } from './error-handler';

type ValidationRule = {
  field: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  message?: string;
};

export function validate(rules: ValidationRule[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    for (const rule of rules) {
      const value = req.body[rule.field];

      if (rule.required && (value === undefined || value === null || value === '')) {
        throw new AppError(400, rule.message || `${rule.field} 不能为空`);
      }

      if (value !== undefined && value !== null) {
        const str = String(value);
        if (rule.minLength && str.length < rule.minLength) {
          throw new AppError(
            400,
            rule.message || `${rule.field} 至少需要 ${rule.minLength} 个字符`,
          );
        }
        if (rule.maxLength && str.length > rule.maxLength) {
          throw new AppError(
            400,
            rule.message || `${rule.field} 最多 ${rule.maxLength} 个字符`,
          );
        }
        if (rule.pattern && !rule.pattern.test(str)) {
          throw new AppError(
            400,
            rule.message || `${rule.field} 格式不正确`,
          );
        }
      }
    }
    next();
  };
}
