import type { ReactNode } from 'react';
import { ArrowRight, MapPin } from 'lucide-react';
import type { Fixture } from '../domain/models';
import { t } from '../i18n';
import { Badge, time } from './ui';

export default function FixtureRow({
  fixture: f,
  navigate,
  now = Date.now(),
  children,
  className = '',
}: {
  fixture: Fixture;
  navigate: (path: string) => void;
  now?: number;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <button
      className={`fixture-row${children ? ' has-odds' : ''}${className ? ` ${className}` : ''}`}
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
        {t(f.homeGoals !== null && f.awayGoals !== null ? `${f.homeGoals} – ${f.awayGoals}` : 'vs')}
      </span>
      <div className="fixture-team away">
        <Badge team={f.away} />
        <span>{t(f.away.name)}</span>
      </div>
      {children}
      <span className="fixture-venue">
        <MapPin size={14} />
        {t(f.league.name)}
      </span>
      <span className="analyze-link">
        {t(f.status === 'finished' ? 'Recap' : 'Analyse')} <ArrowRight size={16} />
      </span>
    </button>
  );
}
