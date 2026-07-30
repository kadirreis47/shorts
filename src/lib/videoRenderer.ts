import type { Scene } from '@/lib/types';

export type CaptionStyle = 'karaoke' | 'highlight' | 'classic' | 'minimal';
export type TransitionStyle = 'crossfade' | 'slide' | 'zoom' | 'fadeblack' | 'glitch' | 'shake' | 'whippan' | 'none';
export type MotionStyle = 'kenburns' | 'pan' | 'zoom_in' | 'zoom_out' | 'static';

export interface RenderOptions {
  width?: number;
  height?: number;
  backgroundColor?: string;
  textColor?: string;
  accentColor?: string;
  fontFamily?: string;
  captionStyle?: CaptionStyle;
  transitionStyle?: TransitionStyle;
  motionStyle?: MotionStyle;
  musicBlob?: Blob | null;
  musicVolume?: number;
  watermarkText?: string;
  watermarkPosition?: string;
  showSubtitles?: boolean;
  captionTextColor?: string;
  captionHighlightColor?: string;
  beatSync?: boolean;
  onProgress?: (progress: number) => void;
}

export interface RenderResult {
  videoBlob: Blob;
  duration: number;
}

const DEFAULT_BG = '#0a0a0f';
const DEFAULT_TEXT = '#ffffff';
const DEFAULT_ACCENT = '#10b981';
const DEFAULT_FONT = 'Inter, system-ui, sans-serif';

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

async function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function loadVideo(url: string): Promise<HTMLVideoElement | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.loop = true;
    video.onloadeddata = () => {
      video.play().then(() => resolve(video)).catch(() => resolve(video));
    };
    video.onerror = () => resolve(null);
    video.src = url;
  });
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | HTMLVideoElement,
  x: number,
  y: number,
  w: number,
  h: number,
  scale: number,
  panX: number = 0,
  panY: number = 0,
) {
  const iw = 'videoWidth' in img ? img.videoWidth : img.naturalWidth || img.width;
  const ih = 'videoHeight' in img ? img.videoHeight : img.naturalHeight || img.height;
  const imgRatio = iw / ih;
  const canvasRatio = w / h;
  let drawW: number;
  let drawH: number;
  if (imgRatio > canvasRatio) {
    drawH = h * scale;
    drawW = drawH * imgRatio;
  } else {
    drawW = w * scale;
    drawH = drawW / imgRatio;
  }
  const offsetX = x + (w - drawW) / 2 + panX;
  const offsetY = y + (h - drawH) / 2 + panY;
  ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

function getWordTimings(text: string, sceneDuration: number): { word: string; startTime: number; endTime: number }[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const totalChars = words.reduce((sum, w) => sum + w.length, 0);
  const readableDuration = sceneDuration - 0.5;
  let elapsed = 0.25;
  return words.map((word) => {
    const fraction = word.length / totalChars;
    const duration = fraction * readableDuration;
    const timing = { word, startTime: elapsed, endTime: elapsed + duration };
    elapsed += duration;
    return timing;
  });
}

function drawKaraokeCaption(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  sceneElapsed: number,
  width: number,
  height: number,
  textColor: string,
  accentColor: string,
  fontFamily: string,
  alpha: number,
) {
  ctx.save();
  ctx.globalAlpha = alpha;

  const fontSize = Math.round(width * 0.075);
  ctx.font = `900 ${fontSize}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const maxWidth = width * 0.88;
  const words = scene.text.split(/\s+/).filter(Boolean);
  const wordTimings = getWordTimings(scene.text, scene.duration || 5);

  const lines = wrapText(ctx, scene.text, maxWidth);
  const lineHeight = fontSize * 1.3;
  const totalHeight = lines.length * lineHeight;
  const centerY = height * 0.5;
  const startY = centerY - totalHeight / 2 + lineHeight / 2;

  let wordIdx = 0;
  lines.forEach((line, lineIdx) => {
    const lineWords = line.split(/\s+/);
    const lineWidth = ctx.measureText(line).width;
    const lineStartX = (width - lineWidth) / 2;
    let xCursor = lineStartX;

    for (const word of lineWords) {
      const timing = wordTimings[wordIdx] ?? { startTime: 0, endTime: 0 };
      const wordWidth = ctx.measureText(word).width;
      const isActive = sceneElapsed >= timing.startTime && sceneElapsed < timing.endTime + 0.15;
      const isPast = sceneElapsed >= timing.endTime + 0.15;

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 4;

      if (isActive) {
        ctx.fillStyle = accentColor;
        const popScale = 1 + 0.12 * easeOutCubic(
          clamp((sceneElapsed - timing.startTime) / 0.12, 0, 1),
        );
        ctx.font = `900 ${Math.round(fontSize * popScale)}px ${fontFamily}`;
        const scaledWidth = ctx.measureText(word).width;
        const adjustX = (wordWidth - scaledWidth) / 2;
        ctx.fillText(word, xCursor + scaledWidth / 2 + adjustX, startY + lineIdx * lineHeight);
        xCursor += wordWidth;
      } else {
        ctx.fillStyle = isPast ? '#ffffff' : 'rgba(255,255,255,0.45)';
        ctx.fillText(word, xCursor + wordWidth / 2, startY + lineIdx * lineHeight);
        xCursor += wordWidth;
      }
      ctx.restore();

      xCursor += ctx.measureText(' ').width;
      wordIdx++;
    }
  });

  ctx.restore();
}

function drawHighlightCaption(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  sceneElapsed: number,
  width: number,
  height: number,
  textColor: string,
  accentColor: string,
  fontFamily: string,
  alpha: number,
) {
  ctx.save();
  ctx.globalAlpha = alpha;

  const fontSize = Math.round(width * 0.07);
  ctx.font = `800 ${fontSize}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const maxWidth = width * 0.88;
  const lines = wrapText(ctx, scene.text, maxWidth);
  const lineHeight = fontSize * 1.35;
  const totalHeight = lines.length * lineHeight;
  const centerY = height * 0.52;
  const startY = centerY - totalHeight / 2 + lineHeight / 2;

  const wordTimings = getWordTimings(scene.text, scene.duration || 5);
  const words = scene.text.split(/\s+/).filter(Boolean);
  let wordIdx = 0;

  lines.forEach((line, lineIdx) => {
    const lineWords = line.split(/\s+/);
    const lineWidth = ctx.measureText(line).width;
    const lineStartX = (width - lineWidth) / 2;
    let xCursor = lineStartX;

    for (const word of lineWords) {
      const timing = wordTimings[wordIdx] ?? { startTime: 0, endTime: 0 };
      const isActive = sceneElapsed >= timing.startTime && sceneElapsed < timing.endTime + 0.2;

      ctx.save();
      if (isActive) {
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 6;
        const wordWidth = ctx.measureText(word).width;
        const padX = fontSize * 0.15;
        const blockH = fontSize * 1.1;
        const blockY = startY + lineIdx * lineHeight - blockH / 2;
        ctx.fillStyle = accentColor;
        ctx.beginPath();
        const r = 8;
        const bx = xCursor - padX;
        const bw = wordWidth + padX * 2;
        ctx.moveTo(bx + r, blockY);
        ctx.arcTo(bx + bw, blockY, bx + bw, blockY + blockH, r);
        ctx.arcTo(bx + bw, blockY + blockH, bx, blockY + blockH, r);
        ctx.arcTo(bx, blockY + blockH, bx, blockY, r);
        ctx.arcTo(bx, blockY, bx + bw, blockY, r);
        ctx.fill();
        ctx.fillStyle = '#0a0a0f';
      } else {
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 3;
        ctx.fillStyle = textColor;
      }
      const wordWidth = ctx.measureText(word).width;
      ctx.fillText(word, xCursor + wordWidth / 2, startY + lineIdx * lineHeight);
      xCursor += wordWidth + ctx.measureText(' ').width;
      ctx.restore();
      wordIdx++;
    }
  });

  ctx.restore();
}

function drawClassicCaption(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  width: number,
  height: number,
  textColor: string,
  fontFamily: string,
  alpha: number,
) {
  ctx.save();
  ctx.globalAlpha = alpha;

  const grad = ctx.createLinearGradient(0, height * 0.4, 0, height);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0.9)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fontSize = Math.round(width * 0.065);
  ctx.font = `bold ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = textColor;

  const maxWidth = width * 0.85;
  const lines = wrapText(ctx, scene.text, maxWidth);
  const lineHeight = width * 0.085;
  const totalHeight = lines.length * lineHeight;
  const startY = height * 0.72 - totalHeight / 2;

  lines.forEach((line, i) => {
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 3;
    ctx.fillText(line, width / 2, startY + i * lineHeight + lineHeight / 2);
  });

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.restore();
}

function drawMinimalCaption(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  width: number,
  height: number,
  textColor: string,
  fontFamily: string,
  alpha: number,
) {
  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fontSize = Math.round(width * 0.055);
  ctx.font = `600 ${fontSize}px ${fontFamily}`;

  const maxWidth = width * 0.82;
  const lines = wrapText(ctx, scene.text, maxWidth);
  const lineHeight = fontSize * 1.4;
  const totalHeight = lines.length * lineHeight;
  const startY = height * 0.5 - totalHeight / 2;

  lines.forEach((line, i) => {
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = textColor;
    ctx.fillText(line, width / 2, startY + i * lineHeight + lineHeight / 2);
  });

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawCaption(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  sceneElapsed: number,
  width: number,
  height: number,
  textColor: string,
  accentColor: string,
  fontFamily: string,
  style: CaptionStyle,
  alpha: number,
) {
  switch (style) {
    case 'karaoke':
      drawKaraokeCaption(ctx, scene, sceneElapsed, width, height, textColor, accentColor, fontFamily, alpha);
      break;
    case 'highlight':
      drawHighlightCaption(ctx, scene, sceneElapsed, width, height, textColor, accentColor, fontFamily, alpha);
      break;
    case 'minimal':
      drawMinimalCaption(ctx, scene, width, height, textColor, fontFamily, alpha);
      break;
    case 'classic':
    default:
      drawClassicCaption(ctx, scene, width, height, textColor, fontFamily, alpha);
      break;
  }
}

function drawGradientBg(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sceneIndex: number,
  accentColor: string,
) {
  const hue = (sceneIndex * 50 + 200) % 360;
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, `hsl(${hue}, 45%, 18%)`);
  grad.addColorStop(0.5, `hsl(${hue + 20}, 55%, 12%)`);
  grad.addColorStop(1, `hsl(${hue + 40}, 40%, 8%)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  const radial = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width * 0.7);
  radial.addColorStop(0, 'rgba(255,255,255,0.06)');
  radial.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, width, height);
}

function drawProgressBar(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
  accentColor: string,
) {
  const barHeight = 6;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(0, height - barHeight, width, barHeight);
  ctx.fillStyle = accentColor;
  ctx.fillRect(0, height - barHeight, (progress / 100) * width, barHeight);
}

function drawWatermark(
  ctx: CanvasRenderingContext2D,
  text: string,
  position: string,
  width: number,
  height: number,
  textColor: string,
) {
  ctx.save();
  ctx.font = 'bold 20px sans-serif';
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = textColor;
  const padding = 24;
  const textWidth = ctx.measureText(text).width;
  let x = padding;
  let y = height - padding;
  if (position === 'bottom-right') { x = width - textWidth - padding; y = height - padding; }
  else if (position === 'top-left') { x = padding; y = 40; }
  else if (position === 'top-right') { x = width - textWidth - padding; y = 40; }
  else if (position === 'bottom-left') { x = padding; y = height - padding; }
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawSceneDots(
  ctx: CanvasRenderingContext2D,
  sceneIndex: number,
  totalScenes: number,
  width: number,
  height: number,
  accentColor: string,
) {
  const dotSpacing = 18;
  const dotsTotalWidth = totalScenes * dotSpacing;
  const dotsStartX = (width - dotsTotalWidth) / 2;
  const dotsY = height - 40;
  for (let i = 0; i < totalScenes; i++) {
    ctx.beginPath();
    const r = i === sceneIndex ? 5 : 3;
    ctx.arc(dotsStartX + i * dotSpacing + dotSpacing / 2, dotsY, r, 0, Math.PI * 2);
    ctx.fillStyle = i === sceneIndex ? accentColor : 'rgba(255,255,255,0.22)';
    ctx.fill();
  }
}

function getMotionParams(
  motionStyle: MotionStyle,
  sceneProgress: number,
): { scale: number; panX: number; panY: number } {
  const t = easeInOut(clamp(sceneProgress, 0, 1));
  switch (motionStyle) {
    case 'zoom_in':
      return { scale: 1 + t * 0.2, panX: 0, panY: 0 };
    case 'zoom_out':
      return { scale: 1.2 - t * 0.2, panX: 0, panY: 0 };
    case 'pan': {
      const panRange = 40;
      return { scale: 1.15, panX: -panRange + t * panRange * 2, panY: 0 };
    }
    case 'static':
      return { scale: 1, panX: 0, panY: 0 };
    case 'kenburns':
    default:
      return { scale: 1 + t * 0.15, panX: 0, panY: 0 };
  }
}

interface SceneMedia {
  image: HTMLImageElement | null;
  video: HTMLVideoElement | null;
}

export async function renderVideo(
  scenes: Scene[],
  audioBlob: Blob | null,
  options: RenderOptions = {},
): Promise<RenderResult> {
  const width = options.width ?? 1080;
  const height = options.height ?? 1920;
  const opts = {
    width,
    height,
    backgroundColor: options.backgroundColor ?? DEFAULT_BG,
    textColor: options.textColor ?? DEFAULT_TEXT,
    accentColor: options.accentColor ?? DEFAULT_ACCENT,
    fontFamily: options.fontFamily ?? DEFAULT_FONT,
    captionStyle: options.captionStyle ?? 'karaoke',
    transitionStyle: options.transitionStyle ?? 'crossfade',
    motionStyle: options.motionStyle ?? 'kenburns',
    musicVolume: options.musicVolume ?? 0.3,
    showSubtitles: options.showSubtitles ?? true,
    captionTextColor: options.captionTextColor ?? null,
    captionHighlightColor: options.captionHighlightColor ?? null,
    beatSync: options.beatSync ?? false,
  };

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  const renderCtx: CanvasRenderingContext2D = ctx;

  const sceneMedia: SceneMedia[] = [];
  for (const scene of scenes) {
    if (scene.videoUrl) {
      const video = await loadVideo(scene.videoUrl);
      if (video) {
        sceneMedia.push({ image: null, video });
        continue;
      }
    }
    if (scene.imageUrl) {
      const img = await loadImage(scene.imageUrl);
      sceneMedia.push({ image: img, video: null });
    } else {
      sceneMedia.push({ image: null, video: null });
    }
  }

  let audioCtx: AudioContext | null = null;
  let audioBuffer: AudioBuffer | null = null;
  let audioSource: AudioBufferSourceNode | null = null;
  let audioDestination: MediaStreamAudioDestinationNode | null = null;
  let musicBuffer: AudioBuffer | null = null;
  let musicSource: AudioBufferSourceNode | null = null;
  let musicGain: GainNode | null = null;

  if ((audioBlob && audioBlob.size > 0) || (options.musicBlob && options.musicBlob.size > 0)) {
    audioCtx = new AudioContext();
    audioDestination = audioCtx.createMediaStreamDestination();

    if (audioBlob && audioBlob.size > 0) {
      const arrayBuffer = await audioBlob.arrayBuffer();
      audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    }

    if (options.musicBlob && options.musicBlob.size > 0) {
      const musicArrayBuffer = await options.musicBlob.arrayBuffer();
      try {
        musicBuffer = await audioCtx.decodeAudioData(musicArrayBuffer);
      } catch {
        musicBuffer = null;
      }
    }
  }

  const sceneDurations = scenes.map((s) => s.duration || 5);
  const totalFromScenes = sceneDurations.reduce((a, b) => a + b, 0);
  const audioDuration = audioBuffer ? audioBuffer.duration : 0;
  const totalDuration = audioBlob && audioDuration > 0 ? Math.max(totalFromScenes, audioDuration) : totalFromScenes;

  const canvasStream = canvas.captureStream(30);
  const combinedStream = new MediaStream();
  canvasStream.getVideoTracks().forEach((track) => combinedStream.addTrack(track));
  if (audioDestination) {
    audioDestination.stream.getAudioTracks().forEach((track) => combinedStream.addTrack(track));
  }

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
    ? 'video/webm;codecs=vp9,opus'
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
      ? 'video/webm;codecs=vp8,opus'
      : 'video/webm';

  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return new Promise<RenderResult>((resolve, reject) => {
    recorder.onstop = () => {
      if (audioCtx) audioCtx.close();
      const videoBlob = new Blob(chunks, { type: 'video/webm' });
      resolve({ videoBlob, duration: totalDuration });
    };
    recorder.onerror = (e) => reject(e);

    recorder.start(100);

    if (audioCtx && audioBuffer && audioDestination) {
      audioSource = audioCtx.createBufferSource();
      audioSource.buffer = audioBuffer;
      audioSource.connect(audioDestination);
      audioSource.start();
    }

    if (audioCtx && musicBuffer && audioDestination) {
      musicSource = audioCtx.createBufferSource();
      musicSource.buffer = musicBuffer;
      musicSource.loop = true;
      musicGain = audioCtx.createGain();
      musicGain.gain.value = opts.musicVolume;
      musicSource.connect(musicGain);
      musicGain.connect(audioDestination);
      musicSource.start();
    }

    const fps = 30;
    const totalFrames = Math.round(totalDuration * fps);
    let currentFrame = 0;
    let currentSceneIndex = 0;
    let sceneElapsed = 0;
    let transitionAlpha = 0;
    let prevSceneIndex = -1;

    function renderFrame() {
      if (currentFrame >= totalFrames) {
        if (audioSource) audioSource.stop();
        if (musicSource) musicSource.stop();
        recorder.stop();
        return;
      }

      const currentTime = currentFrame / fps;

      let sceneStart = 0;
      let newSceneIndex = 0;
      for (let i = 0; i < scenes.length; i++) {
        const sceneEnd = sceneStart + (scenes[i].duration || 5);
        if (currentTime >= sceneStart && currentTime < sceneEnd) {
          newSceneIndex = i;
          sceneElapsed = currentTime - sceneStart;
          break;
        }
        sceneStart = sceneEnd;
      }

      if (newSceneIndex !== currentSceneIndex && currentFrame > 0) {
        prevSceneIndex = currentSceneIndex;
        currentSceneIndex = newSceneIndex;
        transitionAlpha = 1;
      }
      currentSceneIndex = newSceneIndex;

      const currentScene = scenes[currentSceneIndex];
      const sceneDuration = currentScene.duration || 5;
      const sceneProgress = sceneElapsed / sceneDuration;
      const overallProgress = (currentFrame / totalFrames) * 100;

      const { scale, panX, panY } = getMotionParams(opts.motionStyle, sceneProgress);

      renderCtx.fillStyle = opts.backgroundColor;
      renderCtx.fillRect(0, 0, width, height);

      const media = sceneMedia[currentSceneIndex];
      if (media?.video) {
        drawImageCover(renderCtx, media.video, 0, 0, width, height, scale, panX, panY);
      } else if (media?.image) {
        drawImageCover(renderCtx, media.image, 0, 0, width, height, scale, panX, panY);
      } else {
        drawGradientBg(renderCtx, width, height, currentSceneIndex, opts.accentColor);
      }

      const textAlpha = sceneElapsed < 0.3
        ? easeOutCubic(sceneElapsed / 0.3)
        : sceneElapsed > sceneDuration - 0.3
          ? 1 - easeOutCubic((sceneElapsed - (sceneDuration - 0.3)) / 0.3)
          : 1;

      if (opts.showSubtitles) {
        drawCaption(
          renderCtx,
          currentScene,
          sceneElapsed,
          width,
          height,
          opts.captionTextColor ?? opts.textColor,
          opts.captionHighlightColor ?? opts.accentColor,
          opts.fontFamily,
          opts.captionStyle,
          Math.max(0, Math.min(1, textAlpha)),
        );
      }

      if (transitionAlpha > 0 && prevSceneIndex >= 0) {
        const transDuration = 0.4;
        const transProgress = 1 - transitionAlpha;
        const easedTrans = easeInOut(clamp(transProgress, 0, 1));

        if (opts.transitionStyle === 'slide') {
          const slideX = (1 - easedTrans) * width;
          renderCtx.fillStyle = opts.backgroundColor;
          renderCtx.fillRect(0, 0, width, height);
          const prevMedia = sceneMedia[prevSceneIndex];
          if (prevMedia?.video) {
            drawImageCover(renderCtx, prevMedia.video, -width + slideX, 0, width, height, scale, panX, panY);
          } else if (prevMedia?.image) {
            drawImageCover(renderCtx, prevMedia.image, -width + slideX, 0, width, height, scale, panX, panY);
          } else {
            drawGradientBg(renderCtx, width, height, prevSceneIndex, opts.accentColor);
          }
          const currMedia = sceneMedia[currentSceneIndex];
          if (currMedia?.video) {
            drawImageCover(renderCtx, currMedia.video, slideX, 0, width, height, scale, panX, panY);
          } else if (currMedia?.image) {
            drawImageCover(renderCtx, currMedia.image, slideX, 0, width, height, scale, panX, panY);
          } else {
            drawGradientBg(renderCtx, width, height, currentSceneIndex, opts.accentColor);
          }
          if (opts.showSubtitles) {
            drawCaption(renderCtx, currentScene, sceneElapsed, width, height, opts.captionTextColor ?? opts.textColor, opts.captionHighlightColor ?? opts.accentColor, opts.fontFamily, opts.captionStyle, textAlpha);
          }
        } else if (opts.transitionStyle === 'zoom') {
          const zoomScale = 1 + (1 - easedTrans) * 0.5;
          const fadeAlpha = easedTrans;
          renderCtx.fillStyle = `rgba(10,10,15,${1 - fadeAlpha})`;
          renderCtx.fillRect(0, 0, width, height);
          const currMedia = sceneMedia[currentSceneIndex];
          if (currMedia?.video) {
            drawImageCover(renderCtx, currMedia.video, 0, 0, width, height, zoomScale * scale, panX, panY);
          } else if (currMedia?.image) {
            drawImageCover(renderCtx, currMedia.image, 0, 0, width, height, zoomScale * scale, panX, panY);
          }
          if (opts.showSubtitles) {
            drawCaption(renderCtx, currentScene, sceneElapsed, width, height, opts.captionTextColor ?? opts.textColor, opts.captionHighlightColor ?? opts.accentColor, opts.fontFamily, opts.captionStyle, textAlpha * fadeAlpha);
          }
        } else if (opts.transitionStyle === 'fadeblack') {
          renderCtx.fillStyle = `rgba(0,0,0,${transitionAlpha * 0.85})`;
          renderCtx.fillRect(0, 0, width, height);
        } else if (opts.transitionStyle === 'glitch') {
          // Glitch effect: RGB split + horizontal slices
          const glitchAmount = transitionAlpha * 20;
          renderCtx.fillStyle = `rgba(255,0,80,${transitionAlpha * 0.3})`;
          renderCtx.fillRect(-glitchAmount, 0, width, height);
          renderCtx.fillStyle = `rgba(0,255,200,${transitionAlpha * 0.3})`;
          renderCtx.fillRect(glitchAmount, 0, width, height);
          for (let g = 0; g < 5; g++) {
            const sliceY = Math.random() * height;
            const sliceH = 10 + Math.random() * 30;
            const sliceX = (Math.random() - 0.5) * glitchAmount * 2;
            renderCtx.fillStyle = `rgba(255,255,255,${transitionAlpha * 0.1})`;
            renderCtx.fillRect(sliceX, sliceY, width, sliceH);
          }
        } else if (opts.transitionStyle === 'shake') {
          // Camera shake: offset the entire frame
          const shakeX = (Math.random() - 0.5) * transitionAlpha * 30;
          const shakeY = (Math.random() - 0.5) * transitionAlpha * 30;
          renderCtx.save();
          renderCtx.translate(shakeX, shakeY);
          renderCtx.fillStyle = opts.backgroundColor;
          renderCtx.fillRect(-50, -50, width + 100, height + 100);
          const currMedia = sceneMedia[currentSceneIndex];
          if (currMedia?.video) {
            drawImageCover(renderCtx, currMedia.video, 0, 0, width, height, scale, panX, panY);
          } else if (currMedia?.image) {
            drawImageCover(renderCtx, currMedia.image, 0, 0, width, height, scale, panX, panY);
          }
          renderCtx.restore();
        } else if (opts.transitionStyle === 'whippan') {
          // Whip pan: horizontal motion blur effect
          const panOffset = (1 - easedTrans) * width * 2 * (prevSceneIndex < currentSceneIndex ? 1 : -1);
          renderCtx.fillStyle = opts.backgroundColor;
          renderCtx.fillRect(0, 0, width, height);
          renderCtx.save();
          for (let w = 0; w < 3; w++) {
            renderCtx.globalAlpha = 0.3 - w * 0.1;
            const offset = panOffset * (1 + w * 0.3);
            const currMedia = sceneMedia[currentSceneIndex];
            if (currMedia?.image) {
              drawImageCover(renderCtx, currMedia.image, offset, 0, width, height, scale, panX, panY);
            }
          }
          renderCtx.restore();
          renderCtx.globalAlpha = 1;
        } else if (opts.transitionStyle === 'none') {
          // no transition
        } else {
          // crossfade
          renderCtx.fillStyle = `rgba(10,10,15,${transitionAlpha * 0.6})`;
          renderCtx.fillRect(0, 0, width, height);
        }

        transitionAlpha -= 1 / (transDuration * fps);
        if (transitionAlpha < 0) transitionAlpha = 0;
      }

      if (options.watermarkText) {
        drawWatermark(renderCtx, options.watermarkText, options.watermarkPosition ?? 'bottom-right', width, height, opts.textColor);
      }

      drawProgressBar(renderCtx, width, height, overallProgress, opts.accentColor);
      drawSceneDots(renderCtx, currentSceneIndex, scenes.length, width, height, opts.accentColor);

      options.onProgress?.(Math.round(overallProgress));

      currentFrame++;
      setTimeout(renderFrame, 1000 / fps);
    }

    renderFrame();
  });
}
