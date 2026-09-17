import type { Fixture } from './models';
import type { Probability } from '../analysis/probability';
export interface OddsQuote {
  eventId?: string;
  outcomeId?: string;
  betBuilderEligible?: boolean;
  home: string;
  away: string;
  date: string;
  kickoff: string | null;
  market: string;
  bookmaker: string;
  decimal: number;
  /** Time an OPEN price was actually read from the feed; never refreshed on a cache hit. */
  observedAt?: string;
  updatedAt: string | null;
}
export interface OddsSnapshot {
  source: string;
  kind: 'snapshot' | 'feed';
  fetchedAt: string;
  quotes: OddsQuote[];
  message: string;
}
export interface SpotlightCard {
  fixture: Fixture;
  probability: Probability;
  fairOdds: number;
  quote: OddsQuote | null;
  edgePercent: number | null;
}
export interface SpotlightReport {
  availability?: import('./models').DataAvailability[];
  cards: SpotlightCard[];
  checked: number;
  eligible: number;
  source: string;
  oddsKind: OddsSnapshot['kind'];
  fetchedAt: string;
  message: string;
}
