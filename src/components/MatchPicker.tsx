import { t } from '../i18n';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { today } from '../demo/data';
import type { Fixture } from '../domain/models';
import { Badge, Loading, time } from './ui';
export default function MatchPicker({ navigate }: { navigate: (path: string) => void }) {
  const [date, setDate] = useState(today()),
    [query, setQuery] = useState(''),
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
  const filtered = fixtures.filter((f) =>
    `${f.home.name} ${f.away.name} ${f.league.name}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section aria-label={t('Wedstrijd kiezen voor analyse')}>
      <div className="page-heading">
        <div>
          <h1>{t('Matchanalyse')}</h1>
          <p>{t('Kies een wedstrijd om statistieken, odds en onderbouwing te bekijken.')}</p>
        </div>
      </div>
      <div className="market-controls">
        <label>
          {t('Datum')}{' '}
          <input
            aria-label={t('Analysedatum')}
            type="date"
            value={date}
            onChange={(e) => {
              if (e.target.value) setDate(e.target.value);
            }}
          />
        </label>
        <label>
          {t('Team of competitie')}{' '}
          <input
            aria-label={t('Zoek wedstrijd voor analyse')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
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
            <p>{t('Geen wedstrijden gevonden voor deze datum en zoekopdracht.')}</p>
          )}
        </div>
      )}
    </section>
  );
}
