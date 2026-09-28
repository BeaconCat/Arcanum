import httpClient from './http-client';
import type { Profile, CreateProfileRequest, UpdateProfileRequest, ProfileShareData } from '../../shared/types/profile.types';
import type { ApiResponse } from '../../shared/types/api.types';

export async function apiListProfiles(): Promise<Profile[]> {
  const { data } = await httpClient.get<ApiResponse<Profile[]>>('/profiles');
  return data.data!;
}

export async function apiCreateProfile(req: CreateProfileRequest): Promise<Profile> {
  const { data } = await httpClient.post<ApiResponse<Profile>>('/profiles', req);
  return data.data!;
}

export async function apiGetProfile(profileId: string): Promise<Profile> {
  const { data } = await httpClient.get<ApiResponse<Profile>>(`/profiles/${profileId}`);
  return data.data!;
}

export async function apiUpdateProfile(profileId: string, req: UpdateProfileRequest): Promise<Profile> {
  const { data } = await httpClient.put<ApiResponse<Profile>>(`/profiles/${profileId}`, req);
  return data.data!;
}

export async function apiDeleteProfile(profileId: string): Promise<void> {
  await httpClient.delete(`/profiles/${profileId}`);
}

export async function apiGetShareData(profileId: string): Promise<ProfileShareData> {
  const { data } = await httpClient.get<ApiResponse<ProfileShareData>>(`/profiles/${profileId}/share`);
  return data.data!;
}

export async function apiImportProfile(shareData: ProfileShareData): Promise<Profile> {
  const { data } = await httpClient.post<ApiResponse<Profile>>('/profiles/import', shareData);
  return data.data!;
}

export interface AnalysisSection {
  title: string;
  paragraphs: string[];
  keyPoints: { label: string; value: string }[];
}

export interface NatalAnalysis {
  generatedAt: string;
  profileId: string;
  sections: Record<string, AnalysisSection>;
}

export interface NatalChartData {
  bazi: any;
  ziwei: any;
  analysis: NatalAnalysis | null;
}

export async function apiGetNatalChart(profileId: string): Promise<NatalChartData> {
  const { data } = await httpClient.get<ApiResponse<NatalChartData>>(`/profiles/${profileId}/natal-chart`);
  return data.data!;
}

export async function apiGenerateNatalChart(profileId: string): Promise<NatalChartData> {
  const { data } = await httpClient.post<ApiResponse<NatalChartData>>(`/profiles/${profileId}/natal-chart`);
  return data.data!;
}

export async function apiGenerateSection(profileId: string, sectionId: string): Promise<NatalChartData> {
  const { data } = await httpClient.post<ApiResponse<NatalChartData>>(`/profiles/${profileId}/natal-chart/${sectionId}`);
  return data.data!;
}

// ── Shensha explanation ──

export interface ShenshaExplanation {
  name: string;
  overview: string;
  pillarDetails: { pillar: string; detail: string }[];
  generatedAt: string;
}

export async function apiGetShenshaExplanation(profileId: string, name: string): Promise<ShenshaExplanation | null> {
  const { data } = await httpClient.get<ApiResponse<ShenshaExplanation | null>>(`/profiles/${profileId}/shensha/${encodeURIComponent(name)}`);
  return data.data ?? null;
}

export async function apiGenerateShenshaExplanation(profileId: string, name: string): Promise<ShenshaExplanation> {
  const { data } = await httpClient.post<ApiResponse<ShenshaExplanation>>(`/profiles/${profileId}/shensha/${encodeURIComponent(name)}`);
  return data.data!;
}
