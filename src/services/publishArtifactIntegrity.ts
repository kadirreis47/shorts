import type { PublishArtifactBinding } from '@/core/publishing';

export interface RevalidatedPublishArtifact {
  artifactPath: string;
  sizeBytes: number;
  contentDigest: string;
}

export class PublishArtifactIntegrityError extends Error {
  readonly retryable = false;
  readonly status = 409;

  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'PublishArtifactIntegrityError';
  }
}

/** Runs in the renderer only as a narrow request to the trusted Electron filesystem bridge. */
export async function revalidatePublishArtifact(artifact: PublishArtifactBinding): Promise<RevalidatedPublishArtifact> {
  const digest = artifact.contentDigest;
  if (!digest || !/^[a-f0-9]{64}$/.test(digest)) {
    throw new PublishArtifactIntegrityError('artifact-integrity-mismatch', 'Verified export is missing its content digest. Re-export and approve it again.');
  }
  const bridge = window.electronAPI?.ffmpeg;
  if (!bridge?.revalidateArtifact) {
    throw new PublishArtifactIntegrityError('artifact-integrity-unavailable', 'Trusted artifact integrity validation is unavailable.');
  }
  const response = await bridge.revalidateArtifact({ artifactPath: artifact.artifactPath, sizeBytes: artifact.sizeBytes, contentDigest: digest });
  if (!response.ok) throw new PublishArtifactIntegrityError(response.error.code, response.error.message);
  const actual = response.artifact;
  if (actual.artifactPath !== artifact.artifactPath || actual.sizeBytes !== artifact.sizeBytes || actual.contentDigest !== digest) {
    throw new PublishArtifactIntegrityError('artifact-integrity-mismatch', 'Verified export no longer matches the approved artifact.');
  }
  return actual;
}
