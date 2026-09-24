import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, ShieldCheck, X } from 'lucide-react';
import type { Fixture, League, Team } from '../domain/models';
import { locale, t } from '../i18n';
import { Badge } from './ui';

export default function TeamFilter({
  fixtures,
  value,
  onChange,
  disabled,
}: {
  fixtures: Fixture[];
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const groups = new Map<string, { league: League; teams: Map<string, Team> }>();
  for (const fixture of fixtures) {
    let group = groups.get(fixture.league.id);
    if (!group) {
      group = { league: fixture.league, teams: new Map() };
      groups.set(fixture.league.id, group);
    }
    for (const team of [fixture.home, fixture.away]) group.teams.set(team.id, team);
  }
  const selected = [...groups.values()]
    .flatMap((g) => [...g.teams.values()])
    .find((t) => t.id === value);
  const available = !disabled && groups.size > 0;
  useEffect(() => {
    if (!available) setOpen(false);
  }, [available]);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const choose = (team: string) => {
    onChange(team);
    close();
  };
  return (
    <div
      className="team-filter"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (open && event.key === 'Escape') {
          event.preventDefault();
          close();
        }
      }}
    >
      <button
        type="button"
        className="team-filter-trigger"
        ref={trigger}
        aria-label={t('Filter op ploeg')}
        aria-expanded={open && available}
        aria-controls={`${id}-panel`}
        disabled={!available}
        onClick={() => setOpen((value) => !value)}
      >
        {selected ? <Badge team={selected} size="small" /> : <ShieldCheck size={18} />}
        <span>{selected?.name ?? t('Alle ploegen')}</span>
        <ChevronDown size={16} />
      </button>
      {open && available && (
        <div
          className="team-filter-panel"
          id={`${id}-panel`}
          role="region"
          aria-labelledby={`${id}-title`}
        >
          <div className="team-filter-heading">
            <div>
              <strong id={`${id}-title`}>{t('Kies een ploeg')}</strong>
              <p>{t('Ploegen op deze speeldag')}</p>
            </div>
            <button type="button" className="icon-button" aria-label={t('Sluiten')} onClick={close}>
              <X size={18} />
            </button>
          </div>
          <div className="team-filter-options">
            <button
              type="button"
              className="team-filter-option team-filter-all"
              aria-pressed={!value}
              onClick={() => choose('')}
            >
              <ShieldCheck size={20} />
              <span>{t('Alle ploegen')}</span>
              {!value && <Check size={16} />}
            </button>
            {[...groups.values()]
              .sort((a, b) => a.league.name.localeCompare(b.league.name, locale()))
              .map(({ league, teams }) => (
                <div
                  className="team-filter-group"
                  key={league.id}
                  role="group"
                  aria-label={t(league.name)}
                >
                  <h3>{t(league.name)}</h3>
                  <div className="team-filter-grid">
                    {[...teams.values()]
                      .sort((a, b) => a.name.localeCompare(b.name, locale()))
                      .map((team) => (
                        <button
                          type="button"
                          key={team.id}
                          className="team-filter-option"
                          aria-label={team.name}
                          aria-pressed={value === team.id}
                          onClick={() => choose(team.id)}
                        >
                          <Badge team={team} size="small" />
                          <span>{team.name}</span>
                          {value === team.id && <Check size={16} />}
                        </button>
                      ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
