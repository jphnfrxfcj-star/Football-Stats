import DataNotice from './DataNotice';
import TeamFilter from './TeamFilter';
import { t } from '../i18n';
import ComboHistory from './ComboHistory';
import { useComboHistory } from './useComboHistory';
import { programPrices } from '../analysis/program-prices';
import type { OddsSnapshot } from '../domain/spotlight';
import ComboFinder from './ComboFinder';
import { DayRecap } from './Recap';
import { isUpcoming } from '../analysis/recap';
import Spotlight from './Spotlight';
import { useEffect, useState } from 'react';
import {
  CalendarDays,
  Trophy,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Search,
  Info,
  MapPin,
  TrendingUp,
  Database,
  Check,
} from 'lucide-react';
import { api, isDemo } from '../api';
import type { Fixture, League } from '../domain/models';
import { today } from '../demo/data';
import { Badge, SectionTitle, Loading, ErrorBox, time, dateLabel } from './ui';
export default function Dashboard({ navigate }: { navigate: (s: string) => void }) {
  const archive = useComboHistory();
  const [date, setDate] = useState(today()),
    [team, setTeam] = useState(''),
    [league, setLeague] = useState('all');
  const [fixtures, setFixtures] = useState<Fixture[]>([]),
    [leagues, setLeagues] = useState<League[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    Promise.all([api.fixtures(date, controller.signal), api.leagues(controller.signal)])
      .then(([f, l]) => {
        if (!controller.signal.aborted) {
          setFixtures(f);
          setLeagues(l);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [date, retry]);
  const [odds, setOdds] = useState<{ date: string; report: OddsSnapshot } | null>(null),
    [oddsLoading, setOddsLoading] = useState(false),
    [oddsError, setOddsError] = useState(''),
    [oddsRetry, setOddsRetry] = useState(0);
  const hasUpcoming =
    !loading && !error && date >= today() && fixtures.some((f) => isUpcoming(f, now));
  useEffect(() => {
    const c = new AbortController();
    setOddsError('');
    setOddsLoading(false);
    if (!hasUpcoming) return () => c.abort();
    setOddsLoading(true);
    api
      .programOdds(date, c.signal)
      .then((report) => {
        if (!c.signal.aborted) setOdds({ date, report });
      })
      .catch((e) => {
        if (!c.signal.aborted) setOddsError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setOddsLoading(false);
      });
    return () => c.abort();
  }, [date, hasUpcoming, oddsRetry]);
  const [recoveredDate, setRecoveredDate] = useState('');
  useEffect(() => {
    if (!hasUpcoming || oddsLoading || recoveredDate === date) return;
    const missing =
      oddsError ||
      (odds?.date === date &&
        fixtures.some(
          (f) =>
            isUpcoming(f, now) && Object.keys(programPrices(f, odds.report, now).quotes).length < 3,
        ));
    if (!missing) return;
    const timer = setTimeout(() => {
      setRecoveredDate(date);
      setOddsRetry((n) => n + 1);
    }, 65000);
    return () => clearTimeout(timer);
  }, [hasUpcoming, oddsLoading, recoveredDate, date, oddsError, odds, fixtures]);
  const leagueFixtures = fixtures.filter((f) => league === 'all' || f.league.id === league);
  const filtered = leagueFixtures.filter((f) => !team || f.home.id === team || f.away.id === team);
  const changeDate = (next: string) => {
    if (!next || next === date) return;
    setDate(next);
    setFixtures([]);
    setLoading(true);
    setLeague('all');
    setTeam('');
  };
  const shift = (n: number) => {
    const d = new Date(`${date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    changeDate(d.toISOString().slice(0, 10));
  };
  return (
    <>
      <div className="page-heading dashboard-heading">
        <div>
          <div className="eyebrow">
            <span className="green-dot" />
            {t(' JOUW VOORSPRONG BEGINT HIER')}
          </div>
          <h1>
            {t('Elke wedstrijd. Meer inzicht')}
            <span>{'.'}</span>
          </h1>
          <p>{t('Ontdek de vorm, herken de trends en duik in de cijfers.')}</p>
        </div>
        <span className="date-pill">
          <CalendarDays size={16} />
          {t(dateLabel(date, true))}
        </span>
      </div>
      <div className="mobile-quick-links">
        <a href="#program">{t('Naar programma')}</a>
        <a
          href="/combis"
          onClick={(e) => {
            e.preventDefault();
            navigate('/combis');
          }}
        >
          {t('Combivoorstellen')}
        </a>
      </div>
      <div className="overview-grid">
        <div className="overview-card">
          <span className="overview-icon">
            <CalendarDays size={20} />
          </span>
          <div>
            <small>{t('Wedstrijden op deze dag')}</small>
            <strong>
              {t(loading ? '—' : fixtures.length)}
              <span>{t('duels')}</span>
            </strong>
          </div>
          <span className="mini-bars">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
        </div>
        <div className="overview-card">
          <span className="overview-icon">
            <Trophy size={20} />
          </span>
          <div>
            <small>{t('Ondersteunde competities')}</small>
            <strong>{t(isDemo ? 'Premier League (demo)' : '4 competities')}</strong>
          </div>
        </div>
        <div className="overview-card">
          <span className="overview-icon">
            <ShieldCheck size={20} />
          </span>
          <div>
            <small>{t('Eigen analyse-engine')}</small>
            <strong>
              {'100%'}
              <span>{t('uitlegbaar')}</span>
            </strong>
          </div>
          <span className="small-tag">{t('RULE-BASED')}</span>
        </div>
      </div>
      <div className="feature-banner">
        <div className="feature-copy">
          <span className="feature-tag">
            <Sparkles size={13} />
            {t(' KIJK VERDER DAN DE UITSLAG')}
          </span>
          <h2>
            {t('Het verhaal achter')}
            <br />
            {t('de volgende aftrap.')}
          </h2>
          <p>
            {t('Recente vorm, thuisvoordeel en onderlinge duels.')}
            <br />
            {t('Samengebracht in één heldere analyse.')}
          </p>
          <button
            className="primary-button"
            disabled={!fixtures.length || loading || !!error}
            onClick={() => navigate(`/match/${fixtures[0].id}`)}
          >
            {t('Ontdek een matchanalyse ')}
            <ArrowRight size={17} />
          </button>
        </div>
        <div className="pitch-art" aria-hidden="true">
          <div className="pitch">
            <div className="half-line" />
            <div className="center-circle" />
            <div className="penalty left" />
            <div className="penalty right" />
            {[
              [20, 28],
              [32, 67],
              [43, 42],
              [58, 25],
              [65, 64],
              [81, 44],
            ].map(([x, y], i) => (
              <span
                key={i}
                className={`pitch-player p${i}`}
                style={{ left: `${x}%`, top: `${y}%` }}
              />
            ))}
            <div className="pitch-route" />
          </div>
          <div className="floating-stat">
            <span className="stat-icon">
              <TrendingUp size={19} />
            </span>
            <div>
              <small>{t('Jouw volgende inzicht')}</small>
              <strong>{t('Van data naar context')}</strong>
            </div>
            <span className="live-spark" />
          </div>
        </div>
      </div>
      {!loading && !error && filtered.some((f) => isUpcoming(f, now)) && (
        <Spotlight date={date} league={league} navigate={navigate} />
      )}
      {!loading && !error && <DayRecap fixtures={filtered} />}
      <div id="program" />
      <SectionTitle
        title={t(date < today() ? 'Uitslagen & terugblik' : 'Op het programma')}
        aside={<span className="subtle">{t('Alle tijden in jouw tijdzone')}</span>}
      />
      <div className="filters">
        <div className="date-switch">
          <button className="icon-button" onClick={() => shift(-1)} aria-label={t('Vorige dag')}>
            <ChevronLeft size={17} />
          </button>
          <label>
            <CalendarDays size={16} />
            <input
              aria-label={t('Wedstrijddatum')}
              type="date"
              value={date}
              onChange={(e) => changeDate(e.target.value)}
            />
          </label>
          <button className="icon-button" onClick={() => shift(1)} aria-label={t('Volgende dag')}>
            <ChevronRight size={17} />
          </button>
        </div>
        <div className="select-wrap">
          <SlidersHorizontal size={16} />
          <select
            aria-label={t('Filter op competitie')}
            value={league}
            onChange={(e) => {
              setLeague(e.target.value);
              setTeam('');
            }}
          >
            <option value="all">{t('Alle competities')}</option>
            {leagues.map((l) => (
              <option key={l.id} value={l.id}>
                {t(l.name)}
              </option>
            ))}
          </select>
        </div>
        <TeamFilter
          key={`${date}:${league}`}
          fixtures={leagueFixtures}
          value={team}
          onChange={setTeam}
          disabled={loading || !!error}
        />
      </div>
      {hasUpcoming && (
        <p className="program-odds-note">
          {t('Thuis · Gelijk · Uit. Voorkeur voor Unibet; de bookmaker staat bij elke wedstrijd.')}
          {oddsError ? (
            <>
              <span role="status">{t(' Odds tijdelijk niet beschikbaar.')}</span>{' '}
            </>
          ) : (
            t(' Open een wedstrijd voor de volledige analyse.')
          )}{' '}
          <button
            className="text-button"
            disabled={oddsLoading}
            onClick={() => setOddsRetry((n) => n + 1)}
          >
            {t(oddsLoading ? 'Odds laden…' : 'Odds opnieuw laden')}
          </button>
        </p>
      )}
      {!loading && !error && <DataNotice items={filtered.map((f) => f.availability)} />}
      {isDemo && (
        <div className="demo-note">
          <Info size={15} />
          <span>
            {t(
              'Demo-omgeving · Alle wedstrijden en statistieken hieronder zijn fictieve voorbeelddata.',
            )}
          </span>
        </div>
      )}
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} retry={() => setRetry(retry + 1)} />
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <Search size={30} />
          <h3>{t('Geen wedstrijden gevonden')}</h3>
          <p>{t('Kies een andere datum, competitie of ploeg.')}</p>
          {!team && (
            <button className="secondary-button" onClick={() => shift(1)}>
              {t('Volgende dag bekijken')}
            </button>
          )}
          <button
            className="secondary-button"
            onClick={() => {
              setTeam('');
              setLeague('all');
              changeDate(today());
            }}
          >
            {t('Filters herstellen')}
          </button>
        </div>
      ) : (
        <div className="fixture-group">
          <div className="league-heading">
            <span className="league-symbol">
              <Trophy size={18} />
            </span>
            <strong>
              {t(
                league === 'all' ? 'Alle competities' : leagues.find((l) => l.id === league)?.name,
              )}
            </strong>
            <span className="fixture-count">
              {t(filtered.length)}
              {t(' wedstrijden')}
            </span>
          </div>
          {filtered.map((f) => {
            const showOdds = isUpcoming(f, now);
            const prices = programPrices(f, odds?.date === date ? odds.report : null, now);
            return (
              <button
                className={`fixture-row${showOdds ? ' has-odds' : ''}`}
                key={f.id}
                onClick={() => navigate(`/match/${f.id}`)}
              >
                <div className="fixture-time">
                  <strong>{t(f.kickoffKnown === false ? 'Tijd volgt' : time(f.kickoff))}</strong>
                  <span>
                    {t(
                      f.status === 'finished'
                        ? 'Afgelopen'
                        : f.status === 'live'
                          ? 'Bezig'
                          : f.status === 'postponed'
                            ? 'Uitgesteld'
                            : f.status === 'cancelled'
                              ? 'Geannuleerd'
                              : Date.parse(f.kickoff) < now
                                ? 'Uitslag volgt'
                                : 'Gepland',
                    )}
                  </span>
                </div>
                <div className="fixture-team home">
                  <span>{t(f.home.name)}</span>
                  <Badge team={f.home} />
                </div>
                <span className="fixture-vs">
                  {t(
                    f.homeGoals !== null && f.awayGoals !== null
                      ? `${f.homeGoals} – ${f.awayGoals}`
                      : 'vs',
                  )}
                </span>
                <div className="fixture-team away">
                  <Badge team={f.away} />
                  <span>{t(f.away.name)}</span>
                </div>
                {showOdds && (
                  <span className="fixture-odds" aria-label={t('Wedstrijdodds')}>
                    {(['home', 'draw', 'away'] as const).map((market, i) => (
                      <span
                        className="fixture-odd"
                        key={market}
                        title={t(['Thuis', 'Gelijk', 'Uit'][i])}
                      >
                        <small>{t(['1', 'X', '2'][i])}</small>
                        <strong>
                          {t(
                            prices.quotes[market]?.decimal.toFixed(2) ?? (oddsLoading ? '…' : '—'),
                          )}
                        </strong>
                      </span>
                    ))}
                    <span className="fixture-odds-caption" title={t(prices.detail)}>
                      {t(
                        prices.bookmaker ?? (oddsLoading ? 'Odds laden…' : 'Geen odds beschikbaar'),
                      )}
                      {t(prices.bookmaker && prices.snapshot && ' · momentopname')}
                    </span>
                  </span>
                )}
                <span className="fixture-venue">
                  <MapPin size={14} />
                  {t(f.league.name)}
                </span>
                <span className="analyze-link">
                  {t(f.status === 'finished' ? 'Recap' : 'Analyse')} <ArrowRight size={16} />
                </span>
              </button>
            );
          })}
        </div>
      )}
      {date >= today() && (
        <ComboFinder
          key={date}
          date={date}
          navigate={navigate}
          onSave={archive.add}
          onRemove={archive.remove}
          storageError={archive.error}
          savedCombos={archive.combos}
        />
      )}
      {date >= today() && (
        <button className="text-button" onClick={() => navigate('/combis')}>
          {t('Meer combivoorstellen en variatie →')}
        </button>
      )}
      <ComboHistory
        combos={archive.combos}
        error={archive.error}
        remove={archive.remove}
        navigate={navigate}
      />
      <div className="bottom-info">
        <div>
          <Database size={20} />
          <div>
            <strong>{t('Meerdere perspectieven. Eén analyse.')}</strong>
            <p>{t('Tot 20 recente duels, thuis- en uitvorm en historische ontmoetingen.')}</p>
          </div>
        </div>
        <span>
          <Check size={14} />
          {t(' Geen externe predictions')}
        </span>
      </div>
    </>
  );
}
