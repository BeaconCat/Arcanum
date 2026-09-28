import httpClient from './http-client';
import type { ApiResponse } from '../../shared/types/api.types';
import type { AstroChartSettings } from '../../shared/types/astro.types';
import type { AstroInterpretation } from '../../shared/types/astro-interpret.types';

export type AstroInterpretKind = 'natal' | 'transit' | 'progressed' | 'solar-return' | 'synastry' | 'composite';

export interface AstroInterpretRequest {
  kind: AstroInterpretKind;
  /** profileId, or person A for synastry / composite */
  a: string;
  b?: string;
  date?: string;
  time?: string;
  year?: number;
  settings?: Partial<AstroChartSettings>;
}

export async function apiGetAstroInterpretation(req: AstroInterpretRequest): Promise<AstroInterpretation> {
  const params: Record<string, unknown> = {};
  if (req.settings && Object.keys(req.settings).length) params.settings = JSON.stringify(req.settings);
  let url: string;
  switch (req.kind) {
    case 'natal': url = `/astro-interpret/natal/${req.a}`; break;
    case 'transit': url = `/astro-interpret/transit/${req.a}`; Object.assign(params, { date: req.date, time: req.time }); break;
    case 'progressed': url = `/astro-interpret/progressed/${req.a}`; params.date = req.date; break;
    case 'solar-return': url = `/astro-interpret/solar-return/${req.a}`; params.year = req.year; break;
    case 'synastry': url = '/astro-interpret/synastry'; Object.assign(params, { a: req.a, b: req.b }); break;
    case 'composite': url = '/astro-interpret/composite'; Object.assign(params, { a: req.a, b: req.b }); break;
  }
  const { data } = await httpClient.get<ApiResponse<AstroInterpretation>>(url, { params });
  return data.data!;
}
