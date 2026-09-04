const path = require('path');
const { validateCanonicalRenderRequest } = require('./canonical-render-intent.cjs');

// Kept as an internal compatibility export for existing main-process callers
// and tests. It now validates a semantic declaration and categorically rejects
// renderer-authored argv, paths embedded in filters, and all legacy raw fields.
const validateFFmpegRunRequest = validateCanonicalRenderRequest;

function validateTargetPath(targetPath, fieldName = 'targetPath') {
  if (typeof targetPath !== 'string' || !targetPath || targetPath.includes('\0')) {
    throw new TypeError(`Invalid ${fieldName}.`);
  }
  if (!path.isAbsolute(targetPath)) throw new TypeError(`${fieldName} must be absolute.`);
  return path.normalize(targetPath);
}

function validateArtifactIntegrityRequest(artifact) {
  if (!artifact || typeof artifact !== 'object') throw new TypeError('Artifact integrity request is required.');
  const artifactPath = validateTargetPath(artifact.artifactPath, 'artifactPath');
  if (!Number.isSafeInteger(artifact.sizeBytes) || artifact.sizeBytes < 0) throw new TypeError('Invalid artifact size.');
  if (typeof artifact.contentDigest !== 'string' || !/^[a-f0-9]{64}$/.test(artifact.contentDigest)) {
    throw new TypeError('Invalid artifact content digest.');
  }
  return { artifactPath, sizeBytes: artifact.sizeBytes, contentDigest: artifact.contentDigest };
}

module.exports = { validateFFmpegRunRequest, validateTargetPath, validateArtifactIntegrityRequest };
