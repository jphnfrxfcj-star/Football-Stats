import { CalendarDays, ChevronRight } from 'lucide-react';
import { t } from '../i18n';
import { today } from '../demo/data';

export default function EmptyFixtures({
  date,
  hasFilters,
  onDateChange,
  onClearFilters,
}: {
  date: string;
  hasFilters: boolean;
  onDateChange: (date: string) => void;
  onClearFilters: () => void;
}) {
  const nextDay = () => {
    const next = new Date(`${date}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    onDateChange(next.toISOString().slice(0, 10));
  };
  return (
    <div className="empty-state program-empty">
      <span className="program-empty-icon" aria-hidden="true">
        <CalendarDays size={24} />
      </span>
      <h3>{t('Geen wedstrijden gevonden')}</h3>
      <p>{t('Kies een andere datum, competitie of ploeg.')}</p>
      <div className="program-empty-actions">
        <button className="secondary-button" onClick={nextDay}>
          {t('Volgende dag')}
          <ChevronRight size={16} aria-hidden="true" />
        </button>
        {hasFilters ? (
          <button className="text-button" onClick={onClearFilters}>
            {t('Filters wissen')}
          </button>
        ) : date !== today() ? (
          <button className="text-button" onClick={() => onDateChange(today())}>
            {t('Terug naar vandaag')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
