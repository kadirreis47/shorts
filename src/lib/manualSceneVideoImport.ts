export const MAX_MANUAL_SCENE_VIDEO_BYTES = 75 * 1024 * 1024;

export type ManualSceneVideoImportErrorCode =
  | 'selection' | 'mime' | 'empty' | 'too-large' | 'signature' | 'probe' | 'codec' | 'duration' | 'resolution' | 'fps';

export class ManualSceneVideoImportError extends Error {
  constructor(readonly code: ManualSceneVideoImportErrorCode) {
    super(`Manual scene video import failed: ${code}`);
  }
}

/** Early reject only. The native FFprobe boundary remains authoritative. */
export async function validateManualSceneVideo(file: Blob): Promise<void> {
  if (file.type !== 'video/mp4') throw new ManualSceneVideoImportError('mime');
  if (!Number.isSafeInteger(file.size) || file.size <= 0) throw new ManualSceneVideoImportError('empty');
  if (file.size > MAX_MANUAL_SCENE_VIDEO_BYTES) throw new ManualSceneVideoImportError('too-large');
  const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  if (bytes.length < 12 || String.fromCharCode(...bytes.slice(4, 8)) !== 'ftyp' || !hasMp4Brand(bytes)) {
    throw new ManualSceneVideoImportError('signature');
  }
}

function hasMp4Brand(bytes: Uint8Array): boolean {
  const allowed = new Set(['isom', 'iso2', 'avc1', 'mp41', 'mp42', 'dash']);
  for (let offset = 8; offset + 4 <= bytes.length; offset += 4) {
    const brand = String.fromCharCode(...bytes.slice(offset, offset + 4));
    if (allowed.has(brand)) return true;
  }
  return false;
}

export function requireOneManualSceneVideo(files: FileList | readonly File[] | null): File {
  if (!files || files.length !== 1) throw new ManualSceneVideoImportError('selection');
  const file = 'item' in files ? files.item(0) : files[0];
  if (!file) throw new ManualSceneVideoImportError('selection');
  return file;
}

export function isManualSceneVideoImportError(error: unknown): error is ManualSceneVideoImportError {
  return error instanceof ManualSceneVideoImportError;
}
