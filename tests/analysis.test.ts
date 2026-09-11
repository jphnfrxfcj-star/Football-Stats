import { describe, expect, it } from 'vitest';
import {
  analyze,
  frequency,
  metricAverage,
  occurrence,
  summarize,
  weightedMarket,
} from '../src/analysis/engine';
import { probabilities } from '../src/analysis/probability';
import { before, emptyMetrics, type Fixture, type MatchData } from '../src/domain/models';
import { demoMatch } from '../src/demo/data';
const base = demoMatch('demo-2026-09-11-0')!;
const home = base.fixture.home,
  away = base.fixture.away;
function fixture(h: number | null, a: number | null, i = 0, swap = false): Fixture {
  return {
    ...base.fixture,
    id: `test-${i}`,
    status: 'finished',
    kickoff: new Date(Date.parse(base.fixture.kickoff) - (i + 1) * 86400000).toISOString(),
    home: swap ? away : home,
    away: swap ? home : away,
    homeGoals: h,
    awayGoals: a,
    halfHomeGoals: null,
    halfAwayGoals: null,
    statistics: null,
  };
}
function data(history: Fixture[], other: Fixture[] = [], h2h: Fixture[] = []): MatchData {
  return { ...base, homeHistory: history, awayHistory: other, h2h };
}
describe('market calculations', () => {
  it('calculates exact over/under denominators', () => {
    const fixtures = [fixture(2, 1), fixture(1, 1, 1), fixture(0, 0, 2), fixture(null, null, 3)];
    const s = summarize(fixtures, home.id, 10);
    expect(s.markets.over25).toMatchObject({ successes: 1, total: 3 });
    expect(s.markets.over25.percentage).toBeCloseTo(100 / 3);
    expect(s.markets.under25.successes).toBe(2);
    expect(s.markets.over05.successes).toBe(2);
    expect(s.markets.over15.successes).toBe(2);
    expect(s.markets.over35.successes).toBe(0);
  });
  it('calculates BTTS and team-specific thresholds', () => {
    expect(occurrence(fixture(1, 1), home.id, 'btts')).toBe(true);
    expect(occurrence(fixture(3, 0), home.id, 'btts')).toBe(false);
    expect(occurrence(fixture(2, 0), home.id, 'team15')).toBe(true);
    expect(occurrence(fixture(2, 0), away.id, 'team05')).toBe(false);
  });
  it('uses only available halftime observations', () => {
    const f = { ...fixture(null, null), halfHomeGoals: 1, halfAwayGoals: 0 };
    expect(occurrence(f, home.id, 'firstHalf05')).toBe(true);
    expect(occurrence(f, home.id, 'firstHalf15')).toBe(false);
    expect(occurrence(fixture(1, 1, 1), home.id, 'firstHalf05')).toBeNull();
    expect(analyze(data([f])).home[0].markets.firstHalf05.total).toBe(1);
  });
  it('retains known team goals when opponent goals are missing', () => {
    expect(analyze(data([fixture(2, null)])).home[0].markets.team15).toEqual({
      successes: 1,
      total: 1,
      percentage: 100,
    });
  });
  it('excludes unfinished and unrelated matches', () => {
    expect(occurrence({ ...fixture(2, 2), status: 'live' }, home.id, 'btts')).toBeNull();
    expect(occurrence(fixture(2, 2), 'not-this-team', 'over25')).toBeNull();
  });
});
describe('form, splits and H2H', () => {
  it('calculates W/D/L from the correct team perspective', () => {
    const matches = [fixture(2, 0), fixture(1, 1, 1), fixture(1, 0, 2, true)];
    const s = summarize(matches, home.id, 10);
    expect([s.wins, s.draws, s.losses]).toEqual([1, 1, 1]);
    expect(s.goalsFor).toBe(3);
    expect(s.goalsAgainst).toBe(2);
    expect(s.cleanSheets.successes).toBe(1);
    expect(s.scored.successes).toBe(2);
    expect(s.failedToScore.successes).toBe(1);
  });
  it('filters home/away before applying the sample window', () => {
    const matches = Array.from({ length: 20 }, (_, i) => fixture(2, 1, i, i % 2 === 1));
    expect(summarize(matches, home.id, 5, 'home').available).toBe(5);
    expect(summarize(matches, home.id, 20, 'away').available).toBe(10);
    expect(summarize(matches, home.id, 5, 'away').losses).toBe(5);
  });
  it('computes H2H relative to the upcoming home team', () => {
    const result = analyze(data([], [], [fixture(2, 1), fixture(1, 3, 1, true)]));
    expect(result.h2h[0].wins).toBe(2);
    expect(result.h2h[0].averageTotalGoals).toBe(3.5);
    expect(result.h2h[0].markets.over25.percentage).toBe(100);
  });
  it('excludes future fixtures and deduplicates by canonical ID', () => {
    const past = fixture(1, 0);
    expect(
      before(
        [past, past, { ...fixture(3, 3, 1), kickoff: base.fixture.kickoff }],
        base.fixture.kickoff,
      ),
    ).toHaveLength(1);
  });
});
describe('weighted model', () => {
  it('uses disjoint bands rather than overlapping window averages', () => {
    const matches = Array.from({ length: 20 }, (_, i) => fixture(i < 5 ? 3 : 0, 0, i));
    const result = weightedMarket(data(matches), 'over25');
    expect(result.percentage).toBeCloseTo((5 / (5 + 5 * 0.75 + 10 * 0.45)) * 100);
    expect(result.sampleSize).toBe(20);
  });
  it('applies a location multiplier without duplicating rows', () => {
    const matches = [fixture(3, 0), fixture(0, 0, 1, true)];
    const result = weightedMarket(data(matches), 'over25');
    expect(result.percentage).toBeCloseTo((1.1 / 2.1) * 100);
    expect(result.sampleSize).toBe(2);
  });
  it('downweights old H2H and excludes overlapping observations', () => {
    const recent = fixture(3, 0);
    const old = { ...fixture(0, 0, 1), kickoff: '2020-01-01T00:00:00Z' };
    const result = weightedMarket(data([recent], [recent], [recent, old]), 'over25');
    expect(result.sampleSize).toBe(2);
    expect(result.percentage).toBeCloseTo((1.1 / (1.1 + 0.15)) * 100);
  });
  it('returns finite probabilities summing to 100 for 1/X/2', () => {
    const p = probabilities(base);
    const values = p.slice(0, 3).map((p) => p.value!);
    expect(values.every(Number.isFinite)).toBe(true);
    expect(values.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 8);
    expect(p.find((p) => p.key === 'over15')!.value!).toBeGreaterThanOrEqual(
      p.find((p) => p.key === 'over25')!.value!,
    );
  });
});
describe('data quality', () => {
  it('returns null instead of fake zeros for empty datasets', () => {
    const a = analyze(data([]));
    expect(a.home[0].goalsFor).toBeNull();
    expect(a.home[0].goalsPerMatch).toBeNull();
    expect(a.combined.over25.probability).toBeNull();
    expect(a.trends).toHaveLength(0);
    expect(probabilities(data([])).every((p) => p.value === null)).toBe(true);
    expect(frequency([])).toEqual({ successes: 0, total: 0, percentage: null });
  });
  it('counts real zeroes but ignores unavailable or nonfinite advanced stats', () => {
    const f = {
      ...fixture(1, 0),
      statistics: { home: { ...emptyMetrics(), corners: 0, shots: NaN }, away: emptyMetrics() },
    };
    expect(metricAverage([f, fixture(2, 1, 1)], home.id, 'corners')).toEqual({
      value: 0,
      total: 1,
    });
    expect(metricAverage([f], home.id, 'shots')).toEqual({ value: null, total: 0 });
    expect(metricAverage([f], home.id, 'xg')).toEqual({ value: null, total: 0 });
  });
});
