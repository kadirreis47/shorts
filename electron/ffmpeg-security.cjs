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

module.exports = { validateFFmpegRunRequest, validateTargetPath };
