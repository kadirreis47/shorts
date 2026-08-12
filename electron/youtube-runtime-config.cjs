const fs = require('fs');
const path = require('path');

const CONFIG_FILE = 'shortsflow.runtime.json';

function clean(value) { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function readOAuthConfig(filePath, fsApi = fs) {
  try {
    const parsed = JSON.parse(fsApi.readFileSync(filePath, 'utf8'));
    const config = { clientId: clean(parsed.youtubeClientId), clientSecret: clean(parsed.youtubeClientSecret) };
    return config.clientId || config.clientSecret ? config : null;
  } catch { return null; }
}

function resolveYouTubeOAuthConfig({ env = process.env, userDataPath, resourcesPath = process.resourcesPath, fsApi = fs } = {}) {
  const environment = { clientId: clean(env.SHORTSFLOW_YOUTUBE_CLIENT_ID), clientSecret: clean(env.SHORTSFLOW_YOUTUBE_CLIENT_SECRET) };
  if (environment.clientId || environment.clientSecret) return environment;
  const locations = [userDataPath && path.join(userDataPath, CONFIG_FILE), resourcesPath && path.join(resourcesPath, CONFIG_FILE)].filter(Boolean);
  for (const location of locations) { const config = readOAuthConfig(location, fsApi); if (config) return config; }
  return { clientId: null, clientSecret: null };
}
function resolveYouTubeClientId(options) { return resolveYouTubeOAuthConfig(options).clientId; }

module.exports = { CONFIG_FILE, resolveYouTubeClientId, resolveYouTubeOAuthConfig };
