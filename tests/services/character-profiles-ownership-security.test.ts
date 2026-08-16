import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20260815000001_secure_character_profiles_ownership.sql',
  'utf8',
);
const studio = readFileSync('src/views/Studio.tsx', 'utf8');

describe('character_profiles ownership transition', () => {
  it('adds nullable authenticated ownership without claiming legacy rows', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS user_id uuid;');
    expect(migration).toContain('character_profiles_user_id_fkey');
    expect(migration).toContain('REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID');
    expect(migration).toContain('CHECK (user_id IS NOT NULL) NOT VALID');
    expect(migration).not.toMatch(/UPDATE\s+public\.character_profiles\s+SET\s+user_id/i);
    expect(migration).not.toMatch(/DELETE FROM\s+public\.character_profiles/i);
  });

  it('uses owner-only policies and least-privilege grants for ordinary clients', () => {
    expect(migration).toContain('REVOKE ALL PRIVILEGES ON TABLE public.character_profiles');
    expect(migration).toContain('FROM PUBLIC, anon, authenticated, service_role;');
    expect(migration).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.character_profiles TO authenticated;');
    for (const command of ['select', 'insert', 'update', 'delete']) {
      expect(migration).toContain(`character_profiles_authenticated_${command}`);
    }
    expect(migration).toContain('USING (user_id = (SELECT auth.uid()))');
    expect(migration).toContain('WITH CHECK (user_id = (SELECT auth.uid()))');
    expect(migration).not.toMatch(/USING\s*\(\s*true\s*\)|WITH CHECK\s*\(\s*true\s*\)/i);
  });

  it('prevents new cross-owner video/profile links without invalidating nullable legacy rows', () => {
    expect(migration).toContain('character_profiles_id_user_id_key UNIQUE (id, user_id)');
    expect(migration).toContain('videos_character_profile_user_id_fkey');
    expect(migration).toContain('FOREIGN KEY (character_profile_id, user_id)');
    expect(migration).toContain('REFERENCES public.character_profiles(id, user_id)');
    expect(migration).toContain('ON DELETE SET NULL (character_profile_id) NOT VALID');
  });

  it('derives Studio reads and creates from the validated owner with generation checks', () => {
    expect(studio).toContain(".eq('user_id', ownerContext.ownerId)");
    expect(studio).toContain('user_id: ownerContext.ownerId');
    expect(studio).toContain('assertCurrentMediaOwnerContext(ownerContext);');
    expect(studio).toContain('isCurrentValidatedOwnerContext(ownerContext.ownerId, ownerContext.generation)');
    expect(studio).toContain('setCharacterProfileId((current) => reconcileCharacterProfileSelection(current, profiles));');
    expect(studio).toContain("setCharacterProfileId('');");
  });
});
