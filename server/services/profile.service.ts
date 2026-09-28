import { v4 as uuidv4 } from 'uuid';
import { readYaml, writeYaml, deleteYaml, listSubDirs, getProfileDir, ensureDir } from './storage.service';
import { AppError } from '../middleware/error-handler';
import type { Profile, CreateProfileRequest, UpdateProfileRequest, ProfileShareData } from '../../shared/types/profile.types';
import { resolve } from 'path';

/**
 * Validate an optional manual coordinate pair. Returns undefined when both are blank
 * (meaning "no override"), throws 400 when only one is given or out of range.
 */
function parseCoords(lat: unknown, lon: unknown): { birthLat: number; birthLon: number } | undefined {
  const blank = (v: unknown) => v === undefined || v === null || v === '';
  if (blank(lat) && blank(lon)) return undefined;
  if (blank(lat) || blank(lon)) throw new AppError(400, '经度和纬度需要同时填写');
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || la < -90 || la > 90) throw new AppError(400, '纬度需在 -90 到 90 之间');
  if (!Number.isFinite(lo) || lo < -180 || lo > 180) throw new AppError(400, '经度需在 -180 到 180 之间');
  return { birthLat: +la.toFixed(4), birthLon: +lo.toFixed(4) };
}

const RELATIONS = ['本人', '父亲', '母亲', '配偶', '子女', '朋友', '客户', '其他'];
const MAX_PROFILES_PER_USER = 100;

/**
 * Validate client-supplied profile fields. Profiles feed the engines (bad dates would crash them)
 * and every LLM prompt, so types, formats and lengths are enforced here. `partial` = update.
 */
function checkProfileFields(data: Record<string, unknown>, partial: boolean) {
  if (!data || typeof data !== 'object') throw new AppError(400, '档案数据格式不正确');
  const has = (k: string) => data[k] !== undefined;
  const str = (k: string, label: string, max: number, required: boolean) => {
    if (!has(k)) { if (required && !partial) throw new AppError(400, `请填写${label}`); return; }
    const v = data[k];
    if (typeof v !== 'string') throw new AppError(400, `${label}格式不正确`);
    if (required && !v.trim()) throw new AppError(400, `请填写${label}`);
    if (v.length > max) throw new AppError(400, `${label}最多 ${max} 个字符`);
  };
  str('name', '姓名', 40, true);
  str('birthPlace', '出生地', 100, false);
  if (has('relation') && !RELATIONS.includes(data.relation as string)) throw new AppError(400, '关系不正确');
  if (!partial && !has('relation')) throw new AppError(400, '请选择关系');
  if (has('gender') || !partial) {
    if (data.gender !== 'male' && data.gender !== 'female') throw new AppError(400, '性别不正确');
  }
  if (has('birthDate') || !partial) {
    const d = data.birthDate;
    const ok = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(new Date(`${d}T00:00:00Z`).getTime());
    const year = ok ? Number(d.slice(0, 4)) : 0;
    if (!ok || year < 1800 || year > 2200) throw new AppError(400, '出生日期格式应为 YYYY-MM-DD（1800–2200 年）');
  }
  if (has('birthTime') || !partial) {
    const t = data.birthTime;
    if (typeof t !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw new AppError(400, '出生时间格式应为 HH:mm');
  }
  if (has('timezone') && data.timezone !== '' && data.timezone !== null) {
    const tz = data.timezone;
    let valid = typeof tz === 'string' && tz.length <= 64;
    if (valid) { try { new Intl.DateTimeFormat('en', { timeZone: tz as string }); } catch { valid = false; } }
    if (!valid) throw new AppError(400, '时区不正确');
  }
}

export async function listProfiles(userId: string): Promise<Profile[]> {
  const profileIds = await listSubDirs(`users/${userId}/profiles`);
  const profiles: Profile[] = [];
  for (const profileId of profileIds) {
    const profile = await readYaml<Profile>(
      `${getProfileDir(userId, profileId)}/profile.yaml`,
    );
    if (profile) profiles.push(profile);
  }
  // Primary first, then by creation time
  profiles.sort((a, b) => {
    if (a.isPrimary) return -1;
    if (b.isPrimary) return 1;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
  return profiles;
}

export async function getProfile(
  userId: string,
  profileId: string,
): Promise<Profile> {
  const profile = await readYaml<Profile>(
    `${getProfileDir(userId, profileId)}/profile.yaml`,
  );
  if (!profile) throw new AppError(404, '档案不存在');
  return profile;
}

export async function createProfile(
  userId: string,
  data: CreateProfileRequest,
  isPrimary = false,
): Promise<Profile> {
  checkProfileFields(data as unknown as Record<string, unknown>, false);
  if ((await listSubDirs(`users/${userId}/profiles`)).length >= MAX_PROFILES_PER_USER) {
    throw new AppError(400, `档案数量已达上限（${MAX_PROFILES_PER_USER} 个）`);
  }
  const profileId = `p_${uuidv4().slice(0, 8)}`;
  const now = new Date().toISOString();

  const profile: Profile = {
    profileId,
    name: data.name,
    relation: data.relation,
    isPrimary,
    birthDate: data.birthDate,
    birthTime: data.birthTime,
    gender: data.gender,
    birthPlace: data.birthPlace || '',
    timezone: data.timezone || 'Asia/Shanghai',
    ...parseCoords(data.birthLat, data.birthLon),
    createdAt: now,
    updatedAt: now,
  };

  const dir = getProfileDir(userId, profileId);
  await ensureDir(resolve(process.cwd(), 'data', dir));
  await writeYaml(`${dir}/profile.yaml`, profile);
  return profile;
}

export async function updateProfile(
  userId: string,
  profileId: string,
  data: UpdateProfileRequest,
): Promise<Profile> {
  checkProfileFields(data as unknown as Record<string, unknown>, true);
  const profile = await getProfile(userId, profileId);

  if (data.name !== undefined) profile.name = data.name;
  if (data.relation !== undefined) profile.relation = data.relation;
  if (data.birthDate !== undefined) profile.birthDate = data.birthDate;
  if (data.birthTime !== undefined) profile.birthTime = data.birthTime;
  if (data.gender !== undefined) profile.gender = data.gender;
  if (data.birthPlace !== undefined) profile.birthPlace = data.birthPlace;
  if (data.timezone !== undefined) profile.timezone = data.timezone;
  if (data.birthLat !== undefined || data.birthLon !== undefined) {
    const coords = parseCoords(data.birthLat, data.birthLon);
    if (coords) Object.assign(profile, coords);
    else { delete profile.birthLat; delete profile.birthLon; }
  }
  profile.updatedAt = new Date().toISOString();

  await writeYaml(
    `${getProfileDir(userId, profileId)}/profile.yaml`,
    profile,
  );
  return profile;
}

export async function deleteProfile(
  userId: string,
  profileId: string,
): Promise<void> {
  const profile = await getProfile(userId, profileId);
  if (profile.isPrimary) {
    throw new AppError(400, '主档案不可删除');
  }
  // Delete the profile.yaml (directory cleanup can be done later)
  await deleteYaml(`${getProfileDir(userId, profileId)}/profile.yaml`);
}

export async function getShareData(
  userId: string,
  profileId: string,
): Promise<ProfileShareData> {
  const profile = await getProfile(userId, profileId);
  return {
    version: 1,
    name: profile.name,
    birthDate: profile.birthDate,
    birthTime: profile.birthTime,
    gender: profile.gender,
    birthPlace: profile.birthPlace,
    timezone: profile.timezone,
    ...(profile.birthLat !== undefined && profile.birthLon !== undefined
      ? { birthLat: profile.birthLat, birthLon: profile.birthLon }
      : {}),
  };
}

export async function importProfile(
  userId: string,
  shareData: ProfileShareData,
): Promise<Profile> {
  return createProfile(userId, {
    name: shareData.name,
    relation: '其他',
    birthDate: shareData.birthDate,
    birthTime: shareData.birthTime,
    gender: shareData.gender,
    birthPlace: shareData.birthPlace,
    timezone: shareData.timezone,
    birthLat: shareData.birthLat,
    birthLon: shareData.birthLon,
  });
}
