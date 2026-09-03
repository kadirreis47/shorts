import type { ViewKey } from '@/components/Sidebar';

export const V1_VIEW_KEYS = [
  'dashboard',
  'studio',
  'director',
  'editor',
  'audio-studio',
  'visual-studio',
  'subtitle-studio',
  'export-studio',
  'publishing-studio',
  'videos',
  'calendar',
  'settings',
] as const satisfies readonly ViewKey[];

export type V1ViewKey = (typeof V1_VIEW_KEYS)[number];

const V1_VIEW_SET = new Set<ViewKey>(V1_VIEW_KEYS);

export function isV1View(view: unknown): view is V1ViewKey {
  return typeof view === 'string' && V1_VIEW_SET.has(view as ViewKey);
}

export function resolveV1View(view: unknown): V1ViewKey {
  return isV1View(view) ? view : 'dashboard';
}

export const V1_EDGE_FUNCTIONS = [
  'provider-status',
  'generate-script',
  'generate-hooks',
  'generate-seo',
  'analyze-script',
  'generate-image',
  'ingest-pexels-image',
  'ingest-pexels-video',
  'generate-voiceover',
  'list-voices',
  'research-footage',
  'search-images',
  'search-videos',
  'translate-subtitles',
  'visual-query-planner',
  'media-analysis-reference',
  'analyze-visual-semantics',
] as const;

export type V1EdgeFunction = (typeof V1_EDGE_FUNCTIONS)[number];

const V1_EDGE_FUNCTION_SET = new Set<string>(V1_EDGE_FUNCTIONS);

export function isV1EdgeFunction(endpoint: string): endpoint is V1EdgeFunction {
  const functionName = endpoint.split('?', 1)[0];
  return V1_EDGE_FUNCTION_SET.has(functionName);
}
