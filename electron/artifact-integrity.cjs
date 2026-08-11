const crypto = require('crypto');
const fs = require('fs');

class ArtifactIntegrityError extends Error {
  constructor(code, message) { super(message); this.name = 'ArtifactIntegrityError'; this.code = code; this.retryable = false; this.status = 409; }
}

async function inspectRegularReadableFile(artifactPath) {
  let stat;
  try { stat = await fs.promises.lstat(artifactPath); } catch (error) { if (error && error.code === 'ENOENT') throw new ArtifactIntegrityError('artifact-missing', 'The verified export artifact is no longer available. Re-export and approve it again.'); throw new ArtifactIntegrityError('artifact-unreadable', 'The verified export artifact cannot be read. Re-export and approve it again.'); }
  if (!stat.isFile() || stat.isSymbolicLink()) throw new ArtifactIntegrityError('artifact-unreadable', 'The verified export artifact is not a readable regular file.');
  try { await fs.promises.access(artifactPath, fs.constants.R_OK); } catch { throw new ArtifactIntegrityError('artifact-unreadable', 'The verified export artifact cannot be read. Re-export and approve it again.'); }
  return stat;
}

async function hashFileSha256(artifactPath) {
  const before = await inspectRegularReadableFile(artifactPath);
  const hash = crypto.createHash('sha256'); let bytesRead = 0;
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(artifactPath);
    stream.on('data', (chunk) => { bytesRead += chunk.length; hash.update(chunk); });
    stream.once('error', () => reject(new ArtifactIntegrityError('artifact-unreadable', 'The verified export artifact could not be read.')));
    stream.once('end', resolve);
  });
  const after = await inspectRegularReadableFile(artifactPath);
  if (before.size !== after.size || bytesRead !== before.size) throw new ArtifactIntegrityError('artifact-integrity-mismatch', 'The verified export artifact changed while it was being validated. Re-export and approve it again.');
  return { artifactPath, sizeBytes: before.size, contentDigest: hash.digest('hex') };
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

async function hashOpenFile(fileHandle, sizeBytes) {
  const hash = crypto.createHash('sha256'); let bytesRead = 0;
  await new Promise((resolve, reject) => {
    const stream = fileHandle.createReadStream({ start: 0, end: Math.max(0, sizeBytes - 1), autoClose: false });
    stream.on('data', (chunk) => { bytesRead += chunk.length; hash.update(chunk); });
    stream.once('error', () => reject(new ArtifactIntegrityError('artifact-unreadable', 'The verified export artifact could not be read.')));
    stream.once('end', resolve);
  });
  if (bytesRead !== sizeBytes) throw new ArtifactIntegrityError('artifact-integrity-mismatch', 'The verified export artifact changed while it was being validated. Re-export and approve it again.');
  return hash.digest('hex');
}

async function openVerifiedArtifact(artifact) {
  if (!artifact || typeof artifact.artifactPath !== 'string') throw new ArtifactIntegrityError('artifact-missing', 'The verified export artifact is unavailable.');
  if (!/^[a-f0-9]{64}$/.test(artifact.contentDigest ?? '')) throw new ArtifactIntegrityError('artifact-digest-missing', 'This export was verified before content integrity was available. Re-export and approve it again.');
  let pathStat; let fileHandle;
  try {
    pathStat = await fs.promises.lstat(artifact.artifactPath);
    if (!pathStat.isFile() || pathStat.isSymbolicLink()) throw new ArtifactIntegrityError('artifact-unreadable', 'The verified export artifact is not a readable regular file.');
    const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0);
    fileHandle = await fs.promises.open(artifact.artifactPath, flags);
  } catch (error) {
    if (error instanceof ArtifactIntegrityError) throw error;
    if (error?.code === 'ENOENT') throw new ArtifactIntegrityError('artifact-missing', 'The verified export artifact is no longer available. Re-export and approve it again.');
    throw new ArtifactIntegrityError('artifact-unreadable', 'The verified export artifact cannot be read. Re-export and approve it again.');
  }
  try {
    const before = await fileHandle.stat();
    if (!before.isFile() || !sameFileIdentity(pathStat, before)) throw new ArtifactIntegrityError('artifact-integrity-mismatch', 'The verified export artifact was replaced while it was being opened. Re-export and approve it again.');
    if (before.size !== artifact.sizeBytes) throw new ArtifactIntegrityError('artifact-integrity-mismatch', 'The verified export artifact no longer matches the approved bytes. Re-export and approve it again.');
    const contentDigest = await hashOpenFile(fileHandle, before.size);
    const after = await fileHandle.stat();
    if (!sameFileIdentity(before, after) || before.size !== after.size || after.size !== artifact.sizeBytes || contentDigest !== artifact.contentDigest) throw new ArtifactIntegrityError('artifact-integrity-mismatch', 'The verified export artifact no longer matches the approved bytes. Re-export and approve it again.');
    let closed = false;
    return {
      artifactPath: artifact.artifactPath,
      sizeBytes: after.size,
      contentDigest,
      createReadStream(start = 0) {
        if (closed) throw new ArtifactIntegrityError('artifact-unreadable', 'The verified export artifact is no longer open for publishing.');
        if (!Number.isSafeInteger(start) || start < 0 || start >= after.size) throw new ArtifactIntegrityError('artifact-integrity-mismatch', 'The verified export artifact upload offset is invalid.');
        return fileHandle.createReadStream({ start, end: after.size - 1, autoClose: false });
      },
      async assertUnchanged() {
        if (closed) throw new ArtifactIntegrityError('artifact-unreadable', 'The verified export artifact is no longer open for publishing.');
        const current = await fileHandle.stat();
        if (!sameFileIdentity(after, current) || current.size !== after.size || current.mtimeMs !== after.mtimeMs) throw new ArtifactIntegrityError('artifact-integrity-mismatch', 'The verified export artifact changed after validation. Re-export and approve it again.');
      },
      async close() { if (!closed) { closed = true; await fileHandle.close(); } },
    };
  } catch (error) { await fileHandle.close().catch(() => undefined); throw error; }
}

async function revalidateVerifiedArtifact(artifact) {
  if (!artifact || typeof artifact.artifactPath !== 'string') throw new ArtifactIntegrityError('artifact-missing', 'The verified export artifact is unavailable.');
  if (!/^[a-f0-9]{64}$/.test(artifact.contentDigest ?? '')) throw new ArtifactIntegrityError('artifact-digest-missing', 'This export was verified before content integrity was available. Re-export and approve it again.');
  const actual = await hashFileSha256(artifact.artifactPath);
  if (actual.sizeBytes !== artifact.sizeBytes || actual.contentDigest !== artifact.contentDigest) throw new ArtifactIntegrityError('artifact-integrity-mismatch', 'The verified export artifact no longer matches the approved bytes. Re-export and approve it again.');
  return actual;
}

module.exports = { ArtifactIntegrityError, hashFileSha256, openVerifiedArtifact, revalidateVerifiedArtifact };
