import type {
  AudioSegment,
  MediaAsset,
  RenderManifest,
} from '@/core/media';

export interface AudioMixCommandPlan {
  inputArgs: string[];
  filterComplex: string | null;
  outputLabel: string | null;
  realInputCount: number;
  voiceInputCount: number;
  musicInputCount: number;
  sfxInputCount: number;
}

export function assertRequiredNarrationBound(
  manifest: RenderManifest,
  audio: Pick<AudioMixCommandPlan, 'voiceInputCount'>,
): void {
  if (manifest.audio?.narrationMode === 'required' && audio.voiceInputCount === 0) {
    throw new Error('Required canonical narration could not be bound to FFmpeg.');
  }
}

interface ResolvedAudioSegment {
  segment: AudioSegment;
  asset: MediaAsset;
  inputIndex: number;
}

export function buildAudioMixCommand(
  manifest: RenderManifest,
  firstAudioInputIndex: number,
): AudioMixCommandPlan {
  const voice = resolveSegments(
    manifest.audio.voice,
    manifest.assets,
    firstAudioInputIndex,
  );
  const music = resolveSegments(
    manifest.audio.music,
    manifest.assets,
    firstAudioInputIndex + voice.length,
  );
  const sfx = resolveSegments(
    manifest.audio.sfx,
    manifest.assets,
    firstAudioInputIndex + voice.length + music.length,
  );
  const resolved = [...voice, ...music, ...sfx];

  if (resolved.length === 0) {
    return {
      inputArgs: [],
      filterComplex: null,
      outputLabel: null,
      realInputCount: 0,
      voiceInputCount: 0,
      musicInputCount: 0,
      sfxInputCount: 0,
    };
  }

  const inputArgs = resolved.flatMap(({ segment, asset }) => {
    const args: string[] = [];
    if (segment.type === 'music') {
      args.push('-stream_loop', '-1');
    }
    args.push('-i', asset.source);
    return args;
  });

  const filters: string[] = [];
  const voiceLabels = buildSegmentFilters(voice, filters, 'voice');
  const musicLabels = buildSegmentFilters(music, filters, 'music');
  const sfxLabels = buildSegmentFilters(sfx, filters, 'sfx');

  const voiceBus = mixBus(voiceLabels, filters, 'voicebus');
  const musicBus = mixBus(musicLabels, filters, 'musicbus');
  const sfxBus = mixBus(sfxLabels, filters, 'sfxbus');

  const finalInputs: string[] = [];

  if (voiceBus && musicBus) {
    const attack = Math.max(1, manifest.audio.settings.duckingAttackMs);
    const release = Math.max(1, manifest.audio.settings.duckingReleaseMs);
    filters.push(
      `[${voiceBus}]asplit=2[voicefinal][voiceside]`,
      `[${musicBus}][voiceside]sidechaincompress=threshold=0.025:ratio=8:attack=${attack}:release=${release}:makeup=1[duckedmusic]`,
    );
    finalInputs.push('[voicefinal]', '[duckedmusic]');
  } else {
    if (voiceBus) finalInputs.push(`[${voiceBus}]`);
    if (musicBus) finalInputs.push(`[${musicBus}]`);
  }

  if (sfxBus) finalInputs.push(`[${sfxBus}]`);

  const masterGain = finiteGain(manifest.audio.settings.masterGain);
  const targetLufs = clamp(
    manifest.audio.settings.targetLufs,
    -30,
    -5,
  );

  if (finalInputs.length === 1) {
    filters.push(
      `${finalInputs[0]}volume=${masterGain},loudnorm=I=${targetLufs}:TP=-1.5:LRA=11,alimiter=limit=0.95[audioout]`,
    );
  } else {
    filters.push(
      `${finalInputs.join('')}amix=inputs=${finalInputs.length}:duration=longest:normalize=0,volume=${masterGain},loudnorm=I=${targetLufs}:TP=-1.5:LRA=11,alimiter=limit=0.95[audioout]`,
    );
  }

  return {
    inputArgs,
    filterComplex: filters.join(';'),
    outputLabel: '[audioout]',
    realInputCount: resolved.length,
    voiceInputCount: voice.length,
    musicInputCount: music.length,
    sfxInputCount: sfx.length,
  };
}

function resolveSegments(
  segments: AudioSegment[],
  assets: MediaAsset[],
  startIndex: number,
): ResolvedAudioSegment[] {
  const resolved: ResolvedAudioSegment[] = [];

  for (const segment of segments) {
    if (!segment.assetId) continue;
    const asset = assets.find(
      (candidate) =>
        candidate.id === segment.assetId &&
        candidate.source.trim().length > 0,
    );
    if (!asset) continue;

    resolved.push({
      segment,
      asset,
      inputIndex: startIndex + resolved.length,
    });
  }

  return resolved;
}

function buildSegmentFilters(
  segments: ResolvedAudioSegment[],
  filters: string[],
  prefix: string,
): string[] {
  return segments.map(({ segment, inputIndex }, index) => {
    const output = `${prefix}${index}`;
    const durationSeconds = Math.max(0.05, segment.durationMs / 1000);
    const delayMs = Math.max(0, Math.round(segment.startMs));
    const fadeInSeconds = Math.max(0, segment.fadeInMs / 1000);
    const fadeOutSeconds = Math.max(0, segment.fadeOutMs / 1000);
    const fadeOutStart = Math.max(
      0,
      durationSeconds - fadeOutSeconds,
    );

    const chain = [
      `atrim=duration=${durationSeconds.toFixed(3)}`,
      `apad=whole_dur=${durationSeconds.toFixed(3)}`,
      'asetpts=PTS-STARTPTS',
      'aresample=48000',
      'aformat=sample_fmts=fltp:channel_layouts=stereo',
      `volume=${finiteGain(segment.gain)}`,
    ];

    if (fadeInSeconds > 0) {
      chain.push(`afade=t=in:st=0:d=${fadeInSeconds.toFixed(3)}`);
    }
    if (fadeOutSeconds > 0) {
      chain.push(
        `afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeOutSeconds.toFixed(3)}`,
      );
    }

    chain.push(`adelay=${delayMs}|${delayMs}[${output}]`);
    filters.push(`[${inputIndex}:a]${chain.join(',')}`);
    return output;
  });
}

function mixBus(
  labels: string[],
  filters: string[],
  output: string,
): string | null {
  if (labels.length === 0) return null;
  if (labels.length === 1) {
    filters.push(`[${labels[0]}]anull[${output}]`);
    return output;
  }

  filters.push(
    `${labels.map((label) => `[${label}]`).join('')}amix=inputs=${labels.length}:duration=longest:normalize=0[${output}]`,
  );
  return output;
}

function finiteGain(value: number): string {
  const safe = Number.isFinite(value) ? value : 1;
  return clamp(safe, 0, 2).toFixed(4);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
