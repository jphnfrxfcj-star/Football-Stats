import { expect, it } from 'vitest';
import { refreshToken, validRefreshToken, scheduledRefreshHour } from '../server/nightly-refresh';
it('dispatches once in the morning and evening in Brussels across DST', () => {
  for (const date of [
    '2026-09-13T21:35:00Z',
    '2026-09-14T05:35:00Z',
    '2026-12-13T22:35:00Z',
    '2026-12-14T06:35:00Z',
  ])
    expect(scheduledRefreshHour(new Date(date))).toBe(true);
  for (const date of [
    '2026-09-13T22:35:00Z',
    '2026-09-14T06:35:00Z',
    '2026-12-13T21:35:00Z',
    '2026-12-14T05:35:00Z',
  ])
    expect(scheduledRefreshHour(new Date(date))).toBe(false);
});
it('requires a dedicated valid signature, not the database key or arbitrary POST', () => {
  const secret = 'test-private',
    token = refreshToken(secret);
  expect(validRefreshToken(`Bearer ${token}`, secret)).toBe(true);
  for (const header of [null, secret, token, `Bearer ${secret}`, `Bearer ${token}x`])
    expect(validRefreshToken(header, secret)).toBe(false);
  expect(validRefreshToken(`Bearer ${token}`, 'other-secret')).toBe(false);
});
