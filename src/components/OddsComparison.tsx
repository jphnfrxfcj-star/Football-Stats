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
export default function OddsComparison({ id }: { id: string }) {
  const [report, setReport] = useState<OddsSnapshot | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!attempt) return;
    const c = new AbortController();
    setLoading(true);
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
    <section className="odds-section" aria-label="Bookmakervergelijking">
      <SectionTitle
        eyebrow="DE PRIJS MAAKT HET VERSCHIL"
        title="Bookmakerodds"
        aside={<span className="subtle">90 minuten · decimale odds</span>}
      />
      {!report && !loading && (
        <div className="player-invitation">
          <BarChart3 size={24} />
          <div>
            <strong>Vergelijk dezelfde markt</strong>
            <p>Bekijk beschikbare quoteringen en de actualiteit van de bron.</p>
          </div>
          <button className="secondary-button" onClick={() => setAttempt(attempt + 1)}>
            {error ? 'Opnieuw proberen' : 'Odds vergelijken'}
          </button>
        </div>
      )}
      {loading && <Loading />}
      {error && <p role="alert">{error}</p>}
      {report && (
        <>
          <p className="section-intro">{report.message}</p>
          {books.length ? (
            <div className="player-table-scroll" tabIndex={0} aria-label="Bookmakerodds tabel">
              <table className="player-table">
                <thead>
                  <tr>
                    <th>Bookmaker</th>
                    {markets.map(([key, label]) => (
                      <th key={key}>{label}</th>
                    ))}
                    <th>Quoteringstijdstip</th>
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
                        <th scope="row">{book}</th>
                        {markets.map(([key]) => (
                          <td key={key}>
                            {quotes.find((q) => q.market === key)?.decimal.toFixed(2) ?? '—'}
                          </td>
                        ))}
                        <td>
                          {oldest
                            ? new Date(oldest).toLocaleString('nl-BE')
                            : 'Onbekend · momentopname'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="spotlight-placeholder">
              Geen bookmakerodds voor deze wedstrijd beschikbaar bij de ingestelde bron.
            </div>
          )}
          <p className="spotlight-note">
            Bron: {report.source} · opgehaald {new Date(report.fetchedAt).toLocaleString('nl-BE')}.
            Beschikbare bookmakers zijn niet noodzakelijk toegankelijk in jouw land. Controleer de
            actuele prijs en marktvoorwaarden bij de bookmaker.
          </p>
          <button
            className="text-button"
            disabled={loading}
            onClick={() => setAttempt(attempt + 1)}
          >
            Opnieuw laden
          </button>
        </>
      )}
    </section>
  );
}
