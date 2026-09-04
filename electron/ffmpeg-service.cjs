const { app, ipcMain, dialog, BrowserWindow, shell } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomBytes } = require('crypto');
const { validateFFmpegRunRequest, validateTargetPath, validateArtifactIntegrityRequest } = require('./ffmpeg-security.cjs');
const { compileCanonicalRenderRequest } = require('./canonical-render-intent.cjs');
const { ArtifactIntegrityError, hashFileSha256, revalidateVerifiedArtifact } = require('./artifact-integrity.cjs');
const { createArtifactSnapshotStore } = require('./artifact-snapshot.cjs');
const { isPackagedRuntime, resolveFFmpegRuntime } = require('./ffmpeg-runtime.cjs');
const { resolveSupabaseAuthConfig } = require('./supabase-runtime-config.cjs');
const { createImageDisplayGeometryAuthorityService, prepareImageDisplayGeometryExecution, authorizeCanonicalImageIntent, authorizeImageDisplayGeometryArgs, privateImageIdentityFromSource } = require('./image-display-geometry-authority.cjs');

const active = new Map();
const materializationLocks = new Map();
const approvedExportDestinations = new Map();
const verifiedExportArtifacts = new Map();
const issuedSegmentResources = new Map();
const renderedArtifacts = new Map();
const canonicalRenderPlans = new Map();
const lifecycleBoundWebContents = new Set();
let cachedCapabilities = null;
const RENDER_PLAN_TTL_MS = 60_000;
const MAX_RENDER_PLANS = 256;
const AUTHORITY_TTL_MS = 60 * 60_000;
const DESTINATION_TTL_MS = 10 * 60_000;
const MAX_SEGMENT_RESOURCES = 512;
const MAX_RENDERED_ARTIFACTS = 256;
const MAX_VERIFIED_ARTIFACTS = 256;
const MAX_APPROVED_DESTINATIONS = 64;
const MAX_PER_WEB_CONTENTS = 128;
const MAX_EXTERNAL_MEDIA_BYTES = 512 * 1024 * 1024;
const TRUSTED_CANONICAL_FILTERS = Symbol('trusted-canonical-filters');

function registerFFmpegHandlers({ ownerContext = null, geometryAuthority: geometryAuthorityOverride = null } = {}) {
  const resolveSupabaseConfig = () => resolveSupabaseAuthConfig({ isPackaged: app.isPackaged });
  const geometryAuthority = geometryAuthorityOverride || (ownerContext
    ? createImageDisplayGeometryAuthorityService({ ownerContext, resolveConfig: resolveSupabaseConfig })
    : null);
  ownerContext?.onTransition?.(() => invalidateOwnerBoundAuthorities(geometryAuthority));
  ipcMain.handle('ffmpeg:pick-output-path', async (event, options = {}) => {
    bindWebContentsLifecycle(event.sender, geometryAuthority);
    const executionOwner = ownerContext?.capture?.() ?? null;
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showSaveDialog(window, { title: 'Export destination', defaultPath: typeof options.defaultPath === 'string' ? options.defaultPath : 'export.mp4', filters: [{ name: 'MP4 video', extensions: ['mp4'] }] });
    const selectedPath = resolveSelectedOutputPath(result);
    if (executionOwner) ownerContext.assertCurrent(executionOwner);
    if (selectedPath) rememberApprovedExportDestination(event.sender.id, selectedPath, options?.purpose === 'save-copy' ? 'save-copy' : 'render', executionOwner);
    return selectedPath;
  });
  ipcMain.handle('ffmpeg:capabilities', async (_event, forceRefresh = false) => {
    if (cachedCapabilities && !forceRefresh) return cachedCapabilities;
    cachedCapabilities = await detectCapabilities();
    return cachedCapabilities;
  });

  ipcMain.handle('ffmpeg:resolve-image-display-geometry', async (event, request) => {
    if (!geometryAuthority) throw new Error('Trusted image display geometry is unavailable.');
    bindWebContentsLifecycle(event.sender, geometryAuthority);
    if (event.sender.isDestroyed?.()) throw new Error('Renderer authority is unavailable.');
    const resolved = await geometryAuthority.resolve(event.sender.id, request);
    if (event.sender.isDestroyed?.()) {
      geometryAuthority.clearWebContents?.(event.sender.id);
      throw new Error('Renderer authority is unavailable.');
    }
    return resolved;
  });
  ipcMain.handle('ffmpeg:create-render-plan', async (event, request) => {
    bindWebContentsLifecycle(event.sender, geometryAuthority);
    return createCanonicalRenderPlan(event.sender.id, request, { geometryAuthority, ownerContext, supabaseUrl: resolveSupabaseConfig().url });
  });
  ipcMain.handle('ffmpeg:execute-render-plan', async (event, reference) => {
    const plan = consumeCanonicalRenderPlan(event.sender.id, reference, ownerContext);
    const result = await runFFmpeg(event.sender, plan.request, {
      geometryAuthority, supabaseUrl: resolveSupabaseConfig().url, ownerContext, executionOwner: plan.owner,
      concatContent: plan.concatContent,
    });
    if (plan.owner) ownerContext?.assertCurrent(plan.owner);
    rememberRenderedArtifact(event.sender.id, result.outputPath, plan.outputKind, plan.owner);
    return result;
  });
  ipcMain.handle('ffmpeg:analyze-render-artifact', async (event, targetPath) => {
    const executionOwner = ownerContext?.capture?.() ?? null;
    const result = await analyzeOutput(requireRenderedArtifact(event.sender.id, targetPath, executionOwner));
    if (executionOwner) ownerContext.assertCurrent(executionOwner);
    return result;
  });
  ipcMain.handle('ffmpeg:verify-render-artifact', async (event, targetPath) => {
    const executionOwner = ownerContext?.capture?.() ?? null;
    const trustedPath = validateTargetPath(targetPath);
    requireRenderedArtifact(event.sender.id, trustedPath, executionOwner);
    const snapshots = createArtifactSnapshotStore({ directory: path.join(app.getPath('temp'), 'shortsflow-artifact-verification') });
    const snapshot = await verifyArtifactSnapshot(trustedPath, { snapshots });
    if (executionOwner) ownerContext.assertCurrent(executionOwner);
    const publishCapability = renderedArtifactKind(event.sender.id, trustedPath, executionOwner) === 'export'
      ? rememberVerifiedExportArtifact(event.sender.id, snapshot.integrity, executionOwner)
      : null;
    return Object.freeze({ ...snapshot, publishCapability });
  });
  ipcMain.handle('ffmpeg:revalidate-artifact', async (event, artifact) => {
    try {
      const validated = validateArtifactIntegrityRequest(artifact);
      const executionOwner = ownerContext?.capture?.() ?? null;
      if (!isKnownVerifiedExportArtifact(event.sender.id, validated, executionOwner)) {
        return { ok: false, error: { code: 'artifact-unavailable', message: 'Verified export is unavailable.' } };
      }
      const result = await revalidateVerifiedArtifact(validated);
      if (executionOwner) ownerContext.assertCurrent(executionOwner);
      return { ok: true, artifact: result };
    } catch (error) {
      if (error instanceof ArtifactIntegrityError) return { ok: false, error: { code: error.code, message: error.message } };
      return { ok: false, error: { code: 'artifact-unreadable', message: 'Verified export could not be read safely.' } };
    }
  });
  ipcMain.handle('ffmpeg:open-verified-export', async (event, artifact) => {
    const executionOwner = ownerContext?.capture?.() ?? null;
    return openVerifiedExport(event.sender.id, artifact, { ownerContext, executionOwner });
  });
  ipcMain.handle('ffmpeg:reveal-verified-export', async (event, artifact) => {
    const executionOwner = ownerContext?.capture?.() ?? null;
    return revealVerifiedExport(event.sender.id, artifact, { ownerContext, executionOwner });
  });
  ipcMain.handle('ffmpeg:save-verified-export-as', async (event, request) => {
    const executionOwner = ownerContext?.capture?.() ?? null;
    return saveVerifiedExportAs(event.sender.id, request, { ownerContext, executionOwner });
  });
  ipcMain.handle('ffmpeg:issue-segment-resource', async (event, fingerprint) => {
    bindWebContentsLifecycle(event.sender, geometryAuthority);
    const executionOwner = ownerContext?.capture?.() ?? null;
    const resource = issueSegmentResource(event.sender.id, validateSegmentFingerprint(fingerprint), executionOwner);
    let exists = false;
    try { exists = (await fs.promises.stat(resource.path)).isFile(); } catch {}
    if (executionOwner) ownerContext.assertCurrent(executionOwner);
    return Object.freeze({ reference: resource.reference, exists });
  });
  ipcMain.handle('ffmpeg:segment-cache-stats', async () => {
    const owner = ownerContext?.capture?.() ?? null;
    const ownerDirectory = getSegmentDirectory(owner);
    await fs.promises.mkdir(ownerDirectory, { recursive: true });
    const files = await fs.promises.readdir(ownerDirectory, { withFileTypes: true });
    let entries = 0;
    let totalBytes = 0;
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith('.mp4')) continue;
      const stat = await fs.promises.stat(path.join(ownerDirectory, file.name));
      entries += 1;
      totalBytes += stat.size;
    }
    if (owner) ownerContext.assertCurrent(owner);
    return { entries, totalBytes, cacheDirectory: ownerDirectory };
  });
  ipcMain.handle('ffmpeg:segment-cache-clear', async (_event) => {
    const owner = ownerContext?.capture?.() ?? null;
    const directory = getSegmentDirectory(owner);
    await fs.promises.rm(directory, { recursive: true, force: true });
    for (const [reference, record] of issuedSegmentResources) if (ownerMatches(record, owner)) issuedSegmentResources.delete(reference);
    if (owner) ownerContext.assertCurrent(owner);
  });

  ipcMain.handle('ffmpeg:resource-exists', async (event, targetPath) => {
    const executionOwner = ownerContext?.capture?.() ?? null;
    try { targetPath = requireKnownResource(event.sender.id, targetPath, executionOwner); } catch { return false; }
    try {
      const stat = await fs.promises.stat(targetPath);
      return stat.isFile();
    } catch {
      return false;
    }
  });
  ipcMain.handle('ffmpeg:materialize-render-artifact', async (event, request) => {
    const executionOwner = ownerContext?.capture?.() ?? null;
    const sourcePath = requireRenderedArtifact(event.sender.id, request?.sourcePath, executionOwner);
    const destinationPath = validateTargetPath(request?.destinationPath, 'destinationPath');
    if (!consumeApprovedExportDestination(event.sender.id, destinationPath, 'render', executionOwner)) throw new Error('Destination capability is unavailable.');
    const samePath = process.platform === 'win32'
      ? sourcePath.toLowerCase() === destinationPath.toLowerCase()
      : sourcePath === destinationPath;
    if (samePath) {
      const stat = await fs.promises.stat(destinationPath);
      if (executionOwner) ownerContext.assertCurrent(executionOwner);
      return { path: destinationPath, sizeBytes: stat.size };
    }
    const key = process.platform === 'win32' ? destinationPath.toLowerCase() : destinationPath;
    const previous = materializationLocks.get(key) || Promise.resolve();
    const operation = previous.then(() => materializeWithOwnerTransaction(
      sourcePath,
      destinationPath,
      fs,
      ownerContext,
      executionOwner,
    ));
    const locked = operation.catch(() => undefined);
    materializationLocks.set(key, locked);
    try {
      const result = await operation;
      if (executionOwner) ownerContext.assertCurrent(executionOwner);
      rememberRenderedArtifact(event.sender.id, result.path, 'export', executionOwner);
      return result;
    } finally { if (materializationLocks.get(key) === locked) materializationLocks.delete(key); }
  });
  ipcMain.handle('ffmpeg:cancel', async (event, jobId) => {
    const operation = active.get(jobId);
    if (!operation || operation.webContentsId !== event.sender.id) return false;
    const child = operation.child;
    child.kill('SIGTERM');
    setTimeout(() => { if (active.get(jobId)?.child === child) child.kill('SIGKILL'); }, 1500).unref();
    return true;
  });
  return Object.freeze({
    verifiedExportAuthority: Object.freeze({ resolve: resolveVerifiedExportPublishCapability }),
  });
}

async function openVerifiedExport(webContentsId, artifact, { ownerContext = null, executionOwner = null } = {}) {
  const verified = await resolveVerifiedExportForShell(webContentsId, artifact, executionOwner);
  if (!verified) return { ok: false, message: 'Saved video is no longer available.' };
  if (executionOwner) ownerContext?.assertCurrent(executionOwner);
  const error = await shell.openPath(verified.artifactPath);
  return error ? { ok: false, message: 'Saved video could not be opened.' } : { ok: true };
}

async function revealVerifiedExport(webContentsId, artifact, { ownerContext = null, executionOwner = null } = {}) {
  const verified = await resolveVerifiedExportForShell(webContentsId, artifact, executionOwner);
  if (!verified) return { ok: false, message: 'Saved video is no longer available.' };
  if (executionOwner) ownerContext?.assertCurrent(executionOwner);
  shell.showItemInFolder(verified.artifactPath);
  return { ok: true };
}

async function saveVerifiedExportAs(webContentsId, request, { ownerContext = null, executionOwner = null } = {}) {
  try {
    const artifact = validateArtifactIntegrityRequest(request?.artifact);
    const destinationPath = validateTargetPath(request?.destinationPath);
    if (!isKnownVerifiedExportArtifact(webContentsId, artifact, executionOwner)) return { ok: false, message: 'Verified export is unavailable.' };
    if (!consumeApprovedExportDestination(webContentsId, destinationPath, 'save-copy', executionOwner)) {
      return { ok: false, message: 'Choose an export destination before saving.' };
    }
    const verified = await revalidateVerifiedArtifact(artifact);
    if (executionOwner) ownerContext?.assertCurrent(executionOwner);
    const samePath = process.platform === 'win32'
      ? verified.artifactPath.toLowerCase() === destinationPath.toLowerCase()
      : verified.artifactPath === destinationPath;
    const sizeBytes = samePath
      ? await verifiedExportFileSize(destinationPath)
      : (await materializeWithOwnerTransaction(
        verified.artifactPath,
        destinationPath,
        fs,
        ownerContext,
        executionOwner,
      )).sizeBytes;
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) throw new Error('Saved export is empty.');
    if (executionOwner) ownerContext?.assertCurrent(executionOwner);
    return { ok: true, path: destinationPath, sizeBytes };
  } catch {
    return { ok: false, message: 'The video could not be saved to that location.' };
  }
}

async function verifiedExportFileSize(targetPath) {
  const stat = await fs.promises.stat(targetPath);
  if (!stat.isFile()) throw new Error('Saved export is not a file.');
  return stat.size;
}

function rememberApprovedExportDestination(webContentsId, destinationPath, operation = 'render', owner = null, now = Date.now()) {
  if (operation !== 'render' && operation !== 'save-copy') throw new TypeError('Invalid destination operation.');
  setBoundedNested(approvedExportDestinations, webContentsId, resourceKey(destinationPath), authorityRecord(owner, now, DESTINATION_TTL_MS, { operation }), MAX_APPROVED_DESTINATIONS, 32, now);
}

function hasApprovedExportDestination(webContentsId, destinationPath, operation = 'render', owner = null, now = Date.now()) {
  const record = getNestedAuthority(approvedExportDestinations, webContentsId, resourceKey(destinationPath), owner, now);
  return record?.operation === operation;
}

function rememberVerifiedExportArtifact(webContentsId, artifact, owner = null, now = Date.now()) {
  let publishReference;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    publishReference = `vea1_${randomBytes(32).toString('base64url')}`;
    if (![...verifiedExportArtifacts.values()].some((entries) => [...entries.values()].some((record) => record.publishReference === publishReference))) break;
    publishReference = null;
  }
  if (!publishReference) throw new Error('Verified export capability could not be issued safely.');
  const expiresAtMs = now + AUTHORITY_TTL_MS;
  setBoundedNested(verifiedExportArtifacts, webContentsId, artifactRegistryKey(artifact.artifactPath), authorityRecord(owner, now, AUTHORITY_TTL_MS, {
    artifactPath: artifact.artifactPath, sizeBytes: artifact.sizeBytes, contentDigest: artifact.contentDigest,
    operation: 'youtube-publish', publishReference,
  }), MAX_VERIFIED_ARTIFACTS, MAX_PER_WEB_CONTENTS, now);
  return Object.freeze({ version: 1, reference: publishReference, expiresAt: new Date(expiresAtMs).toISOString() });
}

function isKnownVerifiedExportArtifact(webContentsId, artifact, owner = null, now = Date.now()) {
  const known = getNestedAuthority(verifiedExportArtifacts, webContentsId, artifactRegistryKey(artifact.artifactPath), owner, now);
  return Boolean(known && known.sizeBytes === artifact.sizeBytes && known.contentDigest === artifact.contentDigest);
}

async function resolveVerifiedExportPublishCapability(webContentsId, reference, owner = null, now = Date.now()) {
  pruneNestedRegistry(verifiedExportArtifacts, now);
  if (!Number.isSafeInteger(webContentsId) || typeof reference !== 'string' || !/^vea1_[A-Za-z0-9_-]{43}$/.test(reference)) {
    throw new ArtifactIntegrityError('artifact-unavailable', 'Verified export publish capability is unavailable.');
  }
  const entries = verifiedExportArtifacts.get(webContentsId);
  const record = entries && [...entries.values()].find((value) => value.publishReference === reference);
  if (!record || record.operation !== 'youtube-publish' || !ownerMatches(record, owner) || record.expiresAtMs <= now) {
    throw new ArtifactIntegrityError('artifact-unavailable', 'Verified export publish capability is unavailable.');
  }
  return revalidateVerifiedArtifact({ artifactPath: record.artifactPath, sizeBytes: record.sizeBytes, contentDigest: record.contentDigest });
}

function artifactRegistryKey(artifactPath) {
  return process.platform === 'win32' ? artifactPath.toLowerCase() : artifactPath;
}

function consumeApprovedExportDestination(webContentsId, destinationPath, operation, owner = null, now = Date.now()) {
  const destinations = approvedExportDestinations.get(webContentsId);
  const key = resourceKey(destinationPath);
  const record = getNestedAuthority(approvedExportDestinations, webContentsId, key, owner, now);
  if (record?.operation !== operation || !destinations?.delete(key)) return false;
  if (destinations.size === 0) approvedExportDestinations.delete(webContentsId);
  return true;
}

async function resolveVerifiedExportForShell(webContentsId, artifact, owner = null) {
  try {
    const validated = validateArtifactIntegrityRequest(artifact);
    if (!isKnownVerifiedExportArtifact(webContentsId, validated, owner)) return null;
    return await revalidateVerifiedArtifact(validated);
  } catch { return null; }
}

function resourceKey(value) {
  const normalized = validateTargetPath(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function issueSegmentResource(webContentsId, fingerprint, owner = null, random = randomBytes, now = Date.now(), segmentPath = getSegmentPath(fingerprint, owner)) {
  pruneSegmentResources(now);
  let reference;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    reference = `sgr1_${random(32).toString('base64url')}`;
    if (!issuedSegmentResources.has(reference)) break;
    reference = null;
  }
  if (!reference) throw new Error('Segment capability could not be issued safely.');
  issuedSegmentResources.set(reference, Object.freeze({
    ...authorityRecord(owner, now, AUTHORITY_TTL_MS, { operation: 'segment', type: 'segment', fingerprint }),
    reference, webContentsId, path: validateTargetPath(segmentPath),
  }));
  enforceFlatBound(issuedSegmentResources, MAX_SEGMENT_RESOURCES, webContentsId, MAX_PER_WEB_CONTENTS);
  return issuedSegmentResources.get(reference);
}

function rememberIssuedSegment(webContentsId, fingerprint, segmentPath, owner = null, random = randomBytes, now = Date.now()) {
  validateSegmentFingerprint(fingerprint);
  return issueSegmentResource(webContentsId, fingerprint, owner, random, now, segmentPath).reference;
}

function requireIssuedSegment(webContentsId, reference, owner = null, now = Date.now()) {
  pruneSegmentResources(now);
  if (typeof reference !== 'string' || !/^sgr1_[A-Za-z0-9_-]{43}$/.test(reference)) throw new TypeError('Invalid segment capability.');
  const resource = issuedSegmentResources.get(reference);
  if (!resource || resource.webContentsId !== webContentsId || !ownerMatches(resource, owner) || resource.operation !== 'segment' || resource.type !== 'segment') {
    throw new Error('Segment capability is unavailable.');
  }
  return resource.path;
}

function validateSegmentFingerprint(fingerprint) {
  if (typeof fingerprint !== 'string' || !/^[a-f0-9]{16,128}$/i.test(fingerprint)) throw new TypeError('Invalid segment capability.');
  return fingerprint;
}

function isIssuedSegmentPath(webContentsId, candidate, owner = null, now = Date.now()) {
  pruneSegmentResources(now);
  let key;
  try { key = resourceKey(candidate); } catch { return false; }
  return [...issuedSegmentResources.values()].some((record) => record.webContentsId === webContentsId && ownerMatches(record, owner) && resourceKey(record.path) === key);
}

function rememberRenderedArtifact(webContentsId, artifactPath, kind = 'export', owner = null, now = Date.now()) {
  if (kind !== 'export' && kind !== 'segment') throw new TypeError('Invalid render artifact kind.');
  setBoundedNested(renderedArtifacts, webContentsId, resourceKey(artifactPath), authorityRecord(owner, now, AUTHORITY_TTL_MS, {
    kind, operation: 'render-artifact',
  }), MAX_RENDERED_ARTIFACTS, MAX_PER_WEB_CONTENTS, now);
}

function renderedArtifactKind(webContentsId, artifactPath, owner = null, now = Date.now()) {
  return getNestedAuthority(renderedArtifacts, webContentsId, resourceKey(artifactPath), owner, now)?.kind ?? null;
}

function requireRenderedArtifact(webContentsId, artifactPath, owner = null, now = Date.now()) {
  const normalized = validateTargetPath(artifactPath);
  const record = getNestedAuthority(renderedArtifacts, webContentsId, resourceKey(normalized), owner, now);
  if (record?.operation !== 'render-artifact') throw new Error('Render artifact capability is unavailable.');
  return normalized;
}

function requireKnownResource(webContentsId, targetPath, owner = null, now = Date.now()) {
  const normalized = validateTargetPath(targetPath);
  if (getNestedAuthority(renderedArtifacts, webContentsId, resourceKey(normalized), owner, now)?.operation === 'render-artifact'
    || isIssuedSegmentPath(webContentsId, normalized, owner, now)) return normalized;
  throw new Error('Native resource capability is unavailable.');
}

function requireApprovedDestination(webContentsId, targetPath, operation = 'render', owner = null, now = Date.now()) {
  const normalized = validateTargetPath(targetPath);
  if (!hasApprovedExportDestination(webContentsId, normalized, operation, owner, now)) throw new Error('Destination capability is unavailable.');
  return normalized;
}

function authorityRecord(owner, createdAtMs, ttlMs, extra) {
  return Object.freeze({ ...extra, ownerId: owner?.ownerId ?? null, generation: owner?.generation ?? null, createdAtMs, expiresAtMs: createdAtMs + ttlMs });
}

function ownerMatches(record, owner) {
  return record.ownerId === (owner?.ownerId ?? null) && record.generation === (owner?.generation ?? null);
}

function getNestedAuthority(registry, webContentsId, key, owner, now) {
  pruneNestedRegistry(registry, now);
  const record = registry.get(webContentsId)?.get(key);
  return record && ownerMatches(record, owner) ? record : null;
}

function setBoundedNested(registry, webContentsId, key, record, globalLimit, perWebContentsLimit, now) {
  pruneNestedRegistry(registry, now);
  const entries = registry.get(webContentsId) || new Map();
  entries.delete(key);
  entries.set(key, record);
  registry.set(webContentsId, entries);
  while (entries.size > perWebContentsLimit) entries.delete(entries.keys().next().value);
  while (nestedRegistrySize(registry) > globalLimit) evictOldestNested(registry);
}

function pruneNestedRegistry(registry, now = Date.now()) {
  for (const [webContentsId, entries] of registry) {
    for (const [key, record] of entries) if (record.expiresAtMs <= now) entries.delete(key);
    if (entries.size === 0) registry.delete(webContentsId);
  }
}

function nestedRegistrySize(registry) {
  let total = 0;
  for (const entries of registry.values()) total += entries.size;
  return total;
}

function evictOldestNested(registry) {
  let oldest = null;
  for (const [webContentsId, entries] of registry) for (const [key, record] of entries) {
    if (!oldest || record.createdAtMs < oldest.record.createdAtMs) oldest = { webContentsId, key, record };
  }
  if (!oldest) return;
  const entries = registry.get(oldest.webContentsId);
  entries?.delete(oldest.key);
  if (entries?.size === 0) registry.delete(oldest.webContentsId);
}

function pruneSegmentResources(now = Date.now()) {
  for (const [reference, record] of issuedSegmentResources) if (record.expiresAtMs <= now) issuedSegmentResources.delete(reference);
}

function enforceFlatBound(registry, globalLimit, webContentsId, perWebContentsLimit) {
  while ([...registry.values()].filter((record) => record.webContentsId === webContentsId).length > perWebContentsLimit) {
    const oldest = [...registry].find(([, record]) => record.webContentsId === webContentsId);
    if (!oldest) break;
    registry.delete(oldest[0]);
  }
  while (registry.size > globalLimit) registry.delete(registry.keys().next().value);
}

function bindWebContentsLifecycle(webContents, geometryAuthority = null) {
  if (!webContents || !Number.isSafeInteger(webContents.id) || lifecycleBoundWebContents.has(webContents.id)) return;
  lifecycleBoundWebContents.add(webContents.id);
  webContents.once?.('destroyed', () => {
    clearWebContentsAuthorities(webContents.id);
    geometryAuthority?.clearWebContents?.(webContents.id);
  });
}

function clearWebContentsAuthorities(webContentsId) {
  approvedExportDestinations.delete(webContentsId);
  verifiedExportArtifacts.delete(webContentsId);
  renderedArtifacts.delete(webContentsId);
  for (const [reference, record] of issuedSegmentResources) if (record.webContentsId === webContentsId) issuedSegmentResources.delete(reference);
  for (const [reference, plan] of canonicalRenderPlans) if (plan.webContentsId === webContentsId) canonicalRenderPlans.delete(reference);
  lifecycleBoundWebContents.delete(webContentsId);
}

async function createCanonicalRenderPlan(webContentsId, rawRequest, {
  geometryAuthority = null,
  ownerContext = null,
  supabaseUrl = null,
  probeInput = async () => 'deferred',
  now = () => Date.now(),
  random = randomBytes,
} = {}) {
  pruneCanonicalRenderPlans(now());
  const request = validateFFmpegRunRequest(rawRequest);
  const owner = ownerContext?.capture ? ownerContext.capture() : null;
  const outputKind = request.operation === 'segment-render' ? 'segment' : 'export';
  const outputPath = outputKind === 'segment'
    ? requireIssuedSegment(webContentsId, request.outputResourceReference, owner, now())
    : requireApprovedDestination(webContentsId, request.outputPath, 'render', owner, now());
  const segmentPaths = request.intent.segmentReferences.map((reference) => requireIssuedSegment(webContentsId, reference, owner, now()));
  // Framing provenance is checked against metadata returned by the live,
  // owner-bound authority before any crop argv is compiled.
  authorizeCanonicalImageIntent(request.intent.scenes, geometryAuthority, webContentsId);
  const compiled = compileCanonicalRenderRequest(request, { segmentPaths });
  const concatContent = compiled.args.includes('{{CONCAT_FILE}}') ? canonicalConcatContent(segmentPaths) : '';
  await validateCanonicalInputAcquisition(webContentsId, compiled, { geometryAuthority, supabaseUrl, probeInput, concatContent, trustedCanonicalFilters: true });
  if (owner) ownerContext.assertCurrent(owner);
  if (outputKind === 'export' && !consumeApprovedExportDestination(webContentsId, outputPath, 'render', owner, now())) {
    throw new Error('Output destination capability is unavailable.');
  }
  const reference = `crp1_${random(32).toString('base64url')}`;
  if (canonicalRenderPlans.has(reference)) throw new Error('Canonical render plan collision.');
  const frozenRequest = Object.freeze({ jobId: request.jobId, outputPath, subtitleContent: request.intent.subtitleContent, brandingText: compiled.brandingText, [TRUSTED_CANONICAL_FILTERS]: true,
    args: Object.freeze([...compiled.args]), imageGeometryAuthorities: Object.freeze(compiled.imageGeometryAuthorities.map((value) => Object.freeze({ ...value }))),
  });
  canonicalRenderPlans.set(reference, Object.freeze({
    reference, webContentsId, owner, outputKind, request: frozenRequest, concatContent, expiresAtMs: now() + RENDER_PLAN_TTL_MS,
  }));
  while ([...canonicalRenderPlans.values()].filter((plan) => plan.webContentsId === webContentsId).length > MAX_PER_WEB_CONTENTS) {
    const oldest = [...canonicalRenderPlans].find(([, plan]) => plan.webContentsId === webContentsId);
    if (!oldest) break;
    canonicalRenderPlans.delete(oldest[0]);
  }
  while (canonicalRenderPlans.size > MAX_RENDER_PLANS) {
    canonicalRenderPlans.delete(canonicalRenderPlans.keys().next().value);
  }
  return Object.freeze({ version: 1, reference, expiresAt: new Date(now() + RENDER_PLAN_TTL_MS).toISOString() });
}

function consumeCanonicalRenderPlan(webContentsId, reference, ownerContext, now = Date.now()) {
  pruneCanonicalRenderPlans(now);
  if (typeof reference !== 'string' || !/^crp1_[A-Za-z0-9_-]{43}$/.test(reference)) throw new TypeError('Invalid canonical render plan.');
  const plan = canonicalRenderPlans.get(reference);
  if (!plan || plan.webContentsId !== webContentsId) throw new Error('Canonical render plan is unavailable.');
  canonicalRenderPlans.delete(reference);
  if (plan.owner) ownerContext?.assertCurrent(plan.owner);
  return plan;
}

function pruneCanonicalRenderPlans(currentTime) {
  for (const [reference, plan] of canonicalRenderPlans) if (plan.expiresAtMs <= currentTime) canonicalRenderPlans.delete(reference);
}

function resetFFmpegAuthorityStateForTests() {
  invalidateOwnerBoundAuthorities();
  active.clear();
}

function invalidateOwnerBoundAuthorities(geometryAuthority = null) {
  geometryAuthority?.clear?.();
  approvedExportDestinations.clear();
  verifiedExportArtifacts.clear();
  issuedSegmentResources.clear();
  renderedArtifacts.clear();
  canonicalRenderPlans.clear();
}

function canonicalConcatContent(segmentPaths) {
  if (!Array.isArray(segmentPaths) || segmentPaths.length < 1 || segmentPaths.length > 64) throw new Error('Canonical concat resources are invalid.');
  const content = segmentPaths.map((segmentPath) => {
    const normalized = validateTargetPath(segmentPath).replace(/\\/g, '/');
    if (/[\r\n']/.test(normalized)) throw new Error('Canonical segment path cannot be represented safely.');
    return `file '${normalized}'`;
  }).join('\n');
  if (Buffer.byteLength(content, 'utf8') > 1024 * 1024) throw new Error('Canonical concat content is too large.');
  return content;
}

async function validateCanonicalInputAcquisition(webContentsId, request, {
  geometryAuthority,
  supabaseUrl,
  probeInput,
  concatContent,
  trustedCanonicalFilters = false,
} = {}) {
  authorizeImageDisplayGeometryArgs(request.args, request.imageGeometryAuthorities, geometryAuthority, supabaseUrl, { webContentsId, trustedCanonicalFilters });
  if (request.args[request.args.length - 1] !== '{{OUTPUT_FILE}}'
    || request.args.reduce((total, value) => total + value.split('{{OUTPUT_FILE}}').length - 1, 0) !== 1) {
    throw new Error('Canonical output placeholder is invalid.');
  }
  if (request.args.includes('{{CONCAT_FILE}}') !== Boolean(concatContent)) throw new Error('Canonical concat input is invalid.');
  const watermarkMarkers = request.args.reduce((total, value) => total + value.split('{{WATERMARK_TEXT_FILE_FILTER_VALUE}}').length - 1, 0);
  if (watermarkMarkers !== (typeof request.brandingText === 'string' ? 1 : 0)) throw new Error('Canonical watermark resource is invalid.');
}

async function probeExecutionInput(source) {
  const executable = resolveFFprobeExecutable();
  if (!executable) throw new Error('FFprobe is required to classify canonical media inputs.');
  const output = await capture(executable, [
    '-v', 'error', '-show_entries', 'format=format_name,duration:stream=codec_type,codec_name,duration,nb_frames', '-of', 'json', source,
  ]);
  let parsed;
  try { parsed = JSON.parse(output); } catch { throw new Error('Canonical media inspection failed.'); }
  const streams = Array.isArray(parsed?.streams) ? parsed.streams : [];
  const formatNames = String(parsed?.format?.format_name || '').split(',');
  if (formatNames.some((value) => ['image2', 'image2pipe', 'jpeg_pipe', 'png_pipe', 'webp_pipe', 'gif'].includes(value))) return 'image';
  if (formatNames.some((value) => ['hls', 'dash', 'concat', 'concatf', 'ffmetadata'].includes(value))) return 'indirect';
  if (streams.some((stream) => stream?.codec_type === 'video')) return 'video';
  if (streams.some((stream) => stream?.codec_type === 'audio')) return 'audio';
  return 'unsupported';
}

async function prepareCanonicalExternalMediaExecution(originalArgs, preparedArgs, {
  supabaseUrl,
  tempDir,
  fetchImpl,
  fsApi,
  probeInput,
  ownerContext,
  executionOwner,
}) {
  const output = [...preparedArgs];
  let stagedIndex = 0;
  for (let index = 0; index < originalArgs.length; index += 1) {
    if (originalArgs[index] !== '-i' || index + 1 >= originalArgs.length) continue;
    const sourceIndex = index + 1;
    const source = originalArgs[sourceIndex];
    let parsed;
    try { parsed = new URL(source); } catch { continue; }
    if (parsed.protocol !== 'https:' || privateImageIdentityFromSource(source, supabaseUrl)) continue;
    if (executionOwner) ownerContext?.assertCurrent(executionOwner);
    const target = path.join(tempDir, `trusted-external-media-${stagedIndex++}.bin`);
    await downloadExternalMediaToFile(source, target, {
      fetchImpl, fsApi, ownerSignal: executionOwner?.signal,
    });
    if (executionOwner) ownerContext?.assertCurrent(executionOwner);
    const kind = await probeInput(target);
    if (kind === 'image') throw new Error('Mutable external images cannot enter verified execution.');
    if (kind !== 'video' && kind !== 'audio') throw new Error('Canonical external media is not a self-contained video or audio asset.');
    if (executionOwner) ownerContext?.assertCurrent(executionOwner);
    output[sourceIndex] = target;
  }
  return output;
}

async function downloadExternalMediaToFile(source, target, { fetchImpl, fsApi, ownerSignal }) {
  if (typeof fetchImpl !== 'function') throw new Error('Canonical external media transport is unavailable.');
  const timeoutSignal = AbortSignal.timeout(60_000);
  const signal = ownerSignal && typeof AbortSignal.any === 'function'
    ? AbortSignal.any([timeoutSignal, ownerSignal]) : (ownerSignal || timeoutSignal);
  let response;
  try {
    response = await fetchImpl(source, { method: 'GET', redirect: 'follow', signal, headers: { 'Cache-Control': 'no-store' } });
  } catch { throw new Error('Canonical external media could not be staged.'); }
  if (!response?.ok || !response.body) throw new Error('Canonical external media could not be staged.');
  if (response.url) {
    try { if (new URL(response.url).protocol !== 'https:') throw new Error(); }
    catch { throw new Error('Canonical external media redirect is unsafe.'); }
  }
  const declared = response.headers?.get?.('content-length');
  if (declared !== null && declared !== undefined
    && (!/^\d{1,12}$/.test(declared) || Number(declared) < 1 || Number(declared) > MAX_EXTERNAL_MEDIA_BYTES)) {
    throw new Error('Canonical external media exceeds the staging limit.');
  }
  const reader = response.body.getReader();
  let handle;
  try { handle = await fsApi.promises.open(target, 'wx'); }
  catch (error) { reader.releaseLock(); throw error; }
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_EXTERNAL_MEDIA_BYTES) {
        await reader.cancel();
        throw new Error('Canonical external media exceeds the staging limit.');
      }
      await handle.write(value);
    }
  } finally {
    reader.releaseLock();
    await handle.close();
  }
  if (total < 1 || declared !== null && declared !== undefined && total !== Number(declared)) {
    throw new Error('Canonical external media staging was incomplete.');
  }
}

async function materializeFile(sourcePath, destinationPath, fsApi = fs, {
  assertAuthority = null,
  ownerSignal = null,
  lifecycleHooks = {},
  cleanupAttempts = 3,
  cleanupDelay = defaultCleanupDelay,
} = {}) {
  await fsApi.promises.mkdir(path.dirname(destinationPath), { recursive: true });
  const nonce = randomBytes(16).toString('hex');
  const temporaryPath = path.join(path.dirname(destinationPath), `.${path.basename(destinationPath)}.${nonce}.tmp`);
  const backupPath = path.join(path.dirname(destinationPath), `.${path.basename(destinationPath)}.${nonce}.bak`);
  let backedUp = false;
  let destinationOriginallyPresent = false;
  let destinationContainsNewBytes = false;
  let temporaryExists = false;
  let invalidated = Boolean(ownerSignal?.aborted);
  const invalidate = () => { invalidated = true; };
  ownerSignal?.addEventListener?.('abort', invalidate, { once: true });
  const assertCurrent = () => {
    if (invalidated) throw new Error('Native destination authority changed during promotion.');
    assertAuthority?.();
  };
  let primaryError = null;
  try {
    temporaryExists = true;
    await fsApi.promises.copyFile(sourcePath, temporaryPath);
    await lifecycleHooks.afterCopy?.(temporaryPath);
    assertCurrent();
    const temporaryStat = await fsApi.promises.stat(temporaryPath);
    if (!temporaryStat.isFile() || temporaryStat.size <= 0) throw new Error('Materialized cache artifact is empty.');
    try {
      await fsApi.promises.rename(destinationPath, backupPath);
      backedUp = true;
      destinationOriginallyPresent = true;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    assertCurrent();
    await lifecycleHooks.beforeCommit?.(temporaryPath, destinationPath);
    assertCurrent();
    await fsApi.promises.rename(temporaryPath, destinationPath);
    temporaryExists = false;
    destinationContainsNewBytes = true;
    await lifecycleHooks.afterCommit?.(destinationPath);
    assertCurrent();
    const stat = await fsApi.promises.stat(destinationPath);
    if (!stat.isFile() || stat.size !== temporaryStat.size) throw new Error('Materialized destination failed integrity check.');
    assertCurrent();
    if (backedUp) {
      // This final deletion is synchronous in production so an owner transition
      // cannot interleave between the last authority check and transaction end.
      if (typeof fsApi.rmSync === 'function') fsApi.rmSync(backupPath, { force: true });
      else await removeWithRetry(fsApi, backupPath, { force: true }, cleanupAttempts, cleanupDelay);
      backedUp = false;
      assertCurrent();
    }
    return { path: destinationPath, sizeBytes: stat.size };
  } catch (error) {
    primaryError = error;
    const rollbackFailures = [];
    let newDestinationRemoved = !destinationContainsNewBytes;
    if (destinationContainsNewBytes) {
      try { await removeWithRetry(fsApi, destinationPath, { force: true }, cleanupAttempts, cleanupDelay); newDestinationRemoved = true; }
      catch (rollbackFailure) { rollbackFailures.push(rollbackFailure); }
    }
    let originalRestored = !destinationOriginallyPresent;
    if (backedUp) {
      if (newDestinationRemoved) {
        try {
          await renameWithRetry(fsApi, backupPath, destinationPath, cleanupAttempts, cleanupDelay);
          originalRestored = true;
          backedUp = false;
        } catch (rollbackFailure) { rollbackFailures.push(rollbackFailure); }
      } else {
        try { await copyWithRetry(fsApi, backupPath, destinationPath, cleanupAttempts, cleanupDelay); originalRestored = true; }
        catch (rollbackFailure) { rollbackFailures.push(rollbackFailure); }
        if (originalRestored) {
          try { await removeWithRetry(fsApi, backupPath, { force: true }, cleanupAttempts, cleanupDelay); backedUp = false; }
          catch (rollbackFailure) { rollbackFailures.push(rollbackFailure); }
        }
      }
    }
    const safeDestination = destinationOriginallyPresent ? originalRestored : newDestinationRemoved;
    if (rollbackFailures.length) attachSecondaryFailure(error, 'rollbackFailure', 'Native destination rollback encountered a permanent failure.');
    if (!safeDestination) {
      try { Object.defineProperty(error, 'unrecoveredOwnerState', { value: true, enumerable: false, configurable: true }); } catch {}
      try { Object.defineProperty(error, 'code', { value: 'native-promotion-recovery-required', enumerable: true, configurable: true }); } catch {}
    }
    throw error;
  } finally {
    ownerSignal?.removeEventListener?.('abort', invalidate);
    let cleanupError = null;
    try { if (temporaryExists) await removeWithRetry(fsApi, temporaryPath, { force: true }, cleanupAttempts, cleanupDelay); }
    catch (error) { cleanupError = error; }
    if (cleanupError) {
      if (primaryError) attachSecondaryFailure(primaryError, 'cleanupFailure', 'Native promotion cleanup failed.');
      else throw new Error('Required native promotion cleanup failed.');
    }
  }
}

async function materializeWithOwnerTransaction(
  sourcePath,
  destinationPath,
  fsApi,
  ownerContext,
  executionOwner,
  options = {},
) {
  const assertCritical = ownerContext?.assertCriticalCurrent?.bind(ownerContext)
    || ownerContext?.assertCurrent?.bind(ownerContext);
  const operation = () => materializeFile(sourcePath, destinationPath, fsApi, {
    ...options,
    assertAuthority: executionOwner && assertCritical ? () => assertCritical(executionOwner) : null,
    ownerSignal: executionOwner?.signal,
  });
  return executionOwner && ownerContext?.runCritical
    ? ownerContext.runCritical(executionOwner, operation)
    : operation();
}

async function removeWithRetry(fsApi, targetPath, options, attempts = 3, delay = defaultCleanupDelay) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { await fsApi.promises.rm(targetPath, options); return; }
    catch (error) { lastError = error; if (attempt < attempts) await delay(attempt); }
  }
  const failure = new Error('Required native temporary cleanup failed.');
  failure.cause = lastError;
  throw failure;
}

async function renameWithRetry(fsApi, sourcePath, destinationPath, attempts = 3, delay = defaultCleanupDelay) {
  return retryFilesystemOperation(() => fsApi.promises.rename(sourcePath, destinationPath), attempts, delay, 'Required native destination restoration failed.');
}

async function copyWithRetry(fsApi, sourcePath, destinationPath, attempts = 3, delay = defaultCleanupDelay) {
  return retryFilesystemOperation(() => fsApi.promises.copyFile(sourcePath, destinationPath), attempts, delay, 'Required native destination restoration failed.');
}

async function retryFilesystemOperation(operation, attempts, delay, message) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { await operation(); return; }
    catch (error) { lastError = error; if (attempt < attempts) await delay(attempt); }
  }
  const failure = new Error(message);
  failure.cause = lastError;
  throw failure;
}

function defaultCleanupDelay(attempt) {
  return new Promise((resolve) => setTimeout(resolve, attempt * 20));
}

function attachSecondaryFailure(primary, property, message) {
  try { Object.defineProperty(primary, property, { value: new Error(message), enumerable: false, configurable: true }); } catch {}
}

async function detectCapabilities(options = {}) {
  const runtime = resolveRuntime(options);
  const executable = runtime.ffmpeg;
  const captureFn = options.capture ?? capture;
  if (!executable) return { available: false, executable: null, version: null, encoders: [], hardwareEncoders: [], gpuDevices: [], ffprobeAvailable: false, ffprobeExecutable: null, ffprobeVersion: null, reason: 'Bundled FFmpeg is missing from this ShortsFlow installation.' };
  try {
    const versionOutput = await captureFn(executable, ['-version']);
    const encodersOutput = await captureFn(executable, ['-hide_banner', '-encoders']);
    const encoders = parseEncoderRows(encodersOutput);
    const hardwareEncoders = encoders.filter((name) => /nvenc|qsv|vaapi|videotoolbox|amf/i.test(name));
    const gpuDevices = await detectNvidiaGpus();
    const ffprobeExecutable = resolveFFprobeExecutable({ runtime, fsApi: options.fsApi ?? fs });
    let ffprobeAvailable = false; let ffprobeVersion = null;
    try { const probe = await captureFn(ffprobeExecutable, ['-version']); ffprobeAvailable = true; ffprobeVersion = probe.split(/\r?\n/)[0] || null; } catch {}
    return { available: true, executable, version: versionOutput.split(/\r?\n/)[0] || null, encoders, hardwareEncoders, gpuDevices, ffprobeAvailable, ffprobeExecutable: ffprobeAvailable ? ffprobeExecutable : null, ffprobeVersion, reason: ffprobeAvailable ? null : runtime.source === 'bundled' ? 'Bundled FFprobe is missing from this ShortsFlow installation.' : 'FFprobe is unavailable on the current development PATH.' };
  } catch {
    return { available: false, executable: null, version: null, encoders: [], hardwareEncoders: [], gpuDevices: [], ffprobeAvailable: false, ffprobeExecutable: null, ffprobeVersion: null, reason: runtime.source === 'bundled' ? 'Bundled FFmpeg could not be executed. Reinstall ShortsFlow.' : 'FFmpeg is unavailable on the current development PATH.' };
  }
}

function parseEncoderRows(output) {
  return String(output).split(/\r?\n/).flatMap((line) => {
    // FFmpeg encoder rows begin with a six-character capability field. Its
    // letters vary by FFmpeg build (for example V....D), so only its stable
    // structure is parsed; headers, separators, and prose do not match.
    const match = /^\s*[VAS][A-Z.]{5}\s+([a-z0-9][a-z0-9_.-]*)\s{2,}\S/i.exec(line);
    return match ? [match[1]] : [];
  });
}


async function detectNvidiaGpus() {
  try {
    const output = await capture('nvidia-smi', [
      '--query-gpu=index,name,driver_version,memory.total,memory.free,utilization.gpu,temperature.gpu',
      '--format=csv,noheader,nounits',
    ]);
    return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const [index, name, driverVersion, memoryTotal, memoryFree, utilization, temperature] = line.split(',').map((value) => value.trim());
      return {
        index: Number(index) || 0, name, driverVersion: driverVersion || null,
        memoryTotalMiB: numericOrNull(memoryTotal), memoryFreeMiB: numericOrNull(memoryFree),
        utilizationPercent: numericOrNull(utilization), temperatureCelsius: numericOrNull(temperature),
      };
    });
  } catch { return []; }
}
function numericOrNull(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }

async function analyzeOutput(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') {
    throw new Error('Analiz edilecek çıktı yolu geçersiz.');
  }

  const executable = resolveFFprobeExecutable();
  const output = await capture(executable, [
    '-v',
    'error',
    '-show_entries',
    'format=format_name,duration,size,bit_rate:stream=index,codec_type,codec_name,codec_long_name,profile,width,height,pix_fmt,r_frame_rate,bit_rate,duration,sample_rate,channels,channel_layout',
    '-of',
    'json',
    targetPath,
  ]);

  const parsed = JSON.parse(output);
  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
  const video = streams.find((stream) => stream.codec_type === 'video') ?? null;
  const audio = streams.find((stream) => stream.codec_type === 'audio') ?? null;
  const format = parsed.format ?? {};
  const sizeBytes = Number(format.size) || 0;

  return {
    outputPath: targetPath,
    containerFormat: format.format_name ?? null,
    durationSeconds: numericOrNull(format.duration),
    sizeBytes,
    overallBitRate: numericOrNull(format.bit_rate),
    video: video ? normalizeStream(video) : null,
    audio: audio ? normalizeStream(audio) : null,
    warnings: [],
    qualityScore: 0,
    passed: false,
    analyzedAt: new Date().toISOString(),
  };
}

async function verifyArtifactSnapshot(targetPath, { snapshots, analyze = analyzeOutput, digest = hashFileSha256 } = {}) {
  if (!snapshots) throw new TypeError('Trusted artifact snapshot storage is required.');
  const snapshot = await snapshots.create(targetPath); let operationError = null;
  try {
    const diagnostics = await analyze(snapshot.snapshotPath);
    const integrity = await digest(snapshot.snapshotPath);
    if (integrity.sizeBytes !== snapshot.sizeBytes) throw new ArtifactIntegrityError('artifact-integrity-mismatch', 'The verification snapshot changed while it was analyzed.');
    await snapshots.assertSourceUnchanged(snapshot);
    return { diagnostics: { ...diagnostics, outputPath: targetPath }, integrity: { artifactPath: targetPath, sizeBytes: integrity.sizeBytes, contentDigest: integrity.contentDigest } };
  } catch (error) { operationError = error; throw error; }
  finally {
    const removed = await snapshots.remove(snapshot.snapshotPath);
    if (!removed && !operationError) throw new ArtifactIntegrityError('artifact-snapshot-cleanup-failed', 'The temporary verification snapshot could not be removed safely.');
  }
}

function normalizeStream(stream) {
  return {
    codecName: stream.codec_name ?? null,
    codecLongName: stream.codec_long_name ?? null,
    profile: stream.profile ?? null,
    width: numericOrNull(stream.width),
    height: numericOrNull(stream.height),
    pixelFormat: stream.pix_fmt ?? null,
    frameRate: parseFrameRate(stream.r_frame_rate),
    bitRate: numericOrNull(stream.bit_rate),
    durationSeconds: numericOrNull(stream.duration),
    sampleRate: numericOrNull(stream.sample_rate),
    channels: numericOrNull(stream.channels),
    channelLayout: stream.channel_layout ?? null,
  };
}

function parseFrameRate(value) {
  if (!value || typeof value !== 'string') return null;
  const [numerator, denominator] = value.split('/').map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  return numerator / denominator;
}

function resolveFFprobeExecutable({ runtime = resolveRuntime(), fsApi = fs } = {}) {
  if (runtime.source === 'bundled') return runtime.ffprobe;
  if (runtime.ffprobe) return runtime.ffprobe;
  const ffmpeg = runtime.ffmpeg;
  if (!ffmpeg) return null;
  const directory = path.dirname(ffmpeg);
  const extension = process.platform === 'win32' ? '.exe' : '';
  const candidate = path.join(directory, `ffprobe${extension}`);

  if (fsApi.existsSync(candidate)) return candidate;
  return 'ffprobe';
}

function resolveExecutable(options = {}) {
  return resolveRuntime(options).ffmpeg;
}

function resolveRuntime({ isPackaged, resourcesPath, env = process.env, fsApi = fs } = {}) {
  const packaged = isPackaged ?? isPackagedRuntime({ appIsPackaged: Boolean(app?.isPackaged), env });
  const e2ePackaged = !app?.isPackaged && env.SHORTSFLOW_PRODUCT_E2E_PACKAGED === '1';
  return resolveFFmpegRuntime({
    isPackaged: packaged,
    resourcesPath: resourcesPath ?? (e2ePackaged ? env.SHORTSFLOW_E2E_RESOURCES_PATH : process.resourcesPath),
    env,
    fsApi
  });
}

async function runFFmpeg(webContents, request, {
  geometryAuthority = null,
  supabaseUrl = null,
  ownerContext = null,
  executionOwner = null,
  concatContent = '',
  fsApi = fs,
  spawnImpl = spawn,
  capabilities: capabilityOverride = null,
  fetchImpl = globalThis.fetch,
  probeInput = probeExecutionInput,
  lifecycleHooks = {},
} = {}) {
  const capabilities = capabilityOverride || await detectCapabilities();
  if (!capabilities.available || !capabilities.executable) throw new Error('FFmpeg executable bulunamadı.');
  if (active.has(request.jobId)) throw new Error('Aynı jobId ile aktif FFmpeg işlemi var.');
  if (executionOwner) ownerContext?.assertCurrent(executionOwner);
  const tempDir = await fsApi.promises.mkdtemp(path.join(os.tmpdir(), 'shortsflow-ffmpeg-'));
  let operationError = null;
  try {
    const subtitlePath = path.join(tempDir, 'subtitles.srt');
    const watermarkTextPath = path.join(tempDir, 'watermark.txt');
    const concatPath = path.join(tempDir, 'segments.txt');
    const stagedOutputPath = path.join(tempDir, 'render-output.mp4');
    if (request.subtitleContent) {
      await fsApi.promises.writeFile(subtitlePath, request.subtitleContent, 'utf8');
      await lifecycleHooks.afterSubtitleWrite?.(tempDir);
    }
    if (typeof request.brandingText === 'string') await fsApi.promises.writeFile(watermarkTextPath, request.brandingText, 'utf8');
    if (concatContent) {
      await fsApi.promises.writeFile(concatPath, concatContent, 'utf8');
      await lifecycleHooks.afterConcatWrite?.(tempDir);
    }
    const outputPath = resolveOutputPath(request.outputPath, request.jobId);
    await fsApi.promises.mkdir(path.dirname(outputPath), { recursive: true });
    await lifecycleHooks.afterOutputDirectory?.(tempDir);
    if (executionOwner) ownerContext?.assertCurrent(executionOwner);
    const substitutedArgs = request.args.map((arg) => arg
      .replaceAll('{{SUBTITLE_FILE_FILTER_VALUE}}', serializeSubtitleFilterFilename(subtitlePath))
      .replaceAll('{{WATERMARK_TEXT_FILE_FILTER_VALUE}}', serializeSubtitleFilterFilename(watermarkTextPath))
      .replaceAll('{{CONCAT_FILE}}', concatPath)
      .replaceAll('{{OUTPUT_FILE}}', stagedOutputPath));
    const imagePreparedArgs = await prepareImageDisplayGeometryExecution(
      substitutedArgs, request.imageGeometryAuthorities, geometryAuthority, supabaseUrl,
      { tempDir, fsApi, fetchImpl, ownerContext, executionOwner, webContentsId: webContents.id, trustedCanonicalFilters: request[TRUSTED_CANONICAL_FILTERS] === true },
    );
    const args = await prepareCanonicalExternalMediaExecution(request.args, imagePreparedArgs, {
      supabaseUrl, tempDir, fetchImpl, fsApi, probeInput, ownerContext, executionOwner,
    });
    await lifecycleHooks.afterInputPreparation?.(tempDir);
    if (executionOwner) ownerContext?.assertCurrent(executionOwner);
    const started = Date.now();
    const stderrTail = [];
    const result = await new Promise((resolve, reject) => {
      let child;
      try { child = spawnImpl(capabilities.executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); }
      catch (error) { reject(error); return; }
      active.set(request.jobId, { child, webContentsId: webContents.id });
      let progress = {};
      let stdoutBuffer = '';
      let ownerInvalidated = false;
      let ownerKillTimer = null;
      const abortForOwner = () => {
        ownerInvalidated = true;
        if (!child.killed) child.kill('SIGTERM');
        ownerKillTimer = setTimeout(() => {
          if (active.get(request.jobId)?.child === child) child.kill('SIGKILL');
        }, 1500);
        ownerKillTimer.unref?.();
      };
      executionOwner?.signal?.addEventListener('abort', abortForOwner, { once: true });
      try { lifecycleHooks.afterFFmpegSpawn?.(tempDir, child); }
      catch (error) {
        active.delete(request.jobId);
        executionOwner?.signal?.removeEventListener('abort', abortForOwner);
        if (!child.killed) child.kill('SIGTERM');
        reject(error);
        return;
      }
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdoutBuffer += chunk;
        const lines = stdoutBuffer.split(/\r?\n/); stdoutBuffer = lines.pop() || '';
        for (const line of lines) {
          const i = line.indexOf('='); if (i < 0) continue;
          progress[line.slice(0,i)] = line.slice(i+1);
          if (line.startsWith('progress=')) {
            webContents.send('ffmpeg:progress', {
              jobId: request.jobId,
              frame: Number(progress.frame || 0), fps: Number(progress.fps || 0),
              outTimeMs: Math.round(Number(progress.out_time_us || 0) / 1000),
              speed: Number(String(progress.speed || '0').replace('x','')) || 0,
              progress: progress.progress === 'end' ? 'end' : 'continue',
            });
            progress = {};
          }
        }
      });
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => {
        for (const line of chunk.split(/\r?\n/).filter(Boolean)) {
          stderrTail.push(sanitizeFFmpegDiagnostic(line)); if (stderrTail.length > 30) stderrTail.shift();
        }
      });
      child.on('error', finishError);
      child.on('close', async (code, signal) => {
        active.delete(request.jobId);
        if (ownerKillTimer) clearTimeout(ownerKillTimer);
        executionOwner?.signal?.removeEventListener('abort', abortForOwner);
        try {
          if (ownerInvalidated || executionOwner && !ownerContext?.isCurrent(executionOwner)) {
            reject(new Error('Render owner authority changed during execution.'));
            return;
          }
          if (code !== 0) {
            reject(new Error(signal ? `FFmpeg ${signal} sinyaliyle sonlandı.` : `FFmpeg ${code} koduyla sonlandı. ${stderrTail.slice(-5).join(' ')}`));
            return;
          }
          const stat = await fsApi.promises.stat(stagedOutputPath);
          if (executionOwner) ownerContext?.assertCurrent(executionOwner);
          await lifecycleHooks.afterResultProcessing?.(tempDir, stagedOutputPath);
          resolve({ sizeBytes: stat.size, elapsedMs: Date.now()-started, exitCode: code || 0, stderrTail });
        } catch (error) { reject(error); }
      });
      function finishError(error) {
        active.delete(request.jobId);
        if (ownerKillTimer) clearTimeout(ownerKillTimer);
        executionOwner?.signal?.removeEventListener('abort', abortForOwner);
        reject(error);
      }
    });
    if (executionOwner) ownerContext?.assertCurrent(executionOwner);
    await materializeWithOwnerTransaction(stagedOutputPath, outputPath, fsApi, ownerContext, executionOwner, {
      lifecycleHooks: lifecycleHooks.promotion,
      cleanupAttempts: lifecycleHooks.cleanupAttempts ?? 3,
      cleanupDelay: lifecycleHooks.cleanupDelay ?? defaultCleanupDelay,
    });
    if (executionOwner) ownerContext?.assertCurrent(executionOwner);
    return { ...result, outputPath };
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    let cleanupError = null;
    try { await removeWithRetry(fsApi, tempDir, { recursive: true, force: true }, lifecycleHooks.cleanupAttempts ?? 3, lifecycleHooks.cleanupDelay ?? defaultCleanupDelay); }
    catch (error) { cleanupError = error; }
    if (cleanupError) {
      if (operationError) attachSecondaryFailure(operationError, 'cleanupFailure', 'Native render cleanup failed.');
      else throw new Error('Required native render cleanup failed.');
    }
    if (!operationError && executionOwner) ownerContext?.assertCurrent(executionOwner);
  }
}

function getSegmentDirectory(owner = null) {
  const root = path.join(app.getPath('userData'), 'render-cache', 'segments');
  return owner?.ownerId ? path.join(root, owner.ownerId.toLowerCase()) : root;
}
function getSegmentPath(fingerprint, owner = null) {
  const safe = sanitize(fingerprint);
  return path.join(getSegmentDirectory(owner), `v2-${safe}.mp4`);
}

function resolveOutputPath(requested, jobId) {
  if (requested && path.isAbsolute(requested)) return requested;
  const dir = path.join(app.getPath('videos'), 'ShortsFlow');
  return path.join(dir, `${sanitize(jobId)}.mp4`);
}
function resolveSelectedOutputPath(result) {
  if (!result || result.canceled || typeof result.filePath !== 'string' || !result.filePath) return null;
  const selectedPath = validateTargetPath(result.filePath);
  return path.extname(selectedPath).toLowerCase() === '.mp4' ? selectedPath : `${selectedPath}.mp4`;
}
function sanitize(value) { return String(value).replace(/[^a-z0-9_-]/gi, '_'); }
function sanitizeFFmpegDiagnostic(value) {
  return String(value).replace(/https?:\/\/[^\s'"<>]+/gi, '[remote-media-url]');
}
// Serializes a value for FFmpeg's filtergraph parser, not for a shell. The
// trusted main compilation supplies only a placeholder; this process owns the temporary path.
function serializeSubtitleFilterFilename(value) {
  return `'${String(value).replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")}'`;
}
function capture(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true }); let out=''; let err='';
    child.stdout.on('data', c => out += c); child.stderr.on('data', c => err += c);
    child.on('error', reject); child.on('close', code => code === 0 ? resolve(out || err) : reject(new Error(err || `Exit ${code}`)));
  });
}
module.exports = {
  registerFFmpegHandlers,
  materializeFile,
  materializeWithOwnerTransaction,
  resolveSelectedOutputPath,
  saveVerifiedExportAs,
  rememberApprovedExportDestination,
  rememberVerifiedExportArtifact,
  isKnownVerifiedExportArtifact,
  resolveVerifiedExportPublishCapability,
  issueSegmentResource,
  rememberIssuedSegment,
  requireIssuedSegment,
  rememberRenderedArtifact,
  requireRenderedArtifact,
  requireKnownResource,
  requireApprovedDestination,
  consumeApprovedExportDestination,
  createCanonicalRenderPlan,
  consumeCanonicalRenderPlan,
  validateCanonicalInputAcquisition,
  canonicalConcatContent,
  probeExecutionInput,
  prepareCanonicalExternalMediaExecution,
  runFFmpeg,
  resetFFmpegAuthorityStateForTests,
  invalidateOwnerBoundAuthorities,
  bindWebContentsLifecycle,
  clearWebContentsAuthorities,
  removeWithRetry,
  authorityRegistryStats,
  verifyArtifactSnapshot,
  detectCapabilities,
  parseEncoderRows,
  sanitizeFFmpegDiagnostic,
  serializeSubtitleFilterFilename,
  resolveExecutable,
  resolveFFprobeExecutable,
  resolveRuntime,
};

function authorityRegistryStats(now = Date.now()) {
  pruneCanonicalRenderPlans(now);
  pruneSegmentResources(now);
  pruneNestedRegistry(renderedArtifacts, now);
  pruneNestedRegistry(verifiedExportArtifacts, now);
  pruneNestedRegistry(approvedExportDestinations, now);
  return Object.freeze({
    renderPlans: canonicalRenderPlans.size,
    segmentResources: issuedSegmentResources.size,
    renderedArtifacts: nestedRegistrySize(renderedArtifacts),
    verifiedExportArtifacts: nestedRegistrySize(verifiedExportArtifacts),
    approvedExportDestinations: nestedRegistrySize(approvedExportDestinations),
  });
}
