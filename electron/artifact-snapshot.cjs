const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

class ArtifactSnapshotError extends Error {
  constructor(code, message) { super(message); this.name = 'ArtifactSnapshotError'; this.code = code; this.status = 409; this.retryable = false; }
}

function identity(stat) { return { dev: String(stat.dev), ino: String(stat.ino), size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs }; }
function sameIdentity(left, right) { return left.dev === String(right.dev) && left.ino === String(right.ino) && left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs; }

function createArtifactSnapshotStore({ directory, fsApi = fs, randomUUID = crypto.randomUUID } = {}) {
  if (!directory || !path.isAbsolute(directory)) throw new TypeError('A trusted absolute snapshot directory is required.');
  const root = path.resolve(directory);
  const inspectSource = async (sourcePath) => {
    let stat; try { stat = await fsApi.lstat(sourcePath); } catch (error) { if (error?.code === 'ENOENT') throw new ArtifactSnapshotError('artifact-missing', 'The artifact is no longer available.'); throw new ArtifactSnapshotError('artifact-unreadable', 'The artifact cannot be read safely.'); }
    if (!stat.isFile() || stat.isSymbolicLink()) throw new ArtifactSnapshotError('artifact-unreadable', 'The artifact is not a readable regular file.');
    return stat;
  };
  const assertManagedPath = (snapshotPath) => {
    const resolved = path.resolve(snapshotPath);
    if (path.dirname(resolved) !== root || !/^snapshot-[0-9a-f-]{36}\.bin$/i.test(path.basename(resolved))) throw new ArtifactSnapshotError('artifact-snapshot-invalid', 'The trusted artifact snapshot reference is invalid.');
    return resolved;
  };
  const remove = async (snapshotPath) => {
    const resolved = assertManagedPath(snapshotPath);
    try { await fsApi.chmod(resolved, 0o600); } catch {}
    try { await fsApi.rm(resolved, { force: true }); return true; } catch { return false; }
  };
  const ownedSnapshotName = (name) => /^snapshot-[0-9a-f-]{36}\.bin$/i.test(name) || /^\.snapshot-[0-9a-f-]{36}\.tmp$/i.test(name);
  return {
    directory: root,
    async create(sourcePath) {
      const before = await inspectSource(sourcePath);
      await fsApi.mkdir(root, { recursive: true, mode: 0o700 });
      const id = randomUUID(); const temporaryPath = path.join(root, `.snapshot-${id}.tmp`); const snapshotPath = path.join(root, `snapshot-${id}.bin`);
      try {
        await fsApi.copyFile(sourcePath, temporaryPath);
        const copied = await fsApi.lstat(temporaryPath);
        if (!copied.isFile() || copied.isSymbolicLink() || copied.size !== before.size) throw new ArtifactSnapshotError('artifact-integrity-mismatch', 'The artifact changed while its trusted snapshot was created.');
        const after = await inspectSource(sourcePath);
        if (!sameIdentity(identity(before), after)) throw new ArtifactSnapshotError('artifact-integrity-mismatch', 'The artifact changed while its trusted snapshot was created.');
        await fsApi.chmod(temporaryPath, 0o400);
        await fsApi.rename(temporaryPath, snapshotPath);
        return { sourcePath, snapshotPath, sizeBytes: copied.size, sourceIdentity: identity(after) };
      } catch (error) {
        try { await fsApi.chmod(temporaryPath, 0o600); } catch {}
        try { await fsApi.rm(temporaryPath, { force: true }); } catch {}
        try { await fsApi.rm(snapshotPath, { force: true }); } catch {}
        if (error instanceof ArtifactSnapshotError) throw error;
        throw new ArtifactSnapshotError('artifact-snapshot-failed', 'A trusted artifact snapshot could not be created.');
      }
    },
    async assertSourceUnchanged(snapshot) {
      const current = await inspectSource(snapshot.sourcePath);
      if (!sameIdentity(snapshot.sourceIdentity, current)) throw new ArtifactSnapshotError('artifact-integrity-mismatch', 'The artifact changed during verification. Re-export it before publishing.');
      return true;
    },
    assertManagedPath,
    async cleanupOrphans(referencedPaths = []) {
      const referenced = new Set();
      for (const candidate of referencedPaths) {
        try { referenced.add(assertManagedPath(candidate)); } catch { /* Invalid checkpoint paths are never deletion authority. */ }
      }
      let entries;
      try { entries = await fsApi.readdir(root, { withFileTypes: true }); }
      catch (error) { if (error?.code === 'ENOENT') return { removed: 0, failed: 0 }; throw new ArtifactSnapshotError('artifact-snapshot-cleanup-failed', 'Trusted upload snapshots could not be inspected.'); }
      let removed = 0; let failed = 0;
      for (const entry of entries) {
        const name = typeof entry === 'string' ? entry : entry.name;
        const regularFile = typeof entry === 'string' || entry.isFile();
        if (!regularFile || !ownedSnapshotName(name)) continue;
        const candidate = path.join(root, name);
        if (referenced.has(candidate)) continue;
        try { await fsApi.chmod(candidate, 0o600); } catch {}
        try { await fsApi.rm(candidate, { force: true }); removed += 1; } catch { failed += 1; }
      }
      return { removed, failed };
    },
    remove,
  };
}

module.exports = { ArtifactSnapshotError, createArtifactSnapshotStore };
