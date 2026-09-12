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
    [detail, setDetail] = useState<Probability | null>(null);
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
          Alle wedstrijden
        </button>
        <span className="subtle">
          <span className="green-dot" />
          {data.source === 'demo' ? 'Voorbeeldanalyse' : 'Analyse bijgewerkt'} ·{' '}
          {time(data.updatedAt)}
        </span>
      </div>
      <div className="match-hero">
        <div className="match-league">
          <Trophy size={15} />
          {f.league.name}
          <span>•</span>
          {dateLabel(f.sourceDate ?? f.kickoff)}
        </div>
        <div className="match-contest">
          <div className="contender">
            <Badge team={f.home} size="large" />
            <div>
              <h1>{f.home.name}</h1>
              <span>THUIS</span>
            </div>
          </div>
          <div className="match-kickoff">
            <strong>
              {f.homeGoals !== null && f.awayGoals !== null
                ? `${f.homeGoals} – ${f.awayGoals}`
                : f.kickoffKnown === false
                  ? 'Tijd volgt'
                  : time(f.kickoff)}
            </strong>
            <span>
              {f.status === 'finished'
                ? 'AFGELOPEN'
                : f.status === 'scheduled'
                  ? 'AFTRAP'
                  : f.status.toUpperCase()}
            </span>
          </div>
          <div className="contender right">
            <div>
              <h1>{f.away.name}</h1>
              <span>UIT</span>
            </div>
            <Badge team={f.away} size="large" />
          </div>
        </div>
        <div className="match-venue">
          <MapPin size={13} />
          {f.venue ?? 'Stadion niet beschikbaar'}
          <span>•</span>
          <Clock3 size={13} />
          90 minuten · reguliere speeltijd
        </div>
      </div>
      <div className="match-tabs">
        <a href="#probabilities" className="selected">
          Overzicht
        </a>
        <a href="#form">Recente vorm</a>
        <a href="#goals">Goals & BTTS</a>
        <a href="#metrics">Wedstrijdstatistieken</a>
        <a href="#h2h">Head-to-head</a>
      </div>
      {data.sourceLabel && (
        <div className="demo-note">
          <Database size={15} />
          <span>
            Bronnen: {data.sourceLabel}.{' '}
            {f.provenance?.sources.map((source) => (
              <span key={source.url}>
                {source.name}: opgehaald {new Date(source.fetchedAt).toLocaleString('nl-BE')}.{' '}
              </span>
            ))}
          </span>
        </div>
      )}
      {data.warnings.map((w) => (
        <div className="demo-note" key={w}>
          <Info size={15} />
          <span>{w}</span>
        </div>
      ))}
      <section id="probabilities">
        <SectionTitle
          eyebrow="HET MODEL AAN HET WOORD"
          title="Kansen in één oogopslag"
          aside={
            <button className="text-button" onClick={showModel}>
              <CircleHelp size={15} />
              Hoe werkt dit?
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
                <span>{['1', 'X', '2', '2.5', 'BTTS'][i]}</span>
                {p.label}
                <Info size={13} />
              </div>
              <strong>{pct(p.value)}</strong>
              <div className="probability-track">
                <i style={{ width: `${p.value ?? 0}%` }} />
              </div>
              <div className="confidence">
                <span
                  className={`confidence-dot ${p.confidence === 'Gemiddeld' ? 'medium' : ''}`}
                />
                {p.confidence} vertrouwen
              </div>
            </button>
          ))}
        </div>
        {detail && (
          <div className="explanation">
            <div>
              <strong>
                {detail.label} · {pct(detail.value)}
              </strong>
              <button
                className="icon-button"
                aria-label="Uitleg sluiten"
                onClick={() => setDetail(null)}
              >
                <X size={16} />
              </button>
            </div>
            <ul>
              {detail.factors.map((factor) => (
                <li key={factor}>{factor}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="model-note">
          <ShieldCheck size={14} />
          Transparante modelinschattingen, geen zekerheid. Klik op een kans voor de onderbouwing.
        </div>
      </section>
      <OddsComparison key={`odds-${id}`} id={id} />
      <section className="trends-section">
        <SectionTitle
          title="Wat valt op?"
          aside={
            <span className="small-tag">
              <Sparkles size={12} />
              STERKSTE TRENDS
            </span>
          }
        />
        <div className="trends-grid">
          {analysis.trends.length ? (
            analysis.trends.map((t, i) => (
              <div className="trend-card" key={t.text}>
                <div className="trend-number">0{i + 1}</div>
                <div>
                  <p>{t.text}</p>
                  <span>
                    {t.sampleSize} wedstrijden <span>·</span> {Math.round(t.percentage)}% frequentie
                  </span>
                </div>
                <TrendingUp size={19} />
              </div>
            ))
          ) : (
            <p className="subtle">Onvoldoende data voor betrouwbare trends.</p>
          )}
        </div>
      </section>
      <section id="form">
        <SectionTitle
          title="De vorm onder de loep"
          aside={
            <div className="segmented">
              {[5, 10, 20].map((n, i) => (
                <button
                  key={n}
                  className={windowIndex === i ? 'active' : ''}
                  onClick={() => setWindowIndex(i)}
                >
                  Laatste {n}
                </button>
              ))}
            </div>
          }
        />
        <div className="comparison-grid">
          <div className="panel">
            <div className="panel-title">
              <BarChart3 size={17} />
              <h3>Recente vorm</h3>
              <span>Alle locaties</span>
            </div>
            <div className="comparison-head">
              <div>
                <Badge team={f.home} size="small" />
                <strong>{f.home.shortName}</strong>
              </div>
              <span>STATISTIEK</span>
              <div>
                <strong>{f.away.shortName}</strong>
                <Badge team={f.away} size="small" />
              </div>
            </div>
            <div className="comparison-row form-row">
              <Form results={h.results} />
              <span>Vorm</span>
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
                <strong>{v ?? '—'}</strong>
                <span>{l}</span>
                <strong>{r ?? '—'}</strong>
              </div>
            ))}
            <div className="panel-foot">
              {h.available} / {a.available} wedstrijden beschikbaar · nieuwste vorm rechts
            </div>
          </div>
          <div className="panel">
            <div className="panel-title">
              <Globe2 size={17} />
              <h3>Thuis vs. uit</h3>
              <span>Relevante locatie</span>
            </div>
            <div className="comparison-head">
              <div>
                <Badge team={f.home} size="small" />
                <strong>Thuis</strong>
              </div>
              <span>STATISTIEK</span>
              <div>
                <strong>Uit</strong>
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
                <strong>{v}</strong>
                <span>{l}</span>
                <strong>{r}</strong>
              </div>
            ))}
            <div className="split-callout">
              <MapPin size={15} />
              Locatie geeft relevante wedstrijden × 1.1 gewicht.
            </div>
            <div className="panel-foot">
              {hs.available} thuisduels / {as.available} uitduels beschikbaar
            </div>
          </div>
        </div>
      </section>
      <section id="goals">
        <SectionTitle
          eyebrow="VAN DOELPUNT TOT PATROON"
          title="Goals & beide teams scoren"
          aside={<span className="subtle">Steekproef: laatste {[5, 10, 20][windowIndex]}</span>}
        />
        <div className="panel table-scroll">
          <table className="market-table">
            <thead>
              <tr>
                <th>Markt</th>
                <th>{f.home.shortName}</th>
                <th>{f.away.shortName}</th>
                <th>Thuis</th>
                <th>Uit</th>
                <th>H2H · 10</th>
                <th>Gewogen score</th>
              </tr>
            </thead>
            <tbody>
              {goalMarkets.map((m) => (
                <tr key={m}>
                  <td>{marketLabels[m]}</td>
                  {[h, a, hs, as, analysis.h2h[1]].map((s, i) => (
                    <td key={i}>
                      <FrequencyCell value={s.markets[m]} />
                    </td>
                  ))}
                  <td>
                    <span className="weighted-score">{pct(analysis.combined[m].percentage)}</span>
                    <small className="table-note">
                      {analysis.combined[m].sampleSize} unieke duels
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
                  {p.label}
                  <strong>{pct(p.value)}</strong>
                  <span>{p.confidence} vertrouwen</span>
                </summary>
                <ul>
                  {p.factors.map((factor) => (
                    <li key={factor}>{factor}</li>
                  ))}
                </ul>
              </details>
            ))}
        </div>
      </section>
      <section id="metrics">
        <SectionTitle
          title="Corners, kaarten & aanvallende cijfers"
          aside={<span className="subtle">Gemiddelde per beschikbare wedstrijd</span>}
        />
        <div className="panel table-scroll">
          <table className="metrics-table">
            <thead>
              <tr>
                <th>Statistiek</th>
                <th>{f.home.name}</th>
                <th>Beschikbaar</th>
                <th>{f.away.name}</th>
                <th>Beschikbaar</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map(([key, label]) => {
                const hm = metricAverage(h.fixtures, f.home.id, key),
                  am = metricAverage(a.fixtures, f.away.id, key);
                return (
                  <tr key={key}>
                    <td>{label}</td>
                    <td className="metric-value">{num(hm.value)}</td>
                    <td>{hm.total ? `${hm.total} duels` : 'Onvoldoende data'}</td>
                    <td className="metric-value">{num(am.value)}</td>
                    <td>{am.total ? `${am.total} duels` : 'Onvoldoende data'}</td>
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
          title="Eerdere ontmoetingen"
          aside={
            <div className="segmented">
              {[5, 10].map((n, i) => (
                <button
                  key={n}
                  className={h2hIndex === i ? 'active' : ''}
                  onClick={() => setH2hIndex(i)}
                >
                  Laatste {n}
                </button>
              ))}
            </div>
          }
        />
        <div className="h2h-summary">
          <div>
            <strong>{selectedH2h.available ? selectedH2h.wins : '—'}</strong>
            <span>{f.home.name} wint</span>
          </div>
          <div>
            <strong>{selectedH2h.available ? selectedH2h.draws : '—'}</strong>
            <span>Gelijkspel</span>
          </div>
          <div>
            <strong>{selectedH2h.available ? selectedH2h.losses : '—'}</strong>
            <span>{f.away.name} wint</span>
          </div>
          <div>
            <strong>{num(selectedH2h.averageTotalGoals)}</strong>
            <span>Gem. totaal goals</span>
          </div>
          <div>
            <strong>{pct(selectedH2h.markets.btts.percentage)}</strong>
            <span>
              BTTS · {selectedH2h.markets.btts.successes}/{selectedH2h.markets.btts.total}
            </span>
          </div>
        </div>
        <div className="h2h-markets">
          {(['over15', 'over25', 'over35'] as Market[]).map((m) => (
            <span key={m}>
              {marketLabels[m]} <strong>{pct(selectedH2h.markets[m].percentage)}</strong>
              <small>
                {selectedH2h.markets[m].successes}/{selectedH2h.markets[m].total} duels
              </small>
            </span>
          ))}
        </div>
        <div className="panel h2h-list">
          {selectedH2h.fixtures.length ? (
            selectedH2h.fixtures.map((game) => (
              <div className="h2h-row" key={game.id}>
                <span>{new Date(game.kickoff).toLocaleDateString('nl-BE')}</span>
                <strong>{game.home.name}</strong>
                <b>
                  {game.homeGoals} – {game.awayGoals}
                </b>
                <strong>{game.away.name}</strong>
                <span>
                  {Date.parse(f.kickoff) - Date.parse(game.kickoff) > 730 * 86400000
                    ? 'Lager gewicht'
                    : 'Recent H2H'}
                </span>
              </div>
            ))
          ) : (
            <p className="empty-state">Geen onderlinge duels beschikbaar.</p>
          )}
        </div>
        <div className="model-note">
          <Info size={14} />
          H2H ouder dan twee jaar weegt extra licht. Teams, trainers en omstandigheden veranderen.
        </div>
      </section>
      <details className="raw-data">
        <summary>
          <Database size={17} />
          Bekijk de onderliggende wedstrijddata
          <span>
            {before(data.homeHistory, f.kickoff).length +
              before(data.awayHistory, f.kickoff).length}{' '}
            teamobservaties
          </span>
        </summary>
        <p>
          Genormaliseerde brondata · modelversie {analysis.version} ·{' '}
          {data.source === 'demo' ? 'synthetische demo' : (data.sourceLabel ?? 'API-Football')}
        </p>
        <pre>{JSON.stringify({ home: h.fixtures, away: a.fixtures }, null, 2)}</pre>
      </details>
    </>
  );
}
