const fs = require('fs');
const path = require('path');
const { loadLocalSupabaseConfig, loadLocalYouTubeOAuthConfig } = require('./electron-local-config.cjs');

const OUTPUT_DIRECTORY = path.join(process.cwd(), '.shortsflow-build');
const OUTPUT_FILE = path.join(OUTPUT_DIRECTORY, 'shortsflow.runtime.json');

function generateRuntimeConfig({ clientId, clientSecret, resolveConfig = loadLocalYouTubeOAuthConfig, resolveSupabaseConfig = loadLocalSupabaseConfig, outputFile = OUTPUT_FILE, fsApi = fs } = {}) {
  const resolved = clientId === undefined && clientSecret === undefined ? resolveConfig() : { clientId, clientSecret };
  const supabase = resolveSupabaseConfig();
  try { fsApi.rmSync(outputFile, { force: true }); } catch {}
  const value = {
    youtubeClientId: typeof resolved?.clientId === 'string' && resolved.clientId.trim() ? resolved.clientId.trim() : '',
    youtubeClientSecret: typeof resolved?.clientSecret === 'string' && resolved.clientSecret.trim() ? resolved.clientSecret.trim() : '',
    supabaseUrl: typeof supabase?.url === 'string' && supabase.url.trim() ? supabase.url.trim() : '',
    supabaseAnonKey: typeof supabase?.anonKey === 'string' && supabase.anonKey.trim() ? supabase.anonKey.trim() : '',
  };
  fsApi.mkdirSync(path.dirname(outputFile), { recursive: true, mode: 0o700 });
  const temporary = `${outputFile}.${process.pid}.tmp`;
  fsApi.writeFileSync(temporary, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 });
  fsApi.renameSync(temporary, outputFile);
  return outputFile;
}

if (require.main === module) {
  try { console.log(`[ShortsFlow] Generated Electron runtime OAuth configuration at ${generateRuntimeConfig()}.`); } catch (error) { console.error(`[ShortsFlow] ${error.message}`); process.exitCode = 1; }
}

module.exports = { OUTPUT_FILE, generateRuntimeConfig };
