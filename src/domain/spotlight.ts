import type { Fixture } from './models';
import type { Probability } from '../analysis/probability';
export interface OddsQuote {
  home: string;
  away: string;
  date: string;
  kickoff: string | null;
  market: string;
  bookmaker: string;
  decimal: number;
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
  cards: SpotlightCard[];
  checked: number;
  eligible: number;
  source: string;
  oddsKind: OddsSnapshot['kind'];
  fetchedAt: string;
  message: string;
}
