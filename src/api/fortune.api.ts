import httpClient from './http-client';
import type { MonthlyCalendar, DailyDetail, TrendData } from '../../shared/types/fortune.types';

export async function apiGetMonthlyCalendar(
  profileId: string,
  year: number,
  month: number,
): Promise<MonthlyCalendar> {
  const res = await httpClient.get('/fortunes/monthly', {
    params: { profileId, year, month },
  });
  return res.data.data;
}

export async function apiGenerateWeek(
  profileId: string,
  year: number,
  month: number,
  weekIndex: number,
): Promise<MonthlyCalendar> {
  const res = await httpClient.post('/fortunes/monthly', {
    profileId, year, month, weekIndex,
  });
  return res.data.data;
}

export async function apiGenerateFullMonth(
  profileId: string,
  year: number,
  month: number,
  force = false,
): Promise<MonthlyCalendar> {
  const res = await httpClient.post('/fortunes/monthly', {
    profileId, year, month, force,
  });
  return res.data.data;
}

export async function apiGetDailyDetail(
  profileId: string,
  date: string,
): Promise<DailyDetail | null> {
  const res = await httpClient.get('/fortunes/daily', {
    params: { profileId, date },
  });
  return res.data.data;
}

export async function apiGenerateDailyDetail(
  profileId: string,
  date: string,
): Promise<DailyDetail> {
  const res = await httpClient.post('/fortunes/daily', {
    profileId, date,
  });
  return res.data.data;
}

export async function apiGetFortuneTrend(
  profileId: string,
  from: string,
  to: string,
): Promise<TrendData> {
  const res = await httpClient.get('/fortunes/trend', {
    params: { profileId, from, to },
  });
  return res.data.data;
}
