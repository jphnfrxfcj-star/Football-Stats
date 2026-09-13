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
  const [book, setBook] = useState('Unibet België'),
    [window, setWindow] = useState(10),
    [manual, setManual] = useState<Record<string, string>>({}),
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
  const books = [...new Set(['Unibet België', ...(odds?.quotes.map((q) => q.bookmaker) ?? [])])];
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
              const value = manual[`${book}:${key}`] ?? '';
              const decimal = value ? Number(value.replace(',', '.')) : (quote?.decimal ?? NaN);
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
                    <input
                      className="odds-price-input"
                      aria-label={`${label} odd`}
                      inputMode="decimal"
                      maxLength={8}
                      placeholder={quote?.decimal.toFixed(2) ?? 'Geen prijs'}
                      value={value}
                      disabled={!active}
                      onChange={(e) => setManual({ ...manual, [`${book}:${key}`]: e.target.value })}
                    />
                    <small className="quote-detail">
                      {value
                        ? 'Handmatige invoer'
                        : quote
                          ? `Feed · ${quote.updatedAt ? new Date(quote.updatedAt).toLocaleString('nl-BE') : 'tijdstip onbekend'}`
                          : 'Geen feedprijs'}
                    </small>
                    {value && !assessment && active && (
                      <small>Gebruik een odd groter dan 1, maximaal 1000.</small>
                    )}
                  </td>
                  <td>{assessment ? `${assessment.implied.toFixed(1)}%` : '—'}</td>
                  <td>
                    {probability?.value !== null && probability?.value !== undefined
                      ? `${probability.value.toFixed(1)}% · ${probability.confidence}`
                      : 'Geen model'}
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
