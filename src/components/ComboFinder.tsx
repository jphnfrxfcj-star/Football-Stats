import { assessComboPrice } from '../analysis/combo-assessment';
import ComboAssessment, { comboPriceLabels } from './ComboAssessment';
import { tr, t, locale } from '../i18n';
import { saveProposal, type SavedCombo } from '../domain/combo-history';
import { occurrence } from '../analysis/engine';
import { useEffect, useMemo, useState } from 'react';
import { api, isDemo } from '../api';
import { suggestCombinations, comboRates, type MarketsReport } from '../analysis/combinations';
import { SectionTitle, Loading } from './ui';
export default function ComboFinder({
  date,
  navigate,
  onSave,
  compact = false,
}: {
  compact?: boolean;
  onSave: (proposals: SavedCombo[]) => void;
  date: string;
  navigate: (path: string) => void;
}) {
  const [minimumOdd, setMinimumOdd] = useState('2');
  const [maximumOdd, setMaximumOdd] = useState('3');
  const minOdd = compact ? Number(minimumOdd) : 2,
    maxOdd = compact ? Number(maximumOdd) : 3;
  const validTarget =
    Number.isFinite(minOdd) &&
    Number.isFinite(maxOdd) &&
    minOdd >= 2 &&
    maxOdd <= 20 &&
    minOdd <= maxOdd;
  const [priceCheck, setPriceCheck] = useState(true);
  const [diverse, setDiverse] = useState(compact);
  const Evidence = compact ? 'details' : 'div';
  const [started, setStarted] = useState(false);
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
    if (!started) return;
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
  }, [date, window, attempt, minimumRate, started]);
  const cutoff = isDemo ? Date.parse(`${date}T00:00:00Z`) : now;
  const books = [
    ...new Set([
      'Unibet België',
      ...(report?.fixtures.flatMap((f) => f.quotes.map((q) => q.bookmaker)) ?? []),
    ]),
  ];
  const combos = useMemo(
    () =>
      suggestCombinations(report?.selections ?? [], book, cutoff, 8, {
        requirePriceCheck: priceCheck,
        limit: compact ? 9 : 3,
        diverse,
        minOdd,
        maxOdd,
      }),
    [report, book, cutoff, compact, diverse, minOdd, maxOdd, priceCheck],
  );
  useEffect(() => {
    if (isDemo) return;
    onSave(
      combos.flatMap((combo) => {
        const saved = saveProposal(combo, window, minimumRate);
        return saved ? [saved] : [];
      }),
    );
  }, [combos, window, minimumRate, onSave]);
  const eligible = report?.selections.filter((s) => Date.parse(s.fixture.kickoff) > cutoff) ?? [];
  const priced = [
    ...new Set(
      eligible
        .filter((s) =>
          s.quotes.some(
            (q) =>
              q.bookmaker === book &&
              Number.isFinite(q.decimal) &&
              q.decimal >= 1.1 &&
              q.decimal <= maxOdd,
          ),
        )
        .map((s) => s.fixture.id),
    ),
  ].length;
  const rejected = eligible.flatMap((selection) => {
    const quote = selection.quotes
      .filter(
        (q) =>
          q.bookmaker === book &&
          Number.isFinite(q.decimal) &&
          q.decimal >= 1.1 &&
          q.decimal <= maxOdd,
      )
      .sort((a, b) => Date.parse(b.updatedAt ?? '') - Date.parse(a.updatedAt ?? ''))[0];
    if (!quote) return [];
    const assessment = assessComboPrice(selection, quote, cutoff);
    return assessment.status === 'passes' ? [] : [{ selection, quote, assessment }];
  });
  const end = new Date(Date.parse(date) + 7 * 86400000).toISOString().slice(0, 10);
  return (
    <section
      className={`combo-finder${compact ? ' combo-finder-compact' : ''}`}
      aria-label={t(compact ? 'Combivoorstellen zoeken' : 'Combi x2 tot x3')}
    >
      <SectionTitle
        eyebrow={t('VERSCHILLENDE WEDSTRIJDEN · ÉÉN BOOKMAKER')}
        title={t(compact ? 'Stel je combi samen' : 'Combi x2–x3')}
        aside={
          <span className="combo-target">
            {t('Doelodd ')}
            {t(validTarget ? `${minOdd.toFixed(2)}–${maxOdd.toFixed(2)}` : 'instellen')}
          </span>
        }
      />
      <details className="combo-explainer">
        <summary>{t('Hoe worden voorstellen gekozen?')}</summary>
        <p className="section-intro">
          {t('Van ')}
          {t(date)}
          {t(' t/m ')}
          {t(end)}
          {t(
            '. We combineren 2 tot 8 verschillende wedstrijden uit de Premier League, La Liga, Serie A en Ligue 1. Elke ploeg komt maximaal één keer in een combi voor. Iedere selectie kwam voor in minstens ',
          )}
          {t(minimumRate)}
          {t('% van de laatste ')}
          {t(window)}
          {t(' competitieduels van elk team. Elke selectie heeft een odd van minimaal 1,10.')}
        </p>
        {compact && (
          <p className="spotlight-note">
            {t(
              'Tot 9 voorstellen. Meer variatie geeft voorkeur aan verschillende markten en minder herhaalde selecties tussen voorstellen. De historische drempel blijft gelijk; variatie is geen hogere winstkans.',
            )}
          </p>
        )}
        {compact && (
          <p className="spotlight-note">
            {t(
              'Je kunt doelodds tussen 2 en 20 kiezen en de historische drempel verlagen tot 50%. Dit percentage geldt per selectie en per team; het is niet de slaagkans van je volledige combi.',
            )}
          </p>
        )}
        <p className="spotlight-note">
          {t(
            'Prijscontrole actief: minstens 20 waargenomen duels per ploeg en 5 per thuis-/uitreeks. Zowel het gewogen model als het goalsmodel moet minstens 5 procentpunten boven break-even liggen. Alleen feedprijzen die maximaal 15 minuten geleden zijn waargenomen of gewijzigd tellen mee. Dit is een extra filter, geen bewezen winstkans.',
          )}
        </p>
      </details>
      {!validTarget && (
        <p role="alert">
          {t(
            'Kies een minimum en maximum tussen 2 en 20. Het maximum moet minstens gelijk zijn aan het minimum.',
          )}
        </p>
      )}
      <p className="spotlight-note">
        {t(
          priceCheck
            ? 'Prijscontrole actief: langere historie, recente trends en de odd worden samen beoordeeld. Geen bewezen winstkans.'
            : 'Alleen historische frequentie: de prijs wordt niet beoordeeld. Deze voorstellen zijn geen onderbouwd bettingadvies.',
        )}
      </p>
      <div className="market-controls">
        <label className="combo-assessment-control">
          {t('Beoordeling')}
          <select
            aria-label={t('Beoordeling combi')}
            value={priceCheck ? 'checked' : 'history'}
            onChange={(e) => setPriceCheck(e.target.value === 'checked')}
          >
            <option value="checked">{t('Historie + prijscontrole')}</option>
            <option value="history">{t('Alleen historische frequentie')}</option>
          </select>
        </label>
        {compact && (
          <>
            <label>
              {t('Minimale doelodd')}{' '}
              <input
                aria-label={t('Minimale doelodd')}
                type="number"
                min="2"
                max="20"
                step="0.1"
                value={minimumOdd}
                onChange={(e) => setMinimumOdd(e.target.value)}
              />
            </label>
            <label>
              {t('Maximale doelodd')}{' '}
              <input
                aria-label={t('Maximale doelodd')}
                type="number"
                min="2"
                max="20"
                step="0.1"
                value={maximumOdd}
                onChange={(e) => setMaximumOdd(e.target.value)}
              />
            </label>
          </>
        )}
        {compact && (
          <label>
            {t('Rangschikking')}{' '}
            <select
              aria-label={t('Combi rangschikking')}
              value={diverse ? 'variety' : 'target'}
              onChange={(e) => setDiverse(e.target.value === 'variety')}
            >
              <option value="variety">{t('Meer variatie')}</option>
              <option value="target">{t('Dichtst bij het midden')}</option>
            </select>
          </label>
        )}
        <label>
          {t('Bookmaker')}{' '}
          <select
            aria-label={t('Combiboekmaker')}
            value={book}
            onChange={(e) => setBook(e.target.value)}
          >
            {books.map((b) => (
              <option key={b} value={b}>
                {t(b)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('Historische reeks')}{' '}
          <select
            aria-label={t('Combi historie')}
            value={window}
            onChange={(e) => {
              setReport(null);
              setWindow(Number(e.target.value));
            }}
          >
            {[5, 10, 20].map((n) => (
              <option value={n} key={n}>
                {t('Laatste ')}
                {t(n)}
                {t(' duels')}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('Minimale historische frequentie')}{' '}
          <select
            aria-label={t('Combi minimumfrequentie')}
            value={minimumRate}
            onChange={(e) => {
              setReport(null);
              setMinimumRate(Number(e.target.value));
            }}
          >
            {(compact ? [...comboRates].reverse() : [100, 90, 80]).map((n) => (
              <option key={n} value={n}>
                {t(n)}
                {t('% per team')}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary-button"
          disabled={!validTarget}
          onClick={() => {
            setStarted(true);
            setAttempt(attempt + 1);
          }}
        >
          {t(started ? 'Combi zoeken / verversen' : 'Doe een voorstel')}
        </button>
      </div>
      {!started ? (
        <p className="spotlight-note">
          {t(
            'Kies je voorkeuren en klik op ‘Doe een voorstel’. De combianalyse wordt pas dan geladen.',
          )}
        </p>
      ) : error ? (
        <p role="alert">
          {t(error)}
          {t(' Probeer opnieuw met ‘Combi zoeken / verversen’.')}
        </p>
      ) : !report ? (
        <Loading />
      ) : (
        <>
          {report.odds.message && (
            <p className="spotlight-note" role="status">
              {t(report.odds.message)}
            </p>
          )}
          <p className="spotlight-note">
            {t(report.fixtures.filter((f) => Date.parse(f.fixture.kickoff) > cutoff).length)}
            {t(' komende wedstrijden onderzocht · ')}
            {t(eligible.length)}
            {t(' selecties met minstens ')}
            {t(minimumRate)}
            {t('% historie · ')}
            {t(priced)}
            {t(' wedstrijden met passende prijzen bij ')}
            {t(book)}
            {'.'}
          </p>
          {priceCheck && rejected.length > 0 && (
            <details className="combo-rejections">
              <summary>
                {tr('{0} selecties uitgesloten door de prijscontrole', [rejected.length])}
              </summary>
              <p>
                {t(
                  'De historische drempel is gehaald, maar de uitgebreidere controle niet. Een hogere doelodd of meer variatie versoepelt deze controle niet.',
                )}
              </p>
              <ul>
                {Object.entries(comboPriceLabels)
                  .filter(([status]) => status !== 'passes')
                  .map(([status, label]) => {
                    const count = rejected.filter((r) => r.assessment.status === status).length;
                    return count ? (
                      <li key={status}>
                        {t(label)} {count}
                      </li>
                    ) : null;
                  })}
              </ul>
              {rejected.slice(0, 6).map(({ selection, quote }) => (
                <article key={selection.id}>
                  <button
                    className="text-button"
                    onClick={() => navigate(`/match/${selection.fixture.id}`)}
                  >
                    {selection.fixture.home.name} – {selection.fixture.away.name}
                  </button>
                  <p>
                    {t(selection.label)} · {quote.decimal.toFixed(2)}
                  </p>
                  <ComboAssessment selection={selection} quote={quote} now={cutoff} />
                </article>
              ))}
              {rejected.length > 6 && (
                <p>{t('Hierboven staan de eerste zes uitgesloten selecties.')}</p>
              )}
            </details>
          )}
          {combos.length ? (
            <div className="combo-grid">
              {combos.map((combo, i) => (
                <article className="combo-card" key={i}>
                  <div className="combo-heading">
                    <strong>
                      {t('Combi ')}
                      {t(i + 1)}
                      {' · '}
                      {t(combo.legs.length)}
                      {t(' wedstrijden')}
                    </strong>
                    <span className="combo-total">
                      {t('×')}
                      {t(combo.decimal.toFixed(2))}
                    </span>
                  </div>
                  <p>
                    {t(combo.bookmaker)}
                    {' ·'} {t(combo.legs.map((l) => l.quote.decimal.toFixed(2)).join(' × '))}
                    {' ='} {t(combo.decimal.toFixed(2))}
                  </p>
                  {compact && (
                    <ul className="compact-combo-legs">
                      {combo.legs.map(({ selection: s, quote: q }) => (
                        <li key={s.id}>
                          <button
                            className="text-button"
                            onClick={() => navigate(`/match/${s.fixture.id}`)}
                          >
                            {t(s.fixture.home.name)}
                            {' – '}
                            {t(s.fixture.away.name)}
                          </button>
                          <span>
                            {t(s.label)} <b>{t(q.decimal.toFixed(2))}</b>
                          </span>
                          <small>{t(new Date(s.fixture.kickoff).toLocaleString(locale()))}</small>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Evidence className="combo-evidence">
                    {compact && <summary>{t('Historie en onderbouwing')}</summary>}
                    <ol>
                      {combo.legs.map(({ selection: s, quote: q }) => (
                        <li key={s.id} className="finder-leg">
                          <button
                            className="text-button"
                            onClick={() => navigate(`/match/${s.fixture.id}`)}
                          >
                            {t(s.fixture.home.name)}
                            {' – '}
                            {t(s.fixture.away.name)}
                          </button>
                          <small>
                            {t(new Date(s.fixture.kickoff).toLocaleString(locale()))}
                            {' ·'} {t(s.fixture.league.name)}
                          </small>
                          <div>
                            <strong>{t(s.label)}</strong>
                            <strong>{t(q.decimal.toFixed(2))}</strong>
                          </div>
                          <small>
                            {t('Historie:')}{' '}
                            {t(
                              s.homeEvidence.filter(
                                (f) => occurrence(f, s.fixture.home.id, s.market) === true,
                              ).length,
                            )}
                            {'/'}
                            {t(window)}
                            {t(' thuisploeg ·')}{' '}
                            {t(
                              s.awayEvidence.filter(
                                (f) => occurrence(f, s.fixture.away.id, s.market) === true,
                              ).length,
                            )}
                            {'/'}
                            {t(window)}
                            {t(' uitploeg · prijswijziging')}{' '}
                            {t(
                              q.updatedAt
                                ? new Date(q.updatedAt).toLocaleString(locale())
                                : 'onbekend',
                            )}
                          </small>
                          <ComboAssessment selection={s} quote={q} now={cutoff} />
                          <details>
                            <summary>
                              {t('Bekijk de ')}
                              {t(window)}
                              {'+'}
                              {t(window)}
                              {t(' onderliggende duels')}
                            </summary>
                            {[
                              { team: s.fixture.home, rows: s.homeEvidence },
                              { team: s.fixture.away, rows: s.awayEvidence },
                            ].map(({ team, rows }) => (
                              <div key={team.id}>
                                <strong>{t(team.name)}</strong>
                                <ul>
                                  {rows.map((f) => (
                                    <li key={f.id}>
                                      {t(f.kickoff.slice(0, 10))}
                                      {' · '}
                                      {t(f.home.name)} {t(f.homeGoals)}
                                      {'–'}
                                      {t(f.awayGoals)} {t(f.away.name)}
                                      {t(
                                        s.market.startsWith('firstHalf') &&
                                          tr(' (rust {0}–{1})', [f.halfHomeGoals, f.halfAwayGoals]),
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </details>
                        </li>
                      ))}
                    </ol>
                  </Evidence>
                </article>
              ))}
            </div>
          ) : (
            <div className="spotlight-placeholder">
              <strong>
                {t('Geen passende combi bij ')}
                {t(book)}
                {t(' in deze periode.')}
              </strong>
              {priceCheck && priced >= 2 && rejected.length > 0 && (
                <p>
                  {t(
                    'Geen voorstel binnen je instellingen en de extra prijscontrole. Bekijk hierboven waarom selecties afvallen.',
                  )}
                </p>
              )}
              <p>
                {t(
                  priced < 2
                    ? 'Voor een combi zijn minimaal twee verschillende wedstrijden met passende odds nodig.'
                    : tr(
                        'Geen voorstel gevonden binnen {0}–{1} met maximaal acht wedstrijden zonder terugkerende ploegen. De zoekruimte is begrensd om de berekening snel te houden.',
                        [minOdd.toFixed(2), maxOdd.toFixed(2)],
                      ),
                )}{' '}
                {t('Probeer een andere bookmaker of startdatum. Met de ingestelde ')}
                {t(minimumRate)}
                {t('%-eis verzinnen we geen prijzen.')}
              </p>
              {minimumRate === 100 && (
                <button
                  className="secondary-button"
                  onClick={() => {
                    setReport(null);
                    setMinimumRate(80);
                  }}
                >
                  {t('Zoek met minstens 80% historie')}
                </button>
              )}
            </div>
          )}
          <p className="spotlight-note">
            {t('Bron: ')}
            {t(report.odds.source)}
            {t(' · opgehaald')} {t(new Date(report.odds.fetchedAt).toLocaleString(locale()))}
            {t(
              '. Prijzen zijn indicatief; controleer de actuele combiprijs bij de bookmaker. Historische frequentie is geen voorspelde winstkans. Onderlinge duels kunnen in beide reeksen voorkomen.',
            )}{' '}
            {t(isDemo && 'Demo: fictieve historie, geen bookmakerprijzen.')}
          </p>
        </>
      )}
    </section>
  );
}
