import { describe, expect, it } from 'vitest';
import { extractBearerToken } from '../../supabase/functions/_shared/auth-header';

describe('Edge Function bearer authentication header', () => {
  it('rejects missing and malformed credentials', () => {
    expect(extractBearerToken(null)).toBeNull();
    expect(extractBearerToken('')).toBeNull();
    expect(extractBearerToken('Basic credential')).toBeNull();
    expect(extractBearerToken('Bearer')).toBeNull();
    expect(extractBearerToken('Bearer token trailing')).toBeNull();
  });

  it('accepts a bounded bearer token without exposing or transforming it', () => {
    expect(extractBearerToken('Bearer valid.jwt.token')).toBe('valid.jwt.token');
    expect(extractBearerToken('bearer\tvalid-token')).toBe('valid-token');
  });

  it('rejects oversized authorization input', () => {
    expect(extractBearerToken(`Bearer ${'x'.repeat(8_193)}`)).toBeNull();
  });
});
