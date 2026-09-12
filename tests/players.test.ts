import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizePlayerSummary, playerReport } from '../server/providers/espn-players';
import { summarizePlayers } from '../src/domain/players';
const raw = (complete = true) => ({
  header: {
    id: '123',
    competitions: [
      {
        date: '2026-09-01T14:00:00Z',
        status: { type: { completed: complete } },
        competitors: [
          { homeAway: 'home', team: { displayName: 'Arsenal' } },
          { homeAway: 'away', team: { displayName: 'Chelsea' } },
        ],
      },
    ],
  },
  rosters: [
    {
      team: { displayName: 'Arsenal' },
      roster: [
        {
          athlete: { id: '1', displayName: 'Test player' },
          starter: true,
          stats: [
            { name: 'appearances', value: 1 },
            { name: 'totalShots', value: 0 },
            { name: 'foulsCommitted', value: 2 },
          ],
        },
        {
          athlete: { id: '2', displayName: 'Unused substitute' },
          starter: false,
          stats: [
            { name: 'appearances', value: 0 },
            { name: 'totalShots', value: 0 },
          ],
        },
        {
          athlete: { id: '3', displayName: 'Missing participation' },
          stats: [{ name: 'totalShots', value: 0 }],
        },
      ],
    },
  ],
});
describe('player observations', () => {
  it('preserves real zeroes, leaves missing metrics null and excludes unused substitutes', () => {
    const r = normalizePlayerSummary(raw());
    expect(r.observations).toHaveLength(1);
    expect(r.observations[0].metrics.shots).toBe(0);
    expect(r.observations[0].metrics.shotsOnTarget).toBeNull();
    expect(r.observations[0].metrics.foulsCommitted).toBe(2);
  });
  it('rejects unfinished games and malformed responses', () => {
    expect(() => normalizePlayerSummary(raw(false))).toThrow();
    expect(() => normalizePlayerSummary({})).toThrow();
  });
  it('deduplicates games and uses an independent known-data denominator per metric', () => {
    const a = normalizePlayerSummary(raw()).observations[0];
    const b = {
      ...a,
      eventId: '456',
      starter: false,
      metrics: { ...a.metrics, shots: 4, shotsOnTarget: 2 },
    };
    const [p] = summarizePlayers([a, a, b]);
    expect(p.appearances).toBe(2);
    expect(p.starts).toBe(1);
    expect(p.metrics.shots).toEqual({ total: 4, average: 2, samples: 2 });
    expect(p.metrics.shotsOnTarget).toEqual({ total: 2, average: 2, samples: 1 });
    expect(p.metrics.assists).toEqual({ total: null, average: null, samples: 0 });
  });
});

afterEach(() => vi.unstubAllGlobals());
it('checks event/date identity and counts available data independently for each team', async () => {
  const { demoMatch, demoFixtures } = await import('../src/demo/data');
  const data = demoMatch('demo-2026-09-12-0')!;
  const played = { ...demoFixtures('2026-09-01')[0], status: 'finished' as const };
  data.homeHistory = [played, played];
  data.awayHistory = [played];
  const source = raw();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes('scoreboard')
              ? { events: [{ id: '123', competitions: source.header.competitions }] }
              : source,
          ),
        ),
    ),
  );
  const service = {
    cached: async (_key: string, _ttl: number, loader: () => Promise<unknown>) => loader(),
  };
  const report = await playerReport(data, service as never);
  expect(report.teams[0].requested).toBe(1);
  expect(report.teams[0].available).toBe(1);
  expect(report.teams[1].available).toBe(0);
  expect(report.teams[0].players[0].appearances).toBe(1);
  source.header.competitions[0].date = '2026-09-02T14:00:00Z';
  expect((await playerReport(data, service as never)).teams[0].available).toBe(0);
  source.header.competitions[0].date = '2026-09-13T14:00:00Z';
  expect((await playerReport(data, service as never)).teams[0].available).toBe(0);
});
