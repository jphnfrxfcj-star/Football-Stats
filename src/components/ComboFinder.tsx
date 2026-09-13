import { occurrence } from '../analysis/engine';
import { useEffect, useMemo, useState } from 'react';
import { api, isDemo } from '../api';
import { suggestCombinations, type MarketsReport } from '../analysis/combinations';
import { SectionTitle, Loading } from './ui';
export default function ComboFinder({
  date,
  navigate,
}: {
  date: string;
  navigate: (path: string) => void;
}) {
  const [report, setReport] = useState<MarketsReport | null>(null),
    [error, setError] = useState(''),
    [window, setWindow] = useState(5),
    [minimumRate, setMinimumRate] = useState(100),
    [book, setBook] = useState('Unibet België'),
    [attempt, setAttempt] = useState(0),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const c = new AbortController();
    setReport(null);
    setError('');
    api
      .markets(date, window, c.signal, 8, minimumRate)
      .then((r) => {
        if (!c.signal.aborted) setReport(r);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [date, window, attempt, minimumRate]);
  const cutoff = isDemo ? Date.parse(`${date}T00:00:00Z`) : now;
  const books = [
    ...new Set([
      'Unibet België',
      ...(report?.fixtures.flatMap((f) => f.quotes.map((q) => q.bookmaker)) ?? []),
    ]),
  ];
  const combos = useMemo(
    () => suggestCombinations(report?.selections ?? [], book, cutoff, 8),
    [report, book, cutoff],
  );
  const eligible = report?.selections.filter((s) => Date.parse(s.fixture.kickoff) > cutoff) ?? [];
  const priced = [
    ...new Set(
      eligible.filter((s) => s.quotes.some((q) => q.bookmaker === book)).map((s) => s.fixture.id),
    ),
  ].length;
  const end = new Date(Date.parse(date) + 7 * 86400000).toISOString().slice(0, 10);
  return (
    <section className="combo-finder" aria-label="Combi x2 tot x3">
      <SectionTitle
        eyebrow="VERSCHILLENDE WEDSTRIJDEN · ÉÉN BOOKMAKER"
        title="Combi x2–x3"
        aside={<span className="combo-target">Doelodd 2.00–3.00</span>}
      />
      <p className="section-intro">
        Van {date} t/m {end}. We combineren 2 tot 8 verschillende wedstrijden uit de Premier League
        en La Liga. Iedere selectie kwam voor in minstens {minimumRate}% van de laatste {window}{' '}
        competitieduels van elk team.
      </p>
      <div className="market-controls">
        <label>
          Bookmaker{' '}
          <select
            aria-label="Combiboekmaker"
            value={book}
            onChange={(e) => setBook(e.target.value)}
          >
            {books.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
        <label>
          Historische reeks{' '}
          <select
            aria-label="Combi historie"
            value={window}
            onChange={(e) => setWindow(Number(e.target.value))}
          >
            {[5, 10, 20].map((n) => (
              <option value={n} key={n}>
                Laatste {n} duels
              </option>
            ))}
          </select>
        </label>
        <label>
          Minimale historische frequentie{' '}
          <select
            aria-label="Combi minimumfrequentie"
            value={minimumRate}
            onChange={(e) => setMinimumRate(Number(e.target.value))}
          >
            {[100, 90, 80].map((n) => (
              <option key={n} value={n}>
                {n}% per team
              </option>
            ))}
          </select>
        </label>
        <button className="secondary-button" onClick={() => setAttempt(attempt + 1)}>
          Combi zoeken / verversen
        </button>
      </div>
      {error ? (
        <p role="alert">{error} Probeer opnieuw met ‘Combi zoeken / verversen’.</p>
      ) : !report ? (
        <Loading />
      ) : (
        <>
          <p className="spotlight-note">
            {report.fixtures.filter((f) => Date.parse(f.fixture.kickoff) > cutoff).length} komende
            wedstrijden onderzocht · {eligible.length} selecties met minstens {minimumRate}%
            historie · {priced} wedstrijden met passende prijzen bij {book}.
          </p>
          {combos.length ? (
            <div className="combo-grid">
              {combos.map((combo, i) => (
                <article className="combo-card" key={i}>
                  <div className="combo-heading">
                    <strong>
                      Combi {i + 1} · {combo.legs.length} wedstrijden
                    </strong>
                    <span className="combo-total">×{combo.decimal.toFixed(2)}</span>
                  </div>
                  <p>
                    {combo.bookmaker} ·{' '}
                    {combo.legs.map((l) => l.quote.decimal.toFixed(2)).join(' × ')} ={' '}
                    {combo.decimal.toFixed(2)}
                  </p>
                  <ol>
                    {combo.legs.map(({ selection: s, quote: q }) => (
                      <li key={s.id} className="finder-leg">
                        <button
                          className="text-button"
                          onClick={() => navigate(`/match/${s.fixture.id}`)}
                        >
                          {s.fixture.home.name} – {s.fixture.away.name}
                        </button>
                        <small>
                          {new Date(s.fixture.kickoff).toLocaleString('nl-BE')} ·{' '}
                          {s.fixture.league.name}
                        </small>
                        <div>
                          <strong>{s.label}</strong>
                          <strong>{q.decimal.toFixed(2)}</strong>
                        </div>
                        <small>
                          Historie:{' '}
                          {
                            s.homeEvidence.filter(
                              (f) => occurrence(f, s.fixture.home.id, s.market) === true,
                            ).length
                          }
                          /{window} thuisploeg ·{' '}
                          {
                            s.awayEvidence.filter(
                              (f) => occurrence(f, s.fixture.away.id, s.market) === true,
                            ).length
                          }
                          /{window} uitploeg · prijswijziging{' '}
                          {q.updatedAt ? new Date(q.updatedAt).toLocaleString('nl-BE') : 'onbekend'}
                        </small>
                        <details>
                          <summary>
                            Bekijk de {window}+{window} onderliggende duels
                          </summary>
                          {[
                            { team: s.fixture.home, rows: s.homeEvidence },
                            { team: s.fixture.away, rows: s.awayEvidence },
                          ].map(({ team, rows }) => (
                            <div key={team.id}>
                              <strong>{team.name}</strong>
                              <ul>
                                {rows.map((f) => (
                                  <li key={f.id}>
                                    {f.kickoff.slice(0, 10)} · {f.home.name} {f.homeGoals}–
                                    {f.awayGoals} {f.away.name}
                                    {s.market.startsWith('firstHalf') &&
                                      ` (rust ${f.halfHomeGoals}–${f.halfAwayGoals})`}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </details>
                      </li>
                    ))}
                  </ol>
                </article>
              ))}
            </div>
          ) : (
            <div className="spotlight-placeholder">
              <strong>Geen passende combi bij {book} in deze periode.</strong>
              <p>
                {priced < 2
                  ? 'Voor een combi zijn minimaal twee verschillende wedstrijden met passende odds nodig.'
                  : 'De beschikbare prijzen leveren met maximaal acht verschillende wedstrijden geen totaal tussen 2 en 3 op.'}{' '}
                Probeer een andere bookmaker of startdatum. Met de ingestelde {minimumRate}%-eis
                verzinnen we geen prijzen.
              </p>
              {minimumRate === 100 && (
                <button className="secondary-button" onClick={() => setMinimumRate(80)}>
                  Zoek met minstens 80% historie
                </button>
              )}
            </div>
          )}
          <p className="spotlight-note">
            Bron: {report.odds.source} · opgehaald{' '}
            {new Date(report.odds.fetchedAt).toLocaleString('nl-BE')}. Prijzen zijn indicatief;
            controleer de actuele combiprijs bij de bookmaker. Historische frequentie is geen
            voorspelde winstkans. Onderlinge duels kunnen in beide reeksen voorkomen.{' '}
            {isDemo && 'Demo: fictieve historie, geen bookmakerprijzen.'}
          </p>
        </>
      )}
    </section>
  );
}
