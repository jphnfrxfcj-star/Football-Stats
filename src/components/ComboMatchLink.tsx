import { ArrowUpRight } from 'lucide-react';
import type { Fixture } from '../domain/models';
import { t, tr } from '../i18n';

export default function ComboMatchLink({
  fixture,
  navigate,
}: {
  fixture: Fixture;
  navigate: (path: string) => void;
}) {
  const label = tr('Bekijk analyse van {0} – {1}', [t(fixture.home.name), t(fixture.away.name)]);
  return (
    <button
      type="button"
      className="combo-match-link"
      aria-label={label}
      title={label}
      onClick={() => navigate(`/match/${fixture.id}`)}
    >
      <span className="combo-match-link-name">
        {t(fixture.home.name)} – {t(fixture.away.name)}
      </span>
      <ArrowUpRight size={16} aria-hidden="true" />
    </button>
  );
}
