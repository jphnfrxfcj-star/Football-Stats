import { t, locale } from '../i18n';
import BetWorkbench from './BetWorkbench';
import type { AnalysisResponse } from '../api';
import { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { api } from '../api';
import type { OddsSnapshot } from '../domain/spotlight';
import { SectionTitle, Loading } from './ui';
const markets = [
  ['home', 'Thuis'],
  ['draw', 'Gelijk'],
  ['away', 'Uit'],
  ['over25', 'Over 2.5'],
  ['under25', 'Under 2.5'],
];
export default function OddsComparison({
  id,
  response,
}: {
  id: string;
  response: AnalysisResponse;
}) {
  const [report, setReport] = useState<OddsSnapshot | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [attempt, setAttempt] = useState(1);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setReport(null);
    setError('');
    api
      .odds(id, c.signal)
      .then((r) => {
        if (!c.signal.aborted) setReport(r);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [id, attempt]);
  const books = [...new Set(report?.quotes.map((q) => q.bookmaker) ?? [])];
  return (
    <section className="odds-section" aria-label={t('Bookmakervergelijking')}>
      <SectionTitle
        eyebrow={t('DE PRIJS MAAKT HET VERSCHIL')}
        title={t('Bookmakerodds')}
        aside={<span className="subtle">{t('90 minuten · decimale odds')}</span>}
      />
      {report && <BetWorkbench key={id} response={response} odds={report} />}
      {!report && !loading && (
        <div className="player-invitation">
          <BarChart3 size={24} />
          <div>
            <strong>{t('Vergelijk dezelfde markt')}</strong>
            <p>{t('Bekijk beschikbare quoteringen en de actualiteit van de bron.')}</p>
          </div>
          <button className="secondary-button" onClick={() => setAttempt(attempt + 1)}>
            {t(error ? 'Opnieuw proberen' : 'Odds vergelijken')}
          </button>
        </div>
      )}
      {loading && <Loading />}
      {error && <p role="alert">{t(error)}</p>}
      {report && (
        <>
          <p className="section-intro">{t(report.message)}</p>
          {books.length ? (
            <details className="bookmaker-comparison">
              <summary>
                {t('Vergelijk alle bookmakers (')}
                {t(books.length)}
                {')'}
              </summary>
              <div
                className="player-table-scroll"
                tabIndex={0}
                aria-label={t('Bookmakerodds tabel')}
              >
                <table className="player-table">
                  <thead>
                    <tr>
                      <th>{t('Bookmaker')}</th>
                      {markets.map(([key, label]) => (
                        <th key={key}>{t(label)}</th>
                      ))}
                      <th>{t('Quoteringstijdstip')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {books.map((book) => {
                      const quotes = report.quotes.filter((q) => q.bookmaker === book);
                      const timestamps = quotes.map((q) => q.updatedAt);
                      const oldest = timestamps.every((t) => t !== null)
                        ? timestamps.reduce((a, b) => (Date.parse(a!) < Date.parse(b!) ? a : b))!
                        : null;
                      return (
                        <tr key={book}>
                          <th scope="row">{t(book)}</th>
                          {markets.map(([key]) => (
                            <td key={key}>
                              {t(quotes.find((q) => q.market === key)?.decimal.toFixed(2) ?? '—')}
                            </td>
                          ))}
                          <td>
                            {t(
                              oldest
                                ? new Date(oldest).toLocaleString(locale())
                                : 'Onbekend · momentopname',
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          ) : (
            <div className="spotlight-placeholder">
              {t('Geen bookmakerodds voor deze wedstrijd beschikbaar bij de ingestelde bron.')}
            </div>
          )}
          <p className="spotlight-note">
            {t('Bron: ')}
            {t(report.source)}
            {t(' · opgehaald ')}
            {t(new Date(report.fetchedAt).toLocaleString(locale()))}
            {t(
              '. Beschikbare bookmakers zijn niet noodzakelijk toegankelijk in jouw land. Controleer de actuele prijs en marktvoorwaarden bij de bookmaker.',
            )}
          </p>
          <button
            className="text-button"
            disabled={loading}
            onClick={() => setAttempt(attempt + 1)}
          >
            {t('Opnieuw laden')}
          </button>
        </>
      )}
    </section>
  );
}
