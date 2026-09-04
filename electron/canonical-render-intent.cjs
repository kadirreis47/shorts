const OUTPUT_MARKER = '{{OUTPUT_FILE}}';
const CONCAT_MARKER = '{{CONCAT_FILE}}';
const SUBTITLE_MARKER = '{{SUBTITLE_FILE_FILTER_VALUE}}';
const WATERMARK_TEXT_MARKER = '{{WATERMARK_TEXT_FILE_FILTER_VALUE}}';
const MAX_SUBTITLE_BYTES = 2 * 1024 * 1024;
const MAX_SCENES = 64;
const MAX_AUDIO_TRACKS = 192;
const ORIENTATIONS = new Set(['identity', 'mirror-horizontal', 'rotate-180', 'mirror-vertical', 'transpose', 'rotate-90-cw', 'transverse', 'rotate-90-ccw']);
const MOTIONS = new Set(['none', 'zoom_in', 'zoom_out', 'pan_left', 'pan_right', 'ken_burns']);
const ENCODERS = new Set([
  'libx264', 'libx265', 'libvpx-vp9', 'libaom-av1', 'libsvtav1',
  'h264_nvenc', 'hevc_nvenc', 'h264_qsv', 'hevc_qsv', 'h264_amf', 'hevc_amf',
  'h264_videotoolbox', 'hevc_videotoolbox', 'h264_vaapi', 'hevc_vaapi',
]);
const ENCODER_PRESETS = new Set(['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']);
const COLOR_SPACES = new Set(['bt709', 'bt2020nc', 'bt2020ncl', 'smpte170m']);
const PROFILES = new Set(['baseline', 'main', 'high', 'high10', 'rext']);
const ORIENTATION_FILTERS = Object.freeze({
  identity: [], 'mirror-horizontal': ['hflip'], 'rotate-180': ['hflip', 'vflip'], 'mirror-vertical': ['vflip'],
  transpose: ['transpose=clock', 'hflip'], 'rotate-90-cw': ['transpose=clock'], transverse: ['transpose=clock', 'vflip'], 'rotate-90-ccw': ['transpose=cclock'],
});

function validateCanonicalRenderRequest(value) {
  const request = strictObject(value, ['operation', 'jobId', 'outputPath', 'outputResourceReference', 'intent'], 'render request');
  if (!['full-render', 'segment-render', 'segment-concat'].includes(request.operation)) fail('Invalid canonical render operation.');
  if (typeof request.jobId !== 'string' || !/^[a-z0-9_-]{1,128}$/i.test(request.jobId)) fail('Invalid canonical render job.');
  if (request.outputPath !== undefined && (typeof request.outputPath !== 'string' || request.outputPath.length > 32_768 || request.outputPath.includes('\0'))) fail('Invalid canonical output destination.');
  if (request.outputResourceReference !== undefined && (typeof request.outputResourceReference !== 'string' || !/^sgr1_[A-Za-z0-9_-]{43}$/.test(request.outputResourceReference))) fail('Invalid segment output capability.');
  const expectedKind = request.operation === 'full-render' ? 'full' : request.operation === 'segment-render' ? 'segment' : 'concat-segments';
  const intent = normalizeIntent(request.intent, expectedKind);
  if (request.operation === 'segment-render') {
    if (request.outputPath !== undefined || !request.outputResourceReference) fail('Segment render requires one segment destination capability.');
  } else if (!request.outputPath || request.outputResourceReference !== undefined) fail('Export render requires one approved destination.');
  return Object.freeze({ operation: request.operation, jobId: request.jobId, outputPath: request.outputPath, outputResourceReference: request.outputResourceReference, intent });
}

function normalizeIntent(value, expectedKind) {
  const input = strictObject(value, ['version', 'kind', 'width', 'height', 'durationMs', 'scenes', 'sceneDurationsMs', 'transitions', 'segmentReferences', 'branding', 'subtitleContent', 'audioTracks', 'audioSettings', 'encoding'], 'render intent');
  if (input.version !== 3 || input.kind !== expectedKind) fail('Canonical render intent kind is invalid.');
  const width = integer(input.width, 16, 8192, 'width');
  const height = integer(input.height, 16, 8192, 'height');
  const durationMs = integer(input.durationMs, 1, 3_600_000, 'duration');
  if (!Array.isArray(input.scenes) || input.scenes.length > MAX_SCENES) fail('Canonical scenes are invalid.');
  const scenes = input.scenes.map(normalizeScene);
  if ((expectedKind === 'full' && scenes.length < 1) || (expectedKind === 'segment' && scenes.length !== 1) || (expectedKind === 'concat-segments' && scenes.length !== 0)) fail('Canonical scene count is invalid.');
  if (!Array.isArray(input.sceneDurationsMs) || input.sceneDurationsMs.length < 1 || input.sceneDurationsMs.length > MAX_SCENES) fail('Canonical scene durations are invalid.');
  const sceneDurationsMs = input.sceneDurationsMs.map((item) => integer(item, 50, 600_000, 'scene duration'));
  if ((expectedKind === 'full' && sceneDurationsMs.length !== scenes.length)
    || (expectedKind === 'segment' && (sceneDurationsMs.length !== 1 || sceneDurationsMs[0] !== scenes[0].durationMs))) {
    fail('Canonical scene durations do not match scenes.');
  }
  if (expectedKind === 'full' && sceneDurationsMs.some((item, index) => item !== scenes[index].durationMs)) fail('Canonical scene durations do not match scenes.');
  if (!Array.isArray(input.transitions) || input.transitions.length < 1 || input.transitions.length > MAX_SCENES) fail('Canonical transitions are invalid.');
  const transitions = input.transitions.map((value, index) => {
    const item = strictObject(value, ['type', 'overlapMs'], 'transition');
    if (!['cut', 'crossfade'].includes(item.type)) fail('Canonical transition type is invalid.');
    const overlapMs = integer(item.overlapMs, 0, 3_600_000, 'transition overlap');
    if (index === 0 && overlapMs !== 0) fail('First scene cannot overlap.');
    return Object.freeze({ type: item.type, overlapMs });
  });
  const expectedTransitions = expectedKind === 'segment' ? 1 : expectedKind === 'full' ? scenes.length : undefined;
  if (expectedTransitions !== undefined && transitions.length !== expectedTransitions) fail('Canonical transition count is invalid.');
  if (sceneDurationsMs.length !== transitions.length) fail('Canonical scene durations do not match transitions.');
  for (let index = 1; index < transitions.length; index += 1) {
    if (transitions[index].overlapMs >= Math.min(sceneDurationsMs[index - 1], sceneDurationsMs[index])) fail('Canonical transition overlap is invalid.');
  }
  const effectiveDurationMs = sceneDurationsMs.reduce((total, item, index) => total + item - (index === 0 ? 0 : transitions[index].overlapMs), 0);
  if (effectiveDurationMs !== durationMs) fail('Canonical render duration is inconsistent.');
  if (!Array.isArray(input.segmentReferences) || input.segmentReferences.length > MAX_SCENES || input.segmentReferences.some((value) => typeof value !== 'string' || !/^sgr1_[A-Za-z0-9_-]{43}$/.test(value))) fail('Canonical segment resources are invalid.');
  if ((expectedKind === 'concat-segments') !== (input.segmentReferences.length > 0) || expectedKind === 'concat-segments' && input.segmentReferences.length !== transitions.length) fail('Canonical segment resources do not match the operation.');
  const subtitleContent = typeof input.subtitleContent === 'string' ? input.subtitleContent : fail('Canonical subtitle content is invalid.');
  if (Buffer.byteLength(subtitleContent, 'utf8') > MAX_SUBTITLE_BYTES || expectedKind === 'segment' && subtitleContent) fail('Canonical subtitle content is invalid.');
  const branding = normalizeBranding(input.branding, expectedKind);
  if (!Array.isArray(input.audioTracks) || input.audioTracks.length > MAX_AUDIO_TRACKS || expectedKind === 'segment' && input.audioTracks.length) fail('Canonical audio tracks are invalid.');
  const audioTracks = input.audioTracks.map(normalizeAudioTrack);
  const audioSettings = normalizeAudioSettings(input.audioSettings);
  const encoding = normalizeEncoding(input.encoding);
  return deepFreeze({ version: 3, kind: expectedKind, width, height, durationMs, scenes, sceneDurationsMs, transitions, segmentReferences: [...input.segmentReferences], branding, subtitleContent, audioTracks, audioSettings, encoding });
}

function normalizeScene(value) {
  const scene = strictObject(value, ['durationMs', 'cameraMotion', 'source'], 'scene');
  const durationMs = integer(scene.durationMs, 50, 600_000, 'scene duration');
  if (!MOTIONS.has(scene.cameraMotion)) fail('Canonical camera motion is invalid.');
  const source = strictObject(scene.source, ['kind', 'paletteIndex', 'url', 'geometry', 'framing', 'framingBinding'], 'scene source');
  if (source.kind === 'color') {
    if (Object.keys(source).some((key) => !['kind', 'paletteIndex'].includes(key))) fail('Canonical color source is invalid.');
    return deepFreeze({ durationMs, cameraMotion: 'none', source: { kind: 'color', paletteIndex: integer(source.paletteIndex, 0, 1_000_000, 'palette index') } });
  }
  if (source.kind === 'external-video') {
    if (Object.keys(source).some((key) => !['kind', 'url'].includes(key))) fail('Canonical video source is invalid.');
    return deepFreeze({ durationMs, cameraMotion: 'none', source: { kind: 'external-video', url: httpsUrl(source.url) } });
  }
  if (source.kind !== 'private-image' || Object.keys(source).some((key) => !['kind', 'url', 'geometry', 'framing', 'framingBinding'].includes(key))) fail('Canonical scene source is invalid.');
  const geometry = normalizeGeometry(source.geometry);
  const framing = source.framing === undefined ? undefined : normalizeFraming(source.framing);
  const framingBinding = source.framingBinding === undefined ? undefined : normalizeFramingBinding(source.framingBinding);
  if (Boolean(framing) !== Boolean(framingBinding)) fail('Canonical image framing and binding must be paired.');
  if (framingBinding && !bindingMatchesGeometry(framingBinding, geometry)) fail('Canonical image framing binding does not match image geometry.');
  return deepFreeze({ durationMs, cameraMotion: scene.cameraMotion, source: {
    kind: 'private-image', url: httpsUrl(source.url), geometry,
    ...(framing ? { framing, framingBinding } : {}),
  } });
}

function normalizeFraming(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail('Canonical image framing is invalid.');
  const item = strictObject(value, ['version', 'mode', 'anchor'], 'image framing');
  if (item.version !== 1 || item.mode !== 'focal-cover') fail('Canonical image framing is invalid.');
  if (!item.anchor || typeof item.anchor !== 'object' || Array.isArray(item.anchor) || Object.getPrototypeOf(item.anchor) !== Object.prototype) fail('Canonical image framing is invalid.');
  const anchor = strictObject(item.anchor, ['x', 'y'], 'image framing anchor');
  const x = canonicalCoordinate(anchor.x);
  const y = canonicalCoordinate(anchor.y);
  if (x === 0.5 && y === 0.5) return undefined;
  return Object.freeze({ version: 1, mode: 'focal-cover', anchor: Object.freeze({ x, y }) });
}

function canonicalCoordinate(value) {
  const coordinate = finite(value, 0, 1, 'image framing coordinate');
  if (Math.round(coordinate * 10_000) / 10_000 !== coordinate) fail('Canonical image framing precision is invalid.');
  return coordinate;
}

function normalizeGeometry(value) {
  const item = strictExactPlainObject(value, ['inputIndex', 'authorityReference', 'mediaIdentity', 'expectedOrientation', 'contentDigest', 'encodedDimensions', 'displayDimensions'], 'image authority');
  if (item.inputIndex !== 0 || typeof item.authorityReference !== 'string' || !/^idga1_[A-Za-z0-9_-]{43}$/.test(item.authorityReference)
    || typeof item.mediaIdentity !== 'string' || !/^media:[0-9a-f-]{36}\/generated-images\/[0-9a-f-]{36}\.(?:png|jpg)$/i.test(item.mediaIdentity)
    || !ORIENTATIONS.has(item.expectedOrientation) || typeof item.contentDigest !== 'string' || !/^[0-9a-f]{64}$/.test(item.contentDigest)) fail('Canonical image authority is invalid.');
  const encodedDimensions = normalizeImageDimensions(item.encodedDimensions);
  const displayDimensions = normalizeImageDimensions(item.displayDimensions);
  const swaps = ['transpose', 'rotate-90-cw', 'transverse', 'rotate-90-ccw'].includes(item.expectedOrientation);
  if (displayDimensions.width !== (swaps ? encodedDimensions.height : encodedDimensions.width)
    || displayDimensions.height !== (swaps ? encodedDimensions.width : encodedDimensions.height)) fail('Canonical image authority dimensions are inconsistent.');
  return Object.freeze({ inputIndex: 0, authorityReference: item.authorityReference, mediaIdentity: item.mediaIdentity, expectedOrientation: item.expectedOrientation, contentDigest: item.contentDigest, encodedDimensions, displayDimensions });
}

function normalizeFramingBinding(value) {
  const item = strictExactPlainObject(value, ['version', 'mediaIdentity', 'contentDigest', 'encodedDimensions', 'displayDimensions', 'encodedToDisplay'], 'image framing binding');
  if (item.version !== 1 || typeof item.mediaIdentity !== 'string'
    || !/^media:[0-9a-f-]{36}\/generated-images\/[0-9a-f-]{36}\.(?:png|jpg)$/i.test(item.mediaIdentity)
    || typeof item.contentDigest !== 'string' || !/^[0-9a-f]{64}$/.test(item.contentDigest)
    || !ORIENTATIONS.has(item.encodedToDisplay)) fail('Canonical image framing binding is invalid.');
  const encodedDimensions = normalizeImageDimensions(item.encodedDimensions);
  const displayDimensions = normalizeImageDimensions(item.displayDimensions);
  const swaps = ['transpose', 'rotate-90-cw', 'transverse', 'rotate-90-ccw'].includes(item.encodedToDisplay);
  if (displayDimensions.width !== (swaps ? encodedDimensions.height : encodedDimensions.width)
    || displayDimensions.height !== (swaps ? encodedDimensions.width : encodedDimensions.height)) fail('Canonical image framing binding dimensions are inconsistent.');
  return Object.freeze({ version: 1, mediaIdentity: item.mediaIdentity, contentDigest: item.contentDigest, encodedDimensions, displayDimensions, encodedToDisplay: item.encodedToDisplay });
}

function normalizeImageDimensions(value) {
  const item = strictExactPlainObject(value, ['width', 'height'], 'image dimensions');
  if (!Number.isSafeInteger(item.width) || !Number.isSafeInteger(item.height)
    || item.width < 1 || item.height < 1 || item.width > 4096 || item.height > 4096
    || item.width * item.height > 16_000_000) fail('Canonical image dimensions are invalid.');
  return Object.freeze({ width: item.width, height: item.height });
}

function bindingMatchesGeometry(binding, geometry) {
  return binding.version === 1
    && binding.mediaIdentity === geometry.mediaIdentity
    && binding.contentDigest === geometry.contentDigest
    && binding.encodedToDisplay === geometry.expectedOrientation
    && binding.encodedDimensions.width === geometry.encodedDimensions.width
    && binding.encodedDimensions.height === geometry.encodedDimensions.height
    && binding.displayDimensions.width === geometry.displayDimensions.width
    && binding.displayDimensions.height === geometry.displayDimensions.height;
}

function normalizeAudioTrack(value) {
  const item = strictObject(value, ['kind', 'url', 'startMs', 'durationMs', 'fadeInMs', 'fadeOutMs', 'gain'], 'audio track');
  if (!['voice', 'music', 'sfx'].includes(item.kind)) fail('Canonical audio kind is invalid.');
  return Object.freeze({ kind: item.kind, url: httpsUrl(item.url), startMs: integer(item.startMs, 0, 3_600_000, 'audio start'), durationMs: integer(item.durationMs, 50, 3_600_000, 'audio duration'), fadeInMs: integer(item.fadeInMs, 0, 600_000, 'audio fade'), fadeOutMs: integer(item.fadeOutMs, 0, 600_000, 'audio fade'), gain: finite(item.gain, 0, 2, 'audio gain') });
}

function normalizeAudioSettings(value) {
  const item = strictObject(value, ['masterGain', 'targetLufs', 'duckingAttackMs', 'duckingReleaseMs'], 'audio settings');
  return Object.freeze({ masterGain: finite(item.masterGain, 0, 2, 'master gain'), targetLufs: finite(item.targetLufs, -30, -5, 'target loudness'), duckingAttackMs: integer(item.duckingAttackMs, 0, 60_000, 'ducking attack'), duckingReleaseMs: integer(item.duckingReleaseMs, 0, 60_000, 'ducking release') });
}

function normalizeBranding(value, kind) {
  if (value === null) return null;
  if (kind === 'segment') fail('Segment renders cannot contain branding.');
  const item = strictObject(value, ['text', 'position'], 'branding');
  if (typeof item.text !== 'string' || Buffer.byteLength(item.text, 'utf8') > 512 || !['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(item.position)) fail('Canonical branding is invalid.');
  return Object.freeze({ text: item.text, position: item.position });
}

function normalizeEncoding(value) {
  const item = strictObject(value, ['videoCodec', 'audioCodec', 'quality', 'hardwareAcceleration', 'encoder', 'encoderMode', 'bitrateKbps', 'maxBitrateKbps', 'bufferSizeKbps', 'crf', 'encoderPreset', 'frameRate', 'pixelFormat', 'gopFrames', 'keyframeInterval', 'threads', 'audioBitrateKbps', 'sampleRate', 'audioChannels', 'colorSpace', 'profile'], 'encoding');
  if (!['h264', 'hevc', 'av1', 'vp9'].includes(item.videoCodec) || !['aac', 'opus'].includes(item.audioCodec)
    || !['draft', 'standard', 'high'].includes(item.quality) || !['auto', 'disabled', 'nvenc'].includes(item.hardwareAcceleration)
    || item.encoder !== null && !ENCODERS.has(item.encoder) || item.encoderMode !== null && !['software', 'hardware'].includes(item.encoderMode)
    || item.encoderPreset !== null && !ENCODER_PRESETS.has(item.encoderPreset) || !['yuv420p', 'yuv444p'].includes(item.pixelFormat)
    || item.colorSpace !== null && !COLOR_SPACES.has(item.colorSpace) || item.profile !== null && !PROFILES.has(item.profile)) fail('Canonical encoding policy is invalid.');
  const nullableInteger = (input, min, max, name) => input === null ? null : integer(input, min, max, name);
  return Object.freeze({
    videoCodec: item.videoCodec, audioCodec: item.audioCodec, quality: item.quality, hardwareAcceleration: item.hardwareAcceleration,
    encoder: item.encoder, encoderMode: item.encoderMode, bitrateKbps: nullableInteger(item.bitrateKbps, 100, 200_000, 'video bitrate'),
    maxBitrateKbps: nullableInteger(item.maxBitrateKbps, 100, 400_000, 'maximum bitrate'), bufferSizeKbps: nullableInteger(item.bufferSizeKbps, 100, 800_000, 'buffer size'),
    crf: nullableInteger(item.crf, 0, 63, 'crf'), encoderPreset: item.encoderPreset, frameRate: integer(item.frameRate, 1, 120, 'frame rate'), pixelFormat: item.pixelFormat,
    gopFrames: nullableInteger(item.gopFrames, 1, 1_000, 'gop'), keyframeInterval: nullableInteger(item.keyframeInterval, 1, 1_000, 'keyframe interval'),
    threads: nullableInteger(item.threads, 0, 256, 'threads'), audioBitrateKbps: integer(item.audioBitrateKbps, 16, 1_024, 'audio bitrate'), sampleRate: integer(item.sampleRate, 8_000, 192_000, 'sample rate'),
    audioChannels: integer(item.audioChannels, 1, 8, 'audio channels'), colorSpace: item.colorSpace, profile: item.profile,
  });
}

function compileCanonicalRenderRequest(request, { segmentPaths = [] } = {}) {
  const intent = request.intent;
  if (intent.kind === 'segment') return compileSegment(intent);
  if (intent.kind === 'concat-segments') return compileConcat(intent, segmentPaths);
  return compileFull(intent);
}

function compileFull(intent) {
  const args = ['-hide_banner', '-y']; const filters = []; const authorities = [];
  intent.scenes.forEach((scene, index) => { appendSceneInput(args, scene, intent, index, authorities); filters.push(`[${index}:v]${sceneFilters(scene, intent, index).join(',')}[v${index}]`); });
  const transition = transitionFilters(intent.scenes.map((_, index) => `v${index}`), intent.scenes.map((scene) => scene.durationMs), intent.transitions);
  filters.push(...transition.filters);
  const branded = appendBranding(filters, transition.outputLabel, intent);
  filters.push(intent.subtitleContent ? `[${branded}]subtitles=filename=${SUBTITLE_MARKER}[videoout]` : `[${branded}]null[videoout]`);
  const audio = appendAudioInputsAndFilters(args, intent.audioTracks, intent.scenes.length, intent.audioSettings);
  if (audio.filters.length) filters.push(...audio.filters);
  if (!audio.realInputCount) args.push('-f', 'lavfi', '-t', seconds(intent.durationMs), '-i', `anullsrc=channel_layout=${intent.encoding.audioChannels === 1 ? 'mono' : 'stereo'}:sample_rate=${intent.encoding.sampleRate}`);
  args.push('-filter_complex', filters.join(';'), '-map', '[videoout]', '-map', audio.realInputCount ? '[audioout]' : `${intent.scenes.length}:a`);
  appendEncoding(args, intent.encoding, false, true); args.push(OUTPUT_MARKER);
  return Object.freeze({ args, imageGeometryAuthorities: authorities, brandingText: intent.branding?.text ?? null });
}

function compileSegment(intent) {
  const args = ['-hide_banner', '-y']; const authorities = [];
  appendSceneInput(args, intent.scenes[0], intent, 0, authorities);
  args.push('-vf', sceneFilters(intent.scenes[0], intent, 0).join(','), '-an');
  appendEncoding(args, intent.encoding, false, false); args.push(OUTPUT_MARKER);
  return Object.freeze({ args, imageGeometryAuthorities: authorities, brandingText: null });
}

function compileConcat(intent, segmentPaths) {
  if (!Array.isArray(segmentPaths) || segmentPaths.length !== intent.segmentReferences.length) fail('Canonical segment resolution is incomplete.');
  const args = ['-hide_banner', '-y']; const filters = [];
  const compose = segmentPaths.length > 1 && intent.transitions.some((item) => item.overlapMs > 0 || item.type === 'crossfade');
  if (compose) segmentPaths.forEach((segmentPath) => args.push('-i', segmentPath));
  else args.push('-f', 'concat', '-safe', '0', '-i', CONCAT_MARKER);
  const transition = compose ? transitionFilters(segmentPaths.map((_, index) => `${index}:v`), intent.sceneDurationsMs, intent.transitions) : { filters: [], outputLabel: '0:v' };
  filters.push(...transition.filters);
  const branded = appendBranding(filters, transition.outputLabel, intent);
  if (intent.subtitleContent) filters.push(`[${branded}]subtitles=filename=${SUBTITLE_MARKER}[videoout]`);
  else if (filters.length) filters.push(`[${branded}]null[videoout]`);
  const audio = appendAudioInputsAndFilters(args, intent.audioTracks, compose ? segmentPaths.length : 1, intent.audioSettings);
  filters.push(...audio.filters);
  if (!audio.realInputCount) args.push('-f', 'lavfi', '-t', seconds(intent.durationMs), '-i', `anullsrc=channel_layout=${intent.encoding.audioChannels === 1 ? 'mono' : 'stereo'}:sample_rate=${intent.encoding.sampleRate}`);
  if (filters.length) args.push('-filter_complex', filters.join(';'));
  const composedVideo = Boolean(intent.subtitleContent || transition.filters.length || intent.branding);
  args.push('-map', composedVideo ? '[videoout]' : '0:v:0', '-map', audio.realInputCount ? '[audioout]' : `${compose ? segmentPaths.length : 1}:a:0`);
  appendEncoding(args, intent.encoding, !composedVideo, true); args.push(OUTPUT_MARKER);
  return Object.freeze({ args, imageGeometryAuthorities: [], brandingText: intent.branding?.text ?? null });
}

function appendSceneInput(args, scene, intent, index, authorities) {
  const duration = seconds(scene.durationMs);
  if (scene.source.kind === 'color') { args.push('-f', 'lavfi', '-t', duration, '-i', `color=c=${sceneColor(scene.source.paletteIndex)}:s=${intent.width}x${intent.height}:r=${intent.encoding.frameRate}`); return; }
  if (scene.source.kind === 'private-image') {
    args.push('-noautorotate', '-framerate', String(intent.encoding.frameRate), '-loop', '1', '-t', duration, '-i', scene.source.url);
    authorities.push(Object.freeze({
      ...scene.source.geometry,
      inputIndex: index,
      ...(scene.source.framing ? { framingBinding: scene.source.framingBinding } : {}),
    })); return;
  }
  args.push('-stream_loop', '-1', '-t', duration, '-i', scene.source.url);
}

function sceneFilters(scene, intent, index) {
  const filters = scene.source.kind === 'private-image' ? [`{{IMAGE_DISPLAY_GEOMETRY_INPUT_${index}}}`] : [];
  const motion = scene.source.kind === 'private-image' ? motionFilter(scene.cameraMotion, intent.width, intent.height, intent.encoding.frameRate, scene.durationMs) : null;
  if (motion) filters.push(`scale=${motion.sourceWidth}:${motion.sourceHeight}:force_original_aspect_ratio=increase`, imageCropFilter(motion.sourceWidth, motion.sourceHeight, scene.source.framing), motion.filter);
  else filters.push(`scale=${intent.width}:${intent.height}:force_original_aspect_ratio=increase`, scene.source.kind === 'private-image' ? imageCropFilter(intent.width, intent.height, scene.source.framing) : `crop=${intent.width}:${intent.height}`, `fps=${intent.encoding.frameRate}`);
  filters.push(`format=${intent.encoding.pixelFormat}`, `trim=duration=${seconds(scene.durationMs)}`, 'setpts=PTS-STARTPTS'); return filters;
}

function imageCropFilter(width, height, framing) {
  if (!framing) return `crop=${width}:${height}`;
  const x = canonicalCoordinateText(framing.anchor.x);
  const y = canonicalCoordinateText(framing.anchor.y);
  return `crop=${width}:${height}:x='min(max(${x}*iw-${width}/2,0),iw-${width})':y='min(max(${y}*ih-${height}/2,0),ih-${height})'`;
}

function canonicalCoordinateText(value) {
  return value.toFixed(4).replace(/0+$/u, '').replace(/\.$/u, '');
}

function motionFilter(motion, width, height, fps, durationMs) {
  if (motion === 'none') return null;
  const sourceWidth = even(Math.ceil(width * 1.15)); const sourceHeight = even(Math.ceil(height * 1.15)); const denominator = Math.max(1, Math.ceil(durationMs * fps / 1000) - 1);
  let zoom; let x = 'iw/2-iw/zoom/2'; const y = 'ih/2-ih/zoom/2';
  if (motion === 'ken_burns') { zoom = `1+0.12*on/${denominator}`; x = `(iw-iw/zoom)*(0.35+0.3*on/${denominator})`; }
  else if (motion === 'zoom_in') zoom = `1+0.15*on/${denominator}`;
  else if (motion === 'zoom_out') zoom = `1.15-0.15*on/${denominator}`;
  else if (motion === 'pan_left') { zoom = '1.15'; x = `(iw-iw/zoom)*(1-on/${denominator})`; }
  else if (motion === 'pan_right') { zoom = '1.15'; x = `(iw-iw/zoom)*on/${denominator}`; }
  else return null;
  return { sourceWidth, sourceHeight, filter: `zoompan=z='${zoom}':x='${x}':y='${y}':d=1:s=${width}x${height}:fps=${fps}` };
}

function transitionFilters(labels, durations, transitions) {
  let outputLabel = labels[0]; let outputDuration = durations[0]; const filters = [];
  for (let index = 1; index < labels.length; index += 1) {
    const transition = transitions[index]; const next = labels[index]; const label = `transition${index}`;
    if (transition.type === 'crossfade' && transition.overlapMs > 0) filters.push(`[${outputLabel}][${next}]xfade=transition=fade:duration=${seconds(transition.overlapMs)}:offset=${seconds(outputDuration - transition.overlapMs)}[${label}]`);
    else { let left = outputLabel; if (transition.overlapMs > 0) { const trim = `trim${index}`; outputDuration -= transition.overlapMs; filters.push(`[${outputLabel}]trim=duration=${seconds(outputDuration)},setpts=PTS-STARTPTS[${trim}]`); left = trim; } filters.push(`[${left}][${next}]concat=n=2:v=1:a=0[${label}]`); }
    outputDuration += durations[index] - (transition.type === 'crossfade' ? transition.overlapMs : 0); outputLabel = label;
  }
  return { filters, outputLabel };
}

function appendBranding(filters, inputLabel, intent) {
  if (!intent.branding) return inputLabel;
  const margin = Math.max(24, Math.round(Math.min(intent.width, intent.height) * 0.04)); const fontSize = Math.max(28, Math.round(intent.height * 0.024));
  const positions = { 'top-left': [String(margin), String(margin)], 'top-right': [`w-text_w-${margin}`, String(margin)], 'bottom-left': [String(margin), `h-text_h-${margin}`], 'bottom-right': [`w-text_w-${margin}`, `h-text_h-${margin}`] };
  const [x, y] = positions[intent.branding.position];
  filters.push(`[${inputLabel}]drawtext=fontfile='C\\:/Windows/Fonts/arial.ttf':textfile=${WATERMARK_TEXT_MARKER}:fontcolor=white@0.72:fontsize=${fontSize}:x=${x}:y=${y}:expansion=none[brandedvideo]`); return 'brandedvideo';
}

function appendAudioInputsAndFilters(args, tracks, firstIndex, settings) {
  tracks.forEach((track) => { if (track.kind === 'music') args.push('-stream_loop', '-1'); args.push('-i', track.url); });
  if (!tracks.length) return { filters: [], realInputCount: 0 };
  const filters = []; const groups = { voice: [], music: [], sfx: [] };
  tracks.forEach((track, index) => {
    const output = `${track.kind}${groups[track.kind].length}`; groups[track.kind].push(output);
    const duration = Math.max(.05, track.durationMs / 1000); const fadeOut = Math.max(0, track.fadeOutMs / 1000); const chain = [`atrim=duration=${duration.toFixed(3)}`, `apad=whole_dur=${duration.toFixed(3)}`, 'asetpts=PTS-STARTPTS', 'aresample=48000', 'aformat=sample_fmts=fltp:channel_layouts=stereo', `volume=${track.gain.toFixed(4)}`];
    if (track.fadeInMs > 0) chain.push(`afade=t=in:st=0:d=${(track.fadeInMs / 1000).toFixed(3)}`);
    if (track.fadeOutMs > 0) chain.push(`afade=t=out:st=${Math.max(0, duration - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)}`);
    chain.push(`adelay=${track.startMs}|${track.startMs}[${output}]`); filters.push(`[${firstIndex + index}:a]${chain.join(',')}`);
  });
  const bus = (labels, name) => { if (!labels.length) return null; if (labels.length === 1) filters.push(`[${labels[0]}]anull[${name}]`); else filters.push(`${labels.map((label) => `[${label}]`).join('')}amix=inputs=${labels.length}:duration=longest:normalize=0[${name}]`); return name; };
  const voice = bus(groups.voice, 'voicebus'); const music = bus(groups.music, 'musicbus'); const sfx = bus(groups.sfx, 'sfxbus'); const final = [];
  if (voice && music) { filters.push(`[${voice}]asplit=2[voicefinal][voiceside]`, `[${music}][voiceside]sidechaincompress=threshold=0.025:ratio=8:attack=${Math.max(1, settings.duckingAttackMs)}:release=${Math.max(1, settings.duckingReleaseMs)}:makeup=1[duckedmusic]`); final.push('[voicefinal]', '[duckedmusic]'); }
  else { if (voice) final.push(`[${voice}]`); if (music) final.push(`[${music}]`); } if (sfx) final.push(`[${sfx}]`);
  const suffix = `volume=${settings.masterGain.toFixed(4)},loudnorm=I=${settings.targetLufs}:TP=-1.5:LRA=11,alimiter=limit=0.95[audioout]`;
  filters.push(final.length === 1 ? `${final[0]}${suffix}` : `${final.join('')}amix=inputs=${final.length}:duration=longest:normalize=0,${suffix}`);
  return { filters, realInputCount: tracks.length };
}

function appendEncoding(args, value, copyVideo, includeAudio) {
  const encoder = value.encoder || (value.hardwareAcceleration === 'nvenc' ? value.videoCodec === 'hevc' ? 'hevc_nvenc' : 'h264_nvenc' : value.videoCodec === 'hevc' ? 'libx265' : value.videoCodec === 'vp9' ? 'libvpx-vp9' : value.videoCodec === 'av1' ? 'libaom-av1' : 'libx264');
  args.push('-c:v', copyVideo ? 'copy' : encoder);
  if (!copyVideo) {
    if (value.encoderPreset || value.crf !== null) { if (value.encoderPreset) args.push('-preset', value.encoderPreset); if (value.crf !== null) args.push('-crf', String(value.crf)); }
    else if (value.bitrateKbps !== null) { if (value.encoderMode !== 'hardware') args.push('-preset', value.quality === 'draft' ? 'veryfast' : value.quality === 'high' ? 'slow' : 'medium'); }
    else if (value.hardwareAcceleration === 'nvenc') args.push('-preset', value.quality === 'draft' ? 'p1' : value.quality === 'high' ? 'p6' : 'p4', '-cq', value.quality === 'high' ? '18' : '23');
    else args.push('-preset', value.quality === 'draft' ? 'veryfast' : value.quality === 'high' ? 'slow' : 'medium', '-crf', value.quality === 'draft' ? '30' : value.quality === 'high' ? '18' : '23');
    if (value.bitrateKbps !== null) args.push('-b:v', `${value.bitrateKbps}k`); if (value.maxBitrateKbps !== null) args.push('-maxrate', `${value.maxBitrateKbps}k`); if (value.bufferSizeKbps !== null) args.push('-bufsize', `${value.bufferSizeKbps}k`);
    args.push('-r', String(value.frameRate)); if (value.gopFrames !== null) args.push('-g', String(value.gopFrames)); if (value.keyframeInterval !== null) args.push('-keyint_min', String(value.keyframeInterval)); if (value.threads !== null) args.push('-threads', String(value.threads)); if (value.colorSpace) args.push('-colorspace', value.colorSpace); if (value.profile) args.push('-profile:v', value.profile);
    args.push('-pix_fmt', value.pixelFormat);
  }
  if (includeAudio) args.push('-c:a', value.audioCodec === 'opus' ? 'libopus' : 'aac', '-b:a', `${value.audioBitrateKbps}k`, '-ar', String(value.sampleRate), '-ac', String(value.audioChannels));
  args.push('-movflags', '+faststart'); if (includeAudio) args.push('-shortest'); args.push('-progress', 'pipe:1', '-nostats');
}

function strictObject(value, allowed, name) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !allowed.includes(key))) fail(`Invalid canonical ${name}.`); return value; }
function strictExactPlainObject(value, allowed, name) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).length !== allowed.length || allowed.some((key) => !Object.prototype.hasOwnProperty.call(value, key)) || Object.keys(value).some((key) => !allowed.includes(key))) fail(`Invalid canonical ${name}.`); return value; }
function integer(value, min, max, name) { if (!Number.isSafeInteger(value) || value < min || value > max) fail(`Invalid canonical ${name}.`); return value; }
function finite(value, min, max, name) { if (!Number.isFinite(value) || value < min || value > max) fail(`Invalid canonical ${name}.`); return value; }
function httpsUrl(value) { if (typeof value !== 'string' || value.length > 8192) fail('Invalid canonical media reference.'); let parsed; try { parsed = new URL(value); } catch { fail('Invalid canonical media reference.'); } if (parsed.protocol !== 'https:' || parsed.username || parsed.password) fail('Invalid canonical media reference.'); return value; }
function seconds(ms) { return (ms / 1000).toFixed(3); }
function even(value) { return value % 2 === 0 ? value : value + 1; }
function sceneColor(index) { return ['0x0f172a', '0x111827', '0x1e293b', '0x172554', '0x312e81'][index % 5]; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
function fail(message) { throw new TypeError(message); }

module.exports = { validateCanonicalRenderRequest, compileCanonicalRenderRequest, OUTPUT_MARKER, CONCAT_MARKER, SUBTITLE_MARKER, WATERMARK_TEXT_MARKER, MAX_SUBTITLE_BYTES, MAX_SCENES };
