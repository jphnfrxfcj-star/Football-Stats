import type { Fixture, DataAvailability } from '../domain/models';
import type { Probability } from './probability';
import { canonicalClubName } from '../domain/club-names';
import type { OddsSnapshot, SpotlightCard, SpotlightReport } from '../domain/spotlight';
export function buildSpotlight(
  matches: {
    fixture: Fixture;
    availability?: DataAvailability;
    probabilities: Probability[];
    homeSamples: number;
    awaySamples: number;
  }[],
  odds: OddsSnapshot,
  now = Date.now(),
): SpotlightReport {
  const candidates: SpotlightCard[] = [];
  for (const m of matches) {
    const f = m.fixture;
    if (
      [m.availability, f.availability].some((a) => a?.status === 'partial' || a?.status === 'stale')
    )
      continue;
    if (
      f.status !== 'scheduled' ||
      f.kickoffKnown === false ||
      !(Date.parse(f.kickoff) > now) ||
      Math.min(m.homeSamples, m.awaySamples) < 10
    )
      continue;
    const home = canonicalClubName(f.home.name),
      away = canonicalClubName(f.away.name);
    for (const p of m.probabilities) {
      if (
        p.value === null ||
        p.value <= 0 ||
        p.value >= 100 ||
        p.sampleSize < 10 ||
        p.confidence === 'Onvoldoende'
      )
        continue;
      const quotes = odds.quotes.filter(
        (q) =>
          q.home === home &&
          q.away === away &&
          q.market === p.key &&
          q.date === (f.sourceDate ?? f.kickoff.slice(0, 10)) &&
          (q.kickoff === null || Math.abs(Date.parse(q.kickoff) - Date.parse(f.kickoff)) <= 60000),
      );
      const fresh = quotes.filter(
        (q) =>
          q.updatedAt !== null &&
          now - Date.parse(q.updatedAt) >= 0 &&
          now - Date.parse(q.updatedAt) <= 15 * 60000,
      );
      const quote =
        [...(fresh.length ? fresh : quotes)].sort((a, b) => b.decimal - a.decimal)[0] ?? null;
      const edge =
        quote && odds.kind === 'feed' && fresh.includes(quote)
          ? ((p.value / 100) * quote.decimal - 1) * 100
          : null;
      candidates.push({
        fixture: f,
        probability: p,
        fairOdds: 100 / p.value,
        quote,
        edgePercent: edge,
      });
    }
  }
  candidates.sort(
    (a, b) =>
      Math.max(b.edgePercent ?? 0, 0) - Math.max(a.edgePercent ?? 0, 0) ||
      Number(Boolean(b.quote)) - Number(Boolean(a.quote)) ||
      b.probability.value! - a.probability.value!,
  );
  const seen = new Set<string>();
  const cards = candidates
    .filter((c) => {
      if (seen.has(c.fixture.id)) return false;
      seen.add(c.fixture.id);
      return true;
    })
    .slice(0, 3);
  return {
    availability: matches.flatMap((m) =>
      [m.availability, m.fixture.availability].filter((a): a is DataAvailability => !!a),
    ),
    cards,
    checked: matches.length,
    eligible: seen.size,
    source: odds.source,
    oddsKind: odds.kind,
    fetchedAt: odds.fetchedAt,
    message: odds.message,
  };
}
