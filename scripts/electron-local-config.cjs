const fs = require('fs');
const path = require('path');
function loadLocalYouTubeClientId({ cwd = process.cwd(), env = process.env, fsApi = fs } = {}) {
  if (typeof env.SHORTSFLOW_YOUTUBE_CLIENT_ID === 'string' && env.SHORTSFLOW_YOUTUBE_CLIENT_ID.trim()) return env.SHORTSFLOW_YOUTUBE_CLIENT_ID.trim();
  try { const line = fsApi.readFileSync(path.join(cwd, '.env'), 'utf8').split(/\r?\n/).find((item) => item.trim().startsWith('SHORTSFLOW_YOUTUBE_CLIENT_ID=')); return line ? line.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '') || null : null; } catch { return null; }
}
module.exports = { loadLocalYouTubeClientId };
