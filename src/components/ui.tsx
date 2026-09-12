import { useState } from 'react';
import { clubLogo } from '../domain/club-assets';
import { ShieldCheck, Info } from 'lucide-react';
import type { Team } from '../domain/models';
import type { Frequency } from '../analysis/engine';
export const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n)}%`);
export const num = (n: number | null, decimals = 1) => (n === null ? '—' : n.toFixed(decimals));
export const time = (date: string) =>
  new Date(date).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
export const dateLabel = (date: string, short = false) =>
  new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString(
    'nl-BE',
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
          alt=""
          decoding="async"
          width={size === 'large' ? 50 : size === 'small' ? 23 : 30}
          height={size === 'large' ? 50 : size === 'small' ? 23 : 30}
          onError={() => setFailedLogo(logo)}
        />
      ) : (
        <ShieldCheck size={size === 'large' ? 36 : 21} />
      )}
      <span>{team.shortName}</span>
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
            title={r === 'W' ? 'Winst' : r === 'D' ? 'Gelijk' : 'Verlies'}
          >
            {r}
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
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2>{title}</h2>
      </div>
      {aside}
    </div>
  );
}
export function FrequencyCell({ value }: { value: Frequency }) {
  return (
    <div className="frequency-cell">
      <span>{pct(value.percentage)}</span>
      <small>{value.total ? `${value.successes}/${value.total} duels` : 'Onvoldoende data'}</small>
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
      Wedstrijdgegevens laden…
    </div>
  );
}
export function ErrorBox({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="empty-state" role="alert">
      <Info size={25} />
      <h3>Gegevens niet beschikbaar</h3>
      <p>{message}</p>
      <button className="secondary-button" onClick={retry}>
        Opnieuw proberen
      </button>
    </div>
  );
}

export const ratio = (f: Frequency) => (f.total ? `${f.successes}/${f.total}` : '—');
