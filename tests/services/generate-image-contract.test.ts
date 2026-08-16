import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('supabase/functions/generate-image/index.ts', 'utf8');
const verifiedUserSource = readFileSync('supabase/functions/_shared/verified-user.ts', 'utf8');
const protectedFunctionSource = readFileSync('supabase/functions/_shared/protected-function.ts', 'utf8');

describe('generate-image OpenAI contract', () => {
  it('uses the current portrait GPT Image generation contract', () => {
    expect(source).toContain('const IMAGE_MODEL = "gpt-image-1";');
    expect(source).toContain('const IMAGE_SIZE = "1024x1536";');
    expect(source).toContain('model: IMAGE_MODEL');
    expect(source).toContain('size: IMAGE_SIZE');
    expect(source).toContain('quality: "medium"');
    expect(source).toContain('output_format: "png"');
    expect(source).not.toContain('dall-e-3');
    expect(source).not.toContain('1024x1792');
  });

  it('validates base64 provider output and returns private durable media identity', () => {
    expect(source).toContain('const b64Json = data.data?.[0]?.b64_json;');
    expect(source).toContain('base64ToBytes(b64Json)');
    expect(source).toContain('isPng(imageBytes)');
    expect(source).toContain('MAX_GENERATED_IMAGE_BYTES');
    expect(source).toContain('supabase.storage.from("media").upload(storagePath, imageBytes');
    expect(source).toContain('`${verifiedUser.userId}/generated-images/${crypto.randomUUID()}.png`');
    expect(source).toContain('supabase.storage.from("media").createSignedUrl(storagePath, 60 * 60)');
    expect(source).toContain('media: { bucket: "media", objectPath: storagePath }');
    expect(source).not.toContain('getPublicUrl');
  });

  it('uses safe provider and storage errors without leaking provider credentials', () => {
    expect(source).toContain('OpenAI image generation failed. Verify configured model access and image request parameters.');
    expect(source).toContain('Generated image could not be stored.');
    expect(source).not.toContain('api_keys diagnostic');
    expect(source).not.toMatch(/JSON\.stringify\([^\n]*(?:openaiKey|serviceRoleKey|SUPABASE_SERVICE_ROLE_KEY)/);
  });

  it('emits only bounded failure telemetry for provider and private Storage failures', () => {
    expect(source).toContain('event: "generate-image.failure"');
    for (const stage of ['AUTH', 'CONFIG', 'PROVIDER_REQUEST', 'PROVIDER_RESPONSE', 'IMAGE_VALIDATION', 'STORAGE_UPLOAD', 'SIGNED_URL', 'UNKNOWN']) {
      expect(source).toContain(`| "${stage}"`);
    }
    for (const code of ['API_KEYS_QUERY_FAILED', 'OPENAI_NON_SUCCESS', 'STORAGE_UPLOAD_FAILED', 'SIGNED_URL_FAILED', 'UNHANDLED']) {
      expect(source).toContain(`"${code}"`);
    }
    expect(source).toContain('providerStatus');
    expect(source).not.toContain('console.error(openaiKey');
    expect(source).not.toContain('console.error(serviceRoleKey');
    expect(source).not.toContain('console.error(b64Json');
    expect(source).not.toContain('console.error(storagePath');
    expect(source).not.toContain('console.error(fullPrompt');
    expect(source).not.toContain('console.error(signedUrl');
  });

  it('does not return provider diagnostics or raw provider failures', () => {
    expect(source).not.toContain('provider diagnostic');
    expect(source).not.toContain('providerBody = await response.json()');
    expect(source).not.toContain('JSON.stringify({ error: err.message })');
    expect(source).toContain('Image generation could not be completed. Please try again.');
  });

  it('requires a server-verified Supabase user before provider consumption', () => {
    expect(source).toContain('await authorizeProtectedFunction(req, "generate-image")');
    expect(source.indexOf('await authorizeProtectedFunction(req, "generate-image")')).toBeLessThan(source.indexOf('await readBoundedJson<GenerateImageRequest>'));
    expect(protectedFunctionSource).toContain('const verifiedUser = await getVerifiedUser(req);');
    expect(verifiedUserSource).toContain('Authentication is required.');
  });
});
