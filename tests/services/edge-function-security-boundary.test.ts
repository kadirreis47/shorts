import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(readFileSync('supabase/functions/v1-function-allowlist.json', 'utf8')) as {
  active: string[];
  retiredFailClosed: string[];
};
const protectedSource = readFileSync('supabase/functions/_shared/protected-function.ts', 'utf8');
const verifiedSource = readFileSync('supabase/functions/_shared/verified-user.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260815000002_add_edge_function_request_limits.sql', 'utf8');
const generateScriptSource = readFileSync('supabase/functions/generate-script/index.ts', 'utf8');

function sourceFor(name: string): string {
  return readFileSync(`supabase/functions/${name}/index.ts`, 'utf8');
}

describe('V1 Edge Function authorization and abuse boundary', () => {
  it('protects exactly the approved active functions before request/provider work', () => {
    expect(manifest.active).toEqual([
      'provider-status', 'generate-script', 'generate-hooks', 'generate-seo',
      'analyze-script', 'generate-image', 'generate-voiceover', 'list-voices',
      'research-footage', 'search-images', 'search-videos', 'translate-subtitles',
    ]);

    for (const name of manifest.active) {
      const source = sourceFor(name);
      const authCall = `await authorizeProtectedFunction(req, "${name}")`;
      expect(source, name).toContain(authCall);
      const authIndex = source.indexOf(authCall);
      for (const protectedOperation of ['readBoundedJson<', '.from("api_keys")', 'fetch(']) {
        const operationIndex = source.indexOf(protectedOperation);
        if (operationIndex >= 0) expect(authIndex, `${name}: ${protectedOperation}`).toBeLessThan(operationIndex);
      }
      expect(source, name).not.toContain('JSON.stringify({ error: err.message })');
      expect(source, name).not.toContain('response.text()');
    }
  });

  it('independently validates bearer tokens and never accepts a body owner', () => {
    expect(verifiedSource).toContain('extractBearerToken(req.headers.get("Authorization"))');
    expect(verifiedSource).toContain('auth.getUser(token)');
    expect(verifiedSource).toContain('return { ok: true, userId: data.user.id };');
    expect(protectedSource).toContain('p_user_id: verifiedUser.userId');
    expect(protectedSource).not.toMatch(/p_user_id:\s*(?:body|payload|request)\./);
    for (const name of manifest.active) {
      expect(sourceFor(name), name).not.toMatch(/\{[^}]*\b(?:userId|ownerId)\b[^}]*\}\s*=\s*(?:parsedBody\.value|await req\.json)/);
    }
  });

  it('uses centrally owned low, medium and high limits with bounded responses', () => {
    expect(protectedSource).toContain('"provider-status": { operationClass: "low", burstMax: 30, dailyMax: 1_000 }');
    expect(protectedSource).toContain('"generate-script": { operationClass: "medium", burstMax: 10, dailyMax: 200 }');
    expect(protectedSource).toContain('"generate-image": { operationClass: "high", burstMax: 8, dailyMax: 25 }');
    expect(protectedSource).toContain('"generate-voiceover": { operationClass: "high", burstMax: 3, dailyMax: 25 }');
    expect(protectedSource).toContain('"research-footage": { operationClass: "high", burstMax: 2, dailyMax: 20 }');
    expect(protectedSource).toContain('Request limit reached. Please try again shortly.');
    expect(protectedSource).toContain('}, 429)');
    expect(protectedSource).toContain('Service is temporarily unavailable.');
  });

  it('allows one maximum generated-script image batch without weakening voice or daily limits', () => {
    expect(generateScriptSource).toContain('Split the script into 3-8 scenes.');

    const imagePolicy = /"generate-image": \{ operationClass: "high", burstMax: (\d+), dailyMax: (\d+) \}/.exec(protectedSource);
    const voicePolicy = /"generate-voiceover": \{ operationClass: "high", burstMax: (\d+), dailyMax: (\d+) \}/.exec(protectedSource);
    expect(imagePolicy?.slice(1).map(Number)).toEqual([8, 25]);
    expect(voicePolicy?.slice(1).map(Number)).toEqual([3, 25]);

    const imageBurst = Number(imagePolicy?.[1]);
    expect(Array.from({ length: imageBurst }, (_, index) => index + 1 <= imageBurst)).toEqual(Array(8).fill(true));
    expect(imageBurst + 1 <= imageBurst).toBe(false);
    expect(protectedSource).toContain('p_burst_max_requests: limit.burstMax');
    expect(protectedSource).toContain('p_daily_max_requests: limit.dailyMax');
    expect(protectedSource).not.toMatch(/p_(?:burst|daily)_max_requests:\s*(?:body|payload|request)\./);
  });

  it('accounts parallel calls atomically and denies client counter access', () => {
    expect(migration).toContain("window_kind text NOT NULL CHECK (window_kind IN ('burst', 'daily'))");
    expect(migration).toContain('PRIMARY KEY (user_id, function_name, window_kind)');
    expect(migration).toContain('INSERT INTO public.edge_function_request_windows AS quota');
    expect(migration).toContain('ON CONFLICT (user_id, function_name, window_kind) DO UPDATE');
    expect(migration).toContain('ELSE LEAST(quota.request_count + 1, p_burst_max_requests + 1)');
    expect(migration).toContain('ELSE LEAST(quota.request_count + 1, p_daily_max_requests + 1)');
    expect(migration).toContain('RETURN burst_allowed AND daily_allowed;');
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('SET search_path = pg_catalog, public');
    expect(migration).toContain('REVOKE ALL PRIVILEGES ON TABLE public.edge_function_request_windows FROM PUBLIC, anon, authenticated;');
    expect(migration).toContain('REVOKE ALL PRIVILEGES ON TABLE public.edge_function_request_windows FROM service_role;');
    expect(migration).not.toContain('GRANT SELECT, INSERT, UPDATE ON TABLE public.edge_function_request_windows TO service_role;');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.consume_edge_function_quota(uuid, text, integer, integer, integer) FROM PUBLIC, anon, authenticated;');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.consume_edge_function_quota(uuid, text, integer, integer, integer) TO service_role;');
  });

  it('bounds JSON before parsing and validates provider-specific request sizes', () => {
    expect(protectedSource).toContain('if (totalBytes > maxBytes)');
    expect(protectedSource).toContain('Request body is too large.');
    expect(protectedSource).toContain('}, 413)');
    expect(sourceFor('generate-image')).toContain('prompt.length > 4_000');
    expect(sourceFor('generate-image')).toContain('Object.prototype.hasOwnProperty.call(STYLE_PROMPTS, value)');
    expect(sourceFor('generate-voiceover')).toContain('isBoundedString(text, 5_000, true)');
    expect(sourceFor('research-footage')).toContain('scenes.length > 12');
    expect(sourceFor('search-images')).toContain('perPage > 12');
    expect(sourceFor('translate-subtitles')).toContain('isBoundedString(srt, 50_000, true)');
  });

  it('keeps provider failures and logs bounded', () => {
    expect(sourceFor('generate-voiceover')).not.toContain('detail: errText');
    expect(sourceFor('search-images')).not.toContain('Pexels API error:');
    expect(sourceFor('search-videos')).not.toContain('Pexels API error:');
    expect(protectedSource).not.toContain('console.error(authorization');
    expect(protectedSource).not.toContain('console.error(serviceRoleKey');
    expect(protectedSource).not.toContain('apiKey');
    expect(protectedSource).not.toContain('prompt');
  });

  it('stores generated voiceovers under the verified owner rather than returning durable audio bytes', () => {
    const source = sourceFor('generate-voiceover');
    expect(source).toContain('`${authorization.userId}/voiceovers/${crypto.randomUUID()}.mp3`');
    expect(source).toContain('.from("media").upload(');
    expect(source).toContain('contentType: "audio/mpeg"');
    expect(source).toContain('media: { bucket: "media", objectPath }');
    expect(source).not.toContain('base64Audio');
    expect(source).not.toContain('btoa(');
    expect(source).not.toMatch(/(?:ownerId|objectPath|bucket)\s*:\s*parsedBody\.value/);
  });

  it('keeps retired YouTube functions deterministically fail closed', () => {
    expect(manifest.retiredFailClosed).toEqual(['youtube-auth', 'youtube-publish']);
    for (const name of manifest.retiredFailClosed) {
      const source = sourceFor(name);
      expect(source).toContain('status: 410');
      expect(source).not.toContain('createClient');
    }
  });
});
