import type { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
    return;
  }

  // body-parser errors (payload too large, malformed JSON…) carry their own 4xx status
  const status = (err as { status?: number; statusCode?: number }).status ?? (err as { statusCode?: number }).statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    res.status(status).json({ success: false, error: status === 413 ? '请求体过大' : '请求格式不正确' });
    return;
  }

  console.error(`[Error] ${err.message}`, err.stack);
  res.status(500).json({
    success: false,
    error: '服务器内部错误',
  });
}
