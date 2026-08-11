const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const mutationQueues = new Map();

class YouTubeCheckpointError extends Error {
  constructor(code, message) { super(message); this.name = 'YouTubeCheckpointError'; this.code = code; this.status = 503; this.retryable = true; }
}

function createYouTubeUploadCheckpointStore({ userDataPath, safeStorage, fsApi = fs }) {
  const filePath = path.join(userDataPath, 'youtube-upload-checkpoints.v1');
  const assertSecure = () => {
    if (!safeStorage?.isEncryptionAvailable?.() || safeStorage.getSelectedStorageBackend?.() === 'basic_text') {
      throw new YouTubeCheckpointError('secure-storage-unavailable', 'Secure upload recovery storage is unavailable on this system.');
    }
  };
  const read = async () => {
    assertSecure();
    try { return JSON.parse(await fsApi.readFile(filePath, 'utf8')); }
    catch (error) { if (error?.code === 'ENOENT') return {}; throw new YouTubeCheckpointError('upload-checkpoint-storage-failed', 'YouTube upload recovery state could not be read.'); }
  };
  const write = async (records) => {
    assertSecure();
    await fsApi.mkdir(userDataPath, { recursive: true, mode: 0o700 });
    const temporary = `${filePath}.${crypto.randomUUID()}.tmp`;
    try { await fsApi.writeFile(temporary, JSON.stringify(records), { mode: 0o600 }); await fsApi.rename(temporary, filePath); }
    catch { try { await fsApi.unlink(temporary); } catch {} throw new YouTubeCheckpointError('upload-checkpoint-storage-failed', 'YouTube upload recovery state could not be saved.'); }
  };
  const mutate = (operation) => {
    const previous = mutationQueues.get(filePath) || Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    mutationQueues.set(filePath, current.catch(() => undefined));
    return current;
  };
  const encrypt = (value) => safeStorage.encryptString(JSON.stringify(value)).toString('base64');
  const decrypt = (value) => JSON.parse(safeStorage.decryptString(Buffer.from(value, 'base64')));
  return {
    async get(key) { const records = await read(); const record = records[key]; if (!record?.encrypted) return null; try { return decrypt(record.encrypted); } catch { throw new YouTubeCheckpointError('upload-checkpoint-storage-failed', 'YouTube upload recovery state could not be decrypted.'); } },
    async list() { const records = await read(); const checkpoints = []; try { for (const record of Object.values(records)) if (record?.encrypted) checkpoints.push(decrypt(record.encrypted)); return checkpoints; } catch { throw new YouTubeCheckpointError('upload-checkpoint-storage-failed', 'YouTube upload recovery state could not be decrypted.'); } },
    async put(key, checkpoint) { return mutate(async () => { const records = await read(); records[key] = { version: 1, encrypted: encrypt(checkpoint), updatedAt: new Date().toISOString() }; await write(records); return checkpoint; }); },
    async remove(key) { return mutate(async () => { const records = await read(); const existed = Boolean(records[key]); delete records[key]; await write(records); return existed; }); },
    filePath,
  };
}

module.exports = { YouTubeCheckpointError, createYouTubeUploadCheckpointStore };
