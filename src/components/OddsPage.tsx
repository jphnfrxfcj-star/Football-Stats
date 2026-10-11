import { useEffect, useState } from 'react';
import { ArrowRight, ListFilter } from 'lucide-react';
import { api, isDemo } from '../api';
import type { OddsBoardMarket, OddsBoardReport } from '../analysis/odds-board';
import { pricedMarkets, type PricedMarket } from '../analysis/bet-evidence';
import type { OddsQuote } from '../domain/spotlight';
import { today } from '../demo/data';
import { t, tr, locale } from '../i18n';
import DataNotice from './DataNotice';
import RefreshButton from './RefreshButton';
import { Badge, ErrorBox, Loading, time } from './ui';

function newestQuote(quotes: OddsQuote[], bookmaker: string) {
  const observedTime = (quote: OddsQuote) => {
    const value = Date.parse(quote.observedAt ?? quote.updatedAt ?? '');
    return Number.isFinite(value) ? value : -Infinity;
  };
  return quotes
    .filter((quote) => quote.bookmaker === bookmaker)
    .sort((a, b) => observedTime(b) - observedTime(a))[0];
}
const bands = [
  { key: 'high', title: '70% en hoger', includes: (p: number | null) => p !== null && p >= 70 },
  {
    key: 'middle',
    title: '50–69%',
    includes: (p: number | null) => p !== null && p >= 50 && p < 70,
  },
  { key: 'lower', title: 'Onder 50%', includes: (p: number | null) => p !== null && p < 50 },
  { key: 'unknown', title: 'Geen modelkans', includes: (p: number | null) => p === null },
] as const;

type BoardRow = {
  fixture: OddsBoardReport['matches'][number]['fixture'];
  market: OddsBoardMarket;
  quote: OddsQuote | undefined;
};
export default function OddsPage({ navigate }: { navigate: (path: string) => void }) {
  const [date, setDate] = useState(today());
  const [days, setDays] = useState(1);
  const [market, setMarket] = useState<PricedMarket | 'all'>('all');
  const [chosenBook, setBook] = useState('');
  const [showMissing, setShowMissing] = useState(false);
  const [source, setSource] = useState<{ key: string; report: OddsBoardReport } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [now, setNow] = useState(Date.now());
  const key = `${date}:${days}`;
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    api
      .oddsBoard(date, days, controller.signal)
      .then((report) => {
        if (!controller.signal.aborted) setSource({ key, report });
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [date, days, retry, key]);
  const report = source?.key === key ? source.report : null;
  const books = [
    ...new Set(
      report?.matches.flatMap((match) =>
        match.markets.flatMap((item) => item.quotes.map((q) => q.bookmaker)),
      ) ?? [],
    ),
  ].sort((a, b) => a.localeCompare(b, locale()));
  const book = books.includes(chosenBook)
    ? chosenBook
    : books.includes('Unibet België')
      ? 'Unibet België'
      : books[0];
  const rows: BoardRow[] =
    report?.matches.flatMap(({ fixture, markets }) =>
      fixture.kickoffKnown !== false && Date.parse(fixture.kickoff) > now
        ? markets
            .filter((item) => market === 'all' || item.key === market)
            .map((item) => ({
              fixture,
              market: item,
              quote: book ? newestQuote(item.quotes, book) : undefined,
            }))
            .filter((row) => showMissing || books.length === 0 || row.quote)
        : [],
    ) ?? [];
  rows.sort(
    (a, b) =>
      (b.market.probability ?? -1) - (a.market.probability ?? -1) ||
      a.fixture.kickoff.localeCompare(b.fixture.kickoff),
  );
  return (
    <div className="odds-page">
      <div className="page-heading odds-page-heading">
        <div>
          <div className="eyebrow">{t('MARKTENOVERZICHT')}</div>
          <h1>{t('Odds & kansen')}</h1>
          <p>{t('Bekijk beschikbare odds gegroepeerd op de geschatte modelkans per markt.')}</p>
        </div>
        <RefreshButton
          label="Odds en kansen bijwerken"
          loading={loading}
          onClick={() => setRetry((n) => n + 1)}
        />
      </div>
      <p className="spotlight-note">
        {t(
          'Modelkansen zijn ongekalibreerde schattingen, geen zekerheid. Historische treffers zijn geen voorspelde slaagkans. Controleer een prijs en de gecombineerde betbuilder altijd bij de bookmaker.',
        )}
      </p>
      <div className="odds-board-controls">
        <label>
          {t('Vanaf')}
          <input
            type="date"
            aria-label={t('Startdatum odds')}
            min={today()}
            value={date}
            onChange={(event) => event.target.value && setDate(event.target.value)}
          />
        </label>
        <label>
          {t('Periode')}
          <select
            aria-label={t('Periode odds')}
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
          >
            {[1, 3, 8].map((count) => (
              <option key={count} value={count}>
                {tr('{0} dagen', [count])}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('Markt')}
          <select
            aria-label={t('Oddsenmarkt')}
            value={market}
            onChange={(event) => setMarket(event.target.value as PricedMarket | 'all')}
          >
            <option value="all">{t('Alle markten')}</option>
            {(Object.entries(pricedMarkets) as [PricedMarket, string][]).map(([key, label]) => (
              <option key={key} value={key}>
                {t(label)}
              </option>
            ))}
          </select>
        </label>
        {books.length > 0 && (
          <label>
            {t('Bookmaker')}
            <select
              aria-label={t('Oddsbookmaker')}
              value={book}
              onChange={(event) => setBook(event.target.value)}
            >
              {books.map((name) => (
                <option key={name} value={name}>
                  {t(name)}
                </option>
              ))}
            </select>
          </label>
        )}
        {books.length > 0 && (
          <label className="odds-board-check">
            <input
              type="checkbox"
              checked={showMissing}
              onChange={(event) => setShowMissing(event.target.checked)}
            />
            {t('Toon ook zonder odd')}
          </label>
        )}
      </div>
      {error && report && (
        <p role="alert" className="odds-board-error">
          {t(error)} {t('De eerder geladen gegevens blijven zichtbaar.')}
        </p>
      )}
      {!report &&
        (error ? <ErrorBox message={error} retry={() => setRetry((n) => n + 1)} /> : <Loading />)}
      {report && (
        <>
          <DataNotice items={report.availability} />
          {report.blockedFixtures > 0 && (
            <p className="spotlight-note" role="status">
              {tr('{0} wedstrijden met onvolledige of verouderde historie zijn niet ingedeeld.', [
                report.blockedFixtures,
              ])}
            </p>
          )}
          <p className="odds-board-source">
            {t(report.odds.message)}{' '}
            {tr('Bron: {0} · opgehaald {1}', [
              t(report.odds.source),
              new Date(report.odds.fetchedAt).toLocaleString(locale()),
            ])}
          </p>
          {isDemo && (
            <p className="demo-note">{t('Demo: fictieve historie, geen Unibet-prijzen.')}</p>
          )}
          {rows.length === 0 ? (
            <div className="empty-state">
              <ListFilter size={25} />
              <h3>{t('Geen passende markten')}</h3>
              <p>{t('Kies een andere datum, periode, markt of bookmaker.')}</p>
            </div>
          ) : (
            bands.map((band) => {
              const members = rows.filter((row) => band.includes(row.market.probability));
              if (!members.length) return null;
              return (
                <section className="odds-board-group" key={band.key} aria-label={t(band.title)}>
                  <div className="odds-board-group-heading">
                    <h2>{t(band.title)}</h2>
                    <span>{tr('{0} markten', [members.length])}</span>
                  </div>
                  <div className="odds-board-list">
                    {members.map(({ fixture, market: item, quote }) => {
                      const observed = quote?.observedAt ?? quote?.updatedAt;
                      const age = observed ? now - Date.parse(observed) : NaN;
                      const recent =
                        report.odds.kind === 'feed' &&
                        Number.isFinite(age) &&
                        age >= 0 &&
                        age <= 900000;
                      return (
                        <article className="odds-board-row" key={`${fixture.id}:${item.key}`}>
                          <div className="odds-board-time">
                            <strong>{t(time(fixture.kickoff))}</strong>
                            <small>{t('Gepland')}</small>
                          </div>
                          <div className="odds-board-teams">
                            <div className="odds-board-team home">
                              <span title={t(fixture.home.name)}>{t(fixture.home.name)}</span>
                              <Badge team={fixture.home} size="small" />
                            </div>
                            <span className="odds-board-vs">{t('vs')}</span>
                            <div className="odds-board-team away">
                              <Badge team={fixture.away} size="small" />
                              <span title={t(fixture.away.name)}>{t(fixture.away.name)}</span>
                            </div>
                          </div>
                          <div className="odds-board-market">
                            <strong>{t(pricedMarkets[item.key])}</strong>
                            <small>
                              {tr('Laatste 10: thuis {0}/{1} · uit {2}/{3}', [
                                item.homeRecent.successes,
                                item.homeRecent.total,
                                item.awayRecent.successes,
                                item.awayRecent.total,
                              ])}
                            </small>
                          </div>
                          <div className="odds-board-probability">
                            <strong>
                              {item.probability === null ? '—' : `${item.probability.toFixed(0)}%`}
                            </strong>
                            <small>
                              {item.probability === null
                                ? t('Geen modelkans')
                                : `${t('Modelkans')} · ${t(item.confidence.toLowerCase())}`}
                            </small>
                          </div>
                          <div className="odds-board-price">
                            <strong>{quote ? quote.decimal.toFixed(2) : '—'}</strong>
                            <small>
                              {quote
                                ? recent
                                  ? quote.bookmaker
                                  : tr('{0} · momentopname, controleer prijs', [quote.bookmaker])
                                : t('Geen odd beschikbaar')}
                            </small>
                          </div>
                          <button
                            className="odds-board-open"
                            onClick={() => navigate(`/match/${fixture.id}`)}
                            aria-label={tr('Open analyse van {0} tegen {1}', [
                              fixture.home.name,
                              fixture.away.name,
                            ])}
                          >
                            {t('Bekijk analyse')} <ArrowRight size={15} />
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })
          )}
        </>
      )}
    </div>
  );
}
