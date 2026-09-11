import { describe, expect, it } from 'vitest';
import { serverConfig } from '../server/config';
const valid = {
  API_FOOTBALL_KEY: 'football-test',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'supabase-test',
};
describe('server configuration diagnostics', () => {
  it('names missing variables without exposing configured secrets', () => {
    try {
      serverConfig({ API_FOOTBALL_KEY: 'never-echo-this-secret' });
      throw new Error('Expected failure');
    } catch (error) {
      expect(String(error)).toContain('SUPABASE_URL');
      expect(String(error)).not.toContain('never-echo-this-secret');
    }
  });
  it('accepts project and REST dashboard URLs without duplicating the API path', () => {
    for (const suffix of ['', '/', '/rest/v1', '/rest/v1/'])
      expect(
        serverConfig({ ...valid, SUPABASE_URL: valid.SUPABASE_URL + suffix }).supabaseUrl,
      ).toBe(valid.SUPABASE_URL);
  });
  it('rejects invalid URLs and credentials without echoing values', () => {
    for (const value of [
      'invalid',
      'https://user:secret@example.com',
      'https://example.com/unknown',
      'https://example.com?key=secret',
    ]) {
      expect(() => serverConfig({ ...valid, SUPABASE_URL: value })).toThrow();
    }
  });
});
