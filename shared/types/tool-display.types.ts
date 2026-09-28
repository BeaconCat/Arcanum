/**
 * Structured payloads that accompany AI tool calls so the chat UI can render rich views
 * (wheels, spreads, maps) instead of raw text. The LLM only ever sees the text result;
 * the display is sent to the client in the SSE `toolCall` event and persisted with the
 * tool message as `toolDisplay`.
 *
 * Tools whose text result is YAML (bazi, ziwei, huangli, divination…) need no display —
 * the client parses the YAML content directly.
 */
import type { AstroChart, AstroBiWheel, AstroCompositeResponse } from './astro.types';
import type { AstroInterpretation } from './astro-interpret.types';
import type { AcgResult, AcgNearHit, AcgRankedPlace, AcgThemeDef } from './acg.types';
import type { TarotReading } from './tarot.types';

/** Deep link into the full workbench for this result */
export interface ToolDisplayLink {
  to: string;
  label: string;
}

export type ToolDisplay =
  | { kind: 'astro-chart'; subject: string; chart: AstroChart; link?: ToolDisplayLink }
  | { kind: 'astro-biwheel'; subject: string; wheel: AstroBiWheel; link?: ToolDisplayLink }
  | { kind: 'astro-composite'; subject: string; composite: AstroCompositeResponse; link?: ToolDisplayLink }
  | { kind: 'astro-interpretation'; subject: string; interpretation: AstroInterpretation; link?: ToolDisplayLink }
  | {
    kind: 'acg';
    subject: string;
    /** Line coordinates rounded to 0.1° to keep sessions small */
    result: AcgResult;
    focus?: { lat: number; lon: number; label?: string; near: AcgNearHit[] };
    theme?: AcgThemeDef;
    ranked?: AcgRankedPlace[];
    link?: ToolDisplayLink;
  }
  | { kind: 'tarot'; reading: TarotReading; link?: ToolDisplayLink };

export type ToolDisplayKind = ToolDisplay['kind'];
