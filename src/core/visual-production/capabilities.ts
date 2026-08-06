import type { VisualOperationCapability, VisualOperationType } from './types';

const capabilities: Readonly<Record<VisualOperationType, VisualOperationCapability>> = Object.freeze({
  crop: { type: 'crop', support: 'unsupported', renderEffect: false, label: 'Not available', diagnostic: 'Crop has no production render adapter in this version.' },
  reframe: { type: 'reframe', support: 'planned-only', renderEffect: false, label: 'Plan only in this version', diagnostic: 'Reframe is retained as composition guidance; crop/position render support is not available.' },
  stabilize: { type: 'stabilize', support: 'implemented', renderEffect: true, label: 'Render supported', diagnostic: 'Uses the existing scene camera-motion contract.' },
  brightness: { type: 'brightness', support: 'implemented', renderEffect: true, label: 'Render supported', diagnostic: 'Maps directly to the bounded FFmpeg eq brightness parameter.' },
  contrast: { type: 'contrast', support: 'implemented', renderEffect: true, label: 'Render supported', diagnostic: 'Maps directly to the bounded FFmpeg eq contrast parameter.' },
  zoom: { type: 'zoom', support: 'implemented', renderEffect: true, label: 'Render supported', diagnostic: 'Uses the existing scene zoom camera-motion contract.' },
  'slow-zoom': { type: 'slow-zoom', support: 'implemented', renderEffect: true, label: 'Render supported', diagnostic: 'Uses the existing deterministic zoom camera-motion contract.' },
  'color-grade': { type: 'color-grade', support: 'implemented', renderEffect: true, label: 'Render supported', diagnostic: 'Maps the selected profile and intensity to bounded FFmpeg eq parameters; no LUT is applied.' },
  overlay: { type: 'overlay', support: 'planned-only', renderEffect: false, label: 'Plan only in this version', diagnostic: 'B-roll overlay requires a resolved external asset; no asset insertion is performed.' },
  'background-blur': { type: 'background-blur', support: 'planned-only', renderEffect: false, label: 'Plan only in this version', diagnostic: 'Background blur requires foreground segmentation or a subject mask; full-frame blur is not substituted.' },
});

export function getVisualOperationCapability(type: VisualOperationType): VisualOperationCapability { return capabilities[type]; }
export function listVisualOperationCapabilities(): readonly VisualOperationCapability[] { return Object.values(capabilities); }
