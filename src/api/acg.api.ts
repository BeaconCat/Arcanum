import httpClient from './http-client';
import type { ApiResponse } from '../../shared/types/api.types';
import type { AcgNearResponse, AcgPlace, AcgRankResponse, AcgResult, AcgThemeDef, AcgTheme } from '../../shared/types/acg.types';

export async function apiGetAcg(profileId: string): Promise<AcgResult> {
  const { data } = await httpClient.get<ApiResponse<AcgResult>>(`/acg/${profileId}`);
  return data.data!;
}

export async function apiAcgNear(profileId: string, lat: number, lon: number, radius = 600): Promise<AcgNearResponse> {
  const { data } = await httpClient.get<ApiResponse<AcgNearResponse>>(`/acg/${profileId}/near`, {
    params: { lat: lat.toFixed(4), lon: lon.toFixed(4), radius },
  });
  return data.data!;
}

export async function apiAcgRank(profileId: string, theme: AcgTheme): Promise<AcgRankResponse> {
  const { data } = await httpClient.get<ApiResponse<AcgRankResponse>>(`/acg/${profileId}/rank`, { params: { theme } });
  return data.data!;
}

export async function apiAcgThemes(): Promise<AcgThemeDef[]> {
  const { data } = await httpClient.get<ApiResponse<AcgThemeDef[]>>('/acg/themes');
  return data.data!;
}

export async function apiAcgSearch(q: string): Promise<AcgPlace[]> {
  const { data } = await httpClient.get<ApiResponse<AcgPlace[]>>('/acg/places/search', { params: { q } });
  return data.data!;
}
