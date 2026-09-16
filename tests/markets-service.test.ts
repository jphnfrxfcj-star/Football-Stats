import { afterEach, expect, it, vi } from 'vitest';
import { FootballService } from '../server/service';
import { getOdds } from '../server/providers/odds';
import { packMarketHistory } from '../server/market-history';
import { demoFixtures, demoMatch } from '../src/demo/data';

vi.mock('../server/providers/odds', () => ({ getOdds: vi.fn() }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('requests odds for the selected combination period and excludes fixtures that have started', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-12T08:00:00Z'));
  const matches = ['2026-09-12', '2026-09-20'].flatMap((date) =>
    demoFixtures(date).map((fixture) => ({ ...demoMatch(fixture.id)!, fixture })),
  );
  const packed = packMarketHistory(matches);
  vi.setSystemTime(new Date('2026-09-13T08:00:00Z'));
  const service = new FootballService({ name: 'test' } as never, {} as never);
  vi.spyOn(service, 'cached').mockResolvedValue(packed);
  vi.mocked(getOdds).mockResolvedValue({
    source: 'Test',
    kind: 'feed',
    fetchedAt: new Date().toISOString(),
    message: 'Some matches could not be fetched.',
    quotes: [],
  });
  const result = await service.markets('2026-09-13', 5, 8, 80);
  expect(getOdds).toHaveBeenCalledWith(
    service,
    undefined,
    matches.filter((m) => m.fixture.kickoff.startsWith('2026-09-20')).map((m) => m.fixture),
  );
  expect(result.odds.message).toBe('Some matches could not be fetched.');
});
