import http from './http-client';
import type { SystemSettings } from '../../shared/types/settings.types';
import type { UserInfo } from '../../shared/types/auth.types';

export async function apiGetSettings(): Promise<SystemSettings> {
  const res = await http.get('/admin/settings');
  return res.data.data;
}

export async function apiUpdateSettings(settings: Partial<SystemSettings>): Promise<SystemSettings> {
  const res = await http.put('/admin/settings', settings);
  return res.data.data;
}

export async function apiTestLlm(llm?: Partial<SystemSettings['llm']>): Promise<{ ok: boolean; message: string; latencyMs: number }> {
  const res = await http.post('/admin/settings/test-llm', { llm });
  return res.data.data;
}

export async function apiTestSmtp(to: string): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await http.post('/admin/settings/test-smtp', { to });
  return res.data;
}

// ── User Management ──
export async function apiListUsers(): Promise<UserInfo[]> {
  const res = await http.get('/admin/users');
  return res.data.data;
}

export async function apiCreateUser(username: string, email: string, password: string, role?: string): Promise<UserInfo> {
  const res = await http.post('/admin/users', { username, email, password, role });
  return res.data.data;
}

export async function apiDeleteUser(userId: string): Promise<void> {
  await http.delete(`/admin/users/${userId}`);
}

export async function apiResetUserPassword(userId: string, password: string): Promise<UserInfo> {
  const res = await http.put(`/admin/users/${userId}/reset-password`, { password });
  return res.data.data;
}

// ── Registration Codes ──
export interface RegCode {
  code: string;
  createdAt: string;
  usedBy?: string;
  usedAt?: string;
}

export async function apiListRegCodes(): Promise<RegCode[]> {
  const res = await http.get('/admin/reg-codes');
  return res.data.data;
}

export async function apiGenerateRegCodes(count: number): Promise<string[]> {
  const res = await http.post('/admin/reg-codes', { count });
  return res.data.data;
}

export async function apiDeleteRegCode(code: string): Promise<void> {
  await http.delete(`/admin/reg-codes/${encodeURIComponent(code)}`);
}
