import { useEffect, useState } from 'react';
import { ArrowRight, Sparkles, Clock3 } from 'lucide-react';
import { api, isDemo } from '../api';
import type { SpotlightReport } from '../domain/spotlight';
import { Badge, SectionTitle, pct, dateLabel } from './ui';
export default function Spotlight({
  date,
  league = 'all',
  navigate,
}: {
  date: string;
  league?: string;
  navigate: (path: string) => void;
}) {
  const [report, setReport] = useState<SpotlightReport | null>(null),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const c = new AbortController();
    setReport(null);
    setError('');
    api
      .spotlight(date, c.signal)
      .then((r) => {
        if (!c.signal.aborted) setReport(r);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [date, retry]);
  const cards =
    report?.cards.filter(
      (c) =>
        (isDemo || Date.parse(c.fixture.kickoff) > now) &&
        (league === 'all' || c.fixture.league.id === league),
    ) ?? [];
  return (
    <section className="spotlight-section" aria-label="Spotlight">
      <SectionTitle
        eyebrow="UITGELICHT"
        title="Spotlight"
        aside={<span className="subtle">{dateLabel(date, true)} · vóór de aftrap</span>}
      />
      <p className="section-intro">
        Modelkansen met voldoende historie. Actuele odds kunnen een mogelijk prijsvoordeel laten
        zien.
      </p>
      {!report && !error && (
        <div className="spotlight-placeholder" role="status">
          <Sparkles size={18} /> Spotlight wordt berekend… De wedstrijdlijst kun je alvast
          gebruiken.
        </div>
      )}
      {error && (
        <div className="spotlight-placeholder">
          Spotlight is tijdelijk niet beschikbaar.{' '}
          <button className="text-button" onClick={() => setRetry(retry + 1)}>
            Opnieuw proberen
          </button>
        </div>
      )}
      {report && (
        <>
          {cards.length ? (
            <div className="spotlight-grid">
              {cards.map((c) => {
                const fresh =
                  c.quote?.updatedAt &&
                  now - Date.parse(c.quote.updatedAt) >= 0 &&
                  now - Date.parse(c.quote.updatedAt) <= 900000;
                const value = fresh && c.edgePercent !== null && c.edgePercent > 0;
                return (
                  <article className="spotlight-card" key={c.fixture.id}>
                    <div className="spotlight-top">
                      <span className={value ? 'value-tag' : 'small-tag'}>
                        {value ? 'Mogelijke value' : 'Modelkans'}
                      </span>
                      <span className="subtle">
                        {c.probability.sampleSize} duels · {c.probability.confidence.toLowerCase()}{' '}
                        vertrouwen
                      </span>
                    </div>
                    <div className="spotlight-teams">
                      <Badge team={c.fixture.home} />
                      <span>
                        {c.fixture.home.name}
                        <small>tegen {c.fixture.away.name}</small>
                      </span>
                      <Badge team={c.fixture.away} />
                    </div>
                    <div className="spotlight-pick">
                      <h3>{c.probability.label}</h3>
                      <strong>{pct(c.probability.value)}</strong>
                    </div>
                    <div className="spotlight-prices">
                      <span>
                        Modelquotering <b>{c.fairOdds.toFixed(2)}</b>
                      </span>
                      <span>
                        {c.quote?.bookmaker ?? 'Bookmakerodds'}{' '}
                        <b>{c.quote?.decimal.toFixed(2) ?? '—'}</b>
                      </span>
                    </div>
                    {c.quote && (
                      <p className="quote-age">
                        <Clock3 size={12} />
                        {c.quote.updatedAt
                          ? `Quotering ${new Date(c.quote.updatedAt).toLocaleString('nl-BE')}${fresh ? '' : ' · verouderd'}`
                          : 'Momentopname · quoteringstijdstip onbekend'}
                      </p>
                    )}
                    {value && (
                      <p className="value-explanation">
                        Modelvoordeel +{c.edgePercent!.toFixed(1)}% · kans × odds − 1. Een
                        modelsignaal, geen gegarandeerd rendement.
                      </p>
                    )}
                    <button
                      className="spotlight-link"
                      onClick={() => navigate(`/match/${c.fixture.id}`)}
                    >
                      Bekijk onderbouwing <ArrowRight size={16} />
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="spotlight-placeholder">
              Geen geschikte wedstrijden: alleen komende duels met een bekende aftraptijd en
              minstens 10 recente wedstrijden per team komen in aanmerking.
            </div>
          )}
          <p className="spotlight-note">
            {report.message} {report.checked} wedstrijden gecontroleerd. Rangschikking: eerst
            positief modelvoordeel met recente odds, daarna modelkansen met bookmakerodds en overige
            modelkansen; maximaal één selectie per wedstrijd.
          </p>
        </>
      )}
    </section>
  );
}
