const fs = require('fs');
const path = require('path');

const CONFIG_FILE = 'shortsflow.runtime.json';

function readClientId(filePath, fsApi = fs) {
  try {
    const parsed = JSON.parse(fsApi.readFileSync(filePath, 'utf8'));
    return typeof parsed.youtubeClientId === 'string' && parsed.youtubeClientId.trim() ? parsed.youtubeClientId.trim() : null;
  } catch { return null; }
}

function resolveYouTubeClientId({ env = process.env, userDataPath, resourcesPath = process.resourcesPath, fsApi = fs } = {}) {
  if (typeof env.SHORTSFLOW_YOUTUBE_CLIENT_ID === 'string' && env.SHORTSFLOW_YOUTUBE_CLIENT_ID.trim()) return env.SHORTSFLOW_YOUTUBE_CLIENT_ID.trim();
  const locations = [userDataPath && path.join(userDataPath, CONFIG_FILE), resourcesPath && path.join(resourcesPath, CONFIG_FILE)].filter(Boolean);
  for (const location of locations) { const clientId = readClientId(location, fsApi); if (clientId) return clientId; }
  return null;
}

module.exports = { CONFIG_FILE, resolveYouTubeClientId };
