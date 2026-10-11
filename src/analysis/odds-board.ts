import { analyze } from './engine';
import { pricedMarkets, selectionEvidence, type PricedMarket } from './bet-evidence';
import { fixtureQuotes } from './combinations';
import { probabilities, type Probability } from './probability';
import type { Fixture, MatchData, DataAvailability } from '../domain/models';
import type { OddsQuote, OddsSnapshot } from '../domain/spotlight';
import type { Frequency } from './engine';

export interface OddsBoardMarket {
  key: PricedMarket;
  probability: number | null;
  confidence: Probability['confidence'];
  sampleSize: number;
  homeRecent: Frequency;
  awayRecent: Frequency;
  quotes: OddsQuote[];
}
export interface OddsBoardMatch {
  fixture: Fixture;
  markets: OddsBoardMarket[];
}
export interface OddsBoardReport {
  matches: OddsBoardMatch[];
  odds: Omit<OddsSnapshot, 'quotes'>;
  availability: DataAvailability[];
  blockedFixtures: number;
}

/** An inventory, never a new qualification rule for combo proposals. */
export function buildOddsBoard(
  matches: MatchData[],
  odds: OddsSnapshot,
  now = Date.now(),
): OddsBoardReport {
  const entries: OddsBoardMatch[] = [];
  let blockedFixtures = 0;
  for (const data of matches) {
    const fixture = data.fixture;
    if (
      fixture.status !== 'scheduled' ||
      fixture.kickoffKnown === false ||
      Date.parse(fixture.kickoff) <= now
    )
      continue;
    if (
      [data.availability, fixture.availability].some(
        (availability) => availability?.status === 'partial' || availability?.status === 'stale',
      )
    ) {
      blockedFixtures++;
      continue;
    }
    const model = new Map(probabilities(data, analyze(data)).map((p) => [p.key, p]));
    const quotes = fixtureQuotes(fixture, odds);
    const markets = (Object.keys(pricedMarkets) as PricedMarket[]).map((key) => {
      const probability = model.get(key);
      const [home, away] = selectionEvidence(data, [key], 10, now);
      return {
        key,
        probability:
          probability?.confidence === 'Onvoldoende' ? null : (probability?.value ?? null),
        confidence: probability?.confidence ?? 'Onvoldoende',
        sampleSize: probability?.sampleSize ?? 0,
        homeRecent: home.frequency,
        awayRecent: away.frequency,
        quotes: quotes.filter((quote) => quote.market === key),
      };
    });
    entries.push({ fixture, markets });
  }
  const { quotes: _quotes, ...metadata } = odds;
  return {
    matches: entries,
    odds: metadata,
    availability: matches.flatMap((data) =>
      [data.availability, data.fixture.availability].filter((a): a is DataAvailability => !!a),
    ),
    blockedFixtures,
  };
}
