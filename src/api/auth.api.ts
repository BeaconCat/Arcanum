import httpClient from './http-client';
import type { UserInfo } from '../../shared/types/auth.types';
import type { ApiResponse } from '../../shared/types/api.types';

export async function apiRegister(
  username: string,
  email: string,
  password: string,
  regCode?: string,
): Promise<UserInfo> {
  const { data } = await httpClient.post<ApiResponse<UserInfo>>(
    '/auth/register',
    { username, email, password, regCode },
  );
  return data.data!;
}

export async function apiLogin(
  username: string,
  password: string,
): Promise<UserInfo> {
  const { data } = await httpClient.post<ApiResponse<UserInfo>>(
    '/auth/login',
    { username, password },
  );
  return data.data!;
}

export async function apiLogout(): Promise<void> {
  await httpClient.post('/auth/logout');
}

export async function apiRefresh(): Promise<UserInfo> {
  const { data } = await httpClient.post<ApiResponse<UserInfo>>(
    '/auth/refresh',
  );
  return data.data!;
}

export async function apiGetMe(): Promise<UserInfo> {
  const { data } = await httpClient.get<ApiResponse<UserInfo>>('/auth/me');
  return data.data!;
}

export async function apiChangePassword(
  oldPassword: string,
  newPassword: string,
  newUsername?: string,
): Promise<UserInfo> {
  const { data } = await httpClient.put<ApiResponse<UserInfo>>(
    '/auth/change-password',
    { oldPassword, newPassword, newUsername },
  );
  return data.data!;
}

export async function apiForgotPassword(email: string): Promise<void> {
  await httpClient.post('/auth/forgot-password', { email });
}

export async function apiResetPassword(
  token: string,
  newPassword: string,
): Promise<void> {
  await httpClient.post('/auth/reset-password', { token, newPassword });
}

export async function apiUpdateEmail(email: string): Promise<UserInfo> {
  const { data } = await httpClient.put<ApiResponse<UserInfo>>(
    '/auth/update-email',
    { email },
  );
  return data.data!;
}

export async function apiUpdateUsername(username: string): Promise<UserInfo> {
  const { data } = await httpClient.put<ApiResponse<UserInfo>>(
    '/auth/update-username',
    { username },
  );
  return data.data!;
}
