import { z } from 'zod';
import { canonicalClubName } from '../../src/domain/club-names';
import { emptyMetrics, type Fixture, type Metric } from '../../src/domain/models';
const competitor = z.object({
  homeAway: z.enum(['home', 'away']),
  score: z.string().optional(),
  team: z.object({ displayName: z.string() }),
  statistics: z.array(z.object({ name: z.string(), displayValue: z.string() })).optional(),
});
const scoreboard = z.object({
  events: z.array(
    z.object({
      id: z.string(),
      competitions: z.array(
        z.object({
          date: z.string(),
          status: z.object({ type: z.object({ name: z.string(), completed: z.boolean() }) }),
          competitors: z.array(competitor),
        }),
      ),
    }),
  ),
});
export function applyResults(
  fixtures: Fixture[],
  raw: unknown,
  url: string,
  fetchedAt: string,
): Fixture[] {
  const events = scoreboard.parse(raw).events;
  return fixtures.map((f) => {
    if (f.status === 'finished' && f.statistics) return f;
    const event = events.find((e) =>
      e.competitions.some(
        (c) =>
          c.status.type.completed &&
          c.status.type.name === 'STATUS_FULL_TIME' &&
          Math.abs(Date.parse(c.date) - Date.parse(f.kickoff)) <= 6 * 3600000 &&
          c.competitors.some(
            (t) => t.homeAway === 'home' && canonicalClubName(t.team.displayName) === f.home.name,
          ) &&
          c.competitors.some(
            (t) => t.homeAway === 'away' && canonicalClubName(t.team.displayName) === f.away.name,
          ),
      ),
    );
    if (!event) return f;
    const game = event.competitions[0],
      home = game.competitors.find((t) => t.homeAway === 'home')!,
      away = game.competitors.find((t) => t.homeAway === 'away')!;
    if (!/^\d+$/.test(home.score ?? '') || !/^\d+$/.test(away.score ?? '')) return f;
    const metrics = (t: z.infer<typeof competitor>) => {
      const m = emptyMetrics();
      const fields: Partial<Record<Metric, string>> = {
        shots: 'totalShots',
        shotsOnTarget: 'shotsOnTarget',
        corners: 'wonCorners',
        fouls: 'foulsCommitted',
        possession: 'possessionPct',
        yellowCards: 'yellowCards',
        redCards: 'redCards',
      };
      for (const [key, name] of Object.entries(fields)) {
        const v = t.statistics?.find((s) => s.name === name)?.displayValue;
        if (v !== undefined && /^\d+(\.\d+)?$/.test(v)) m[key as Metric] = Number(v);
      }
      return m;
    };
    const missing = f.homeGoals === null || f.awayGoals === null;
    return {
      ...f,
      status: 'finished',
      homeGoals: missing ? Number(home.score) : f.homeGoals,
      awayGoals: missing ? Number(away.score) : f.awayGoals,
      statistics: f.statistics ?? { home: metrics(home), away: metrics(away) },
      provenance: {
        sources: [...(f.provenance?.sources ?? []), { name: 'espn-scoreboard', url, fetchedAt }],
        fields: {
          ...f.provenance?.fields,
          ...(missing ? { score: 'espn-scoreboard' } : {}),
          ...(!f.statistics ? { statistics: 'espn-scoreboard' } : {}),
        },
        conflicts: f.provenance?.conflicts ?? [],
      },
    };
  });
}
