import { t, locale } from '../i18n';
import type { Fixture } from '../domain/models';
import type { OddsQuote, OddsSnapshot } from '../domain/spotlight';
import { fixtureQuotes } from './combinations';
import { isUpcoming } from './recap';
export function programPrices(fixture: Fixture, report: OddsSnapshot | null, now = Date.now()) {
  const available =
    report && isUpcoming(fixture, now)
      ? fixtureQuotes(fixture, report).filter((q) => ['home', 'draw', 'away'].includes(q.market))
      : [];
  const books = [...new Set(available.map((q) => q.bookmaker))];
  const coverage = (book: string) =>
    new Set(available.filter((q) => q.bookmaker === book).map((q) => q.market)).size;
  const ranked = [...books].sort(
    (a, b) =>
      coverage(b) - coverage(a) || Number(b === 'Unibet België') - Number(a === 'Unibet België'),
  );
  const bookmaker = ranked[0] ?? null;
  const quotes: Partial<Record<'home' | 'draw' | 'away', OddsQuote>> = {};
  for (const q of available.filter((q) => q.bookmaker === bookmaker)) {
    const market = q.market as 'home' | 'draw' | 'away';
    if (
      !quotes[market] ||
      Date.parse(q.updatedAt ?? '') > Date.parse(quotes[market]!.updatedAt ?? '')
    )
      quotes[market] = q;
  }
  const selected = Object.values(quotes);
  const snapshot = selected.some((q) => !q.updatedAt);
  const detail = selected
    .map(
      (q) =>
        `${t(q.market === 'home' ? 'Thuis' : q.market === 'draw' ? 'Gelijk' : 'Uit')} ${q.decimal.toFixed(2)} · ${q.updatedAt ? new Date(q.updatedAt).toLocaleString(locale()) : t('tijdstip onbekend')}`,
    )
    .join('\n');
  return { bookmaker, quotes, snapshot, detail };
}
