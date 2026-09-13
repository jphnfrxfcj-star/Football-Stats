import { expect, it, vi } from 'vitest';
import type { Repository } from '../server/repositories/supabase';
import { refreshLeague } from '../server/nightly-refresh';
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

it('reports stored completed results and records a delayed secondary source', async () => {
  const now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-13T10:00:00Z'));
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url: string) =>
        new Response(
          url.includes('espn.com')
            ? 'unavailable'
            : url.includes('githubusercontent')
              ? JSON.stringify({
                  matches: [
                    { date: '2026-09-12', time: '15:00', team1: 'Arsenal FC', team2: 'Chelsea FC' },
                  ],
                })
              : 'Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG\n',
          { status: url.includes('espn.com') ? 503 : 200 },
        ),
    ),
  );
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const repo = {
      cache: vi.fn(async () => {}),
      saveFixtures: vi.fn(async (rows) =>
        rows.map((f: object) => ({ ...f, status: 'finished', homeGoals: 2, awayGoals: 1 })),
      ),
    };
    const report = await refreshLeague(repo as unknown as Repository, 2026, 'E0');
    expect(report).toMatchObject({
      fixtures: 1,
      finished: 1,
      pendingResults: 0,
      recentResultChecksFailed: 1,
    });
  } finally {
    now.mockRestore();
    warn.mockRestore();
    vi.unstubAllGlobals();
  }
});
