import { CalendarDays, ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';
import type { Fixture, League } from '../domain/models';
import { t } from '../i18n';
import TeamFilter from './TeamFilter';

export default function FixtureFilters({
  date,
  league,
  team,
  leagues,
  fixtures,
  disabled,
  onDateChange,
  onLeagueChange,
  onTeamChange,
  analysis = false,
}: {
  date: string;
  league: string;
  team: string;
  leagues: League[];
  fixtures: Fixture[];
  disabled: boolean;
  onDateChange: (date: string) => void;
  onLeagueChange: (league: string) => void;
  onTeamChange: (team: string) => void;
  analysis?: boolean;
}) {
  const changeDate = (next: string) => {
    if (next && next !== date) onDateChange(next);
  };
  const shift = (days: number) => {
    const next = new Date(`${date}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + days);
    changeDate(next.toISOString().slice(0, 10));
  };
  return (
    <div className={`filters${analysis ? ' match-picker-controls' : ''}`}>
      <div className="date-switch">
        <button className="icon-button" onClick={() => shift(-1)} aria-label={t('Vorige dag')}>
          <ChevronLeft size={17} />
        </button>
        <label>
          <CalendarDays size={16} />
          <input
            aria-label={t(analysis ? 'Analysedatum' : 'Wedstrijddatum')}
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
          aria-label={t(analysis ? 'Competitie voor analyse' : 'Filter op competitie')}
          value={league}
          disabled={analysis && (disabled || !leagues.length)}
          onChange={(e) => {
            onLeagueChange(e.target.value);
            onTeamChange('');
          }}
        >
          <option value={analysis ? '' : 'all'}>{t('Alle competities')}</option>
          {leagues.map((l) => (
            <option key={l.id} value={l.id}>
              {t(l.name)}
            </option>
          ))}
        </select>
      </div>
      <TeamFilter
        key={`${date}:${league}`}
        fixtures={fixtures}
        value={team}
        onChange={onTeamChange}
        disabled={disabled}
        label={t(analysis ? 'Ploeg voor analyse' : 'Filter op ploeg')}
      />
    </div>
  );
}
