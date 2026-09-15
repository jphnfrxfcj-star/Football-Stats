import { z } from 'zod';
import { occurrence } from '../analysis/engine';
import { comboMarkets, type Combination } from '../analysis/combinations';
import type { Fixture } from './models';
const legSchema = z.object({
  fixtureId: z.string(),
  homeId: z.string(),
  awayId: z.string(),
  home: z.string(),
  away: z.string(),
  league: z.string(),
  kickoff: z.string().datetime(),
  market: z.enum([
    'over05',
    'over15',
    'over25',
    'over35',
    'under25',
    'btts',
    'firstHalf05',
    'firstHalf15',
  ]),
  decimal: z.number().finite().min(1.1).max(3),
  homeHits: z.number().int().nonnegative(),
  awayHits: z.number().int().nonnegative(),
  quoteUpdatedAt: z.string().nullable(),
});
export const savedComboSchema = z
  .object({
    id: z.string(),
    savedAt: z.string().datetime(),
    bookmaker: z.string(),
    window: z.union([z.literal(5), z.literal(10), z.literal(20)]),
    minimumRate: z.union([z.literal(80), z.literal(90), z.literal(100)]),
    legs: z.array(legSchema).min(2).max(8),
  })
  .refine(
    (c) =>
      new Set(c.legs.map((l) => l.fixtureId)).size === c.legs.length &&
      c.legs.every(
        (l) =>
          Date.parse(l.kickoff) > Date.parse(c.savedAt) &&
          l.homeHits <= c.window &&
          l.awayHits <= c.window,
      ),
  );
export type SavedCombo = z.infer<typeof savedComboSchema>;
export type ComboResult = Pick<
  Fixture,
  | 'id'
  | 'home'
  | 'away'
  | 'kickoff'
  | 'status'
  | 'homeGoals'
  | 'awayGoals'
  | 'halfHomeGoals'
  | 'halfAwayGoals'
>;
export type HistoryStatus = 'open' | 'won' | 'lost' | 'unknown';
export const historyLabels: Record<HistoryStatus, string> = {
  open: 'Nog open',
  won: 'Uitgekomen',
  lost: 'Niet uitgekomen',
  unknown: 'Niet te beoordelen',
};
export function comboIdentity(combo: Combination) {
  return `${combo.bookmaker}|${combo.legs
    .map((l) => `${l.selection.fixture.id}:${l.selection.market}`)
    .sort()
    .join('|')}`;
}
export function saveProposal(
  combo: Combination,
  window: number,
  minimumRate: number,
  now = Date.now(),
): SavedCombo | null {
  const parsed = savedComboSchema.safeParse({
    id: comboIdentity(combo),
    savedAt: new Date(now).toISOString(),
    bookmaker: combo.bookmaker,
    window,
    minimumRate,
    legs: combo.legs.map(({ selection: s, quote: q }) => ({
      fixtureId: s.fixture.id,
      homeId: s.fixture.home.id,
      awayId: s.fixture.away.id,
      home: s.fixture.home.name,
      away: s.fixture.away.name,
      league: s.fixture.league.name,
      kickoff: s.fixture.kickoff,
      market: s.market,
      decimal: q.decimal,
      quoteUpdatedAt: q.updatedAt,
      homeHits: s.homeEvidence.filter((f) => occurrence(f, s.fixture.home.id, s.market) === true)
        .length,
      awayHits: s.awayEvidence.filter((f) => occurrence(f, s.fixture.away.id, s.market) === true)
        .length,
    })),
  });
  if (
    !parsed.success ||
    combo.legs.some(
      (l) => l.quote.bookmaker !== combo.bookmaker || !comboMarkets.includes(l.selection.market),
    )
  )
    return null;
  const decimal = parsed.data.legs.reduce((n, l) => n * l.decimal, 1);
  return decimal >= 2 && decimal <= 3 ? parsed.data : null;
}
export function evaluateProposal(combo: SavedCombo, results: Map<string, ComboResult>) {
  const legs = combo.legs.map((leg) => {
    const result = results.get(leg.fixtureId);
    let status: HistoryStatus = 'open';
    if (result && (result.home.id !== leg.homeId || result.away.id !== leg.awayId))
      status = 'unknown';
    else if (result?.status === 'cancelled') status = 'unknown';
    else if (result?.status === 'finished') {
      const outcome = occurrence(result as Fixture, leg.homeId, leg.market);
      status = outcome === null ? 'unknown' : outcome ? 'won' : 'lost';
    }
    return { leg, result, status };
  });
  const status: HistoryStatus = legs.some((l) => l.status === 'lost')
    ? 'lost'
    : legs.every((l) => l.status === 'won')
      ? 'won'
      : legs.some((l) => l.status === 'open')
        ? 'open'
        : 'unknown';
  return { combo, legs, status, decimal: combo.legs.reduce((n, l) => n * l.decimal, 1) };
}
export function readHistory(raw: string | null): SavedCombo[] {
  if (!raw) return [];
  const parsed = z
    .object({ version: z.literal(1), combos: z.array(z.unknown()).max(200) })
    .safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error('De bewaarde historiek heeft een onbekend formaat.');
  return parsed.data.combos.map((c) => savedComboSchema.parse(c));
}
