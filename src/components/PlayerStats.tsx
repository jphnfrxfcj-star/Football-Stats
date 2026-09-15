import { tr, t, locale } from '../i18n';
import { useEffect, useState } from 'react';
import { Users, RefreshCw } from 'lucide-react';
import { api } from '../api';
import { playerMetrics, type PlayerMetric, type PlayerReport } from '../domain/players';
import { SectionTitle, Loading } from './ui';
export default function PlayerStats({ id }: { id: string }) {
  const [report, setReport] = useState<PlayerReport | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0),
    [team, setTeam] = useState(0),
    [metric, setMetric] = useState<PlayerMetric>('shots'),
    [mode, setMode] = useState<'average' | 'total'>('average');
  useEffect(() => {
    setReport(null);
    setError('');
    setLoading(false);
    setAttempt(0);
    setTeam(0);
  }, [id]);
  useEffect(() => {
    if (!attempt) return;
    const c = new AbortController();
    setLoading(true);
    setError('');
    api
      .players(id, c.signal)
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
  const selected = report?.teams[team];
  const columns = [
    metric,
    ...(Object.keys(playerMetrics) as PlayerMetric[]).filter((key) => key !== metric),
  ];
  const players = [...(selected?.players ?? [])].sort(
    (a, b) => (b.metrics[metric][mode] ?? -1) - (a.metrics[metric][mode] ?? -1),
  );
  return (
    <section id="players" className="player-section">
      <SectionTitle
        eyebrow={t('INDIVIDUELE IMPACT')}
        title={t('Spelerstatistieken')}
        aside={<span className="subtle">{t('Laatste 5 teamduels vóór aftrap')}</span>}
      />
      <p className="section-intro">
        {t(
          'Schoten, schoten op doel en overtredingen per speler. Gemiddelden gelden per optreden met bekende data; ongebruikte wisselspelers tellen niet mee.',
        )}
      </p>
      {!report && !loading && (
        <div className="player-invitation">
          <Users size={24} />
          <div>
            <strong>{t('Wie zorgt voor het gevaar?')}</strong>
            <p>{t('Vergelijk spelers uit recente competitiewedstrijden vóór deze aftrap.')}</p>
          </div>
          <button className="secondary-button" onClick={() => setAttempt(attempt + 1)}>
            {t(error ? 'Opnieuw proberen' : 'Spelers bekijken')}
          </button>
        </div>
      )}
      {loading && <Loading />}
      {error && <p role="alert">{t(error)}</p>}
      {report && (
        <>
          {report.teams.length > 0 && (
            <div className="player-controls">
              <div className="window-tabs">
                {report.teams.map((teamReport, i) => (
                  <button
                    key={teamReport.name}
                    className={i === team ? 'active' : ''}
                    onClick={() => setTeam(i)}
                  >
                    {t(teamReport.name)}
                  </button>
                ))}
              </div>
              <label>
                {t('Weergave')}{' '}
                <select
                  aria-label={t('Spelerstatistieken weergave')}
                  value={mode}
                  onChange={(e) => setMode(e.target.value as typeof mode)}
                >
                  <option value="average">{t('Gemiddeld per optreden')}</option>
                  <option value="total">{t('Totaal')}</option>
                </select>
              </label>
              <label>
                {t('Sorteer op')}{' '}
                <select
                  aria-label={t('Sorteer spelers')}
                  value={metric}
                  onChange={(e) => setMetric(e.target.value as PlayerMetric)}
                >
                  {Object.entries(playerMetrics).map(([key, label]) => (
                    <option key={key} value={key}>
                      {t(label)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {selected && (
            <p className="subtle">
              {t(selected.available)}
              {t(' van ')}
              {t(selected.requested)}
              {t(
                ' geraadpleegde teamduels beschikbaar. Spelers uit historische opstellingen; geen bevestigde selectie voor deze wedstrijd.',
              )}
            </p>
          )}
          {players.length > 0 && (
            <p className="table-hint">
              {t(
                'Schuif in de tabel voor alle spelers en statistieken. De gekozen statistiek staat vooraan.',
              )}
            </p>
          )}
          {players.length ? (
            <div
              className="player-table-scroll"
              tabIndex={0}
              aria-label={t('Spelerstatistieken tabel')}
            >
              <table className="player-table">
                <thead>
                  <tr>
                    <th>{t('Speler')}</th>
                    <th>{t('Duels')}</th>
                    <th>{t('Basis')}</th>
                    {columns.map((key) => (
                      <th key={key}>{t(playerMetrics[key])}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {players.map((p) => (
                    <tr key={p.id}>
                      <th scope="row">{t(p.name)}</th>
                      <td>{t(p.appearances)}</td>
                      <td>{t(p.starts ?? '—')}</td>
                      {columns.map((key) => {
                        const value = p.metrics[key as PlayerMetric];
                        return (
                          <td
                            key={key}
                            title={t(tr('{0} optredens met bekende data', [value.samples]))}
                          >
                            {t(
                              value[mode] === null
                                ? '—'
                                : value[mode]!.toFixed(mode === 'average' ? 2 : 0),
                            )}
                            <small>
                              {t('n=')}
                              {t(value.samples)}
                            </small>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="spotlight-placeholder">
              {t('Geen spelerstatistieken beschikbaar voor deze selectie.')}
            </p>
          )}
          <p className="spotlight-note">
            {t('Bron: ')}
            {t(report.source)}
            {t('. Overzicht samengesteld')} {t(new Date(report.fetchedAt).toLocaleString(locale()))}
            {t(
              '. Minuten zijn niet beschikbaar: deze cijfers zijn geen gemiddelden per 90 minuten en geen voorspelling van een spelersweddenschap.',
            )}
          </p>
          {report.warnings.length > 0 && (
            <details className="source-details">
              <summary>
                {t('Datadekking en ontbrekende wedstrijden (')}
                {t(report.warnings.length)}
                {')'}
              </summary>
              <ul>
                {report.warnings.map((w) => (
                  <li key={w}>{t(w)}</li>
                ))}
              </ul>
            </details>
          )}
          {report.matches.length > 0 && (
            <details className="source-details">
              <summary>{t('Onderliggende wedstrijden bij de bron')}</summary>
              <ul>
                {report.matches.map((m) => (
                  <li key={m.id}>
                    <a href={m.sourceUrl} target="_blank" rel="noreferrer">
                      {t('Wedstrijd ')}
                      {t(new Date(m.kickoff).toLocaleDateString(locale()))}
                      {t(' · ESPN ')}
                      {t(m.id)}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <button
            className="text-button"
            disabled={loading}
            onClick={() => setAttempt(attempt + 1)}
          >
            <RefreshCw size={13} />
            {t(' Opnieuw laden')}
          </button>
        </>
      )}
    </section>
  );
}
