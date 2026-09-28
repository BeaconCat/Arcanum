import httpClient from './http-client';
import type { BaziChart } from '../../shared/types/bazi.types';
import type { ZiweiChart } from '../../shared/types/ziwei.types';
import type { ApiResponse } from '../../shared/types/api.types';
import type {
  AstroChartResponse, AstroHouseSystem, BirthPlaceResolution, AstroChartSettings,
  AstroBiWheelResponse, AstroCompositeResponse,
} from '../../shared/types/astro.types';

export type AstroSettingsParam = Partial<AstroChartSettings> | undefined;

export type AstroCompositeApiResponse = AstroCompositeResponse & {
  places: { a: BirthPlaceResolution; b: BirthPlaceResolution };
};

/** Settings travel as a JSON string query param; houseSystem is duplicated for older servers. */
function astroParams(settings: AstroSettingsParam, extra: Record<string, unknown> = {}) {
  const params: Record<string, unknown> = { ...extra };
  if (settings && Object.keys(settings).length) {
    params.settings = JSON.stringify(settings);
    if (settings.houseSystem) params.houseSystem = settings.houseSystem;
  }
  return params;
}

export async function apiGetBaziChart(profileId: string): Promise<BaziChart> {
  const { data } = await httpClient.get<ApiResponse<BaziChart>>(`/charts/bazi/${profileId}`);
  return data.data!;
}

export async function apiGetZiweiChart(profileId: string): Promise<ZiweiChart> {
  const { data } = await httpClient.get<ApiResponse<ZiweiChart>>(`/charts/ziwei/${profileId}`);
  return data.data!;
}

export async function apiGetDayInfo(date?: string): Promise<{
  gan: string;
  zhi: string;
  ganZhi: string;
  lunarDate: string;
  date: string;
}> {
  const params = date ? { date } : {};
  const { data } = await httpClient.get<ApiResponse<any>>('/charts/day-info', { params });
  return data.data!;
}

export async function apiGetAstroChart(
  profileId: string,
  houseSystem: AstroHouseSystem = 'placidus',
  settings?: AstroSettingsParam,
): Promise<AstroChartResponse> {
  const { data } = await httpClient.get<ApiResponse<AstroChartResponse>>(`/charts/astro/${profileId}`, {
    params: astroParams({ ...settings, houseSystem: settings?.houseSystem ?? houseSystem }, { houseSystem }),
  });
  return data.data!;
}

export async function apiGetAstroTransit(profileId: string, date: string, time: string, settings?: AstroSettingsParam): Promise<AstroBiWheelResponse> {
  const { data } = await httpClient.get<ApiResponse<AstroBiWheelResponse>>(`/charts/astro/${profileId}/transit`, {
    params: astroParams(settings, { date, time }),
  });
  return data.data!;
}

export async function apiGetAstroProgressed(profileId: string, date: string, settings?: AstroSettingsParam): Promise<AstroBiWheelResponse> {
  const { data } = await httpClient.get<ApiResponse<AstroBiWheelResponse>>(`/charts/astro/${profileId}/progressed`, {
    params: astroParams(settings, { date }),
  });
  return data.data!;
}

export async function apiGetAstroSolarReturn(profileId: string, year: number, settings?: AstroSettingsParam): Promise<AstroBiWheelResponse> {
  const { data } = await httpClient.get<ApiResponse<AstroBiWheelResponse>>(`/charts/astro/${profileId}/solar-return`, {
    params: astroParams(settings, { year }),
  });
  return data.data!;
}

export async function apiGetAstroSynastry(a: string, b: string, settings?: AstroSettingsParam): Promise<AstroBiWheelResponse> {
  const { data } = await httpClient.get<ApiResponse<AstroBiWheelResponse>>('/charts/astro-synastry', {
    params: astroParams(settings, { a, b }),
  });
  return data.data!;
}

export async function apiGetAstroComposite(a: string, b: string, settings?: AstroSettingsParam): Promise<AstroCompositeApiResponse> {
  const { data } = await httpClient.get<ApiResponse<AstroCompositeApiResponse>>('/charts/astro-composite', {
    params: astroParams(settings, { a, b }),
  });
  return data.data!;
}

export async function apiResolvePlace(place: string): Promise<BirthPlaceResolution> {
  const { data } = await httpClient.get<ApiResponse<BirthPlaceResolution>>('/charts/place-resolve', { params: { place } });
  return data.data!;
}
