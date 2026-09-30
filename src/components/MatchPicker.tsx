import DataNotice from './DataNotice';
import FixtureFilters from './FixtureFilters';
import FixtureRow from './FixtureRow';
import EmptyFixtures from './EmptyFixtures';
import { t, locale } from '../i18n';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { today } from '../demo/data';
import type { Fixture } from '../domain/models';
import { Loading } from './ui';
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
  const filtered = leagueFixtures.filter((f) => !team || f.home.id === team || f.away.id === team);
  const changeDate = (next: string) => {
    if (!next || next === date) return;
    setDate(next);
    setFixtures([]);
    setLoading(true);
    setLeague('');
    setTeam('');
  };
  return (
    <section aria-label={t('Wedstrijd kiezen voor analyse')}>
      <div className="page-heading">
        <div>
          <h1>{t('Matchanalyse')}</h1>
          <p>{t('Kies een wedstrijd om statistieken, odds en onderbouwing te bekijken.')}</p>
        </div>
      </div>
      <FixtureFilters
        analysis
        date={date}
        league={league}
        team={team}
        leagues={leagues}
        fixtures={leagueFixtures}
        disabled={loading || !!error}
        onDateChange={changeDate}
        onLeagueChange={setLeague}
        onTeamChange={setTeam}
      />
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
        <div className={filtered.length ? 'match-picker-list fixture-group' : 'match-picker-list'}>
          {filtered.length ? (
            filtered.map((f) => (
              <FixtureRow key={f.id} fixture={f} navigate={navigate} className="match-picker-row" />
            ))
          ) : (
            <EmptyFixtures
              date={date}
              hasFilters={!!team || !!league}
              onDateChange={changeDate}
              onClearFilters={() => {
                setTeam('');
                setLeague('');
              }}
            />
          )}
        </div>
      )}
    </section>
  );
}
