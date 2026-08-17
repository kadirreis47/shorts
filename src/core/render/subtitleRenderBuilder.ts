import type { MediaScene, SubtitleCue, SubtitleStyle } from '@/core/media';

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

/** Global canonical ASS plan used after either full composition or segment concat. */
export function buildCanonicalSubtitleRenderPlan(input: {
  cues: SubtitleCue[];
  width: number;
  height: number;
  style: SubtitleStyle;
  enabled?: boolean;
}): SubtitleRenderPlan {
  const { cues, width, height, style } = input;
  if (input.enabled === false) return { preset: 'clean', cueCount: 0, highlightedWordCount: 0 };
  const validCues = cues
    .filter((cue) => cue.text.trim().length > 0 && cue.endMs > cue.startMs)
    .sort((left, right) =>
      left.startMs - right.startMs
      || left.endMs - right.endMs
      || compareStableText(left.sceneId, right.sceneId)
      || compareStableText(left.text, right.text),
    );
  if (validCues.length === 0) return { preset: 'clean', cueCount: 0, highlightedWordCount: 0 };
  const preset = choosePreset(style);
  return {
    assContent: [
      '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${width}`, `PlayResY: ${height}`,
      'WrapStyle: 2', 'ScaledBorderAndShadow: yes', 'YCbCr Matrix: TV.709', '',
      '[V4+ Styles]',
      'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
      ...styleBlock(style, width, height), '', '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      ...validCues.flatMap((cue) => buildCueEvents(cue, cue.startMs, cue.endMs, preset, style)), '',
    ].join('\n'),
    preset,
    cueCount: validCues.length,
    highlightedWordCount: validCues.reduce((total, cue) => total + Math.max(0, (cue.wordIds ?? []).length), 0),
  };
}

function compareStableText(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

export function buildSceneSubtitleRenderPlan(input: {
  scene: MediaScene;
  cues: SubtitleCue[];
  width: number;
  height: number;
  style: SubtitleStyle;
}): SubtitleRenderPlan {
  const { scene, cues, width, height, style } = input;
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

  const preset = choosePreset(style);
  const styles = styleBlock(style, width, height);
  const events = localCues.flatMap(({ cue, startMs, endMs }) =>
    buildCueEvents(cue, startMs, endMs, preset, style),
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
  style: SubtitleStyle,
): string[] {
  const escaped = escapeAss(cue.text);
  const base = `Dialogue: 0,${assTime(startMs)},${assTime(endMs)},`;

  if (preset === 'karaoke' || preset === 'viral') {
    const tokens = tokenizeSubtitleText(cue.text);
    const words = splitWords(cue.text);
    if (words.length > 0) {
      const durationCentiseconds = Math.max(
        words.length,
        Math.round((endMs - startMs) / 10),
      );
      const perWord = Math.max(1, Math.floor(durationCentiseconds / words.length));
      let wordIndex = 0;
      const karaokeText = tokens
        .map((token) => {
          if (token.kind !== 'word') return escapeAss(token.value);
          const index = wordIndex++;
          const pop = preset === 'viral'
            ? `{\\k${perWord}\\t(0,110,\\fscx118\\fscy118)\\t(110,220,\\fscx100\\fscy100)}`
            : `{\\k${perWord}}`;
          const emphasized = (cue.emphasisWordIds ?? []).includes((cue.wordIds ?? [])[index]);
          const highlight = emphasized ? `{\\c${assColor(style.highlightColor)}}` : '';
          const restore = emphasized ? `{\\c${assColor(style.textColor)}}` : '';
          return `${pop}${highlight}${escapeAss(token.value)}${restore}`;
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

  const fade = style.animation === 'fade' ? '{\\fad(90,90)}' : '';
  return [`${base}Clean,,0,0,0,,${fade}${highlightText(cue, style) || escaped}`];
}

function styleBlock(
  style: SubtitleStyle,
  width: number,
  height: number,
): string[] {
  const scale = Math.max(0.7, Math.min(1.5, width / 1080));
  const fontSize = Number.isFinite(style.fontSize) ? style.fontSize : 64;
  const cleanSize = Math.round(Math.max(36, Math.min(96, fontSize)) * scale);
  const boldSize = Math.round(cleanSize * 1.08);
  const karaokeSize = Math.round(cleanSize * 1.04);
  const marginV = subtitleVerticalMargin(style.position, width, height);
  const alignment = style.position === 'top' ? 8 : style.position === 'center' ? 5 : 2;
  const outline = Math.max(0, Math.min(8, Number.isFinite(style.strokeWidth) ? style.strokeWidth : 4));
  const shadow = Math.max(0, Math.min(6, Number.isFinite(style.shadowDepth) ? style.shadowDepth : 1));
  const primary = assColor(style.textColor); const secondary = assColor(style.highlightColor); const outlineColor = assColor('#101010'); const back = assColor(style.backgroundColor, Number.isFinite(style.backgroundOpacity) ? style.backgroundOpacity : .34);

  return [
    `Style: Clean,${style.fontFamily || 'Arial'},${cleanSize},${primary},${secondary},${outlineColor},${back},${(Number.isFinite(style.fontWeight) ? style.fontWeight : 800) >= 700 ? 1 : 0},0,0,0,100,100,0,0,1,${outline},${shadow},${alignment},90,90,${marginV},1`,
    `Style: Bold,${style.fontFamily || 'Arial'},${boldSize},${primary},${secondary},${outlineColor},${back},1,0,0,0,100,100,0,0,1,${outline},${shadow},${alignment},70,70,${marginV},1`,
    `Style: Karaoke,${style.fontFamily || 'Arial'},${karaokeSize},${secondary},${primary},${outlineColor},${back},1,0,0,0,100,100,0,0,1,${outline},${shadow},${alignment},70,70,${marginV},1`,
  ];
}

function choosePreset(style: SubtitleStyle): SubtitleRenderPreset {
  if (style.animation === 'pop') return 'bold';
  if (style.animation === 'karaoke' || style.animation === 'word-highlight') return 'karaoke';
  return 'clean';
}

function highlightText(cue: SubtitleCue, style: SubtitleStyle): string {
  const emphasisWordIds = cue.emphasisWordIds ?? [];
  const wordIds = cue.wordIds ?? [];
  if (!emphasisWordIds.length) return '';
  let wordIndex = 0;
  return tokenizeSubtitleText(cue.text).map((token) => {
    if (token.kind !== 'word') return escapeAss(token.value);
    const emphasized = emphasisWordIds.includes(wordIds[wordIndex++]);
    return emphasized ? `{\\c${assColor(style.highlightColor)}}${escapeAss(token.value)}{\\c${assColor(style.textColor)}}` : escapeAss(token.value);
  }).join('');
}
function assColor(hex: string, opacity = 1): string { const match = /^#([0-9a-f]{6})$/i.exec(hex); const rgb = match?.[1] ?? 'FFFFFF'; const safeOpacity = Number.isFinite(opacity) ? opacity : 1; const alpha = Math.round((1 - Math.max(0, Math.min(1, safeOpacity))) * 255).toString(16).padStart(2, '0').toUpperCase(); return `&H${alpha}${rgb.slice(4, 6)}${rgb.slice(2, 4)}${rgb.slice(0, 2).toUpperCase()}&`; }

interface SubtitleTextToken { kind: 'word' | 'spacing' | 'line-break'; value: string; }

function tokenizeSubtitleText(text: string): SubtitleTextToken[] {
  const normalized = text.replace(/\r\n?/g, '\n');
  return (normalized.match(/\n|[^\S\n]+|[^\s]+/gu) ?? []).map((value) => ({
    kind: value === '\n' ? 'line-break' : /^\s+$/u.test(value) ? 'spacing' : 'word',
    value,
  }));
}

function splitWords(text: string): string[] {
  return tokenizeSubtitleText(text).filter((token) => token.kind === 'word').map((token) => token.value);
}

export function subtitleVerticalMargin(position: SubtitleStyle['position'], width: number, height: number): number {
  const portrait = height > width;
  const safeRatio = portrait ? 0.095 : 0.065;
  if (position === 'center') return Math.round(height * 0.46);
  return Math.round(height * safeRatio);
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
