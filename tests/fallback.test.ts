import { afterEach, expect, it, vi } from 'vitest';
import { normalizeOrg, downloadOrg, orgUrl } from '../server/providers/football-data-org';
import { downloadSource } from '../server/providers/free-football';
import { ResilientFootballProvider } from '../server/providers/resilient-football';
import type { MultiLeagueProvider } from '../server/providers/multi-league';
import { ServiceError } from '../server/errors';
import type { Repository } from '../server/repositories/supabase';
import { Repository as RealRepository } from '../server/repositories/supabase';
import { preserveResult } from '../server/repositories/preserve-result';
import { packMarketHistory, unpackMarketHistory } from '../server/market-history';
import { buildMarkets } from '../src/analysis/combinations';
import { buildSpotlight } from '../src/analysis/spotlight';
import { demoMatch } from '../src/demo/data';
const now = Date.parse('2026-09-17T08:00:00Z');
const fetchedAt = new Date(now).toISOString();
const match = {
  id: 123,
  utcDate: '2026-09-18T19:00:00Z',
  competition: { code: 'PL' },
  season: { startDate: '2026-08-14' },
  status: 'TIMED',
  homeTeam: { name: 'Arsenal FC' },
  awayTeam: { name: 'Chelsea FC' },
  score: { fullTime: { home: null, away: null }, halfTime: { home: null, away: null } },
};
const doc = (m = match) => ({ text: JSON.stringify({ matches: [m] }), fetchedAt });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it('keeps canonical fixture identity, explicit observation time and missing values', () => {
  const f = normalizeOrg(doc(), 2026, 'E0')[0];
  expect(f.id).toBe('free-fixture-2026-arsenal-vs-chelsea');
  expect(f.homeGoals).toBeNull();
  expect(f.halfHomeGoals).toBeNull();
  expect(f.statistics).toBeNull();
  expect(f.availability).toEqual({
    status: 'fallback',
    source: 'Football-data.org',
    updatedAt: fetchedAt,
  });
  expect(f.kickoffKnown).toBe(true);
});
it('does not invent a kickoff, count awarded results, or normalize the wrong competition', () => {
  expect(normalizeOrg(doc({ ...match, status: 'SCHEDULED' }), 2026, 'E0')[0].kickoffKnown).toBe(
    false,
  );
  expect(normalizeOrg(doc({ ...match, status: 'AWARDED' }), 2026, 'E0')[0].status).toBe(
    'cancelled',
  );
  expect(() => normalizeOrg(doc(), 2026, 'SP1')).toThrow('andere competitie');
  expect(() => normalizeOrg(doc(), 2025, 'E0')).toThrow('ander seizoen');
  expect(() =>
    normalizeOrg(doc({ ...match, homeTeam: { name: 'Unknown Team' } }), 2026, 'E0'),
  ).toThrow('teamnaam');
});
it('retains actual zero scores and leaves unavailable halftime scores unknown', () => {
  const f = normalizeOrg(
    {
      text: JSON.stringify({
        matches: [{ ...match, status: 'FINISHED', score: { fullTime: { home: 0, away: 0 } } }],
      }),
      fetchedAt,
    },
    2026,
    'E0',
  )[0];
  expect(f.homeGoals).toBe(0);
  expect(f.awayGoals).toBe(0);
  expect(f.halfHomeGoals).toBeNull();
});
it('rejects redirected authenticated calls and sanitizes provider failures', async () => {
  const fetcher = vi.fn(async () => new Response('private provider diagnostic', { status: 401 }));
  vi.stubGlobal('fetch', fetcher);
  await expect(downloadOrg(orgUrl(2026, 'E0'), 'test-secret')).rejects.toMatchObject({
    code: 'ORG_AUTH_FAILED',
  });
  expect(fetcher.mock.calls[0]).toEqual([
    orgUrl(2026, 'E0'),
    expect.objectContaining({ redirect: 'error', headers: { 'X-Auth-Token': 'test-secret' } }),
  ]);
});
it('stops a source redirect to localhost before issuing an internal request', async () => {
  const fetcher = vi.fn(
    async () =>
      new Response('', { status: 302, headers: { location: 'http://127.0.0.1/fixtures.csv' } }),
  );
  vi.stubGlobal('fetch', fetcher);
  await expect(
    downloadSource('https://www.football-data.co.uk/fixtures.csv'),
  ).rejects.toMatchObject({ code: 'FREE_SOURCE_UNAVAILABLE' });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
function setup({
  key = '',
  read = vi.fn(async () => ({
    text: JSON.stringify({
      matches: [{ date: '2026-09-18', time: '20:00', team1: 'Arsenal FC', team2: 'Chelsea FC' }],
    }),
    fetchedAt,
  })),
  primaryError = new ServiceError('FREE_SOURCE_UNAVAILABLE', 'source unavailable'),
} = {}) {
  const primary = {
    fixtures: vi.fn(async () => {
      throw primaryError;
    }),
    previewRange: vi.fn(async () => {
      throw primaryError;
    }),
    fixture: vi.fn(async () => {
      throw primaryError;
    }),
    warnings: [],
  };
  const repo = {
    rateLimit: vi.fn(async () => true),
    storedSeason: vi.fn(async () => [normalizeOrg(doc(), 2026, 'E0')[0]]),
    storedLeagueHistory: vi.fn(async () => []),
  };
  const entries = new Map<string, Promise<unknown>>();
  const cache = async <T>(key: string, _ttl: number, load: () => Promise<T>): Promise<T> => {
    if (!entries.has(key)) entries.set(key, load());
    return entries.get(key) as Promise<T>;
  };
  const provider = new ResilientFootballProvider(
    2026,
    primary as unknown as MultiLeagueProvider,
    repo as unknown as Repository,
    read,
    cache,
    key,
  );
  return { provider, primary, repo, read };
}
it('uses the independent schedule when CSV fails, without querying historical data', async () => {
  const { provider, repo, read } = setup();
  const f = await provider.fixtures('2026-09-18');
  expect(f).toHaveLength(4);
  expect(f.every((f) => f.availability?.source === 'OpenFootball')).toBe(true);
  expect(read).toHaveBeenCalledTimes(4);
  expect(repo.storedLeagueHistory).not.toHaveBeenCalled();
});
it('does not hide database authentication failures behind a fallback', async () => {
  const { provider, read } = setup({
    primaryError: new ServiceError('SUPABASE_AUTH_FAILED', 'database auth'),
  });
  await expect(provider.fixtures('2026-09-18')).rejects.toMatchObject({
    code: 'SUPABASE_AUTH_FAILED',
  });
  expect(read).not.toHaveBeenCalled();
});
it('falls back to bounded saved fixtures when both schedule sources fail', async () => {
  const read = vi.fn(async () => {
    throw new ServiceError('FREE_SOURCE_UNAVAILABLE', 'offline');
  });
  const { provider, repo } = setup({ read });
  const saved = normalizeOrg(doc(), 2026, 'E0')[0];
  saved.availability = {
    status: 'stale',
    source: 'Opgeslagen wedstrijddata',
    updatedAt: '2026-09-16T08:00:00Z',
  };
  repo.storedSeason.mockResolvedValue([saved]);
  const f = await provider.fixtures('2026-09-18');
  expect(f[0].availability?.updatedAt).toBe('2026-09-16T08:00:00Z');
});
it('does not silently turn total source loss into an empty schedule', async () => {
  const { provider, repo } = setup({
    read: vi.fn(async () => {
      throw new ServiceError('FREE_SOURCE_UNAVAILABLE', 'offline');
    }),
  });
  repo.storedSeason.mockResolvedValue([]);
  await expect(provider.fixtures('2026-09-18')).rejects.toMatchObject({
    code: 'FREE_SOURCE_UNAVAILABLE',
  });
});
it('marks incomplete history and retains its status through compact storage', async () => {
  const { provider } = setup();
  const data = await provider.previewRange('2026-09-18', 1);
  expect(data[0].availability?.status).toBe('partial');
  const restored = unpackMarketHistory(packMarketHistory(data, now));
  expect(restored[0].availability).toEqual(data[0].availability);
  expect(restored[0].updatedAt).toBe(data[0].updatedAt);
});
it('blocks automatic proposals even when partial history would meet the historical threshold', () => {
  const data = demoMatch('demo-2026-09-18-0')!;
  const odds = { source: 'test', kind: 'snapshot' as const, fetchedAt, quotes: [], message: '' };
  expect(buildMarkets([data], odds, 5, now, 50).selections.length).toBeGreaterThan(0);
  data.availability = { status: 'partial', source: 'Saved history', updatedAt: fetchedAt };
  expect(
    buildMarkets(unpackMarketHistory(packMarketHistory([data], now)), odds, 5, now, 50).selections,
  ).toEqual([]);
  expect(
    buildSpotlight(
      [
        {
          fixture: data.fixture,
          availability: data.availability,
          probabilities: [],
          homeSamples: 20,
          awaySamples: 20,
        },
      ],
      odds,
      now,
    ).cards,
  ).toEqual([]);
});
it('never writes a saved snapshot back as a newly observed fixture', async () => {
  const repo = new RealRepository('https://example.supabase.co', 'test');
  const from = vi.spyOn(repo.db, 'from');
  const f = normalizeOrg(doc(), 2026, 'E0')[0];
  f.availability = { status: 'stale', source: 'Saved', updatedAt: fetchedAt };
  expect(await repo.saveFixtures([f])).toEqual([f]);
  expect(from).not.toHaveBeenCalled();
});
it('preserves observed statistics when a fallback only returns the same full-time score', () => {
  const saved = demoMatch('demo-2026-09-18-0')!.homeHistory[0];
  const incoming = { ...saved, statistics: null, halfHomeGoals: null, halfAwayGoals: null };
  expect(preserveResult(incoming, saved).statistics).toEqual(saved.statistics);
  expect(preserveResult(incoming, saved).halfHomeGoals).toBe(saved.halfHomeGoals);
  expect(preserveResult({ ...incoming, homeGoals: 99 }, saved).statistics).toBeNull();
});

it('uses independently verified seasons for automatic history without mixing in older saved gaps', async () => {
  const { provider, repo } = setup({ key: 'test-key' });
  vi.spyOn(Date, 'now').mockReturnValue(now);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = new URL(url),
        year = Number(u.searchParams.get('season'));
      const code = u.pathname.split('/')[3];
      return new Response(
        JSON.stringify({
          matches: [
            {
              ...match,
              competition: { code },
              season: { startDate: `${year}-08-01` },
              utcDate: year === 2025 ? '2025-09-18T19:00:00Z' : match.utcDate,
              status: year === 2025 ? 'FINISHED' : 'TIMED',
              score: {
                fullTime: { home: year === 2025 ? 2 : null, away: year === 2025 ? 1 : null },
                halfTime: { home: null, away: null },
              },
            },
          ],
        }),
      );
    }),
  );
  const old = normalizeOrg(doc({ ...match, status: 'FINISHED' }), 2026, 'E0')[0];
  repo.storedLeagueHistory.mockResolvedValue([old] as never);
  const data = await provider.previewRange('2026-09-18', 1);
  expect(data).toHaveLength(4);
  expect(data.every((d) => d.availability?.status === 'fallback')).toBe(true);
  expect(data[0].homeHistory).toHaveLength(1);
  expect(data[0].homeHistory[0].kickoff).toBe('2025-09-18T19:00:00Z');
  expect(repo.rateLimit).toHaveBeenCalledTimes(8);
});
it('marks history incomplete when a previous fixture still has no confirmed result', async () => {
  const { provider } = setup({ key: 'test-key' });
  vi.spyOn(Date, 'now').mockReturnValue(now);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = new URL(url),
        year = Number(u.searchParams.get('season'));
      return new Response(
        JSON.stringify({
          matches: [
            {
              ...match,
              competition: { code: u.pathname.split('/')[3] },
              season: { startDate: `${year}-08-01` },
              utcDate: year === 2025 ? '2025-09-18T19:00:00Z' : match.utcDate,
            },
          ],
        }),
      );
    }),
  );
  const data = await provider.previewRange('2026-09-18', 1);
  expect(data.every((d) => d.availability?.status === 'partial')).toBe(true);
});
it('uses OpenFootball if the alternative API quota is exhausted without spending another request', async () => {
  const { provider, repo } = setup({ key: 'test-key' });
  repo.rateLimit.mockResolvedValue(false);
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const rows = await provider.fixtures('2026-09-18');
  expect(rows.every((f) => f.availability?.source === 'OpenFootball')).toBe(true);
  expect(fetcher).not.toHaveBeenCalled();
});
