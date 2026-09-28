export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface UserInfo {
  userId: string;
  username: string;
  email: string;
  role: 'user' | 'admin';
  forcePasswordChange: boolean;
  timezone: string;
  themePreference: 'auto' | 'light' | 'dark' | 'scheduled';
  createdAt: string;
  lastLoginAt: string;
}

export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
  newUsername?: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}
