import { describe, expect, it } from 'vitest';
import {
  FreeFootballProvider,
  freeTeam,
  londonKickoff,
  mergeFixtures,
  normalizeCsv,
  normalizeSchedule,
  type SourceReader,
} from '../server/providers/free-football';
import { analyze } from '../src/analysis/engine';
import { serverConfig } from '../server/config';
const fetchedAt = '2026-09-11T10:00:00Z';
const doc = (text: string) => ({ text, fetchedAt });
const csvHeader =
  'Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,HTHG,HTAG,HS,AS,HST,AST,HC,AC,HF,AF,HY,AY,HR,AR\n';
const played =
  csvHeader + 'E0,21/08/2026,20:00,Arsenal,Man United,2,1,1,0,15,9,5,2,6,3,9,8,1,2,0,0\n';
const schedule = JSON.stringify({
  matches: [
    {
      date: '2026-08-21',
      time: '20:00',
      team1: 'Arsenal FC',
      team2: 'Manchester United FC',
      score: { ft: [2, 1], ht: [1, 0] },
    },
  ],
});
describe('free source normalization', () => {
  it('maps known team aliases and rejects unreviewed names', () => {
    expect(freeTeam('Man United').id).toBe(freeTeam('Manchester United FC').id);
    expect(freeTeam("Nott'm Forest").id).toBe(freeTeam('Nottingham Forest FC').id);
    expect(() => freeTeam('Unmapped United')).toThrow('teamnaam');
  });
  it('normalizes UK winter and summer kickoff times without inventing unknown times', () => {
    expect(londonKickoff('2026-08-21', '20:00').kickoff).toBe('2026-08-21T19:00:00.000Z');
    expect(londonKickoff('2026-12-21', '20:00').kickoff).toBe('2026-12-21T20:00:00.000Z');
    expect(londonKickoff('2026-08-21').kickoffKnown).toBe(false);
    expect(() => londonKickoff('2026-08-21', '25:00')).toThrow();
  });
  it('imports real zero cards, goals, halftime and stats while retaining missing metrics', () => {
    const f = normalizeCsv(doc(played), 2026, 'https://example.test/results.csv')[0];
    expect(f.homeGoals).toBe(2);
    expect(f.halfAwayGoals).toBe(0);
    expect(f.statistics?.home.redCards).toBe(0);
    expect(f.statistics?.home.shots).toBe(15);
    expect(f.statistics?.home.possession).toBeNull();
    expect(f.statistics?.home.xg).toBeNull();
    expect(f.provenance?.sources[0].fetchedAt).toBe(fetchedAt);
  });
  it('does not convert blank metrics or goals to zero', () => {
    const f = normalizeCsv(
      doc(csvHeader + 'E0,21/08/2026,,Arsenal,Chelsea,,,,,,,,,,,,,,,,\n'),
      2026,
      'https://example.test/results.csv',
    )[0];
    expect(f.status).toBe('scheduled');
    expect(f.homeGoals).toBeNull();
    expect(f.statistics).toBeNull();
    expect(f.kickoffKnown).toBe(false);
  });
  it('handles quoted CSV names and ignores other competitions', () => {
    const rows = normalizeCsv(
      doc(played + 'E1,21/08/2026,20:00,Unknown,Unknown,2,1,1,0,15,9,5,2,6,3,9,8,1,2,0,0\n'),
      2026,
      'test',
    );
    expect(rows).toHaveLength(1);
  });
  it('rejects malformed or negative data', () => {
    expect(() => normalizeCsv(doc('<html>Unavailable</html>'), 2026, 'test')).toThrow();
    expect(() => normalizeCsv(doc(played.replace(',15,9,', ',-1,9,')), 2026, 'test')).toThrow();
  });
});
describe('source reconciliation', () => {
  it('merges a fixture only once and preserves metrics and source stamps', () => {
    const open = normalizeSchedule(doc(schedule), 2026, 'open'),
      csv = normalizeCsv(doc(played), 2026, 'csv');
    const merged = mergeFixtures(open, csv, []);
    expect(merged).toHaveLength(1);
    expect(merged[0].statistics?.home.corners).toBe(6);
    expect(merged[0].provenance?.sources).toHaveLength(2);
    expect(merged[0].provenance?.conflicts).toEqual([]);
  });
  it('keeps fixture identity across rescheduling and flags conflicting scores', () => {
    const open = normalizeSchedule(
      doc(schedule.replace('2026-08-21', '2026-08-22').replace('[2,1]', '[3,1]')),
      2026,
      'open',
    );
    const csv = normalizeCsv(doc(played), 2026, 'csv');
    const result = mergeFixtures(open, csv, []);
    expect(result).toHaveLength(1);
    expect(result[0].homeGoals).toBe(2);
    expect(result[0].sourceDate).toBe('2026-08-21');
    expect(result[0].provenance?.conflicts).toHaveLength(2);
  });
  it('never erases known results with a rolling upcoming row', () => {
    const csv = normalizeCsv(doc(played), 2026, 'results');
    const upcoming = normalizeCsv(
      doc('Div,Date,Time,HomeTeam,AwayTeam\nE0,21/08/2026,20:00,Arsenal,Man United\n'),
      2026,
      'fixtures',
      true,
    );
    const result = mergeFixtures([], csv, upcoming)[0];
    expect(result.status).toBe('finished');
    expect(result.homeGoals).toBe(2);
    expect(result.statistics?.home.corners).toBe(6);
  });
  it('does not attach the current rolling fixture feed to an old season', () => {
    expect(
      normalizeCsv(
        doc('Div,Date,Time,HomeTeam,AwayTeam\nE0,21/08/2026,20:00,Arsenal,Chelsea\n'),
        2024,
        'fixtures',
        true,
      ),
    ).toEqual([]);
  });
});
describe('free provider', () => {
  it('uses no API key by default and still validates the optional paid adapter', () => {
    const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test' };
    expect(serverConfig(env).provider).toBe('free-football');
    expect(() => serverConfig({ ...env, FOOTBALL_PROVIDER: 'api-football' })).toThrow(
      'API_FOOTBALL_KEY',
    );
    expect(() => serverConfig({ ...env, FOOTBALL_PROVIDER: 'unknown' })).toThrow(
      'FOOTBALL_PROVIDER',
    );
  });
  it('reuses source documents across history, H2H, list and detail', async () => {
    const calls: string[] = [];
    const reader: SourceReader = async (url) => {
      calls.push(url);
      if (url.includes('githubusercontent')) return doc(schedule);
      if (url.endsWith('fixtures.csv'))
        return doc('Div,Date,Time,HomeTeam,AwayTeam\nE0,12/09/2026,15:00,Arsenal,Chelsea\n');
      return doc(
        played.replaceAll('2026', String(2000 + Number(url.match(/mmz4281\/(\d{2})/)![1]))),
      );
    };
    const provider = new FreeFootballProvider(2026, reader);
    const fixtures = await provider.fixtures('2026-09-12');
    expect(fixtures).toHaveLength(1);
    const [history, h2h] = await Promise.all([
      provider.history('arsenal', fixtures[0].kickoff),
      provider.h2h('arsenal', 'manchester-united', fixtures[0].kickoff),
    ]);
    expect(history).toHaveLength(5);
    expect(h2h).toHaveLength(5);
    expect(await provider.fixture(fixtures[0].refs[0].externalId)).not.toBeNull();
    expect(calls).toHaveLength(7);
    const analysis = analyze({
      fixture: fixtures[0],
      homeHistory: history,
      awayHistory: [],
      h2h: [],
      source: 'live',
      updatedAt: fetchedAt,
      warnings: [],
    });
    expect(analysis.home[0].markets.over25.percentage).toBe(100);
  });
});

it('supports both observed OpenFootball score formats and empty fixture lists', () => {
  const fixture = normalizeSchedule(
    doc(
      JSON.stringify({
        matches: [{ date: '2026-09-05', team1: 'Arsenal FC', team2: 'Chelsea FC', score: [0, 0] }],
      }),
    ),
    2026,
    'open',
  )[0];
  expect(fixture.status).toBe('finished');
  expect(fixture.homeGoals).toBe(0);
  expect(fixture.halfHomeGoals).toBeNull();
  expect(normalizeCsv(doc('Div,Date,Time,HomeTeam,AwayTeam\n'), 2026, 'fixtures', true)).toEqual(
    [],
  );
});
