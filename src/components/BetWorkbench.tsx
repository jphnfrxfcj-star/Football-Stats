import { useEffect, useState } from 'react';
import type { AnalysisResponse } from '../api';
import type { OddsSnapshot } from '../domain/spotlight';
import {
  pricedMarkets,
  selectionEvidence,
  priceAssessment,
  type PricedMarket,
} from '../analysis/bet-evidence';
export default function BetWorkbench({
  response,
  odds,
}: {
  response: AnalysisResponse;
  odds: OddsSnapshot | null;
}) {
  const [chosenBook, setBook] = useState<string | null>(null),
    [window, setWindow] = useState(10),
    [picked, setPicked] = useState<PricedMarket[]>([]),
    [builderPrice, setBuilderPrice] = useState(''),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const data = response.data,
    demo = data.source === 'demo';
  const active =
    demo ||
    (data.fixture.status === 'scheduled' &&
      data.fixture.kickoffKnown !== false &&
      Date.parse(data.fixture.kickoff) > now);
  const availableBooks = [...new Set(odds?.quotes.map((q) => q.bookmaker) ?? [])];
  const books = availableBooks.length ? availableBooks : ['Unibet België'];
  const book =
    chosenBook && books.includes(chosenBook)
      ? chosenBook
      : books.includes('Unibet België')
        ? 'Unibet België'
        : books[0];
  useEffect(() => {
    setPicked([]);
    setBuilderPrice('');
  }, [book, data.fixture.id]);
  const joint = selectionEvidence(data, picked, window);
  const total = priceAssessment(Number(builderPrice.replace(',', '.')), null);
  function toggle(m: PricedMarket) {
    setBuilderPrice('');
    setPicked(picked.includes(m) ? picked.filter((p) => p !== m) : [...picked, m]);
  }
  return (
    <div className="bet-workbench" aria-label="Odds versus statistiek">
      <h3>Odds versus statistiek</h3>
      <p className="section-intro">
        Begin bij de aangeboden prijs. Vergelijk de impliciete kans met het model en bekijk wat er
        in recente wedstrijden gebeurde.
      </p>
      {odds && !availableBooks.includes('Unibet België') && (
        <p className="odds-availability" role="status">
          {availableBooks.length
            ? `Geen Unibet-prijzen beschikbaar voor deze wedstrijd. Je bekijkt de prijzen van ${book}.`
            : 'Voor deze wedstrijd zijn momenteel geen bookmakerprijzen beschikbaar. De historische analyse blijft beschikbaar.'}
        </p>
      )}
      <div className="market-controls">
        <label>
          Bookmaker{' '}
          <select
            aria-label="Analysebookmaker"
            value={book}
            onChange={(e) => {
              setBook(e.target.value);
              setPicked([]);
              setBuilderPrice('');
            }}
          >
            {books.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
        <label>
          Historie{' '}
          <select
            aria-label="Oddsanalyse historie"
            value={window}
            onChange={(e) => setWindow(Number(e.target.value))}
          >
            {[5, 10, 20].map((n) => (
              <option key={n} value={n}>
                Laatste {n}
              </option>
            ))}
          </select>
        </label>
        <a
          className="text-button"
          href="https://nl.unibetsports.be/betting"
          target="_blank"
          rel="noreferrer"
        >
          Open Unibet België
        </a>
      </div>
      {!active && (
        <p className="spotlight-placeholder">
          De pre-matchvergelijking is gesloten voor deze wedstrijd.
        </p>
      )}
      {demo && <p className="spotlight-note">Demo: fictieve historie, geen Unibet-prijzen.</p>}
      <details className="odds-reading-guide">
        <summary>Hoe lees je odds en statistieken?</summary>
        <p className="spotlight-note">
          Impliciete kans = 100 / odd, inclusief bookmakeropslag. Modelverschil is een
          ongekalibreerde schatting in procentpunten, geen bewezen voordeel. Historie telt
          beschikbare competitieduels ongeacht thuis/uit; bij 1X2 telt de eigen ploeg vanuit haar
          rol in deze wedstrijd (bij ‘thuis wint’: thuisploeg wint, uitploeg verliest). Het model
          gebruikt zijn eigen gewogen vensters.
        </p>
      </details>
      <div className="player-table-scroll" tabIndex={0} aria-label="Odds en statistiek tabel">
        <table className="player-table">
          <thead>
            <tr>
              <th>Markt</th>
              <th>{book} odd</th>
              <th>Impliciet</th>
              <th>Model</th>
              <th>Verschil</th>
              <th>{data.fixture.home.name} historie</th>
              <th>{data.fixture.away.name} historie</th>
              <th>Builder</th>
            </tr>
          </thead>
          <tbody>
            {(Object.entries(pricedMarkets) as [PricedMarket, string][]).map(([key, label]) => {
              const quote = active
                ? odds?.quotes.find((q) => q.bookmaker === book && q.market === key)
                : undefined;
              const decimal = quote?.decimal ?? NaN;
              const probability = response.probabilities.find((p) => p.key === key);
              const assessment = active
                ? priceAssessment(
                    decimal,
                    probability?.confidence === 'Onvoldoende' ? null : (probability?.value ?? null),
                  )
                : null;
              const evidence = selectionEvidence(data, [key], window);
              const conflict =
                !picked.includes(key) &&
                ((['home', 'draw', 'away'].includes(key) &&
                  picked.some((p) => ['home', 'draw', 'away'].includes(p))) ||
                  (key === 'under25' && picked.some((p) => ['over25', 'over35'].includes(p))) ||
                  (['over25', 'over35'].includes(key) && picked.includes('under25')));
              return (
                <tr key={key}>
                  <th scope="row">{label}</th>
                  <td>
                    <strong
                      className={`market-odd${quote ? '' : ' market-odd-missing'}`}
                      aria-label={`${label} odd`}
                    >
                      {quote ? quote.decimal.toFixed(2) : 'Geen prijs'}
                    </strong>
                    <small className="quote-detail">
                      {quote
                        ? quote.updatedAt
                          ? `Bijgewerkt ${new Date(quote.updatedAt).toLocaleString('nl-BE')}`
                          : 'Momentopname · tijdstip onbekend'
                        : 'Niet aangeboden in deze feed'}
                    </small>
                  </td>
                  <td>{assessment ? `${assessment.implied.toFixed(1)}%` : '—'}</td>
                  <td>
                    {probability?.value !== null && probability?.value !== undefined ? (
                      <>
                        <strong>{probability.value.toFixed(1)}%</strong>
                        <small>{probability.confidence}</small>
                      </>
                    ) : (
                      'Geen model'
                    )}
                  </td>
                  <td>
                    {assessment?.gap != null
                      ? `${assessment.gap > 0 ? '+' : ''}${assessment.gap.toFixed(1)} pp`
                      : '—'}
                  </td>
                  {evidence.map((e) => (
                    <td key={e.team.id}>
                      <details>
                        <summary>
                          {e.frequency.successes}/{e.frequency.total} ·{' '}
                          {e.frequency.percentage?.toFixed(0) ?? '—'}%
                        </summary>
                        <small>
                          {e.frequency.total}/{window} met bekende data
                        </small>
                        <ul>
                          {e.rows.map((f, i) => (
                            <li key={f.id}>
                              {f.kickoff.slice(0, 10)} · {f.home.name} {f.homeGoals ?? '?'}–
                              {f.awayGoals ?? '?'} {f.away.name} ·{' '}
                              {e.values[i] === null ? 'onbekend' : e.values[i] ? 'ja' : 'nee'}
                            </li>
                          ))}
                        </ul>
                      </details>
                    </td>
                  ))}
                  <td>
                    <button
                      className="text-button"
                      disabled={
                        !active || conflict || (!picked.includes(key) && picked.length >= 6)
                      }
                      aria-pressed={picked.includes(key)}
                      onClick={() => toggle(key)}
                    >
                      {picked.includes(key) ? 'Verwijderen' : 'Toevoegen'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="combo-card builder-slip" aria-label="Betbuilder concept">
        <h3>Betbuilder · {book}</h3>
        <p>
          Selecteer twee tot zes markten uit deze wedstrijd. Dit is een concept; beschikbaarheid en
          de gecombineerde prijs bevestig je bij de bookmaker.
        </p>
        {picked.length ? (
          <ul>
            {picked.map((m) => (
              <li key={m}>
                {pricedMarkets[m]}{' '}
                <button className="text-button" onClick={() => toggle(m)}>
                  Verwijder {pricedMarkets[m]}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>Nog geen selecties toegevoegd.</p>
        )}
        {picked.length >= 2 && (
          <>
            <p>Alle gekozen voorwaarden tegelijk in de historie:</p>
            {joint.map((e) => (
              <p key={e.team.id}>
                {e.team.name}: {e.frequency.successes}/{e.frequency.total} (
                {e.frequency.percentage?.toFixed(0) ?? '—'}%) · {e.frequency.total}/{window} met
                bekende data
              </p>
            ))}
            <p className="spotlight-note">
              Dit is gezamenlijke historische frequentie, geen gecombineerde modelkans. Overlappende
              markten zijn afhankelijk; losse odds worden niet vermenigvuldigd.
            </p>
            <details className="builder-price-details">
              <summary>Bookmakerprijs toevoegen (optioneel)</summary>
              <label className="manual-price">
                Gecombineerde bookmakerodd{' '}
                <input
                  aria-label="Gecombineerde bookmakerodd"
                  inputMode="decimal"
                  maxLength={8}
                  placeholder="Prijs uit betbuilder"
                  value={builderPrice}
                  disabled={!active}
                  onChange={(e) => setBuilderPrice(e.target.value)}
                />
              </label>
            </details>
            {total && active ? (
              <p>
                <strong>Totale odd {Number(builderPrice.replace(',', '.')).toFixed(2)}</strong> ·
                impliciete kans {total.implied.toFixed(1)}% · handmatig ingevoerd
              </p>
            ) : (
              <p>Gecombineerde prijs nog niet bevestigd.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
