export const MAX_MANUAL_SCENE_IMAGE_BYTES = 20 * 1024 * 1024;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const JPEG_HEADER_BYTES = 6;
const JPEG_EOI = [0xff, 0xd9] as const;

export type ManualSceneImageImportErrorCode =
  | 'selection'
  | 'mime'
  | 'empty'
  | 'too-large'
  | 'signature';

export class ManualSceneImageImportError extends Error {
  constructor(readonly code: ManualSceneImageImportErrorCode) {
    super(`Manual scene image import failed: ${code}`);
  }
}

/**
 * Validates the only user-imported visual formats supported by this bounded
 * slice. The Blob remains transient; callers upload it only after this check.
 */
export async function validateManualSceneImage(file: Blob): Promise<void> {
  if (file.type !== 'image/png' && file.type !== 'image/jpeg') throw new ManualSceneImageImportError('mime');
  if (!Number.isSafeInteger(file.size) || file.size <= 0) throw new ManualSceneImageImportError('empty');
  if (file.size > MAX_MANUAL_SCENE_IMAGE_BYTES) throw new ManualSceneImageImportError('too-large');

  if (file.type === 'image/png') {
    const bytes = new Uint8Array(await file.slice(0, PNG_SIGNATURE.length).arrayBuffer());
    if (bytes.length !== PNG_SIGNATURE.length || PNG_SIGNATURE.some((value, index) => bytes[index] !== value)) {
      throw new ManualSceneImageImportError('signature');
    }
    return;
  }

  const [opening, ending] = await Promise.all([
    file.slice(0, JPEG_HEADER_BYTES).arrayBuffer(),
    file.slice(Math.max(0, file.size - JPEG_EOI.length), file.size).arrayBuffer(),
  ]);
  const openingBytes = new Uint8Array(opening);
  const endingBytes = new Uint8Array(ending);
  const firstMarker = openingBytes[3];
  const firstSegmentLength = openingBytes[4] * 256 + openingBytes[5];
  if (
    openingBytes.length !== JPEG_HEADER_BYTES
    || endingBytes.length !== JPEG_EOI.length
    || openingBytes[0] !== 0xff
    || openingBytes[1] !== 0xd8
    || openingBytes[2] !== 0xff
    || firstMarker === 0x00
    || firstMarker === 0xd8
    || firstMarker === 0xd9
    || firstSegmentLength < 2
    || 4 + firstSegmentLength > file.size
    || JPEG_EOI.some((value, index) => endingBytes[index] !== value)
  ) throw new ManualSceneImageImportError('signature');
}

export function requireOneManualSceneImage(files: FileList | readonly File[] | null): File {
  if (!files || files.length !== 1) throw new ManualSceneImageImportError('selection');
  const file = 'item' in files ? files.item(0) : files[0];
  if (!file) throw new ManualSceneImageImportError('selection');
  return file;
}

export function isManualSceneImageImportError(error: unknown): error is ManualSceneImageImportError {
  return error instanceof ManualSceneImageImportError;
}
