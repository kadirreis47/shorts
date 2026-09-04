import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20260814000002_secure_private_owner_media_storage.sql', 'utf8');
const generatedImage = readFileSync('supabase/functions/generate-image/index.ts', 'utf8');
const verifiedUser = readFileSync('supabase/functions/_shared/verified-user.ts', 'utf8');
const verifiedUserVerifier = readFileSync('supabase/functions/_shared/verified-user-verifier.ts', 'utf8');
const rendererStorage = readFileSync('src/lib/mediaStorage.ts', 'utf8');
const studio = readFileSync('src/views/Studio.tsx', 'utf8');
const sourceProvider = readFileSync('src/core/media/providers/sourceSceneProvider.ts', 'utf8');
const exportController = readFileSync('src/services/exportIntelligenceController.ts', 'utf8');
const dependencies = readFileSync('src/app/registerDependencies.ts', 'utf8');

describe('private owner-scoped media Storage security', () => {
  it('makes media private and replaces every historical bucket-wide policy', () => {
    expect(migration).toMatch(/UPDATE storage\.buckets\s+SET public = false\s+WHERE id = 'media'/);
    for (const policy of ['media_public_read', 'media_anon_write', 'media_anon_update', 'media_anon_delete']) {
      expect(migration).toContain(`DROP POLICY IF EXISTS "${policy}" ON storage.objects`);
    }
    expect(migration).not.toMatch(/CREATE POLICY[\s\S]+TO\s+(?:PUBLIC|anon)\b/i);
  });

  it('limits authenticated object CRUD to the first owner path component', () => {
    for (const command of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      expect(migration).toMatch(new RegExp(`ON storage\\.objects FOR ${command}[\\s\\S]+?TO authenticated`, 'i'));
    }
    expect(migration.match(/\(storage\.foldername\(name\)\)\[1\] = \(SELECT auth\.uid\(\)\)::text/g)).toHaveLength(5);
    expect(migration).toMatch(/FOR UPDATE[\s\S]+USING[\s\S]+WITH CHECK/);
  });

  it('preserves legacy objects without claiming or deleting them', () => {
    expect(migration).not.toMatch(/UPDATE\s+storage\.objects/i);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+storage\.objects/i);
    expect(migration).not.toMatch(/INSERT\s+INTO\s+storage\.objects/i);
    expect(migration).not.toContain('generated-images/%');
    expect(migration).not.toContain('videos/%');
  });

  it('binds stable database identities to the row owner', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS video_storage_bucket text');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS video_storage_path text');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS storage_bucket text');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS storage_path text');
    expect(migration).toContain("split_part(video_storage_path, '/', 1) = user_id::text");
    expect(migration).toContain("split_part(storage_path, '/', 1) = user_id::text");
    expect(migration).not.toMatch(/UPDATE\s+public\.(?:videos|assets)\s+SET\s+user_id/i);
  });

  it('validates generate-image JWT before body/provider/storage work', () => {
    expect(generatedImage.indexOf('await authorizeProtectedFunction(req, "generate-image")')).toBeLessThan(generatedImage.indexOf('await readBoundedJson<GenerateImageRequest>'));
    expect(verifiedUser).toContain('createVerifiedUserVerifier({');
    expect(verifiedUserVerifier).toContain('auth.getUser(token)');
    expect(verifiedUser).not.toContain('service_role');
    expect(generatedImage).toContain('`${verifiedUser.userId}/generated-images/${crypto.randomUUID()}.png`');
    expect(generatedImage).not.toMatch(/const\s+\{[^}]*userId[^}]*\}\s*=\s*await req\.json/);
  });

  it('returns stable identity plus a private signed viewing URL, never a public URL', () => {
    expect(generatedImage).toContain('.createSignedUrl(storagePath, 60 * 60)');
    expect(generatedImage).toContain('media: { bucket: "media", objectPath: storagePath }');
    expect(generatedImage).not.toContain('getPublicUrl');
    expect(rendererStorage).toContain('.createSignedUrl(identity.objectPath, PRIVATE_MEDIA_SIGNED_URL_TTL_SECONDS)');
    expect(rendererStorage).not.toContain('getPublicUrl');
    expect(studio).toContain('scenes: toDurableScenes(scenes)');
    expect(studio).toContain('video_storage_path: upload.media.objectPath');
    expect(studio).toContain('video_url: null');
    expect(sourceProvider).toContain('privateStorageSource(storageIdentity)');
    expect(exportController).not.toContain('materializePrivateManifestMedia');
    expect(exportController).toContain('renderEngine.submit({ manifest: job.manifest');
    expect(dependencies).toContain('materializeManifestForExecution: materializePrivateManifestMedia');
  });

  it('does not touch unrelated security or native artifact paths', () => {
    expect(migration).not.toContain('api_keys');
    expect(migration).not.toContain('youtube');
    expect(migration).not.toContain('publishing');
    expect(migration).not.toContain('ffmpeg');
  });
});
