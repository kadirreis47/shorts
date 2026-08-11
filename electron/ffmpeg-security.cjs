const path = require('path');

function validateFFmpegRunRequest(request) {
  if (!request || typeof request !== 'object') throw new TypeError('FFmpeg request is required.');
  if (typeof request.jobId !== 'string' || !/^[a-z0-9_-]{1,128}$/i.test(request.jobId)) {
    throw new TypeError('Invalid FFmpeg jobId.');
  }
  if (!Array.isArray(request.args) || request.args.length === 0 || request.args.length > 512) {
    throw new TypeError('FFmpeg args must be a non-empty bounded array.');
  }
  if (request.args.some((arg) => typeof arg !== 'string' || arg.length > 16_384 || arg.includes('\0'))) {
    throw new TypeError('Invalid FFmpeg argument.');
  }
  if (request.outputPath !== undefined) validateTargetPath(request.outputPath, 'outputPath');
  if (request.subtitleContent !== undefined && typeof request.subtitleContent !== 'string') {
    throw new TypeError('subtitleContent must be a string.');
  }
  if (request.concatContent !== undefined && typeof request.concatContent !== 'string') {
    throw new TypeError('concatContent must be a string.');
  }
  return request;
}

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
