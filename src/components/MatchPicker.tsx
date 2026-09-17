import DataNotice from './DataNotice';
import { t, locale } from '../i18n';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { today } from '../demo/data';
import type { Fixture } from '../domain/models';
import { Badge, Loading, time } from './ui';
export default function MatchPicker({ navigate }: { navigate: (path: string) => void }) {
  const [date, setDate] = useState(today()),
    [league, setLeague] = useState(''),
    [team, setTeam] = useState(''),
    [retry, setRetry] = useState(0);
  const [fixtures, setFixtures] = useState<Fixture[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError('');
    api
      .fixtures(date, c.signal)
      .then((rows) => {
        if (!c.signal.aborted) setFixtures(rows);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [date, retry]);
  const leagues = [...new Map(fixtures.map((f) => [f.league.id, f.league])).values()].sort((a, b) =>
    a.name.localeCompare(b.name, locale()),
  );
  const leagueFixtures = fixtures.filter((f) => !league || f.league.id === league);
  const teams = [
    ...new Map(leagueFixtures.flatMap((f) => [f.home, f.away]).map((t) => [t.id, t])).values(),
  ].sort((a, b) => a.name.localeCompare(b.name, locale()));
  const filtered = leagueFixtures.filter((f) => !team || f.home.id === team || f.away.id === team);
  return (
    <section aria-label={t('Wedstrijd kiezen voor analyse')}>
      <div className="page-heading">
        <div>
          <h1>{t('Matchanalyse')}</h1>
          <p>{t('Kies een wedstrijd om statistieken, odds en onderbouwing te bekijken.')}</p>
        </div>
      </div>
      <div className="market-controls match-picker-controls">
        <label>
          {t('Datum')}{' '}
          <input
            aria-label={t('Analysedatum')}
            type="date"
            value={date}
            onChange={(e) => {
              if (e.target.value) {
                setDate(e.target.value);
                setFixtures([]);
                setLoading(true);
                setLeague('');
                setTeam('');
              }
            }}
          />
        </label>
        <label>
          {t('Competitie')}
          <select
            aria-label={t('Competitie voor analyse')}
            value={league}
            disabled={loading || !!error || !leagues.length}
            onChange={(e) => {
              setLeague(e.target.value);
              setTeam('');
            }}
          >
            <option value="">{t('Alle competities')}</option>
            {leagues.map((l) => (
              <option key={l.id} value={l.id}>
                {t(l.name)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('Ploeg')}
          <select
            aria-label={t('Ploeg voor analyse')}
            value={team}
            disabled={loading || !!error || !teams.length}
            onChange={(e) => setTeam(e.target.value)}
          >
            <option value="">{t('Alle ploegen')}</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!loading && !error && <DataNotice items={filtered.map((f) => f.availability)} />}
      {loading ? (
        <Loading />
      ) : error ? (
        <p role="alert">
          {t(error)}{' '}
          <button className="text-button" onClick={() => setRetry((n) => n + 1)}>
            {t('Opnieuw proberen')}
          </button>
        </p>
      ) : (
        <div className="match-picker-list">
          {filtered.length ? (
            filtered.map((f) => (
              <button
                className="match-picker-row"
                key={f.id}
                onClick={() => navigate(`/match/${f.id}`)}
              >
                <Badge team={f.home} />
                <span>
                  <strong>
                    {t(f.home.name)}
                    {' – '}
                    {t(f.away.name)}
                  </strong>
                  <small>
                    {t(f.league.name)}
                    {' · '}
                    {t(time(f.kickoff))}
                    {t(
                      f.status === 'finished'
                        ? ` · ${f.homeGoals ?? '–'}–${f.awayGoals ?? '–'}`
                        : '',
                    )}
                  </small>
                </span>
                <span>{t('Analyse →')}</span>
              </button>
            ))
          ) : (
            <p>{t('Geen wedstrijden gevonden voor deze datum en filters.')}</p>
          )}
        </div>
      )}
    </section>
  );
}
