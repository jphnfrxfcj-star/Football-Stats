import { useEffect, useMemo, useState } from 'react';
import { api, isDemo } from '../api';
import { suggestCombinations, type MarketsReport } from '../analysis/combinations';
import { SectionTitle, Loading } from './ui';
const columns = [
  ['home', 'Thuis'],
  ['draw', 'Gelijk'],
  ['away', 'Uit'],
  ['over25', 'Over 2.5'],
  ['under25', 'Under 2.5'],
];
export default function Markets({
  date,
  navigate,
}: {
  date: string;
  navigate: (path: string) => void;
}) {
  const [window, setWindow] = useState(5),
    [book, setBook] = useState('Unibet België'),
    [manual, setManual] = useState<Record<string, string>>({}),
    [report, setReport] = useState<MarketsReport | null>(null),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const c = new AbortController();
    setReport(null);
    setError('');
    api
      .markets(date, window, c.signal)
      .then((r) => {
        if (!c.signal.aborted) setReport(r);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [date, window, attempt]);
  const cutoff = isDemo ? Date.parse(`${date}T00:00:00Z`) : now;
  const fixtures = report?.fixtures.filter((row) => Date.parse(row.fixture.kickoff) > cutoff) ?? [];
  const selections =
    report?.selections.filter((row) => Date.parse(row.fixture.kickoff) > cutoff) ?? [];
  const books = [...new Set(fixtures.flatMap((row) => row.quotes.map((q) => q.bookmaker)))].sort();
  const selectedBook = books.includes(book) ? book : (books[0] ?? book.trim());
  const combos = useMemo(
    () =>
      suggestCombinations(
        (report?.selections ?? []).map((s) => {
          const decimal = Number((manual[`${selectedBook}:${s.id}`] ?? '').replace(',', '.'));
          if (!selectedBook || !Number.isFinite(decimal) || decimal <= 1 || decimal > 1000)
            return s;
          return {
            ...s,
            quotes: [
              ...s.quotes.filter((q) => q.bookmaker !== selectedBook),
              {
                home: s.fixture.home.name,
                away: s.fixture.away.name,
                date,
                kickoff: s.fixture.kickoff,
                market: s.market,
                bookmaker: selectedBook,
                decimal,
                updatedAt: null,
              },
            ],
          };
        }),
        selectedBook,
        cutoff,
      ),
    [report, selectedBook, cutoff, manual, date],
  );
  return (
    <section className="markets-section" aria-label="Odds en combibouwer">
      <SectionTitle
        eyebrow="PRIJZEN & RECENTE RESULTATEN"
        title="Odds & combi"
        aside={<span className="subtle">{date} · voor de aftrap</span>}
      />
      <p className="section-intro">
        Vergelijk bookmakerodds en zoek een combi van 2–3 met maximaal zes verschillende
        wedstrijden. Elke selectie kwam voor in alle laatste {window} duels van elk van beide teams.
      </p>
      <div className="market-controls">
        <label>
          Historie{' '}
          <select value={window} onChange={(e) => setWindow(Number(e.target.value))}>
            {[5, 10, 20].map((n) => (
              <option key={n} value={n}>
                Laatste {n} wedstrijden
              </option>
            ))}
          </select>
        </label>
        {books.length > 0 && (
          <label>
            Bookmaker{' '}
            <select
              aria-label="Bookmaker"
              value={selectedBook}
              onChange={(e) => setBook(e.target.value)}
            >
              {books.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </label>
        )}
        {!books.length && (
          <label>
            Bookmaker voor handmatige odds{' '}
            <input
              value={book}
              maxLength={60}
              onChange={(e) => setBook(e.target.value)}
              placeholder="Naam bookmaker"
            />
          </label>
        )}
      </div>
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button className="secondary-button" onClick={() => setAttempt(attempt + 1)}>
            Odds opnieuw proberen
          </button>
        </div>
      ) : !report ? (
        <Loading />
      ) : (
        <>
          <p className="spotlight-note">
            {report.odds.message} Bron: {report.odds.source}. Opgehaald{' '}
            {new Date(report.odds.fetchedAt).toLocaleString('nl-BE')}. De totale odd is indicatief;
            controleer prijzen en combinatiemogelijkheid bij de bookmaker.
          </p>
          <h3>Wedstrijdodds · {selectedBook || 'geen prijzen beschikbaar'}</h3>
          {fixtures.length > 0 ? (
            <div className="player-table-scroll" tabIndex={0} aria-label="Wedstrijdodds tabel">
              <table className="player-table">
                <thead>
                  <tr>
                    <th>Wedstrijd</th>
                    {columns.map(([key, label]) => (
                      <th key={key}>{label}</th>
                    ))}
                    <th>Quoteringstijdstip</th>
                  </tr>
                </thead>
                <tbody>
                  {fixtures.map(({ fixture: f, quotes }) => {
                    const prices = quotes.filter((q) => q.bookmaker === selectedBook);
                    const timestamps = prices.map((q) => q.updatedAt);
                    const stamp =
                      timestamps.length && timestamps.every((t) => t !== null)
                        ? timestamps.sort()[0]
                        : null;
                    return (
                      <tr key={f.id}>
                        <th scope="row">
                          <button
                            className="text-button"
                            onClick={() => navigate(`/match/${f.id}`)}
                          >
                            {f.home.name} – {f.away.name}
                          </button>
                        </th>
                        {columns.map(([key]) => (
                          <td key={key}>
                            {prices.find((q) => q.market === key)?.decimal.toFixed(2) ?? '—'}
                          </td>
                        ))}
                        <td>
                          {stamp
                            ? new Date(stamp).toLocaleString('nl-BE')
                            : 'Onbekend · momentopname'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="spotlight-placeholder">Geen komende wedstrijden op deze datum.</p>
          )}
          <h3>Combi’s met historische 100%</h3>
          <p className="spotlight-note">
            100% beschrijft uitsluitend de onderzochte historie, geen winstkans of garantie.
            Volledige wedstrijden binnen de beschikbare competitiehistorie, ongeacht thuis/uit.
            Ontbrekende uitslagen tellen niet als succes. Onderlinge duels kunnen in beide reeksen
            voorkomen.
          </p>
          {combos.length ? (
            <div className="combo-grid">
              {combos.map((combo, i) => (
                <article className="combo-card" key={i}>
                  <div className="combo-heading">
                    <strong>{combo.bookmaker}</strong>
                    <span>Totale odd {combo.decimal.toFixed(2)}</span>
                  </div>
                  <ul>
                    {combo.legs.map(({ selection: s, quote: q }) => (
                      <li key={s.id}>
                        <button
                          className="text-button"
                          onClick={() => navigate(`/match/${s.fixture.id}`)}
                        >
                          {s.fixture.home.name} – {s.fixture.away.name}
                        </button>
                        <div>
                          {s.label} <strong>× {q.decimal.toFixed(2)}</strong>
                        </div>
                        <small>
                          Beide teams {window}/{window} ·{' '}
                          {manual[`${selectedBook}:${s.id}`] &&
                          Number(manual[`${selectedBook}:${s.id}`].replace(',', '.')) === q.decimal
                            ? 'Handmatig ingevoerd'
                            : q.updatedAt
                              ? new Date(q.updatedAt).toLocaleString('nl-BE')
                              : 'Quoteringstijdstip onbekend'}
                        </small>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          ) : (
            <p className="spotlight-placeholder">
              Geen combi tussen 2 en 3 met beschikbare prijzen bij {selectedBook || 'de bron'} en{' '}
              {window}/{window} voor beide teams. De eis van 100% blijft behouden.
            </p>
          )}
          <details className="perfect-details">
            <summary>Alle historische 100%-selecties ({selections.length}) en bewijs</summary>
            <p className="spotlight-note">
              Selecties zonder bookmakerprijs kunnen niet in een berekende combi. Niet elke bron
              biedt iedere markt; ontbrekende prijzen blijven leeg. Klap een selectie open om een
              gecontroleerde prijs bij dezelfde bookmaker in te vullen. Handmatige prijzen gelden
              alleen in dit scherm en worden niet opgeslagen.
            </p>
            {selections.map((s) => (
              <details key={s.id} className="selection-evidence">
                <summary>
                  {s.fixture.home.name} – {s.fixture.away.name} · {s.label} · {window}/{window} per
                  team ·{' '}
                  {s.quotes.find((q) => q.bookmaker === selectedBook)?.decimal.toFixed(2) ??
                    'Geen odds bij bron'}
                </summary>
                <label className="manual-price">
                  Gecontroleerde odd voor {s.label} bij {selectedBook || 'je bookmaker'}
                  <input
                    aria-label={`Handmatige odd ${s.fixture.home.name} ${s.label}`}
                    inputMode="decimal"
                    placeholder="Bijv. 1,40"
                    maxLength={8}
                    disabled={!selectedBook}
                    value={manual[`${selectedBook}:${s.id}`] ?? ''}
                    onChange={(e) =>
                      setManual({ ...manual, [`${selectedBook}:${s.id}`]: e.target.value })
                    }
                  />
                  <small>
                    Handmatige invoer · vervangt voor deze selectie de bronprijs. Wis om terug te
                    zetten. Gebruik een decimale odd groter dan 1, maximaal 1000.
                  </small>
                </label>
                {[
                  { team: s.fixture.home, rows: s.homeEvidence },
                  { team: s.fixture.away, rows: s.awayEvidence },
                ].map(({ team, rows }) => (
                  <div key={team.id}>
                    <strong>
                      {team.name}: {window}/{window}
                    </strong>
                    <ul>
                      {rows.map((f) => (
                        <li key={f.id}>
                          {f.kickoff.slice(0, 10)} · {f.home.name} {f.homeGoals}–{f.awayGoals}{' '}
                          {f.away.name}
                          {s.market.startsWith('firstHalf') &&
                            ` (rust ${f.halfHomeGoals}–${f.halfAwayGoals})`}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </details>
            ))}
            {!selections.length && (
              <p>Geen selectie voldoet aan de volledige historische steekproef.</p>
            )}
          </details>
          <button className="text-button" onClick={() => setAttempt(attempt + 1)}>
            Odds en combi vernieuwen
          </button>
        </>
      )}
    </section>
  );
}
