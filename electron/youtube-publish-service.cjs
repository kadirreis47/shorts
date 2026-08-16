const crypto = require('crypto');
const { openVerifiedArtifact } = require('./artifact-integrity.cjs');

const CREATE_URL = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';
const VIDEO_STATUS_URL = 'https://www.googleapis.com/youtube/v3/videos?part=status,processingDetails&id=';

class YouTubePublishError extends Error {
  constructor(code, message, { status = 500, retryable = false, retryAfterUtc = null } = {}) { super(message); this.name = 'YouTubePublishError'; this.code = code; this.status = status; this.retryable = retryable; this.retryAfterUtc = retryAfterUtc; }
}

function checkpointKey(request, ownerId = null) {
  return crypto.createHash('sha256').update(JSON.stringify([ownerId, request.jobId, request.idempotencyKey, request.account.accountId, request.account.accountRef, request.account.channelRef, request.target.accountId, request.target.channelRef, request.artifact.artifactFingerprint, request.artifact.contentDigest, request.artifact.sizeBytes])).digest('hex');
}
function parseConfirmedOffset(range, totalBytes) {
  if (range === null || range === undefined || range === '') return 0;
  const match = /^bytes=0-(\d+)$/.exec(range);
  if (!match) throw new YouTubePublishError('youtube-upload-range-invalid', 'YouTube returned an invalid resumable upload offset.', { status: 409 });
  const last = Number(match[1]); const next = last + 1;
  if (!Number.isSafeInteger(last) || last < 0 || next > totalBytes) throw new YouTubePublishError('youtube-upload-range-invalid', 'YouTube returned an out-of-range resumable upload offset.', { status: 409 });
  return next;
}
function parseRetryAfter(value, nowMs = Date.now()) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.trim();
  let target;
  if (/^\d+(?:\.\d+)?$/.test(normalized)) target = nowMs + Number(normalized) * 1000;
  else target = Date.parse(normalized);
  if (!Number.isFinite(target) || target < nowMs || target > 8_640_000_000_000_000) return null;
  try { return new Date(target).toISOString(); } catch { return null; }
}
function retryAfterUtc(response) { return parseRetryAfter(response.headers?.get?.('retry-after')); }
async function providerFailure(response, operation, sessionOperation = false) {
  let body = {}; try { body = await response.json(); } catch {}
  const reasons = JSON.stringify(body).toLowerCase();
  if (sessionOperation && (response.status === 404 || response.status === 410)) throw new YouTubePublishError('youtube-upload-session-expired', 'The YouTube resumable upload session expired and must be restarted.', { status: 503, retryable: true });
  if (response.status === 401 || reasons.includes('invalidcredentials') || reasons.includes('autherror')) throw new YouTubePublishError('credential-reconnect-required', 'YouTube authorization has expired. Reconnect the account.', { status: 401 });
  if (response.status === 429 || reasons.includes('quotaexceeded') || reasons.includes('ratelimitexceeded') || reasons.includes('userratelimitexceeded')) throw new YouTubePublishError('youtube-rate-limited', 'YouTube upload quota or rate limit was reached.', { status: 429, retryable: true, retryAfterUtc: retryAfterUtc(response) });
  if (response.status >= 500) throw new YouTubePublishError('youtube-provider-transient', `YouTube ${operation} is temporarily unavailable.`, { status: response.status, retryable: true });
  if (response.status >= 400 && response.status < 500) throw new YouTubePublishError('youtube-publish-validation-failed', `YouTube rejected the ${operation} request.`, { status: response.status });
  throw new YouTubePublishError('youtube-upload-ambiguous', `YouTube ${operation} returned an ambiguous result.`, { status: 503, retryable: true });
}
function completedResource(body, mediaAccepted = false) { const id = typeof body?.id === 'string' && body.id ? body.id : null; if (!id) throw new YouTubePublishError(mediaAccepted ? 'youtube-upload-ambiguous' : 'youtube-upload-response-invalid', mediaAccepted ? 'YouTube may have accepted the upload, but did not return a video identifier.' : 'YouTube confirmed upload completion without a video identifier.', { status: 502, retryable: true }); return { state: 'complete', videoId: id }; }
function processingState(body, videoId) {
  if (!Array.isArray(body?.items)) throw new YouTubePublishError('youtube-status-response-invalid', 'YouTube returned an invalid video status response.', { status: 502, retryable: true });
  const item = body.items.find((candidate) => candidate?.id === videoId);
  if (!item) return { state: 'unknown', reason: 'video-unavailable' };
  const uploadStatus = item.status?.uploadStatus;
  const processingStatus = item.processingDetails?.processingStatus;
  if (['failed', 'rejected', 'deleted'].includes(uploadStatus) || ['failed', 'terminated'].includes(processingStatus)) return { state: 'failed', reason: item.status?.rejectionReason || item.status?.failureReason || processingStatus || uploadStatus };
  if (uploadStatus === 'processed' && (processingStatus === undefined || processingStatus === 'succeeded')) return { state: 'published', reason: null };
  if (uploadStatus === 'uploaded' || processingStatus === 'processing') return { state: 'processing', reason: null };
  return { state: 'unknown', reason: 'video-status-unknown' };
}
function createYouTubeTransport({ fetchImpl = fetch } = {}) {
  return {
    async createSession({ accessToken, metadata, sizeBytes, signal }) {
      let response; try { response = await fetchImpl(CREATE_URL, { method: 'POST', signal, headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(sizeBytes), 'X-Upload-Content-Type': 'video/mp4' }, body: JSON.stringify(metadata) }); }
      catch { throw new YouTubePublishError('youtube-network-failure', 'Unable to start the YouTube upload.', { status: 503, retryable: true }); }
      if (!response.ok) await providerFailure(response, 'session creation');
      const sessionUri = response.headers.get('location');
      if (!sessionUri || !/^https:\/\//i.test(sessionUri)) throw new YouTubePublishError('youtube-upload-session-invalid', 'YouTube did not return a valid resumable upload session.', { status: 502, retryable: true });
      return sessionUri;
    },
    async querySession({ sessionUri, accessToken, sizeBytes, signal }) {
      let response; try { response = await fetchImpl(sessionUri, { method: 'PUT', signal, headers: { Authorization: `Bearer ${accessToken}`, 'Content-Length': '0', 'Content-Range': `bytes */${sizeBytes}` } }); }
      catch { throw new YouTubePublishError('youtube-upload-ambiguous', 'YouTube upload status could not be confirmed.', { status: 503, retryable: true }); }
      if (response.status === 308) return { state: 'incomplete', nextOffset: parseConfirmedOffset(response.headers.get('range'), sizeBytes) };
      if (response.ok) return completedResource(await response.json());
      await providerFailure(response, 'upload status', true);
    },
    async upload({ sessionUri, accessToken, artifact, startOffset, sizeBytes, signal }) {
      if (!Number.isSafeInteger(startOffset) || startOffset < 0 || startOffset >= sizeBytes) throw new YouTubePublishError('youtube-upload-range-invalid', 'The resumable upload offset is invalid.', { status: 409 });
      await artifact.assertUnchanged();
      const stream = artifact.createReadStream(startOffset);
      const abort = () => stream.destroy(Object.assign(new Error('Upload cancelled.'), { name: 'AbortError' })); signal?.addEventListener('abort', abort, { once: true });
      let response;
      try { response = await fetchImpl(sessionUri, { method: 'PUT', signal, duplex: 'half', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'video/mp4', 'Content-Length': String(sizeBytes - startOffset), 'Content-Range': `bytes ${startOffset}-${sizeBytes - 1}/${sizeBytes}` }, body: stream }); }
      catch (error) { stream.destroy(); if (signal?.aborted || error?.name === 'AbortError') throw new YouTubePublishError('youtube-upload-interrupted', 'YouTube upload was interrupted.', { status: 503, retryable: true }); throw new YouTubePublishError('youtube-upload-ambiguous', 'YouTube upload outcome could not be confirmed.', { status: 503, retryable: true }); }
      finally { signal?.removeEventListener('abort', abort); }
      await artifact.assertUnchanged();
      if (response.status === 308) return { state: 'incomplete', nextOffset: parseConfirmedOffset(response.headers.get('range'), sizeBytes) };
      if (response.ok) return completedResource(await response.json(), true);
      await providerFailure(response, 'media upload', true);
    },
    async getVideoStatus({ accessToken, videoId, signal }) {
      let response; try { response = await fetchImpl(`${VIDEO_STATUS_URL}${encodeURIComponent(videoId)}`, { method: 'GET', signal, headers: { Authorization: `Bearer ${accessToken}` } }); }
      catch { throw new YouTubePublishError('youtube-network-failure', 'Unable to verify YouTube video processing.', { status: 503, retryable: true }); }
      if (!response.ok) await providerFailure(response, 'video processing verification');
      return processingState(await response.json(), videoId);
    },
  };
}
function youtubeMetadata(metadata, outboundDescription) {
  if (typeof outboundDescription !== 'string' || outboundDescription.length > 5000) throw new YouTubePublishError('youtube-description-too-long', 'The composed YouTube description exceeds 5000 characters.', { status: 400 });
  if (metadata.thumbnailPath !== null || metadata.playlistRef !== null || metadata.commentsEnabled !== null) throw new YouTubePublishError('youtube-option-unsupported', 'One or more approved YouTube publishing options are not supported by the current publishing adapter.', { status: 400 });
  const snippet = { title: metadata.title, description: outboundDescription, tags: metadata.hashtags.map((tag) => tag.replace(/^#/, '')).filter(Boolean) };
  if (metadata.category) snippet.categoryId = metadata.category;
  if (metadata.language) snippet.defaultLanguage = metadata.language;
  const status = { privacyStatus: metadata.visibility };
  if (Object.prototype.hasOwnProperty.call(metadata.audienceFlags, 'selfDeclaredMadeForKids')) status.selfDeclaredMadeForKids = Boolean(metadata.audienceFlags.selfDeclaredMadeForKids);
  return { snippet, status };
}
function createYouTubePublishService({ auth, ownerContext, checkpoints, snapshots, transport = createYouTubeTransport(), openArtifact = openVerifiedArtifact, now = () => new Date().toISOString() }) {
  const flights = new Map(); const active = new Map();
  if (!snapshots) throw new TypeError('Trusted upload snapshot storage is required.');
  let initialization;
  const assertOwner = (owner) => { if (ownerContext) ownerContext.assertCurrent(owner); };
  const ownerIsCurrent = (owner) => !ownerContext || ownerContext.isCurrent(owner);
  const owned = async (operation, owner) => {
    assertOwner(owner);
    try { const result = await operation(); assertOwner(owner); return result; }
    catch (error) { assertOwner(owner); throw error; }
  };
  const initialize = () => {
    if (!initialization) initialization = (async () => {
      if (typeof checkpoints.list !== 'function' || typeof snapshots.cleanupOrphans !== 'function') return { removed: 0, failed: 0 };
      const stored = await checkpoints.list();
      const referenced = stored.filter((checkpoint) => typeof checkpoint?.snapshotPath === 'string').map((checkpoint) => checkpoint.snapshotPath);
      return snapshots.cleanupOrphans(referenced);
    })();
    return initialization;
  };
  const verifyKnownVideo = async ({ credential, videoId, signal, key }) => {
    try {
      const verified = await transport.getVideoStatus({ accessToken: credential.accessToken, videoId, signal });
      return { found: verified.state !== 'unknown', remotePublishId: videoId, remoteUrl: `https://www.youtube.com/watch?v=${videoId}`, state: verified.state, reason: verified.reason, retryAfterUtc: null, checkpointKey: key };
    } catch (error) {
      if (!error?.retryable) throw error;
      return { found: true, remotePublishId: videoId, remoteUrl: `https://www.youtube.com/watch?v=${videoId}`, state: 'unknown', reason: 'video-status-temporarily-unavailable', retryAfterUtc: error.retryAfterUtc ?? null, checkpointKey: key };
    }
  };
  const restartable = (key, reason) => ({ found: false, state: 'unknown', restartRequired: true, reason, retryAfterUtc: null, checkpointKey: key });
  const execute = async (request, reconcileOnly = false, owner = undefined) => {
    assertOwner(owner);
    if (request.platform !== 'youtube' || request.account.platform !== 'youtube') throw new YouTubePublishError('account-platform-mismatch', 'The publishing account is not a YouTube account.', { status: 400 });
    if (request.target.accountId !== request.account.accountId || request.target.channelRef !== request.account.channelRef) throw new YouTubePublishError('account-target-mismatch', 'The YouTube publishing target does not match the authenticated account binding.', { status: 400 });
    if (!request.approvalFingerprint || !request.approvedAt) throw new YouTubePublishError('publish-approval-required', 'Publishing approval is required.', { status: 400 });
    const key = checkpointKey(request, owner?.ownerId ?? null);
    const flightKey = `${owner?.ownerId || 'unscoped'}:${owner?.generation || 0}:${key}`;
    if (flights.has(flightKey)) return flights.get(flightKey);
    const flight = (async () => {
      const controller = new AbortController();
      const ownerChanged = () => controller.abort();
      owner?.signal?.addEventListener('abort', ownerChanged, { once: true });
      active.set(request.jobId, { controller, owner });
      try {
        await owned(() => initialize(), owner);
        const credential = await owned(() => auth.resolveExecutionCredential(request.account.credentialRef, owner), owner);
        if (!credential.channelId || credential.channelId !== request.account.channelRef || credential.channelId !== request.account.accountRef) throw new YouTubePublishError('youtube-channel-mismatch', 'The connected credential does not own the selected YouTube channel.', { status: 401 });
        let checkpoint = await owned(() => checkpoints.get(key), owner);
        if (checkpoint && (checkpoint.identity !== key || (ownerContext && checkpoint.ownerId !== owner.ownerId))) throw new YouTubePublishError('youtube-upload-checkpoint-mismatch', 'Stored YouTube upload recovery state does not match this publish job.', { status: 409 });
        const approvalMismatch = Boolean(checkpoint && checkpoint.approvalFingerprint !== request.approvalFingerprint);
        if (checkpoint?.status === 'complete' && checkpoint.videoId) {
          const result = await owned(() => verifyKnownVideo({ credential, videoId: checkpoint.videoId, signal: controller.signal, key }), owner);
          if (!approvalMismatch) return result;
          if (result.state === 'failed') { await owned(() => checkpoints.remove(key), owner); if (checkpoint.snapshotPath) await owned(() => snapshots.remove(checkpoint.snapshotPath), owner); return restartable(key, 'prior-approval-remote-failed'); }
          return { ...result, approvalMismatch: true, reason: result.reason ?? 'approval-mismatch' };
        }
        if (!checkpoint && request.remotePublishId) return owned(() => verifyKnownVideo({ credential, videoId: request.remotePublishId, signal: controller.signal, key }), owner);
        if (reconcileOnly && !checkpoint) {
          const ambiguousEvidence = request.recovery?.remoteState === 'processing'
            || request.recovery?.remoteState === 'unknown'
            || request.recovery?.failureCode === 'youtube-upload-ambiguous';
          return ambiguousEvidence
            ? { found: false, state: 'unknown', reason: 'remote-outcome-ambiguous', retryAfterUtc: null, checkpointKey: key }
            : restartable(key, 'checkpoint-not-created');
        }
        let createdSnapshot = null; let snapshotPath = checkpoint?.snapshotPath ?? null; let artifact = null;
        let videoId; let checkpointDurable = Boolean(checkpoint); let remoteComplete = false; let completedApprovalMismatch = false;
        try {
          let remote;
          if (checkpoint) {
            try { remote = await owned(() => transport.querySession({ sessionUri: checkpoint.sessionUri, accessToken: credential.accessToken, sizeBytes: checkpoint.sizeBytes, signal: controller.signal }), owner); }
            catch (error) { if (error?.code === 'youtube-upload-session-expired') { await owned(() => checkpoints.remove(key), owner); checkpointDurable = false; if (snapshotPath) await owned(() => snapshots.remove(snapshotPath), owner); return restartable(key, 'session-expired'); } throw error; }
            if (approvalMismatch && remote.state === 'incomplete') {
              if (remote.nextOffset === 0) {
                await owned(() => checkpoints.remove(key), owner); checkpointDurable = false;
                if (snapshotPath) await owned(() => snapshots.remove(snapshotPath), owner);
                checkpoint = null; snapshotPath = null; remote = null;
                if (reconcileOnly) return restartable(key, 'approval-mismatch-empty-session');
              } else return { found: false, state: 'unknown', approvalMismatch: true, reason: 'approval-mismatch-remote-active', retryAfterUtc: null, checkpointKey: key };
            }
            if (approvalMismatch && remote?.state === 'complete') completedApprovalMismatch = true;
          }
          if (!checkpoint) {
            const metadata = youtubeMetadata(request.metadata, request.outboundDescription);
            createdSnapshot = await owned(() => snapshots.create(request.artifact.artifactPath), owner);
            snapshotPath = createdSnapshot.snapshotPath;
            try { snapshots.assertManagedPath(snapshotPath); } catch { await owned(() => snapshots.remove(snapshotPath), owner); throw new YouTubePublishError('youtube-upload-snapshot-invalid', 'The immutable upload snapshot reference is invalid.', { status: 409 }); }
            artifact = await owned(() => openArtifact({ artifactPath: snapshotPath, sizeBytes: request.artifact.sizeBytes, contentDigest: request.artifact.contentDigest }), owner);
            const sessionUri = await owned(() => transport.createSession({ accessToken: credential.accessToken, metadata, sizeBytes: request.artifact.sizeBytes, signal: controller.signal }), owner);
            checkpoint = { version: ownerContext ? 2 : 1, ownerId: owner?.ownerId ?? undefined, identity: key, jobId: request.jobId, idempotencyKey: request.idempotencyKey, accountId: request.account.accountId, accountRef: request.account.accountRef, channelRef: request.account.channelRef, approvalFingerprint: request.approvalFingerprint, artifactFingerprint: request.artifact.artifactFingerprint, contentDigest: request.artifact.contentDigest, sizeBytes: request.artifact.sizeBytes, snapshotPath, sessionUri, status: 'active', videoId: null, createdAt: now(), updatedAt: now() };
            await owned(() => checkpoints.put(key, checkpoint), owner);
            checkpointDurable = true;
            try { remote = await owned(() => transport.querySession({ sessionUri: checkpoint.sessionUri, accessToken: credential.accessToken, sizeBytes: checkpoint.sizeBytes, signal: controller.signal }), owner); }
            catch (error) { if (error?.code === 'youtube-upload-session-expired') { await owned(() => checkpoints.remove(key), owner); checkpointDurable = false; await owned(() => snapshots.remove(snapshotPath), owner); return restartable(key, 'session-expired'); } throw error; }
          }
          while (remote.state === 'incomplete') {
            if (remote.nextOffset === checkpoint.sizeBytes) throw new YouTubePublishError('youtube-upload-ambiguous', 'YouTube received all bytes but has not confirmed the video identifier.', { status: 503, retryable: true });
            if (!artifact) {
              if (!snapshotPath) throw new YouTubePublishError('youtube-upload-snapshot-missing', 'The immutable upload snapshot is unavailable. The existing remote session will not be restarted automatically.', { status: 409 });
              try { snapshots.assertManagedPath(snapshotPath); } catch { throw new YouTubePublishError('youtube-upload-snapshot-invalid', 'The immutable upload snapshot reference is invalid.', { status: 409 }); }
              try { artifact = await owned(() => openArtifact({ artifactPath: snapshotPath, sizeBytes: request.artifact.sizeBytes, contentDigest: request.artifact.contentDigest }), owner); }
              catch (error) { if (error?.code === 'artifact-missing') throw new YouTubePublishError('youtube-upload-snapshot-missing', 'The immutable upload snapshot is missing. The existing remote session requires safe user reconciliation.', { status: 409 }); throw error; }
            }
            await owned(() => artifact.assertUnchanged(), owner);
            remote = await owned(() => transport.upload({ sessionUri: checkpoint.sessionUri, accessToken: credential.accessToken, artifact, startOffset: remote.nextOffset, sizeBytes: checkpoint.sizeBytes, signal: controller.signal }), owner);
          }
          videoId = remote.videoId;
          const complete = { ...checkpoint, status: 'complete', videoId, updatedAt: now() };
          await owned(() => checkpoints.put(key, complete), owner);
          remoteComplete = true;
        } finally {
          if (artifact) await artifact.close();
          if (ownerIsCurrent(owner) && snapshotPath && (remoteComplete || (createdSnapshot && !checkpointDurable))) await owned(() => snapshots.remove(snapshotPath), owner);
        }
        const result = await owned(() => verifyKnownVideo({ credential, videoId, signal: controller.signal, key }), owner);
        if (!completedApprovalMismatch) return result;
        if (result.state === 'failed') { await owned(() => checkpoints.remove(key), owner); return restartable(key, 'prior-approval-remote-failed'); }
        return { ...result, approvalMismatch: true, reason: result.reason ?? 'approval-mismatch' };
      } finally { owner?.signal?.removeEventListener('abort', ownerChanged); const tracked = active.get(request.jobId); if (tracked?.controller === controller) active.delete(request.jobId); }
    })();
    flights.set(flightKey, flight); try { return await flight; } finally { flights.delete(flightKey); }
  };
  return {
    initialize,
    publish: (request, owner) => execute(request, false, owner),
    reconcile: (request, owner) => execute(request, true, owner),
    cancel(jobId, owner) { assertOwner(owner); const tracked = active.get(jobId); if (!tracked || (ownerContext && (tracked.owner?.ownerId !== owner.ownerId || tracked.owner?.generation !== owner.generation))) return false; tracked.controller.abort(); return true; },
    async acknowledgeReceipt(request, owner) { assertOwner(owner); await owned(() => auth.resolveExecutionCredential(request.account.credentialRef, owner), owner); const key = checkpointKey(request, owner?.ownerId ?? null); const checkpoint = await owned(() => checkpoints.get(key), owner); if (!checkpoint || (ownerContext && checkpoint.ownerId !== owner.ownerId) || checkpoint.status !== 'complete' || checkpoint.videoId !== request.remotePublishId) return false; if (checkpoint.snapshotPath) await owned(() => snapshots.remove(checkpoint.snapshotPath), owner); return owned(() => checkpoints.remove(key), owner); },
  };
}

module.exports = { CREATE_URL, VIDEO_STATUS_URL, YouTubePublishError, checkpointKey, parseConfirmedOffset, parseRetryAfter, processingState, youtubeMetadata, createYouTubeTransport, createYouTubePublishService };
