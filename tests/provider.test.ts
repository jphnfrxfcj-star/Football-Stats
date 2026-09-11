import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiFootballProvider, normalizeFixture } from '../server/providers/api-football';
const raw = {
  fixture: { id: 1, date: '2026-09-10T18:00:00Z', venue: { name: null }, status: { short: 'FT' } },
  league: { id: 39, name: 'Premier League', country: 'England' },
  teams: { home: { id: 1, name: 'Arsenal' }, away: { id: 2, name: 'Chelsea' } },
  goals: { home: 2, away: 1 },
  score: { halftime: { home: null, away: null }, fulltime: { home: 2, away: 1 } },
};
afterEach(() => vi.unstubAllGlobals());
describe('normalization', () => {
  it('keeps canonical models independent and nullable', () => {
    const f = normalizeFixture(raw);
    expect(f.home.id).toBe('af-team-1');
    expect(f.refs).toEqual([{ provider: 'api-football', externalId: '1' }]);
    expect(f.venue).toBeNull();
    expect(f.statistics).toBeNull();
    expect(f.halfHomeGoals).toBeNull();
  });
  it('uses fulltime regulation scores instead of extra-time goals', () => {
    expect(
      normalizeFixture({
        ...raw,
        fixture: { ...raw.fixture, status: { short: 'AET' } },
        goals: { home: 4, away: 3 },
      }).homeGoals,
    ).toBe(2);
  });
  it('rejects malformed provider fixtures', () => {
    expect(() => normalizeFixture({})).toThrow();
  });
  it('propagates provider quota errors instead of returning fake empty data', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ errors: { requests: 'quota' }, response: [] })),
        ),
    );
    await expect(new ApiFootballProvider('test').fixtures('2026-09-11')).rejects.toThrow(
      'rejected',
    );
  });
  it('does not use prediction endpoints and bounds history before kickoff', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ errors: [], response: [raw] })));
    vi.stubGlobal('fetch', fetcher);
    await new ApiFootballProvider('test').history('1', '2026-09-11T18:00:00Z');
    const url = String(fetcher.mock.calls[0][0]);
    expect(url).toContain('/fixtures?');
    expect(url).toContain('to=2026-09-10');
    expect(url).not.toContain('predictions');
  });
});
