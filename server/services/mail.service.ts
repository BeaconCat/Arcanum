import nodemailer from 'nodemailer';
import { getSettings } from './llm.service';
import type { SmtpConfig } from '../../shared/types/settings.types';

// ── Transporter management ──

let transporter: nodemailer.Transporter | null = null;
let lastSmtpHash = '';

function smtpHash(cfg: SmtpConfig): string {
  return `${cfg.host}:${cfg.port}:${cfg.user}:${cfg.pass}:${cfg.secure}`;
}

async function getTransporter(): Promise<nodemailer.Transporter> {
  const settings = await getSettings();
  const cfg = settings.smtp;
  const hash = smtpHash(cfg);
  if (!transporter || hash !== lastSmtpHash) {
    if (!cfg.host || !cfg.user) {
      throw new Error('SMTP 未配置，请前往管理后台填写邮箱服务器信息');
    }
    transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
    });
    lastSmtpHash = hash;
  }
  return transporter;
}

// ── HTML email layout ──

function emailLayout(body: string): string {
  return `<!DOCTYPE html>
<html lang="zh">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f1ec;font-family:'Noto Serif SC','Songti SC','SimSun',Georgia,serif;">
  <div style="max-width:520px;margin:40px auto;background:#fffdf8;border-radius:12px;overflow:hidden;box-shadow:0 2px 24px rgba(0,0,0,0.06);">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);padding:32px 24px;text-align:center;">
      <h1 style="margin:0;font-size:28px;color:#e8d5b7;letter-spacing:4px;font-weight:400;">天 枢</h1>
      <p style="margin:6px 0 0;font-size:12px;color:rgba(232,213,183,0.6);letter-spacing:2px;">A R C A N U M</p>
    </div>
    <!-- Body -->
    <div style="padding:32px 28px;">
      ${body}
    </div>
    <!-- Footer -->
    <div style="padding:16px 28px;border-top:1px solid #ebe6dc;text-align:center;">
      <p style="margin:0;font-size:11px;color:#b0a89c;letter-spacing:1px;">天枢 Arcanum — 命理智能助手</p>
    </div>
  </div>
</body>
</html>`;
}

// ── Email templates ──

function resetPasswordHtml(resetLink: string): string {
  return emailLayout(`
    <h2 style="margin:0 0 8px;font-size:18px;color:#2c2520;font-weight:600;">重置密码</h2>
    <p style="color:#6b5e52;font-size:14px;line-height:1.8;margin:0 0 24px;">
      您正在申请重置密码。请点击下方按钮完成操作，如非本人操作请忽略此邮件。
    </p>
    <div style="text-align:center;margin:28px 0;">
      <a href="${resetLink}" style="display:inline-block;padding:14px 40px;background:linear-gradient(135deg,#1a1a2e,#0f3460);color:#e8d5b7;text-decoration:none;border-radius:8px;font-size:15px;letter-spacing:2px;font-weight:500;">
        重 置 密 码
      </a>
    </div>
    <p style="color:#a09488;font-size:12px;line-height:1.6;margin:0 0 8px;">
      如果按钮无法点击，请复制以下链接到浏览器：
    </p>
    <p style="color:#7c6f63;font-size:11px;word-break:break-all;background:#f7f3ed;padding:10px 12px;border-radius:6px;margin:0 0 16px;">
      ${resetLink}
    </p>
    <p style="color:#b0a89c;font-size:12px;margin:0;">
      ⏳ 此链接 30 分钟内有效
    </p>
  `);
}

function welcomeHtml(username: string, loginUrl: string): string {
  return emailLayout(`
    <h2 style="margin:0 0 8px;font-size:18px;color:#2c2520;font-weight:600;">欢迎加入天枢</h2>
    <p style="color:#6b5e52;font-size:14px;line-height:1.8;margin:0 0 20px;">
      <strong>${username}</strong>，您的账号已创建成功。
    </p>
    <div style="background:#f7f3ed;border-radius:8px;padding:20px 24px;margin:0 0 24px;">
      <p style="margin:0 0 8px;font-size:13px;color:#8c7e72;">您可以使用天枢的以下功能：</p>
      <ul style="margin:0;padding:0 0 0 18px;color:#5a5048;font-size:13px;line-height:2;">
        <li>八字与紫微斗数智能排盘</li>
        <li>AI 命理师实时对话解读</li>
        <li>每日运势与流年推算</li>
        <li>六爻、梅花易数、奇门遁甲</li>
      </ul>
    </div>
    <div style="text-align:center;margin:24px 0;">
      <a href="${loginUrl}" style="display:inline-block;padding:14px 40px;background:linear-gradient(135deg,#1a1a2e,#0f3460);color:#e8d5b7;text-decoration:none;border-radius:8px;font-size:15px;letter-spacing:2px;font-weight:500;">
        开 始 使 用
      </a>
    </div>
  `);
}

function testEmailHtml(): string {
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  return emailLayout(`
    <h2 style="margin:0 0 8px;font-size:18px;color:#2c2520;font-weight:600;">邮件服务测试</h2>
    <p style="color:#6b5e52;font-size:14px;line-height:1.8;margin:0 0 16px;">
      如果您收到此邮件，说明 SMTP 配置正确，邮件服务运行正常。
    </p>
    <div style="background:#f7f3ed;border-radius:8px;padding:16px 20px;margin:0 0 16px;">
      <p style="margin:0;font-size:13px;color:#8c7e72;">发送时间：${now}</p>
    </div>
    <p style="color:#b0a89c;font-size:12px;margin:0;">
      此邮件由管理后台手动触发，无需回复。
    </p>
  `);
}

// ── Public API ──

export async function sendResetEmail(
  email: string,
  resetToken: string,
): Promise<void> {
  const settings = await getSettings();
  const appUrl = settings.smtp.appUrl || 'http://localhost:3001';
  const resetLink = `${appUrl}/reset-password?token=${resetToken}`;
  const t = await getTransporter();

  await t.sendMail({
    from: settings.smtp.from,
    to: email,
    subject: '天枢 (Arcanum) — 重置密码',
    html: resetPasswordHtml(resetLink),
  });
}

export async function sendWelcomeEmail(
  email: string,
  username: string,
): Promise<void> {
  const settings = await getSettings();
  const appUrl = settings.smtp.appUrl || 'http://localhost:3001';
  const loginUrl = `${appUrl}/login`;
  const t = await getTransporter();

  await t.sendMail({
    from: settings.smtp.from,
    to: email,
    subject: '天枢 (Arcanum) — 欢迎加入',
    html: welcomeHtml(username, loginUrl),
  });
}

export async function sendTestEmail(to: string): Promise<void> {
  const t = await getTransporter();
  const settings = await getSettings();

  await t.sendMail({
    from: settings.smtp.from,
    to,
    subject: '天枢 (Arcanum) — SMTP 测试',
    html: testEmailHtml(),
  });
}
