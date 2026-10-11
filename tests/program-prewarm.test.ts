import { afterEach, expect, it, vi } from 'vitest';
import { FootballService, BusyError } from '../server/service';
import type { Repository } from '../server/repositories/supabase';
import type { FootballDataProvider } from '../server/providers/provider';
import { FreeFootballProvider, type SourceDocument } from '../server/providers/free-football';
import { programDate, programPrewarmEnabled } from '../server/program-prewarm';
import { demoFixtures } from '../src/demo/data';

afterEach(() => vi.useRealTimers());

function sharedStore() {
  const values = new Map<string, { data: unknown; expires: number }>();
  const locks = new Set<string>();
  const repo = {
    cached: vi.fn(async (key: string) => {
      const row = values.get(key);
      return row && row.expires > Date.now() ? row.data : null;
    }),
    cache: vi.fn(async (key: string, data: unknown, ttl: number) => {
      values.set(key, { data, expires: Date.now() + ttl * 1000 });
    }),
    lock: vi.fn(async (key: string) => {
      if (locks.has(key)) return false;
      locks.add(key);
      return true;
    }),
    extendLock: vi.fn(async () => {}),
    unlock: vi.fn(async (key: string) => {
      locks.delete(key);
    }),
    log: vi.fn(async () => {}),
    saveFixtures: vi.fn(async (rows) => rows),
  };
  return { repo, values, locks };
}
const date = '2026-09-12';
const namespace = 'test:2026';
const key = `${namespace}:fixtures:${date}`;
function service(repo: ReturnType<typeof sharedStore>['repo'], load: () => Promise<unknown>) {
  return new FootballService(
    { name: 'test', cacheNamespace: namespace, fixtures: load } as unknown as FootballDataProvider,
    repo as unknown as Repository,
  );
}

it('prepares a day before expiry, atomically replaces it and preserves source timestamps', async () => {
  vi.useFakeTimers();
  const { repo, values } = sharedStore();
  const rows = demoFixtures(date);
  const load = vi.fn(async () => rows);
  values.set(key, { data: ['previous valid snapshot'], expires: Date.now() + 1000 });
  const worker = service(repo, load);
  expect(await worker.prepareProgram(date)).toEqual({ skipped: false, fixtures: rows.length });
  expect(load).toHaveBeenCalledTimes(1);
  expect(values.get(key)).toEqual({ data: rows, expires: Date.now() + 300000 });
  const requestLoad = vi.fn(async () => []);
  expect(await service(repo, requestLoad).fixtures(date)).toEqual(rows);
  expect(requestLoad).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(300001);
  expect(await service(repo, requestLoad).fixtures(date)).toEqual([]);
  expect(requestLoad).toHaveBeenCalledTimes(1);
});

it('retains an unexpired previous snapshot on preparation failure without extending its expiry', async () => {
  const { repo, values, locks } = sharedStore();
  const previous = { data: demoFixtures(date), expires: Date.now() + 1000 };
  values.set(key, previous);
  await expect(
    service(repo, async () => {
      throw new Error('source unavailable');
    }).prepareProgram(date),
  ).rejects.toThrow('source unavailable');
  expect(values.get(key)).toEqual(previous);
  expect(repo.cache).not.toHaveBeenCalled();
  expect(locks.size).toBe(0);
});

it('bounds a mocked 24-instance cold burst while slow preparation cannot hold visitor locks', async () => {
  vi.useFakeTimers();
  const { repo, locks } = sharedStore();
  const rows = demoFixtures(date);
  const load = vi.fn(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return rows;
  });
  const preparation = service(repo, load).prepareProgram(date);
  const requests = Array.from({ length: 24 }, () => service(repo, load).fixtures(date));
  const secondPreparation = service(repo, load).prepareProgram(date);
  await vi.runAllTimersAsync();
  expect(await preparation).toEqual({ skipped: false, fixtures: rows.length });
  expect(await secondPreparation).toEqual({ skipped: true });
  expect(await Promise.all(requests)).toEqual(Array.from({ length: 24 }, () => rows));
  // One background build and at most one visitor build. Shared source-document
  // caches provide the deeper network-level deduplication in production.
  expect(load.mock.calls.length).toBeLessThanOrEqual(2);
  expect(repo.cache.mock.calls.length).toBeLessThanOrEqual(2);
  expect(repo.unlock).toHaveBeenCalledTimes(2);
  expect(locks.size).toBe(0);
});

it('fails a locked cold burst with BusyError after bounded waits without stealing work', async () => {
  vi.useFakeTimers();
  const { repo, locks } = sharedStore();
  locks.add(key);
  const load = vi.fn(async () => []);
  const requests = Array.from({ length: 24 }, () => service(repo, load).fixtures(date));
  const settled = Promise.allSettled(requests);
  await vi.runAllTimersAsync();
  for (const result of await settled) {
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') expect(result.reason).toBeInstanceOf(BusyError);
  }
  expect(load).not.toHaveBeenCalled();
  expect(repo.unlock).not.toHaveBeenCalled();
  expect(locks.has(key)).toBe(true);
});

it('repairs only the requested day, while full-season callers retain seven-day enrichment', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-13T20:00:00Z'));
  const fetchedAt = '2026-09-13T19:00:00Z';
  const read = vi.fn(async (url: string): Promise<SourceDocument> => ({
    fetchedAt,
    text: url.includes('githubusercontent')
      ? JSON.stringify({
          matches: [
            { date: '2026-09-10', time: '15:00', team1: 'Arsenal FC', team2: 'Chelsea FC' },
            { date: '2026-09-12', time: '15:00', team1: 'Liverpool FC', team2: 'Everton FC' },
            {
              date: '2026-09-13',
              time: '15:00',
              team1: 'Manchester City FC',
              team2: 'Manchester United FC',
            },
          ],
        })
      : url.includes('espn.com')
        ? '{"events":[]}'
        : 'Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG\n',
  }));
  const day = await new FreeFootballProvider(2026, read).fixtures(date);
  expect(day).toHaveLength(1);
  expect(day[0].provenance?.sources.every((source) => source.fetchedAt === fetchedAt)).toBe(true);
  const dayCalls = read.mock.calls.filter(([url]) => url.includes('espn.com')).map(([url]) => url);
  expect(dayCalls).toHaveLength(1);
  expect(dayCalls[0]).toContain('dates=20260912');
  read.mockClear();
  const season = await new FreeFootballProvider(2026, read).seasonFixtures();
  expect(season).toHaveLength(3);
  expect(read.mock.calls.filter(([url]) => url.includes('espn.com'))).toHaveLength(3);
});

it('uses the Brussels calendar at midnight and guards demo, opt-out and legacy providers', () => {
  expect(programDate(new Date('2026-09-12T22:30:00Z'))).toBe('2026-09-13');
  expect(programDate(new Date('2026-12-12T23:30:00Z'))).toBe('2026-12-13');
  expect(programPrewarmEnabled({})).toBe(false);
  expect(programPrewarmEnabled({ DEMO_MODE: 'false' })).toBe(true);
  expect(programPrewarmEnabled({ DEMO_MODE: 'false', PROGRAM_PREWARM_ENABLED: 'false' })).toBe(
    false,
  );
  expect(programPrewarmEnabled({ DEMO_MODE: 'false', FOOTBALL_PROVIDER: 'api-football' })).toBe(
    false,
  );
});
