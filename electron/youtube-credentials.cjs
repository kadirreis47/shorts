const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const mutationQueues = new Map();
const SEALED_OWNER_FIELD = '__shortsflowOwnerId';

class YouTubeCredentialError extends Error {
  constructor(code, message) { super(message); this.name = 'YouTubeCredentialError'; this.code = code; }
}

function publicError(error) {
  if (error instanceof YouTubeCredentialError || error?.name === 'YouTubeOwnerError') return { code: error.code, message: error.message };
  return { code: 'youtube-provider-failure', message: 'YouTube account operation failed.' };
}

function createCredentialVault({ userDataPath, safeStorage, ownerContext, fsApi = fs }) {
  if (!ownerContext?.capture || !ownerContext?.assertCurrent || !ownerContext?.runCritical || !ownerContext?.assertCriticalCurrent) throw new TypeError('YouTube credential storage requires a validated owner context.');
  const filePath = path.join(userDataPath, 'youtube-credentials.v1');
  const unavailable = () => new YouTubeCredentialError('credential-unavailable', 'The YouTube connection is unavailable for this signed-in user. Reconnect YouTube to continue.');
  const assertSecureStorage = () => {
    if (!safeStorage?.isEncryptionAvailable?.() || safeStorage.getSelectedStorageBackend?.() === 'basic_text') {
      throw new YouTubeCredentialError('secure-storage-unavailable', 'Secure credential storage is unavailable on this system. Configure a supported OS keyring before connecting YouTube.');
    }
  };
  const records = async () => {
    assertSecureStorage();
    try { const parsed = JSON.parse(await fsApi.readFile(filePath, 'utf8')); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; } catch (error) { if (error?.code === 'ENOENT') return {}; throw new YouTubeCredentialError('credential-storage-failed', 'Credential storage could not be opened.'); }
  };
  const save = async (value) => {
    assertSecureStorage();
    await fsApi.mkdir(userDataPath, { recursive: true, mode: 0o700 });
    const temp = `${filePath}.${crypto.randomUUID()}.tmp`;
    try { await fsApi.writeFile(temp, JSON.stringify(value), { mode: 0o600 }); await fsApi.rename(temp, filePath); } catch { try { await fsApi.unlink(temp); } catch {} throw new YouTubeCredentialError('credential-storage-failed', 'Credential storage could not be updated.'); }
  };
  const encrypt = (material, ownerId) => safeStorage.encryptString(JSON.stringify({ ...material, [SEALED_OWNER_FIELD]: ownerId })).toString('base64');
  const decrypt = (value) => JSON.parse(safeStorage.decryptString(Buffer.from(value, 'base64')));
  const mutate = (operation) => {
    const previous = mutationQueues.get(filePath) || Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    mutationQueues.set(filePath, current.catch(() => undefined));
    return current;
  };
  const assertOwnedRecord = (record, context) => {
    ownerContext.assertCriticalCurrent(context);
    if (!record?.encrypted || record.ownerId !== context.ownerId) throw unavailable();
    return record;
  };
  const decode = (record, expectedOwnerId = null) => {
    try {
      const material = decrypt(record.encrypted);
      if (!material || typeof material !== 'object') throw new Error('invalid');
      const sealedOwnerId = material[SEALED_OWNER_FIELD];
      if (expectedOwnerId === null ? sealedOwnerId !== undefined : sealedOwnerId !== expectedOwnerId) throw unavailable();
      delete material[SEALED_OWNER_FIELD];
      return material;
    }
    catch (error) { if (error?.code === 'credential-unavailable') throw error; throw new YouTubeCredentialError('credential-storage-failed', 'Stored YouTube credentials could not be read. Reconnect the account.'); }
  };
  const withoutCallerOwnership = (material) => { const value = { ...material }; delete value.ownerId; delete value[SEALED_OWNER_FIELD]; return value; };
  return {
    async store(material, context = ownerContext.capture()) {
      return ownerContext.runCritical(context, () => mutate(async () => {
        ownerContext.assertCriticalCurrent(context);
        const all = await records();
        ownerContext.assertCriticalCurrent(context);
        const candidates = Object.entries(all).sort((left, right) => {
          const leftOwned = left[1]?.ownerId === context.ownerId ? 1 : 0;
          const rightOwned = right[1]?.ownerId === context.ownerId ? 1 : 0;
          if (leftOwned !== rightOwned) return rightOwned - leftOwned;
          return String(right[1]?.updatedAt || '').localeCompare(String(left[1]?.updatedAt || ''));
        });
        let credentialRef = null;
        for (const [candidateRef, record] of candidates) {
          if (record?.ownerId && record.ownerId !== context.ownerId) continue;
          try {
            const existing = decode(record, record?.ownerId ? context.ownerId : null);
            if (existing.channelId === material.channelId) { credentialRef = candidateRef; break; }
          } catch { /* A malformed record is never claimed or exposed. */ }
        }
        credentialRef ??= `youtube_${crypto.randomUUID()}`;
        ownerContext.assertCriticalCurrent(context);
        all[credentialRef] = { version: 2, ownerId: context.ownerId, encrypted: encrypt(withoutCallerOwnership(material), context.ownerId), updatedAt: new Date().toISOString() };
        await save(all);
        ownerContext.assertCriticalCurrent(context);
        return credentialRef;
      }));
    },
    async resolve(credentialRef, context = ownerContext.capture()) {
      ownerContext.assertCurrent(context);
      const all = await records();
      const material = decode(assertOwnedRecord(all[credentialRef], context), context.ownerId);
      ownerContext.assertCurrent(context);
      return material;
    },
    async update(credentialRef, material, context = ownerContext.capture()) {
      return ownerContext.runCritical(context, () => mutate(async () => {
        ownerContext.assertCriticalCurrent(context);
        const all = await records();
        assertOwnedRecord(all[credentialRef], context);
        all[credentialRef] = { version: 2, ownerId: context.ownerId, encrypted: encrypt(withoutCallerOwnership(material), context.ownerId), updatedAt: new Date().toISOString() };
        ownerContext.assertCriticalCurrent(context);
        await save(all);
        ownerContext.assertCriticalCurrent(context);
      }));
    },
    async remove(credentialRef, context = ownerContext.capture()) {
      return ownerContext.runCritical(context, () => mutate(async () => {
        ownerContext.assertCriticalCurrent(context);
        const all = await records();
        assertOwnedRecord(all[credentialRef], context);
        delete all[credentialRef];
        ownerContext.assertCriticalCurrent(context);
        await save(all);
        ownerContext.assertCriticalCurrent(context);
        return true;
      }));
    },
    async exists(credentialRef, context = ownerContext.capture()) {
      try {
        ownerContext.assertCurrent(context);
        const all = await records();
        assertOwnedRecord(all[credentialRef], context);
        ownerContext.assertCurrent(context);
        return true;
      } catch (error) {
        if (error?.code === 'credential-unavailable') return false;
        throw error;
      }
    },
    async assertAccessible(credentialRef, context = ownerContext.capture()) {
      ownerContext.assertCurrent(context);
      const all = await records();
      assertOwnedRecord(all[credentialRef], context);
      ownerContext.assertCurrent(context);
      return true;
    },
    captureOwnerContext: () => ownerContext.capture(),
    assertOwnerContext: (context) => ownerContext.assertCurrent(context),
    filePath,
  };
}

function base64url(value) { return Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'); }
function createPkce() { const verifier = base64url(crypto.randomBytes(48)); return { verifier, challenge: base64url(crypto.createHash('sha256').update(verifier).digest()) }; }
function createState() { return base64url(crypto.randomBytes(32)); }

module.exports = { YouTubeCredentialError, publicError, createCredentialVault, createPkce, createState };
