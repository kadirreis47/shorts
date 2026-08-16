function present(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function credentialPair(env, linkName, passwordName, source) {
  const hasLink = present(env[linkName]);
  const hasPassword = present(env[passwordName]);

  if (!hasLink && !hasPassword) return null;
  if (!hasLink || !hasPassword) {
    throw new Error(`Public Windows release requires both ${linkName} and ${passwordName}.`);
  }

  return { source };
}

function validatePublicWindowsSigning(env = process.env) {
  const windowsCredentials = credentialPair(env, 'WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD', 'WIN_CSC');
  if (windowsCredentials) return windowsCredentials;

  const standardCredentials = credentialPair(env, 'CSC_LINK', 'CSC_KEY_PASSWORD', 'CSC');
  if (standardCredentials) return standardCredentials;

  throw new Error('Public Windows release requires WIN_CSC_LINK and WIN_CSC_KEY_PASSWORD (or the standard CSC_LINK and CSC_KEY_PASSWORD fallback).');
}

if (require.main === module) {
  try {
    const signing = validatePublicWindowsSigning();
    console.log(`[ShortsFlow] Public Windows signing credentials are configured via ${signing.source}.`);
  } catch (error) {
    console.error(`[ShortsFlow] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { validatePublicWindowsSigning };
