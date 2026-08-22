export const MIN_VIDEO_WIDTH = 720;
export const MIN_VIDEO_HEIGHT = 1280;
export const MAX_VIDEO_WIDTH = 1080;
export const MAX_VIDEO_HEIGHT = 1920;

export interface VideoFile { id?: unknown; link?: unknown; file_type?: unknown; width?: unknown; height?: unknown; fps?: unknown; quality?: unknown }
export interface PexelsVideo { id?: unknown; url?: unknown; user?: { name?: unknown }; video_files?: unknown }
type AcceptedVideoFile = VideoFile & { id: number; link: string; width: number; height: number; fps: number };

function isApprovedUrl(value: unknown, host: string): value is string {
  if (typeof value !== "string" || value.length > 2_000) return false;
  try { const url = new URL(value); return url.protocol === "https:" && url.hostname === host && !url.username && !url.password && !url.hash; } catch { return false; }
}

/** Initial candidates are accepted only from the server-resolved Pexels delivery host. */
export function isServerResolvedPexelsVideoUrl(value: unknown): value is string { return isApprovedUrl(value, "videos.pexels.com"); }

/** Redirects remain limited to exact provider-established delivery hosts. */
export function isTrustedVideoDownloadUrl(value: unknown): value is string {
  return isServerResolvedPexelsVideoUrl(value) || isApprovedUrl(value, "player.vimeo.com") || isApprovedUrl(value, "vod-progressive.akamaized.net");
}

export function selectPexelsVideoCandidate(video: PexelsVideo, mediaId: number): Required<Pick<VideoFile, "link">> | null {
  if (video.id !== mediaId || !Array.isArray(video.video_files)) return null;
  const files = video.video_files.filter((value): value is VideoFile => Boolean(value) && typeof value === "object")
    .map(toAcceptedVideoFile).filter((value): value is AcceptedVideoFile => value !== null);
  files.sort((left, right) => (right.width * right.height) - (left.width * left.height) || left.id - right.id);
  const selected = files[0];
  return selected?.link ? { link: selected.link } : null;
}

function toAcceptedVideoFile(file: VideoFile): AcceptedVideoFile | null {
  const id = safeInteger(file.id);
  const width = safeInteger(file.width);
  const height = safeInteger(file.height);
  const fps = finiteNumber(file.fps);
  // Provider quality labels are optional metadata; actual media authority is
  // the trusted post-quarantine FFprobe validation.
  if (file.file_type !== "video/mp4" || !isServerResolvedPexelsVideoUrl(file.link)
    || id === null || width === null || height === null || fps === null
    || width < MIN_VIDEO_WIDTH || height < MIN_VIDEO_HEIGHT || height <= width
    || width > MAX_VIDEO_WIDTH || height > MAX_VIDEO_HEIGHT || fps <= 0 || fps > 60) return null;
  return { ...file, id, link: file.link, width, height, fps };
}
function safeInteger(value: unknown): number | null { return typeof value === "number" && Number.isSafeInteger(value) ? value : null; }
function finiteNumber(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
