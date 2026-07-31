export type MediaValidationSeverity = 'info' | 'warning' | 'error';

export type MediaValidationCategory =
  | 'project'
  | 'timeline'
  | 'assets'
  | 'subtitles'
  | 'audio'
  | 'render';

export interface MediaValidationIssue {
  id: string;
  code: string;
  category: MediaValidationCategory;
  severity: MediaValidationSeverity;
  message: string;
  sceneId?: string;
  metadata: Readonly<Record<string, unknown>>;
}

export interface MediaValidationScoreBreakdown {
  project: number;
  timeline: number;
  assets: number;
  subtitles: number;
  audio: number;
  render: number;
}

export interface MediaValidationReport {
  valid: boolean;
  renderReady: boolean;
  score: number;
  scoreBreakdown: MediaValidationScoreBreakdown;
  issues: MediaValidationIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  validatedAt: string;
}
