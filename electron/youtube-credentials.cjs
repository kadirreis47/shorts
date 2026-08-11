const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const mutationQueues = new Map();

class YouTubeCredentialError extends Error {
  constructor(code, message) { super(message); this.name = 'YouTubeCredentialError'; this.code = code; }
}

function publicError(error) {
  if (error instanceof YouTubeCredentialError) return { code: error.code, message: error.message };
  return { code: 'youtube-provider-failure', message: 'YouTube account operation failed.' };
}

function createCredentialVault({ userDataPath, safeStorage, fsApi = fs }) {
  const filePath = path.join(userDataPath, 'youtube-credentials.v1');
  const assertSecureStorage = () => {
    if (!safeStorage?.isEncryptionAvailable?.() || safeStorage.getSelectedStorageBackend?.() === 'basic_text') {
      throw new YouTubeCredentialError('secure-storage-unavailable', 'Secure credential storage is unavailable on this system. Configure a supported OS keyring before connecting YouTube.');
    }
  };
  const records = async () => {
    assertSecureStorage();
    try { return JSON.parse(await fsApi.readFile(filePath, 'utf8')); } catch (error) { if (error?.code === 'ENOENT') return {}; throw new YouTubeCredentialError('credential-storage-failed', 'Credential storage could not be opened.'); }
  };
  const save = async (value) => {
    assertSecureStorage();
    await fsApi.mkdir(userDataPath, { recursive: true, mode: 0o700 });
    const temp = `${filePath}.${crypto.randomUUID()}.tmp`;
    try { await fsApi.writeFile(temp, JSON.stringify(value), { mode: 0o600 }); await fsApi.rename(temp, filePath); } catch { try { await fsApi.unlink(temp); } catch {} throw new YouTubeCredentialError('credential-storage-failed', 'Credential storage could not be updated.'); }
  };
  const encrypt = (material) => safeStorage.encryptString(JSON.stringify(material)).toString('base64');
  const decrypt = (value) => JSON.parse(safeStorage.decryptString(Buffer.from(value, 'base64')));
  const mutate = (operation) => {
    const previous = mutationQueues.get(filePath) || Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    mutationQueues.set(filePath, current.catch(() => undefined));
    return current;
  };
  return {
    async store(material) { return mutate(async () => { const all = await records(); const credentialRef = `youtube_${crypto.randomUUID()}`; all[credentialRef] = { version: 1, encrypted: encrypt(material), updatedAt: new Date().toISOString() }; await save(all); return credentialRef; }); },
    async resolve(credentialRef) { const all = await records(); const record = all[credentialRef]; if (!record?.encrypted) throw new YouTubeCredentialError('credential-missing', 'The connected YouTube account is no longer available. Reconnect it to continue.'); try { return decrypt(record.encrypted); } catch { throw new YouTubeCredentialError('credential-storage-failed', 'Stored YouTube credentials could not be read. Reconnect the account.'); } },
    async update(credentialRef, material) { return mutate(async () => { const all = await records(); if (!all[credentialRef]) throw new YouTubeCredentialError('credential-missing', 'The connected YouTube account is no longer available. Reconnect it to continue.'); all[credentialRef] = { version: 1, encrypted: encrypt(material), updatedAt: new Date().toISOString() }; await save(all); }); },
    async remove(credentialRef) { return mutate(async () => { const all = await records(); const existed = Boolean(all[credentialRef]); delete all[credentialRef]; await save(all); return existed; }); },
    async exists(credentialRef) { try { const all = await records(); return Boolean(all[credentialRef]); } catch (error) { if (error?.code === 'credential-missing') return false; throw error; } },
    filePath,
  };
}

function base64url(value) { return Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'); }
function createPkce() { const verifier = base64url(crypto.randomBytes(48)); return { verifier, challenge: base64url(crypto.createHash('sha256').update(verifier).digest()) }; }
function createState() { return base64url(crypto.randomBytes(32)); }

module.exports = { YouTubeCredentialError, publicError, createCredentialVault, createPkce, createState };
