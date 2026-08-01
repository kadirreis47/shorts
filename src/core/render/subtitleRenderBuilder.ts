import type { MediaScene, SubtitleCue } from '@/core/media';

export type SubtitleRenderPreset =
  | 'clean'
  | 'bold'
  | 'karaoke'
  | 'viral';

export interface SubtitleRenderPlan {
  assContent?: string;
  preset: SubtitleRenderPreset;
  cueCount: number;
  highlightedWordCount: number;
}

export function buildSceneSubtitleRenderPlan(input: {
  scene: MediaScene;
  cues: SubtitleCue[];
  width: number;
  height: number;
}): SubtitleRenderPlan {
  const { scene, cues, width, height } = input;
  const localCues = cues
    .filter((cue) => cue.startMs < scene.endMs && cue.endMs > scene.startMs)
    .map((cue) => ({
      cue,
      startMs: Math.max(0, cue.startMs - scene.startMs),
      endMs: Math.max(0, Math.min(scene.endMs, cue.endMs) - scene.startMs),
    }))
    .filter(({ cue, startMs, endMs }) =>
      cue.text.trim().length > 0 && endMs > startMs,
    );

  if (localCues.length === 0) {
    return {
      preset: 'clean',
      cueCount: 0,
      highlightedWordCount: 0,
    };
  }

  const preset = choosePreset(scene);
  const styles = styleBlock(preset, width, height);
  const events = localCues.flatMap(({ cue, startMs, endMs }) =>
    buildCueEvents(cue, startMs, endMs, preset),
  );

  return {
    assContent: [
      '[Script Info]',
      'ScriptType: v4.00+',
      `PlayResX: ${width}`,
      `PlayResY: ${height}`,
      'WrapStyle: 2',
      'ScaledBorderAndShadow: yes',
      'YCbCr Matrix: TV.709',
      '',
      '[V4+ Styles]',
      'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
      ...styles,
      '',
      '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      ...events,
      '',
    ].join('\n'),
    preset,
    cueCount: localCues.length,
    highlightedWordCount: localCues.reduce(
      (total, { cue }) => total + Math.max(0, cue.wordIds.length),
      0,
    ),
  };
}

function buildCueEvents(
  cue: SubtitleCue,
  startMs: number,
  endMs: number,
  preset: SubtitleRenderPreset,
): string[] {
  const escaped = escapeAss(cue.text);
  const base = `Dialogue: 0,${assTime(startMs)},${assTime(endMs)},`;

  if (preset === 'karaoke' || preset === 'viral') {
    const words = splitWords(cue.text);
    if (words.length > 0) {
      const durationCentiseconds = Math.max(
        words.length,
        Math.round((endMs - startMs) / 10),
      );
      const perWord = Math.max(1, Math.floor(durationCentiseconds / words.length));
      const karaokeText = words
        .map((word, index) => {
          const pop = preset === 'viral'
            ? `{\\k${perWord}\\t(0,110,\\fscx118\\fscy118)\\t(110,220,\\fscx100\\fscy100)}`
            : `{\\k${perWord}}`;
          return `${pop}${escapeAss(word)}${index < words.length - 1 ? ' ' : ''}`;
        })
        .join('');

      return [
        `${base}Karaoke,,0,0,0,,${karaokeText}`,
      ];
    }
  }

  if (preset === 'bold') {
    return [
      `${base}Bold,,0,0,0,,{\\fad(80,80)\\t(0,140,\\fscx108\\fscy108)\\t(140,260,\\fscx100\\fscy100)}${escaped}`,
    ];
  }

  return [
    `${base}Clean,,0,0,0,,{\\fad(90,90)}${escaped}`,
  ];
}

function styleBlock(
  preset: SubtitleRenderPreset,
  width: number,
  height: number,
): string[] {
  const scale = Math.max(0.7, Math.min(1.5, width / 1080));
  const cleanSize = Math.round(62 * scale);
  const boldSize = Math.round(70 * scale);
  const karaokeSize = Math.round(68 * scale);
  const marginV = Math.round(height * 0.095);

  return [
    `Style: Clean,Arial,${cleanSize},&H00FFFFFF,&H00FFFFFF,&H00101010,&H50000000,1,0,0,0,100,100,0,0,1,4,1,2,90,90,${marginV},1`,
    `Style: Bold,Arial,${boldSize},&H00FFFFFF,&H00FFFFFF,&H00101010,&H64000000,1,0,0,0,100,100,0,0,1,6,1,2,70,70,${marginV},1`,
    `Style: Karaoke,Arial,${karaokeSize},&H0000E5FF,&H00FFFFFF,&H00101010,&H60000000,1,0,0,0,100,100,0,0,1,5,1,2,70,70,${marginV},1`,
  ];
}

function choosePreset(scene: MediaScene): SubtitleRenderPreset {
  if (scene.role === 'hook' || scene.intensity >= 0.82) return 'viral';
  if (scene.role === 'cta' || scene.intensity >= 0.66) return 'bold';
  if (scene.intensity >= 0.5) return 'karaoke';
  return 'clean';
}

function splitWords(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

function escapeAss(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/{/g, '\\{')
    .replace(/}/g, '\\}')
    .replace(/\r?\n/g, '\\N');
}

function assTime(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const hours = Math.floor(safe / 3_600_000);
  const minutes = Math.floor((safe % 3_600_000) / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1_000);
  const centiseconds = Math.floor((safe % 1_000) / 10);
  return `${hours}:${pad(minutes)}:${pad(seconds)}.${pad(centiseconds)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
