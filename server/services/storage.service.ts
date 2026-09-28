import { readFile, writeFile, mkdir, rename, unlink, readdir } from 'fs/promises';
import crypto from 'crypto';
import { existsSync } from 'fs';
import { resolve, dirname, sep } from 'path';
import * as yaml from 'js-yaml';
import { AppError } from '../middleware/error-handler';

const DATA_ROOT = resolve(process.cwd(), 'data');

function safePath(filePath: string): string {
  const full = resolve(DATA_ROOT, filePath);
  if (full !== DATA_ROOT && !full.startsWith(DATA_ROOT + sep)) {
    throw new AppError(400, '非法路径');
  }
  return full;
}

export async function ensureDir(dirPath: string): Promise<void> {
  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true });
  }
}

export async function readYaml<T>(filePath: string): Promise<T | null> {
  const fullPath = safePath(filePath);
  if (!existsSync(fullPath)) return null;
  const content = await readFile(fullPath, 'utf-8');
  return yaml.load(content) as T;
}

export async function writeYaml(filePath: string, data: unknown): Promise<void> {
  const fullPath = safePath(filePath);
  await ensureDir(dirname(fullPath));
  const content = yaml.dump(data, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });
  const tmpPath = fullPath + '.tmp';
  await writeFile(tmpPath, content, 'utf-8');
  await rename(tmpPath, fullPath);
}

export async function deleteYaml(filePath: string): Promise<void> {
  const fullPath = safePath(filePath);
  if (existsSync(fullPath)) {
    await unlink(fullPath);
  }
}

export async function listDir(dirPath: string): Promise<string[]> {
  const fullPath = safePath(dirPath);
  if (!existsSync(fullPath)) return [];
  const entries = await readdir(fullPath, { withFileTypes: true });
  return entries.map((e) => e.name);
}

export async function listSubDirs(dirPath: string): Promise<string[]> {
  const fullPath = safePath(dirPath);
  if (!existsSync(fullPath)) return [];
  const entries = await readdir(fullPath, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

export function getUserDir(userId: string): string {
  if (userId !== 'admin' && !/^u_[a-f0-9]{8}$/i.test(userId)) throw new AppError(400, '无效的用户编号');
  return `users/${userId}`;
}

export function getProfileDir(userId: string, profileId: string): string {
  getUserDir(userId);
  if (typeof profileId !== 'string' || !/^p_[a-f0-9]{8}$/i.test(profileId)) throw new AppError(400, '无效的档案编号');
  return `users/${userId}/profiles/${profileId}`;
}

/**
 * Save a base64 data URI as a file and return the relative storage path.
 * e.g. 'data:image/png;base64,iVBOR...' → 'users/{userId}/chat-images/{uuid}.png'
 */
export async function saveBase64Image(userId: string, dataUri: string): Promise<string> {
  const match = dataUri.match(/^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) throw new Error('Invalid data URI');
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const buf = Buffer.from(match[2], 'base64');
  if (!buf.length || buf.length > 50 * 1024 * 1024) throw new Error('Image must be between 1 byte and 50 MB');
  const id = crypto.randomUUID();
  const relPath = `users/${userId}/chat-images/${id}.${ext}`;
  const fullPath = safePath(relPath);
  await ensureDir(dirname(fullPath));
  await writeFile(fullPath, buf);
  return relPath;
}

/**
 * Read a stored image file back as a base64 data URI.
 */
export async function readImageAsDataUri(relPath: string): Promise<string> {
  const fullPath = safePath(relPath);
  const buf = await readFile(fullPath);
  const ext = relPath.split('.').pop()?.toLowerCase() || 'png';
  const mime = ext === 'jpg' ? 'jpeg' : ext;
  return `data:image/${mime};base64,${buf.toString('base64')}`;
}

export { DATA_ROOT };
