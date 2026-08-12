const fs = require('fs');
const path = require('path');
function clean(value) { return typeof value === 'string' && value.trim() ? value.trim().replace(/^['"]|['"]$/g, '') || null : null; }
function dotenvValue(contents, name) { const line = contents.split(/\r?\n/).find((item) => item.trim().startsWith(`${name}=`)); return line ? clean(line.slice(line.indexOf('=') + 1)) : null; }
function loadLocalYouTubeOAuthConfig({ cwd = process.cwd(), env = process.env, fsApi = fs } = {}) {
  const environment = { clientId: clean(env.SHORTSFLOW_YOUTUBE_CLIENT_ID), clientSecret: clean(env.SHORTSFLOW_YOUTUBE_CLIENT_SECRET) };
  if (environment.clientId || environment.clientSecret) return environment;
  try {
    const contents = fsApi.readFileSync(path.join(cwd, '.env'), 'utf8');
    return { clientId: dotenvValue(contents, 'SHORTSFLOW_YOUTUBE_CLIENT_ID'), clientSecret: dotenvValue(contents, 'SHORTSFLOW_YOUTUBE_CLIENT_SECRET') };
  } catch { return { clientId: null, clientSecret: null }; }
}
function loadLocalYouTubeClientId(options) { return loadLocalYouTubeOAuthConfig(options).clientId; }
module.exports = { loadLocalYouTubeClientId, loadLocalYouTubeOAuthConfig };
