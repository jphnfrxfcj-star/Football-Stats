import DataNotice from './DataNotice';
import { tr, t, locale } from '../i18n';
import { MatchRecap } from './Recap';
import { isUpcoming } from '../analysis/recap';
import OddsComparison from './OddsComparison';
import PlayerStats from './PlayerStats';
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Trophy,
  MapPin,
  Clock3,
  Info,
  CircleHelp,
  X,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  BarChart3,
  Globe2,
  Database,
} from 'lucide-react';
import { api, type AnalysisResponse } from '../api';
import { before, type Metric } from '../domain/models';
import { marketLabels, metricAverage, type Market } from '../analysis/engine';
import type { Probability } from '../analysis/probability';
import {
  Badge,
  Form,
  SectionTitle,
  FrequencyCell,
  Loading,
  ErrorBox,
  pct,
  num,
  time,
  dateLabel,
  ratio,
} from './ui';
export default function MatchPage({
  id,
  navigate,
  showModel,
}: {
  id: string;
  navigate: (s: string) => void;
  showModel: () => void;
}) {
  const [response, setResponse] = useState<AnalysisResponse | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0),
    [windowIndex, setWindowIndex] = useState(1),
    [h2hIndex, setH2hIndex] = useState(0),
    [detail, setDetail] = useState<Probability | null>(null),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setDetail(null);
    api
      .analysis(id, controller.signal)
      .then((r) => {
        if (!controller.signal.aborted) setResponse(r);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, retry]);
  if (loading) return <Loading />;
  if (error || !response)
    return (
      <ErrorBox message={error || 'Wedstrijd niet gevonden'} retry={() => setRetry(retry + 1)} />
    );
  const { data, analysis, probabilities: probs } = response;
  const f = data.fixture,
    h = analysis.home[windowIndex],
    a = analysis.away[windowIndex],
    hs = analysis.homeSplit[windowIndex],
    as = analysis.awaySplit[windowIndex];
  const selectedH2h = analysis.h2h[h2hIndex];
  const keyProbs = ['home', 'draw', 'away', 'over25', 'btts'].map((key) =>
    probs.find((p) => p.key === key)!,
  );
  const goalMarkets = Object.keys(marketLabels) as Market[];
  const metrics: [Metric, string][] = [
    ['corners', 'Corners'],
    ['yellowCards', 'Gele kaarten'],
    ['redCards', 'Rode kaarten'],
    ['shots', 'Schoten'],
    ['shotsOnTarget', 'Schoten op doel'],
    ['possession', 'Balbezit (%)'],
    ['fouls', 'Overtredingen'],
    ['bigChances', 'Grote kansen'],
    ['xg', 'Expected goals (xG)'],
  ];
  return (
    <>
      <div className="match-topline">
        <button className="text-button" onClick={() => navigate('/')}>
          <ArrowLeft size={16} />
          {t('Alle wedstrijden')}
        </button>
        <span className="subtle">
          <span className="green-dot" />
          {t(data.source === 'demo' ? 'Voorbeeldanalyse' : 'Analyse bijgewerkt')}
          {' ·'} {t(time(data.updatedAt))}
        </span>
      </div>
      <div className="match-hero">
        <div className="match-league">
          <Trophy size={15} />
          {t(f.league.name)}
          <span>{'•'}</span>
          {t(dateLabel(f.sourceDate ?? f.kickoff))}
        </div>
        <div className="match-contest">
          <div className="contender">
            <Badge team={f.home} size="large" />
            <div>
              <h1>{t(f.home.name)}</h1>
              <span>{t('THUIS')}</span>
            </div>
          </div>
          <div className="match-kickoff">
            <strong>
              {t(
                f.homeGoals !== null && f.awayGoals !== null
                  ? `${f.homeGoals} – ${f.awayGoals}`
                  : f.kickoffKnown === false
                    ? 'Tijd volgt'
                    : time(f.kickoff),
              )}
            </strong>
            <span>
              {t(
                f.status === 'finished'
                  ? 'AFGELOPEN'
                  : f.status === 'scheduled'
                    ? Date.parse(f.kickoff) < now
                      ? 'UITSLAG VOLGT'
                      : 'AFTRAP'
                    : f.status.toUpperCase(),
              )}
            </span>
          </div>
          <div className="contender right">
            <div>
              <h1>{t(f.away.name)}</h1>
              <span>{t('UIT')}</span>
            </div>
            <Badge team={f.away} size="large" />
          </div>
        </div>
        <div className="match-venue">
          <MapPin size={13} />
          {t(f.venue ?? 'Stadion niet beschikbaar')}
          <span>{'•'}</span>
          <Clock3 size={13} />
          {t('90 minuten · reguliere speeltijd')}
        </div>
      </div>
      <div className="match-tabs">
        <a href="#probabilities" className="selected">
          {t('Overzicht')}
        </a>
        <a href="#form">{t('Recente vorm')}</a>
        <a href="#goals">{t('Goals & BTTS')}</a>
        <a href="#metrics">{t('Wedstrijdstatistieken')}</a>
        <a href="#h2h">{t('Head-to-head')}</a>
      </div>
      <DataNotice items={[data.availability, data.fixture.availability]} />
      {data.sourceLabel && (
        <div className="demo-note">
          <Database size={15} />
          <span>
            {t('Bronnen: ')}
            {t(data.sourceLabel)}
            {'.'}{' '}
            {f.provenance?.sources.map((source) => (
              <span key={source.url}>
                {t(source.name)}
                {t(': opgehaald ')}
                {t(new Date(source.fetchedAt).toLocaleString(locale()))}
                {'.'}{' '}
              </span>
            ))}
          </span>
        </div>
      )}
      {data.warnings.map((w) => (
        <div className="demo-note" key={w}>
          <Info size={15} />
          <span>{t(w)}</span>
        </div>
      ))}
      {isUpcoming(f, now) && <OddsComparison key={`odds-${id}`} id={id} response={response} />}
      <MatchRecap fixture={f} />
      <section id="probabilities">
        {f.status === 'finished' && (
          <p className="spotlight-note">
            {t(
              'Achteraf gereconstrueerd met de beschikbare historie vóór deze wedstrijd; geen vastgelegde pre-matchvoorspelling.',
            )}
          </p>
        )}
        <SectionTitle
          eyebrow={t('HET MODEL AAN HET WOORD')}
          title={t(
            f.status === 'finished' ? 'Historische modelinschatting' : 'Kansen in één oogopslag',
          )}
          aside={
            <button className="text-button" onClick={showModel}>
              <CircleHelp size={15} />
              {t('Hoe werkt dit?')}
            </button>
          }
        />
        <div className="probability-grid">
          {keyProbs.map((p, i) => (
            <button
              key={p.key}
              className={`probability-card ${detail?.key === p.key ? 'chosen' : ''} ${i === 3 ? 'featured' : ''}`}
              onClick={() => setDetail(detail?.key === p.key ? null : p)}
            >
              <div className="probability-label">
                <span>{t(['1', 'X', '2', '2.5', 'BTTS'][i])}</span>
                {t(p.label)}
                <Info size={13} />
              </div>
              <strong>{t(pct(p.value))}</strong>
              <div className="probability-track">
                <i style={{ width: `${p.value ?? 0}%` }} />
              </div>
              <div className="confidence">
                <span
                  className={`confidence-dot ${p.confidence === 'Gemiddeld' ? 'medium' : ''}`}
                />
                {t(p.confidence)}
                {t(' vertrouwen')}
              </div>
            </button>
          ))}
        </div>
        {detail && (
          <div className="explanation">
            <div>
              <strong>
                {t(detail.label)}
                {' · '}
                {t(pct(detail.value))}
              </strong>
              <button
                className="icon-button"
                aria-label={t('Uitleg sluiten')}
                onClick={() => setDetail(null)}
              >
                <X size={16} />
              </button>
            </div>
            <ul>
              {detail.factors.map((factor) => (
                <li key={factor}>{t(factor)}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="model-note">
          <ShieldCheck size={14} />
          {t(
            'Transparante modelinschattingen, geen zekerheid. Klik op een kans voor de onderbouwing.',
          )}
        </div>
      </section>
      <section className="trends-section">
        <SectionTitle
          title={t('Wat valt op?')}
          aside={
            <span className="small-tag">
              <Sparkles size={12} />
              {t('STERKSTE TRENDS')}
            </span>
          }
        />
        <div className="trends-grid">
          {analysis.trends.length ? (
            analysis.trends.map((trend, i) => (
              <div className="trend-card" key={trend.text}>
                <div className="trend-number">
                  {'0'}
                  {t(i + 1)}
                </div>
                <div>
                  <p>{t(trend.text)}</p>
                  <span>
                    {t(trend.sampleSize)}
                    {t(' wedstrijden ')}
                    <span>{'·'}</span> {t(Math.round(trend.percentage))}
                    {t('% frequentie')}
                  </span>
                </div>
                <TrendingUp size={19} />
              </div>
            ))
          ) : (
            <p className="subtle">{t('Onvoldoende data voor betrouwbare trends.')}</p>
          )}
        </div>
      </section>
      <section id="form">
        <SectionTitle
          title={t('De vorm onder de loep')}
          aside={
            <div className="segmented">
              {[5, 10, 20].map((n, i) => (
                <button
                  key={n}
                  className={windowIndex === i ? 'active' : ''}
                  onClick={() => setWindowIndex(i)}
                >
                  {t('Laatste ')}
                  {t(n)}
                </button>
              ))}
            </div>
          }
        />
        <div className="comparison-grid">
          <div className="panel">
            <div className="panel-title">
              <BarChart3 size={17} />
              <h3>{t('Recente vorm')}</h3>
              <span>{t('Alle locaties')}</span>
            </div>
            <div className="comparison-head">
              <div>
                <Badge team={f.home} size="small" />
                <strong>{t(f.home.shortName)}</strong>
              </div>
              <span>{t('STATISTIEK')}</span>
              <div>
                <strong>{t(f.away.shortName)}</strong>
                <Badge team={f.away} size="small" />
              </div>
            </div>
            <div className="comparison-row form-row">
              <Form results={h.results} />
              <span>{t('Vorm')}</span>
              <Form results={a.results} />
            </div>
            {[
              [
                h.available ? `${h.wins} / ${h.draws} / ${h.losses}` : '—',
                'W / G / V',
                a.available ? `${a.wins} / ${a.draws} / ${a.losses}` : '—',
              ],
              [h.goalsFor, 'Goals voor', a.goalsFor],
              [h.goalsAgainst, 'Goals tegen', a.goalsAgainst],
              [num(h.goalsPerMatch), 'Goals per duel', num(a.goalsPerMatch)],
              [ratio(h.cleanSheets), 'Clean sheets', ratio(a.cleanSheets)],
              [ratio(h.scored), 'Gescoord', ratio(a.scored)],
              [ratio(h.failedToScore), 'Niet gescoord', ratio(a.failedToScore)],
            ].map(([v, l, r]) => (
              <div className="comparison-row" key={String(l)}>
                <strong>{t(v ?? '—')}</strong>
                <span>{t(l)}</span>
                <strong>{t(r ?? '—')}</strong>
              </div>
            ))}
            <div className="panel-foot">
              {t(h.available)}
              {' / '}
              {t(a.available)}
              {t(' wedstrijden beschikbaar · nieuwste vorm rechts')}
            </div>
          </div>
          <div className="panel">
            <div className="panel-title">
              <Globe2 size={17} />
              <h3>{t('Thuis vs. uit')}</h3>
              <span>{t('Relevante locatie')}</span>
            </div>
            <div className="comparison-head">
              <div>
                <Badge team={f.home} size="small" />
                <strong>{t('Thuis')}</strong>
              </div>
              <span>{t('STATISTIEK')}</span>
              <div>
                <strong>{t('Uit')}</strong>
                <Badge team={f.away} size="small" />
              </div>
            </div>
            {[
              [
                hs.available ? `${hs.wins} / ${hs.draws} / ${hs.losses}` : '—',
                'W / G / V',
                as.available ? `${as.wins} / ${as.draws} / ${as.losses}` : '—',
              ],
              [num(hs.goalsPerMatch), 'Goals per duel', num(as.goalsPerMatch)],
              [num(hs.averageTotalGoals), 'Totaal goals / duel', num(as.averageTotalGoals)],
              [ratio(hs.scored), 'Team scoorde', ratio(as.scored)],
              [ratio(hs.cleanSheets), 'Clean sheets', ratio(as.cleanSheets)],
              [pct(hs.markets.over25.percentage), 'Over 2.5', pct(as.markets.over25.percentage)],
              [pct(hs.markets.btts.percentage), 'BTTS', pct(as.markets.btts.percentage)],
            ].map(([v, l, r]) => (
              <div className="comparison-row" key={String(l)}>
                <strong>{t(v)}</strong>
                <span>{t(l)}</span>
                <strong>{t(r)}</strong>
              </div>
            ))}
            <div className="split-callout">
              <MapPin size={15} />
              {t('Locatie geeft relevante wedstrijden × 1.1 gewicht.')}
            </div>
            <div className="panel-foot">
              {t(hs.available)}
              {t(' thuisduels / ')}
              {t(as.available)}
              {t(' uitduels beschikbaar')}
            </div>
          </div>
        </div>
      </section>
      <section id="goals">
        <SectionTitle
          eyebrow={t('VAN DOELPUNT TOT PATROON')}
          title={t('Goals & beide teams scoren')}
          aside={
            <span className="subtle">
              {t('Steekproef: laatste ')}
              {t([5, 10, 20][windowIndex])}
            </span>
          }
        />
        <div className="panel table-scroll">
          <table className="market-table">
            <thead>
              <tr>
                <th>{t('Markt')}</th>
                <th>{t(f.home.shortName)}</th>
                <th>{t(f.away.shortName)}</th>
                <th>{t('Thuis')}</th>
                <th>{t('Uit')}</th>
                <th>{t('H2H · 10')}</th>
                <th>{t('Gewogen score')}</th>
              </tr>
            </thead>
            <tbody>
              {goalMarkets.map((m) => (
                <tr key={m}>
                  <td>{t(marketLabels[m])}</td>
                  {[h, a, hs, as, analysis.h2h[1]].map((s, i) => (
                    <td key={i}>
                      <FrequencyCell value={s.markets[m]} />
                    </td>
                  ))}
                  <td>
                    <span className="weighted-score">
                      {t(pct(analysis.combined[m].percentage))}
                    </span>
                    <small className="table-note">
                      {t(analysis.combined[m].sampleSize)}
                      {t(' unieke duels')}
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="additional-probs">
          {probs
            .filter((p) => ['over15', 'over35'].includes(p.key))
            .map((p) => (
              <details key={p.key}>
                <summary>
                  {t(p.label)}
                  <strong>{t(pct(p.value))}</strong>
                  <span>
                    {t(p.confidence)}
                    {t(' vertrouwen')}
                  </span>
                </summary>
                <ul>
                  {p.factors.map((factor) => (
                    <li key={factor}>{t(factor)}</li>
                  ))}
                </ul>
              </details>
            ))}
        </div>
      </section>
      <section id="metrics">
        <SectionTitle
          title={t('Corners, kaarten & aanvallende cijfers')}
          aside={<span className="subtle">{t('Gemiddelde per beschikbare wedstrijd')}</span>}
        />
        <div className="panel table-scroll">
          <table className="metrics-table">
            <thead>
              <tr>
                <th>{t('Statistiek')}</th>
                <th>{t(f.home.name)}</th>
                <th>{t('Beschikbaar')}</th>
                <th>{t(f.away.name)}</th>
                <th>{t('Beschikbaar')}</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map(([key, label]) => {
                const hm = metricAverage(h.fixtures, f.home.id, key),
                  am = metricAverage(a.fixtures, f.away.id, key);
                return (
                  <tr key={key}>
                    <td>{t(label)}</td>
                    <td className="metric-value">{t(num(hm.value))}</td>
                    <td>{t(hm.total ? tr('{0} duels', [hm.total]) : 'Onvoldoende data')}</td>
                    <td className="metric-value">{t(num(am.value))}</td>
                    <td>{t(am.total ? tr('{0} duels', [am.total]) : 'Onvoldoende data')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <PlayerStats key={id} id={id} />
      <section id="h2h">
        <SectionTitle
          title={t('Eerdere ontmoetingen')}
          aside={
            <div className="segmented">
              {[5, 10].map((n, i) => (
                <button
                  key={n}
                  className={h2hIndex === i ? 'active' : ''}
                  onClick={() => setH2hIndex(i)}
                >
                  {t('Laatste ')}
                  {t(n)}
                </button>
              ))}
            </div>
          }
        />
        <div className="h2h-summary">
          <div>
            <strong>{t(selectedH2h.available ? selectedH2h.wins : '—')}</strong>
            <span>
              {t(f.home.name)}
              {t(' wint')}
            </span>
          </div>
          <div>
            <strong>{t(selectedH2h.available ? selectedH2h.draws : '—')}</strong>
            <span>{t('Gelijkspel')}</span>
          </div>
          <div>
            <strong>{t(selectedH2h.available ? selectedH2h.losses : '—')}</strong>
            <span>
              {t(f.away.name)}
              {t(' wint')}
            </span>
          </div>
          <div>
            <strong>{t(num(selectedH2h.averageTotalGoals))}</strong>
            <span>{t('Gem. totaal goals')}</span>
          </div>
          <div>
            <strong>{t(pct(selectedH2h.markets.btts.percentage))}</strong>
            <span>
              {t('BTTS · ')}
              {t(selectedH2h.markets.btts.successes)}
              {'/'}
              {t(selectedH2h.markets.btts.total)}
            </span>
          </div>
        </div>
        <div className="h2h-markets">
          {(['over15', 'over25', 'over35'] as Market[]).map((m) => (
            <span key={m}>
              {t(marketLabels[m])} <strong>{t(pct(selectedH2h.markets[m].percentage))}</strong>
              <small>
                {t(selectedH2h.markets[m].successes)}
                {'/'}
                {t(selectedH2h.markets[m].total)}
                {t(' duels')}
              </small>
            </span>
          ))}
        </div>
        <div className="panel h2h-list">
          {selectedH2h.fixtures.length ? (
            selectedH2h.fixtures.map((game) => (
              <div className="h2h-row" key={game.id}>
                <span>{t(new Date(game.kickoff).toLocaleDateString(locale()))}</span>
                <strong>{t(game.home.name)}</strong>
                <b>
                  {t(game.homeGoals)}
                  {' – '}
                  {t(game.awayGoals)}
                </b>
                <strong>{t(game.away.name)}</strong>
                <span>
                  {t(
                    Date.parse(f.kickoff) - Date.parse(game.kickoff) > 730 * 86400000
                      ? 'Lager gewicht'
                      : 'Recent H2H',
                  )}
                </span>
              </div>
            ))
          ) : (
            <p className="empty-state">{t('Geen onderlinge duels beschikbaar.')}</p>
          )}
        </div>
        <div className="model-note">
          <Info size={14} />
          {t(
            'H2H ouder dan twee jaar weegt extra licht. Teams, trainers en omstandigheden veranderen.',
          )}
        </div>
      </section>
      <details className="raw-data">
        <summary>
          <Database size={17} />
          {t('Bekijk de onderliggende wedstrijddata')}
          <span>
            {t(
              before(data.homeHistory, f.kickoff).length +
                before(data.awayHistory, f.kickoff).length,
            )}{' '}
            {t('teamobservaties')}
          </span>
        </summary>
        <p>
          {t('Genormaliseerde brondata · modelversie ')}
          {t(analysis.version)}
          {' ·'}{' '}
          {t(data.source === 'demo' ? 'synthetische demo' : (data.sourceLabel ?? 'API-Football'))}
        </p>
        <pre>{JSON.stringify({ home: h.fixtures, away: a.fixtures }, null, 2)}</pre>
      </details>
    </>
  );
}
