import { afterEach, expect, it, vi } from 'vitest';
import { FootballService } from '../server/service';
import { getOdds } from '../server/providers/odds';
import { demoFixtures } from '../src/demo/data';
vi.mock('../server/providers/odds', () => ({ getOdds: vi.fn() }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it('requests prices for the spotlight fixtures and shows the matching bookmaker quote', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-12T10:00:00Z'));
  const fixture = demoFixtures('2026-09-12')[0];
  const service = new FootballService({ name: 'test' } as never, {} as never);
  vi.spyOn(service, 'cached').mockResolvedValue([
    {
      fixture,
      homeSamples: 20,
      awaySamples: 20,
      probabilities: [
        {
          key: 'home',
          label: 'Thuis wint',
          value: 60,
          confidence: 'Laag',
          sampleSize: 20,
          factors: [],
        },
      ],
    },
  ]);
  vi.mocked(getOdds).mockResolvedValue({
    source: 'Test',
    kind: 'feed',
    fetchedAt: new Date().toISOString(),
    message: '',
    quotes: [
      {
        home: 'Arsenal',
        away: 'Chelsea',
        date: '2026-09-12',
        kickoff: fixture.kickoff,
        market: 'home',
        bookmaker: 'Unibet België',
        decimal: 2,
        updatedAt: new Date().toISOString(),
      },
    ],
  });
  const result = await service.spotlight('2026-09-12');
  expect(getOdds).toHaveBeenCalledWith(service, undefined, [fixture]);
  expect(result.cards[0].quote?.decimal).toBe(2);
  expect(result.cards[0].quote?.bookmaker).toBe('Unibet België');
});
