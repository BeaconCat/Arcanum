export interface Profile {
  profileId: string;
  name: string;
  relation: ProfileRelation;
  isPrimary: boolean;
  birthDate: string;
  birthTime: string;
  gender: 'male' | 'female';
  birthPlace: string;
  /** Optional manual birth coordinates (override automatic 出生地 parsing for 星盘) */
  birthLat?: number;
  birthLon?: number;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export type ProfileRelation =
  | '本人'
  | '父亲'
  | '母亲'
  | '配偶'
  | '子女'
  | '朋友'
  | '客户'
  | '其他';

export interface CreateProfileRequest {
  name: string;
  relation: ProfileRelation;
  birthDate: string;
  birthTime: string;
  gender: 'male' | 'female';
  birthPlace: string;
  timezone?: string;
  /** null clears a previously saved manual coordinate */
  birthLat?: number | null;
  birthLon?: number | null;
}

export interface UpdateProfileRequest extends Partial<CreateProfileRequest> {}

export interface ProfileShareData {
  version: number;
  name: string;
  birthDate: string;
  birthTime: string;
  gender: 'male' | 'female';
  birthPlace: string;
  timezone: string;
  birthLat?: number;
  birthLon?: number;
}
