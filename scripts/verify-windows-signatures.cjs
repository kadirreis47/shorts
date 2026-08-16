const { execFileSync } = require('node:child_process');
const path = require('node:path');
const packageJson = require('../package.json');

const REQUIRED_ARTIFACTS = [
  path.join('release', 'win-unpacked', `${packageJson.build.productName}.exe`),
  path.join('release', `${packageJson.build.productName} Setup ${packageJson.version}.exe`),
];

function assertValidAuthenticodeResults(results) {
  const normalized = Array.isArray(results) ? results : [results];
  if (normalized.length !== REQUIRED_ARTIFACTS.length) {
    throw new Error('Public Windows release signature verification returned an incomplete artifact set.');
  }

  const expectedNames = new Set(REQUIRED_ARTIFACTS.map((artifact) => path.basename(artifact)));
  const actualNames = new Set(normalized.map((result) => typeof result?.artifact === 'string' ? path.basename(result.artifact) : ''));
  if (expectedNames.size !== actualNames.size || [...expectedNames].some((name) => !actualNames.has(name))) {
    throw new Error('Public Windows release signature verification returned an unexpected artifact set.');
  }

  for (const result of normalized) {
    if (result?.status !== 'Valid' || result.signerPresent !== true) {
      const name = typeof result?.artifact === 'string' ? path.basename(result.artifact) : 'release artifact';
      throw new Error(`Public Windows release artifact is not Authenticode-valid: ${name}.`);
    }
  }

  return normalized;
}

function verifyWindowsSignatures({ run = execFileSync } = {}) {
  if (process.platform !== 'win32') {
    throw new Error('Public Windows release signature verification must run on Windows.');
  }

  const script = path.join(__dirname, 'verify-windows-signatures.ps1');
  const output = run('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-File', script,
  ], { encoding: 'utf8' });

  let results;
  try {
    results = JSON.parse(String(output).trim());
  } catch {
    throw new Error('Public Windows release signature verification returned an invalid result.');
  }

  return assertValidAuthenticodeResults(results);
}

if (require.main === module) {
  try {
    const results = verifyWindowsSignatures();
    for (const result of results) {
      console.log(`[ShortsFlow] Authenticode verification passed: ${path.basename(result.artifact)}.`);
    }
  } catch (error) {
    console.error(`[ShortsFlow] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { REQUIRED_ARTIFACTS, assertValidAuthenticodeResults, verifyWindowsSignatures };
