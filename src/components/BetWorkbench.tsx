import { tr, t, locale } from '../i18n';
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
    <div className="bet-workbench" aria-label={t('Odds versus statistiek')}>
      <h3>{t('Odds versus statistiek')}</h3>
      <p className="section-intro">
        {t(
          'Begin bij de aangeboden prijs. Vergelijk de impliciete kans met het model en bekijk wat er in recente wedstrijden gebeurde.',
        )}
      </p>
      {odds && !availableBooks.includes('Unibet België') && (
        <p className="odds-availability" role="status">
          {t(
            availableBooks.length
              ? tr(
                  'Geen Unibet-prijzen beschikbaar voor deze wedstrijd. Je bekijkt de prijzen van {0}.',
                  [book],
                )
              : 'Voor deze wedstrijd zijn momenteel geen bookmakerprijzen beschikbaar. De historische analyse blijft beschikbaar.',
          )}
        </p>
      )}
      <div className="market-controls">
        <label>
          {t('Bookmaker')}{' '}
          <select
            aria-label={t('Analysebookmaker')}
            value={book}
            onChange={(e) => {
              setBook(e.target.value);
              setPicked([]);
              setBuilderPrice('');
            }}
          >
            {books.map((b) => (
              <option key={b} value={b}>
                {t(b)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('Historie')}{' '}
          <select
            aria-label={t('Oddsanalyse historie')}
            value={window}
            onChange={(e) => setWindow(Number(e.target.value))}
          >
            {[5, 10, 20].map((n) => (
              <option key={n} value={n}>
                {t('Laatste ')}
                {t(n)}
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
          {t('Open Unibet België')}
        </a>
      </div>
      {!active && (
        <p className="spotlight-placeholder">
          {t('De pre-matchvergelijking is gesloten voor deze wedstrijd.')}
        </p>
      )}
      {demo && (
        <p className="spotlight-note">{t('Demo: fictieve historie, geen Unibet-prijzen.')}</p>
      )}
      <details className="odds-reading-guide">
        <summary>{t('Hoe lees je odds en statistieken?')}</summary>
        <p className="spotlight-note">
          {t(
            'Impliciete kans = 100 / odd, inclusief bookmakeropslag. Modelverschil is een ongekalibreerde schatting in procentpunten, geen bewezen voordeel. Historie telt beschikbare competitieduels ongeacht thuis/uit; bij 1X2 telt de eigen ploeg vanuit haar rol in deze wedstrijd (bij ‘thuis wint’: thuisploeg wint, uitploeg verliest). Het model gebruikt zijn eigen gewogen vensters.',
          )}
        </p>
      </details>
      <div className="player-table-scroll" tabIndex={0} aria-label={t('Odds en statistiek tabel')}>
        <table className="player-table">
          <thead>
            <tr>
              <th>{t('Markt')}</th>
              <th>
                {t(book)}
                {t(' odd')}
              </th>
              <th>{t('Impliciet')}</th>
              <th>{t('Model')}</th>
              <th>{t('Verschil')}</th>
              <th>
                {t(data.fixture.home.name)}
                {t(' historie')}
              </th>
              <th>
                {t(data.fixture.away.name)}
                {t(' historie')}
              </th>
              <th>{t('Builder')}</th>
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
                  <th scope="row">{t(label)}</th>
                  <td>
                    <strong
                      className={`market-odd${quote ? '' : ' market-odd-missing'}`}
                      aria-label={t(tr('{0} odd', [label]))}
                    >
                      {t(quote ? quote.decimal.toFixed(2) : 'Geen prijs')}
                    </strong>
                    <small className="quote-detail">
                      {t(
                        quote
                          ? quote.updatedAt
                            ? tr('Bijgewerkt {0}', [
                                new Date(quote.updatedAt).toLocaleString(locale()),
                              ])
                            : 'Momentopname · tijdstip onbekend'
                          : 'Niet aangeboden in deze feed',
                      )}
                    </small>
                  </td>
                  <td>{t(assessment ? `${assessment.implied.toFixed(1)}%` : '—')}</td>
                  <td>
                    {probability?.value !== null && probability?.value !== undefined ? (
                      <>
                        <strong>
                          {t(probability.value.toFixed(1))}
                          {'%'}
                        </strong>
                        <small>{t(probability.confidence)}</small>
                      </>
                    ) : (
                      t('Geen model')
                    )}
                  </td>
                  <td>
                    {t(
                      assessment?.gap != null
                        ? `${assessment.gap > 0 ? '+' : ''}${assessment.gap.toFixed(1)} pp`
                        : '—',
                    )}
                  </td>
                  {evidence.map((e) => (
                    <td key={e.team.id}>
                      <details>
                        <summary>
                          {t(e.frequency.successes)}
                          {'/'}
                          {t(e.frequency.total)}
                          {' ·'} {t(e.frequency.percentage?.toFixed(0) ?? '—')}
                          {'%'}
                        </summary>
                        <small>
                          {t(e.frequency.total)}
                          {'/'}
                          {t(window)}
                          {t(' met bekende data')}
                        </small>
                        <ul>
                          {e.rows.map((f, i) => (
                            <li key={f.id}>
                              {t(f.kickoff.slice(0, 10))}
                              {' · '}
                              {t(f.home.name)} {t(f.homeGoals ?? '?')}
                              {'–'}
                              {t(f.awayGoals ?? '?')} {t(f.away.name)}
                              {' ·'}{' '}
                              {t(e.values[i] === null ? 'onbekend' : e.values[i] ? 'ja' : 'nee')}
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
                      {t(picked.includes(key) ? 'Verwijderen' : 'Toevoegen')}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="combo-card builder-slip" aria-label={t('Betbuilder concept')}>
        <h3>
          {t('Betbuilder · ')}
          {t(book)}
        </h3>
        <p>
          {t(
            'Selecteer twee tot zes markten uit deze wedstrijd. Dit is een concept; beschikbaarheid en de gecombineerde prijs bevestig je bij de bookmaker.',
          )}
        </p>
        {picked.length ? (
          <ul>
            {picked.map((m) => (
              <li key={m}>
                {t(pricedMarkets[m])}{' '}
                <button className="text-button" onClick={() => toggle(m)}>
                  {t('Verwijder ')}
                  {t(pricedMarkets[m])}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>{t('Nog geen selecties toegevoegd.')}</p>
        )}
        {picked.length >= 2 && (
          <>
            <p>{t('Alle gekozen voorwaarden tegelijk in de historie:')}</p>
            {joint.map((e) => (
              <p key={e.team.id}>
                {t(e.team.name)}
                {': '}
                {t(e.frequency.successes)}
                {'/'}
                {t(e.frequency.total)}
                {' ('}
                {t(e.frequency.percentage?.toFixed(0) ?? '—')}
                {'%) · '}
                {t(e.frequency.total)}
                {'/'}
                {t(window)}
                {t(' met bekende data')}
              </p>
            ))}
            <p className="spotlight-note">
              {t(
                'Dit is gezamenlijke historische frequentie, geen gecombineerde modelkans. Overlappende markten zijn afhankelijk; losse odds worden niet vermenigvuldigd.',
              )}
            </p>
            <details className="builder-price-details">
              <summary>{t('Bookmakerprijs toevoegen (optioneel)')}</summary>
              <label className="manual-price">
                {t('Gecombineerde bookmakerodd')}{' '}
                <input
                  aria-label={t('Gecombineerde bookmakerodd')}
                  inputMode="decimal"
                  maxLength={8}
                  placeholder={t('Prijs uit betbuilder')}
                  value={builderPrice}
                  disabled={!active}
                  onChange={(e) => setBuilderPrice(e.target.value)}
                />
              </label>
            </details>
            {total && active ? (
              <p>
                <strong>
                  {t('Totale odd ')}
                  {t(Number(builderPrice.replace(',', '.')).toFixed(2))}
                </strong>
                {t(' · impliciete kans ')}
                {t(total.implied.toFixed(1))}
                {t('% · handmatig ingevoerd')}
              </p>
            ) : (
              <p>{t('Gecombineerde prijs nog niet bevestigd.')}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
