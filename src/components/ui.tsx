import { tr, t, locale } from '../i18n';
import { useState } from 'react';
import { clubLogo } from '../domain/club-assets';
import { ShieldCheck, Info } from 'lucide-react';
import type { Team } from '../domain/models';
import type { Frequency } from '../analysis/engine';
export const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n)}%`);
export const num = (n: number | null, decimals = 1) => (n === null ? '—' : n.toFixed(decimals));
export const time = (date: string) =>
  new Date(date).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
export const dateLabel = (date: string, short = false) =>
  new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString(
    locale(),
    short ? { day: 'numeric', month: 'short' } : { weekday: 'long', day: 'numeric', month: 'long' },
  );
export function Badge({
  team,
  size = 'normal',
}: {
  team: Team;
  size?: 'small' | 'normal' | 'large';
}) {
  const logo = clubLogo(team.name) ?? team.logo;
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  return (
    <span
      className={`team-badge ${size}`}
      style={{ '--team-color': team.color } as React.CSSProperties}
    >
      {logo && failedLogo !== logo ? (
        <img
          src={logo}
          alt={''}
          decoding="async"
          width={size === 'large' ? 50 : size === 'small' ? 23 : 30}
          height={size === 'large' ? 50 : size === 'small' ? 23 : 30}
          onError={() => setFailedLogo(logo)}
        />
      ) : (
        <ShieldCheck size={size === 'large' ? 36 : 21} />
      )}
      <span>{t(team.shortName)}</span>
    </span>
  );
}
export function Form({ results }: { results: string[] }) {
  return (
    <span className="form-badges">
      {results
        .slice(0, 5)
        .reverse()
        .map((r, i) => (
          <span
            key={i}
            className={`form-result ${r}`}
            title={t(r === 'W' ? 'Winst' : r === 'D' ? 'Gelijk' : 'Verlies')}
          >
            {t(r)}
          </span>
        ))}
    </span>
  );
}
export function SectionTitle({
  eyebrow,
  title,
  aside,
}: {
  eyebrow?: string;
  title: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        {eyebrow && <div className="eyebrow">{t(eyebrow)}</div>}
        <h2>{t(title)}</h2>
      </div>
      {t(aside)}
    </div>
  );
}
export function FrequencyCell({ value }: { value: Frequency }) {
  return (
    <div className="frequency-cell">
      <span>{t(pct(value.percentage))}</span>
      <small>
        {t(value.total ? tr('{0}/{1} duels', [value.successes, value.total]) : 'Onvoldoende data')}
      </small>
      <div className="tiny-track">
        <i style={{ width: `${value.percentage ?? 0}%` }} />
      </div>
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <span className="spinner" />
      {t('Wedstrijdgegevens laden…')}
    </div>
  );
}
export function ErrorBox({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="empty-state" role="alert">
      <Info size={25} />
      <h3>{t('Gegevens niet beschikbaar')}</h3>
      <p>{t(message)}</p>
      <button className="secondary-button" onClick={retry}>
        {t('Opnieuw proberen')}
      </button>
    </div>
  );
}

export const ratio = (f: Frequency) => (f.total ? `${f.successes}/${f.total}` : '—');
