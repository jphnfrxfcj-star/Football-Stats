export const playerMetrics = {
  shots: 'Schoten',
  shotsOnTarget: 'Op doel',
  foulsCommitted: 'Overtredingen',
  foulsSuffered: 'Uitgelokt',
  goals: 'Goals',
  assists: 'Assists',
  yellowCards: 'Geel',
  redCards: 'Rood',
} as const;
export type PlayerMetric = keyof typeof playerMetrics;
export interface PlayerObservation {
  eventId: string;
  kickoff: string;
  team: string;
  playerId: string;
  name: string;
  starter: boolean | null;
  metrics: Record<PlayerMetric, number | null>;
  sourceUrl: string;
}
export interface PlayerSummary {
  id: string;
  name: string;
  appearances: number;
  starts: number | null;
  metrics: Record<PlayerMetric, { total: number | null; average: number | null; samples: number }>;
}
export interface PlayerReport {
  source: string;
  fetchedAt: string;
  warnings: string[];
  teams: { name: string; requested: number; available: number; players: PlayerSummary[] }[];
  matches: { id: string; kickoff: string; sourceUrl: string }[];
}
export function summarizePlayers(observations: PlayerObservation[]): PlayerSummary[] {
  const unique = [
    ...new Map(observations.map((o) => [`${o.eventId}:${o.team}:${o.playerId}`, o])).values(),
  ];
  const groups = new Map<string, PlayerObservation[]>();
  for (const row of unique) groups.set(row.playerId, [...(groups.get(row.playerId) ?? []), row]);
  return [...groups]
    .map(([id, rows]) => ({
      id,
      name: rows[0].name,
      appearances: rows.length,
      starts: rows.every((r) => r.starter !== null) ? rows.filter((r) => r.starter).length : null,
      metrics: Object.fromEntries(
        Object.keys(playerMetrics).map((key) => {
          const values = rows
            .map((r) => r.metrics[key as PlayerMetric])
            .filter((v): v is number => v !== null);
          const total = values.length ? values.reduce((a, b) => a + b, 0) : null;
          return [
            key,
            {
              total,
              average: total === null ? null : total / values.length,
              samples: values.length,
            },
          ];
        }),
      ) as PlayerSummary['metrics'],
    }))
    .sort((a, b) => (b.metrics.shots.average ?? -1) - (a.metrics.shots.average ?? -1));
}
