const fs = require('fs');
const path = require('path');

const CONFIG_FILE = 'shortsflow.runtime.json';

function clean(value) { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function validUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && /\.supabase\.co$/i.test(url.hostname) ? url.origin : null; }
  catch { return null; }
}
function readConfig(filePath, fsApi = fs) {
  try {
    const parsed = JSON.parse(fsApi.readFileSync(filePath, 'utf8'));
    const url = validUrl(clean(parsed.supabaseUrl));
    const anonKey = clean(parsed.supabaseAnonKey);
    return url && anonKey ? { url, anonKey } : null;
  } catch { return null; }
}

function resolveSupabaseAuthConfig({ env = process.env, resourcesPath = process.resourcesPath, isPackaged = false, fsApi = fs } = {}) {
  const packagedConfig = resourcesPath ? readConfig(path.join(resourcesPath, CONFIG_FILE), fsApi) : null;
  // A packaged build trusts only its build-owned resource. Launch environment
  // overrides must not be able to redirect bearer-token validation.
  if (isPackaged) return packagedConfig || { url: null, anonKey: null };
  const environmentUrl = validUrl(clean(env.VITE_SUPABASE_URL));
  const environmentAnonKey = clean(env.VITE_SUPABASE_ANON_KEY);
  if (environmentUrl && environmentAnonKey) return { url: environmentUrl, anonKey: environmentAnonKey };
  // Supabase identity authority is build-owned. Never accept a renderer/user-data
  // override that could redirect bearer-token validation to another project.
  if (packagedConfig) return packagedConfig;
  return { url: null, anonKey: null };
}

module.exports = { CONFIG_FILE, resolveSupabaseAuthConfig };
