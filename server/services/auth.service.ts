import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { readYaml, writeYaml, listSubDirs, ensureDir, getUserDir } from './storage.service';
import { sendResetEmail, sendWelcomeEmail } from './mail.service';
import { AppError } from '../middleware/error-handler';
import type { UserInfo, AuthTokens } from '../../shared/types/auth.types';
import { resolve } from 'path';
import { randomBytes } from 'crypto';

const IS_PROD = process.env.NODE_ENV === 'production';
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || (IS_PROD ? (() => { throw new Error('JWT_ACCESS_SECRET is required in production'); })() as never : 'dev-access-secret');
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || (IS_PROD ? (() => { throw new Error('JWT_REFRESH_SECRET is required in production'); })() as never : 'dev-refresh-secret');
const BCRYPT_ROUNDS = 12;
/** bcrypt only looks at the first 72 bytes; also stops huge strings from being hashed */
const MAX_PASSWORD_CHARS = 128;

/**
 * Serialize account mutations that check-then-write (registration codes, username/email
 * uniqueness). Storage is plain files in one process, so an in-process queue is enough.
 */
let accountLock: Promise<unknown> = Promise.resolve();
function withAccountLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = accountLock.then(fn, fn);
  accountLock = run.catch(() => {});
  return run;
}

function requireString(v: unknown, message: string): string {
  if (typeof v !== 'string') throw new AppError(400, message);
  return v;
}

function checkNewPassword(pw: unknown, label = '密码'): string {
  const p = requireString(pw, `${label}格式不正确`);
  const n = [...p].length;
  if (n < 6) throw new AppError(400, `${label}至少需要6个字符`);
  if (n > MAX_PASSWORD_CHARS) throw new AppError(400, `${label}最多 ${MAX_PASSWORD_CHARS} 个字符`);
  return p;
}

interface AccountData {
  userId: string;
  username: string;
  email: string;
  passwordHash: string;
  role: 'user' | 'admin';
  createdAt: string;
  lastLoginAt: string;
  forcePasswordChange: boolean;
  timezone: string;
  themePreference: 'auto' | 'light' | 'dark' | 'scheduled';
  resetToken?: string;
  resetTokenExpiry?: string;
  /** Bumped when the password changes; tokens carrying an older version are rejected */
  tokenVersion?: number;
}

// In-memory index for fast username/email lookups
const usernameIndex = new Map<string, string>(); // username -> userId
const emailIndex = new Map<string, string>(); // email -> userId

async function loadIndexes(): Promise<void> {
  const userDirs = await listSubDirs('users');
  for (const userId of userDirs) {
    const account = await readYaml<AccountData>(`users/${userId}/account.yaml`);
    if (account) {
      usernameIndex.set(account.username.toLowerCase(), userId);
      emailIndex.set(account.email.toLowerCase(), userId);
    }
  }
}

export async function initAdmin(): Promise<void> {
  await loadIndexes();

  // Check by file existence (userId = 'admin'), not by username index.
  // This prevents overwriting when admin changes their username.
  const existing = await readYaml<AccountData>('users/admin/account.yaml');
  if (existing) {
    console.log('[Auth] 管理员账户已存在');
    return;
  }

  const userId = 'admin';
  // Never ship a guessable default in production: use ADMIN_INITIAL_PASSWORD or a random one
  const initialPassword = process.env.ADMIN_INITIAL_PASSWORD
    || (IS_PROD ? randomBytes(12).toString('base64url') : 'password');
  const passwordHash = await bcrypt.hash(initialPassword, BCRYPT_ROUNDS);
  const now = new Date().toISOString();

  const adminAccount: AccountData = {
    userId,
    username: 'Admin',
    email: 'admin@arcanum.local',
    passwordHash,
    role: 'admin',
    createdAt: now,
    lastLoginAt: now,
    forcePasswordChange: true,
    timezone: 'Asia/Shanghai',
    themePreference: 'auto',
  };

  await writeYaml(`users/${userId}/account.yaml`, adminAccount);
  usernameIndex.set('admin', userId);
  emailIndex.set('admin@arcanum.local', userId);
  if (process.env.ADMIN_INITIAL_PASSWORD) console.log('[Auth] 管理员账户已创建（Admin / ADMIN_INITIAL_PASSWORD），首次登录请修改密码');
  else console.log(`[Auth] 管理员账户已创建：Admin / ${initialPassword}  （仅显示这一次，首次登录请修改密码）`);
}

export async function register(
  username: string,
  email: string,
  password: string,
  role: 'user' | 'admin' = 'user',
): Promise<UserInfo> {
  return withAccountLock(() => registerLocked(username, email, password, role));
}

async function registerLocked(
  username: string,
  email: string,
  password: string,
  role: 'user' | 'admin',
): Promise<UserInfo> {
  requireString(username, '用户名格式不正确');
  requireString(email, '邮箱格式不正确');
  if (email.length > 254) throw new AppError(400, '邮箱格式不正确');
  if (role !== 'user' && role !== 'admin') throw new AppError(400, '角色不正确');
  // Validate username
  if (!/^[\w\u4e00-\u9fff]{2,20}$/.test(username)) {
    throw new AppError(400, '用户名需2-20字符，支持中文、英文、数字、下划线');
  }

  // Check uniqueness
  if (usernameIndex.has(username.toLowerCase())) {
    throw new AppError(409, '用户名已被占用');
  }
  if (emailIndex.has(email.toLowerCase())) {
    throw new AppError(409, '邮箱已被注册');
  }

  // Validate password (supports Chinese and any Unicode, 6–128 chars)
  checkNewPassword(password);

  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError(400, '邮箱格式不正确');
  }

  const userId = `u_${uuidv4().slice(0, 8)}`;
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const now = new Date().toISOString();

  const account: AccountData = {
    userId,
    username,
    email,
    passwordHash,
    role,
    createdAt: now,
    lastLoginAt: now,
    forcePasswordChange: false,
    timezone: 'Asia/Shanghai',
    themePreference: 'auto',
  };

  await writeYaml(`users/${userId}/account.yaml`, account);

  // Create default primary profile directory
  const profileDir = `users/${userId}/profiles`;
  await ensureDir(resolve(process.cwd(), 'data', profileDir));

  // Update indexes
  usernameIndex.set(username.toLowerCase(), userId);
  emailIndex.set(email.toLowerCase(), userId);

  // Send welcome email (non-blocking)
  sendWelcomeEmail(email, username).catch((err) =>
    console.error('[Auth] 欢迎邮件发送失败:', err.message),
  );

  return toUserInfo(account);
}

export async function login(
  username: string,
  password: string,
): Promise<{ user: UserInfo; tokens: AuthTokens }> {
  const userId = usernameIndex.get(username.toLowerCase());
  if (!userId) {
    throw new AppError(401, '用户名或密码错误');
  }

  const account = await readYaml<AccountData>(`users/${userId}/account.yaml`);
  if (!account) {
    throw new AppError(401, '用户名或密码错误');
  }

  const valid = await bcrypt.compare(password, account.passwordHash);
  if (!valid) {
    throw new AppError(401, '用户名或密码错误');
  }

  // Update last login time
  account.lastLoginAt = new Date().toISOString();
  await writeYaml(`users/${userId}/account.yaml`, account);

  const tokens = await generateTokens(account.userId, account.role);
  return { user: toUserInfo(account), tokens };
}

export async function changePassword(
  userId: string,
  oldPassword: string,
  newPassword: string,
  newUsername?: string,
): Promise<UserInfo> {
  const account = await readYaml<AccountData>(`users/${userId}/account.yaml`);
  if (!account) {
    throw new AppError(404, '用户不存在');
  }

  requireString(oldPassword, '原密码格式不正确');
  if (oldPassword.length > 1000) throw new AppError(401, '原密码错误');
  const valid = await bcrypt.compare(oldPassword, account.passwordHash);
  if (!valid) {
    throw new AppError(401, '原密码错误');
  }

  checkNewPassword(newPassword, '新密码');
  if (newUsername !== undefined && newUsername !== null && newUsername !== '') requireString(newUsername, '用户名格式不正确');

  account.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  account.forcePasswordChange = false;
  // Sign out every other device holding a token from before the change
  account.tokenVersion = (account.tokenVersion || 0) + 1;

  // Admin first login: also change username
  if (newUsername) {
    if (!/^[\w\u4e00-\u9fff]{2,20}$/.test(newUsername)) {
      throw new AppError(400, '用户名需2-20字符');
    }
    const existing = usernameIndex.get(newUsername.toLowerCase());
    if (existing && existing !== userId) {
      throw new AppError(409, '用户名已被占用');
    }
    usernameIndex.delete(account.username.toLowerCase());
    account.username = newUsername;
    usernameIndex.set(newUsername.toLowerCase(), userId);
  }

  await writeYaml(`users/${userId}/account.yaml`, account);
  return toUserInfo(account);
}

export async function forgotPassword(email: string): Promise<void> {
  const userId = emailIndex.get(email.toLowerCase());
  if (!userId) {
    // Don't reveal whether email exists
    return;
  }

  const account = await readYaml<AccountData>(`users/${userId}/account.yaml`);
  if (!account) return;

  const resetToken = uuidv4();
  const expiry = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  account.resetToken = resetToken;
  account.resetTokenExpiry = expiry;
  await writeYaml(`users/${userId}/account.yaml`, account);

  try {
    await sendResetEmail(email, resetToken);
  } catch (err) {
    console.error('[Auth] 邮件发送失败:', err);
    throw new AppError(500, '邮件发送失败，请稍后再试');
  }
}

export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<void> {
  // Search all users for the reset token
  const userDirs = await listSubDirs('users');
  for (const userId of userDirs) {
    const account = await readYaml<AccountData>(`users/${userId}/account.yaml`);
    if (!account || account.resetToken !== token) continue;

    if (
      !account.resetTokenExpiry ||
      new Date(account.resetTokenExpiry) < new Date()
    ) {
      throw new AppError(400, '重置链接已过期');
    }

    checkNewPassword(newPassword, '新密码');

    account.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    account.tokenVersion = (account.tokenVersion || 0) + 1;
    account.resetToken = undefined;
    account.resetTokenExpiry = undefined;
    await writeYaml(`users/${userId}/account.yaml`, account);
    return;
  }

  throw new AppError(400, '无效的重置链接');
}

export async function getUserById(userId: string): Promise<UserInfo | null> {
  const account = await readAccount(userId);
  return account ? toUserInfo(account) : null;
}

async function readAccount(userId: unknown): Promise<AccountData | null> {
  if (typeof userId !== 'string') return null;
  try { getUserDir(userId); } catch { return null; }
  return readYaml<AccountData>(`users/${userId}/account.yaml`);
}

/**
 * Resolve the account behind a verified token: it must still exist and the token must carry
 * the current token version (password changes revoke older tokens).
 */
export async function getTokenUser(payload: { userId?: unknown; tv?: unknown }): Promise<UserInfo | null> {
  const account = await readAccount(payload.userId);
  if (!account) return null;
  if ((Number(payload.tv) || 0) !== (account.tokenVersion || 0)) return null;
  return toUserInfo(account);
}

export async function generateTokens(userId: string, role: 'user' | 'admin'): Promise<AuthTokens> {
  const tv = (await readAccount(userId))?.tokenVersion || 0;
  const accessToken = jwt.sign({ userId, role, tv }, ACCESS_SECRET, {
    expiresIn: '2h',
    algorithm: 'HS256',
  });
  const refreshToken = jwt.sign({ userId, role, tv }, REFRESH_SECRET, {
    expiresIn: '7d',
    algorithm: 'HS256',
  });
  return { accessToken, refreshToken };
}

export function verifyRefreshToken(token: string): { userId: string; role: 'user' | 'admin'; tv?: number } {
  try {
    return jwt.verify(token, REFRESH_SECRET, { algorithms: ['HS256'] }) as { userId: string; role: 'user' | 'admin'; tv?: number };
  } catch {
    throw new AppError(401, 'Refresh Token 无效或已过期');
  }
}

// ── Update email ──
export async function updateEmail(
  userId: string,
  newEmail: string,
): Promise<UserInfo> {
  requireString(newEmail, '邮箱格式不正确');
  if (newEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    throw new AppError(400, '邮箱格式不正确');
  }
  const existing = emailIndex.get(newEmail.toLowerCase());
  if (existing && existing !== userId) {
    throw new AppError(409, '邮箱已被使用');
  }
  const account = await readYaml<AccountData>(`users/${userId}/account.yaml`);
  if (!account) throw new AppError(404, '用户不存在');
  emailIndex.delete(account.email.toLowerCase());
  account.email = newEmail;
  emailIndex.set(newEmail.toLowerCase(), userId);
  await writeYaml(`users/${userId}/account.yaml`, account);
  return toUserInfo(account);
}

// ── Update username (no password required for self-service) ──
export async function updateUsername(
  userId: string,
  newUsername: string,
): Promise<UserInfo> {
  requireString(newUsername, '用户名格式不正确');
  if (!/^[\w\u4e00-\u9fff]{2,20}$/.test(newUsername)) {
    throw new AppError(400, '用户名需2-20字符');
  }
  const existing = usernameIndex.get(newUsername.toLowerCase());
  if (existing && existing !== userId) {
    throw new AppError(409, '用户名已被占用');
  }
  const account = await readYaml<AccountData>(`users/${userId}/account.yaml`);
  if (!account) throw new AppError(404, '用户不存在');
  usernameIndex.delete(account.username.toLowerCase());
  account.username = newUsername;
  usernameIndex.set(newUsername.toLowerCase(), userId);
  await writeYaml(`users/${userId}/account.yaml`, account);
  return toUserInfo(account);
}

// ── Admin: list all users ──
export async function listAllUsers(): Promise<UserInfo[]> {
  const userDirs = await listSubDirs('users');
  const users: UserInfo[] = [];
  for (const uid of userDirs) {
    const account = await readYaml<AccountData>(`users/${uid}/account.yaml`);
    if (account) users.push(toUserInfo(account));
  }
  return users.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// ── Admin: reset user password ──
export async function adminResetPassword(
  targetUserId: string,
  newPassword: string,
): Promise<UserInfo> {
  checkNewPassword(newPassword);
  const account = await readAccount(targetUserId);
  if (!account) throw new AppError(404, '用户不存在');
  account.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  account.tokenVersion = (account.tokenVersion || 0) + 1;
  await writeYaml(`users/${targetUserId}/account.yaml`, account);
  return toUserInfo(account);
}

// ── Admin: delete user ──
export async function adminDeleteUser(targetUserId: string): Promise<void> {
  if (targetUserId === 'admin') throw new AppError(400, '不能删除管理员');
  const account = await readAccount(targetUserId);
  if (!account) throw new AppError(404, '用户不存在');
  usernameIndex.delete(account.username.toLowerCase());
  emailIndex.delete(account.email.toLowerCase());
  // Remove user directory
  const { rmSync } = await import('fs');
  const userDir = resolve(process.cwd(), 'data', getUserDir(targetUserId));
  try { rmSync(userDir, { recursive: true, force: true }); } catch { /* ok */ }
}

// ── Admin: create user ──
export async function adminCreateUser(
  username: string,
  email: string,
  password: string,
  role: 'user' | 'admin' = 'user',
): Promise<UserInfo> {
  return register(username, email, password, role);
}

// ── Registration codes ──
interface RegCode {
  code: string;
  createdAt: string;
  usedBy?: string;
  usedAt?: string;
}

async function loadRegCodes(): Promise<RegCode[]> {
  return (await readYaml<RegCode[]>('system/reg-codes.yaml')) || [];
}

async function saveRegCodes(codes: RegCode[]): Promise<void> {
  await writeYaml('system/reg-codes.yaml', codes);
}

export async function generateRegCodes(count: number): Promise<string[]> {
  const codes = await loadRegCodes();
  const newCodes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = `ARC-${uuidv4().slice(0, 8).toUpperCase()}`;
    newCodes.push(code);
    codes.push({ code, createdAt: new Date().toISOString() });
  }
  await saveRegCodes(codes);
  return newCodes;
}

export async function listRegCodes(): Promise<RegCode[]> {
  return loadRegCodes();
}

export async function validateRegCode(code: string): Promise<boolean> {
  if (typeof code !== 'string' || code.length > 64) return false;
  const codes = await loadRegCodes();
  return codes.some(c => c.code === code && !c.usedBy);
}

export async function consumeRegCode(code: string, username: string): Promise<boolean> {
  return withAccountLock(() => consumeRegCodeLocked(code, username));
}

async function consumeRegCodeLocked(code: string, username: string): Promise<boolean> {
  const codes = await loadRegCodes();
  const entry = codes.find(c => c.code === code && !c.usedBy);
  if (!entry) return false;
  entry.usedBy = username;
  entry.usedAt = new Date().toISOString();
  await saveRegCodes(codes);
  return true;
}

export async function rollbackRegCode(code: string): Promise<void> {
  return withAccountLock(() => rollbackRegCodeLocked(code));
}

async function rollbackRegCodeLocked(code: string): Promise<void> {
  const codes = await loadRegCodes();
  const entry = codes.find(c => c.code === code);
  if (entry) {
    delete entry.usedBy;
    delete entry.usedAt;
    await saveRegCodes(codes);
  }
}

export async function deleteRegCode(code: string): Promise<void> {
  const codes = await loadRegCodes();
  const idx = codes.findIndex(c => c.code === code);
  if (idx >= 0) {
    codes.splice(idx, 1);
    await saveRegCodes(codes);
  }
}

function toUserInfo(account: AccountData): UserInfo {
  return {
    userId: account.userId,
    username: account.username,
    email: account.email,
    role: account.role,
    forcePasswordChange: account.forcePasswordChange,
    timezone: account.timezone,
    themePreference: account.themePreference,
    createdAt: account.createdAt,
    lastLoginAt: account.lastLoginAt,
  };
}
