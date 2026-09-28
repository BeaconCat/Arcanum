import type { QuickToolDef, QuickToolParam } from '../../shared/constants/quick-tools';
import type { Profile } from '../../shared/types/profile.types';
import { localDateStr } from './fortune';

export interface QuickToolInput {
  params: Record<string, unknown>;
  profile?: Profile | null;
  profile2?: Profile | null;
}

export interface ResolvedQuickTool {
  prompt: string;
  presetTools: { name: string; args: Record<string, unknown> }[];
}

/** Resolve a param default ('$today' / '$thisYear' / literal). */
export function paramDefault(p: QuickToolParam): unknown {
  if (p.default === '$today') return localDateStr();
  if (p.default === '$thisYear') return new Date().getFullYear();
  if (p.default === '$thisMonth') return String(new Date().getMonth() + 1);
  return p.default ?? (p.type === 'select' ? p.options?.[0]?.value ?? '' : '');
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

/**
 * Turn a quick tool + the dialog values into the chat message and the tools the server
 * should run first. See shared/constants/quick-tools.ts for the placeholder syntax.
 */
export function resolveQuickTool(def: QuickToolDef, input: QuickToolInput): ResolvedQuickTool {
  const vars: Record<string, unknown> = {
    $profile: input.profile?.profileId ?? '',
    $profileName: input.profile?.name ?? '我',
    $profile2: input.profile2?.profileId ?? '',
    $profile2Name: input.profile2?.name ?? '对方',
    $today: localDateStr(),
    $thisYear: new Date().getFullYear(),
  };
  const param = (key: string): unknown => input.params[key];
  const label = (key: string): string => {
    const p = def.params?.find((x) => x.key === key);
    const v = param(key);
    return p?.options?.find((o) => o.value === v)?.label ?? String(v ?? '');
  };

  /** Value of one placeholder token (without braces) */
  const lookup = (token: string): unknown => {
    if (token.startsWith('$')) return vars[token];
    if (token.endsWith('.label')) return isEmpty(param(token.slice(0, -6))) ? '' : label(token.slice(0, -6));
    return param(token);
  };

  const presetTools = def.run.map((r) => {
    const args: Record<string, unknown> = {};
    for (const [k, raw] of Object.entries(r.args || {})) {
      let v: unknown = raw;
      if (typeof raw === 'string') {
        const whole = /^\{([\w.]+)\}$/.exec(raw) || /^(\$\w+)$/.exec(raw);
        v = whole ? lookup(whole[1]) : raw.replace(/\{([\w.]+)\}|(\$\w+)/g, (_, a, b) => String(lookup(a || b) ?? ''));
      }
      if (!isEmpty(v)) args[k] = v;
    }
    return { name: r.tool, args };
  });

  // Optional [[ … ]] segments disappear when any param they reference is empty
  let prompt = def.prompt.replace(/\[\[([\s\S]*?)\]\]/g, (_, seg: string) => {
    const refs = [...seg.matchAll(/\{([\w.]+)\}/g)].map((m) => m[1].replace(/\.label$/, ''));
    return refs.some((r) => isEmpty(param(r))) ? '' : seg;
  });
  // Longest names first so $profile2Name isn't eaten by $profile
  prompt = prompt
    .replace(/\$(profile2Name|profileName|profile2|profile|today|thisYear)/g, (m) => String(vars[m] ?? ''))
    .replace(/\{([\w.]+)\}/g, (_, t: string) => String(lookup(t) ?? ''));

  return { prompt, presetTools };
}
