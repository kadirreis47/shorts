import type { SubtitleCapability, SubtitleOperationType } from './types';

const registry: Record<SubtitleOperationType, SubtitleCapability> = {
  'split-subtitle': implemented('split-subtitle', 'Cue splitting updates canonical cue boundaries and ASS output.'),
  'merge-subtitle': implemented('merge-subtitle', 'Adjacent compatible cues are merged in the canonical subtitle timeline.'),
  resize: implemented('resize', 'Font size is rendered from the canonical subtitle style.'),
  reposition: implemented('reposition', 'Top, center and bottom alignment are rendered by ASS.'),
  restyle: implemented('restyle', 'Caption profile parameters are stored from SubtitleStyle; vertical lineSpacing remains planned-only until supported by the renderer.'),
  'highlight-keyword': implemented('highlight-keyword', 'Emphasis word IDs drive ASS highlight rendering.'),
  'timing-adjust': implemented('timing-adjust', 'Cue timing is clamped to its scene and rendered from the manifest.'),
  animation: { type: 'animation', support: 'implemented', renderEffect: true, diagnostic: 'Fade, pop, karaoke and word-highlight are render-supported; other animation values remain planned-only.', supportedAnimations: ['none', 'fade', 'pop', 'karaoke', 'word-highlight'] },
  stroke: implemented('stroke', 'ASS outline width is rendered from SubtitleStyle.strokeWidth.'),
  shadow: implemented('shadow', 'ASS shadow depth is rendered from SubtitleStyle.shadowDepth.'),
  'line-spacing': { type: 'line-spacing', support: 'planned-only', renderEffect: false, diagnostic: 'ASS Spacing is horizontal character spacing; vertical subtitle line spacing is not render-supported yet.' },
};
function implemented(type: SubtitleOperationType, diagnostic: string): SubtitleCapability { return { type, support: 'implemented', renderEffect: true, diagnostic }; }
export function getSubtitleCapability(type: SubtitleOperationType): SubtitleCapability { return registry[type]; }
export function subtitleOperationSupport(type: SubtitleOperationType, parameters: Readonly<Record<string, string | number | boolean>>): SubtitleCapability['support'] { if (type !== 'animation') return registry[type].support; const animation = String(parameters.animation); return registry.animation.supportedAnimations?.includes(animation as never) ? 'implemented' : 'planned-only'; }
export const SUBTITLE_CAPABILITIES = Object.freeze(Object.values(registry));
