import { t } from '../i18n';
import { useState } from 'react';
import { today } from '../demo/data';
import ComboFinder from './ComboFinder';
import ComboHistory from './ComboHistory';
import { useComboHistory } from './useComboHistory';
export default function CombinationsPage({ navigate }: { navigate: (path: string) => void }) {
  const [date, setDate] = useState(today());
  const archive = useComboHistory();
  return (
    <div className="combinations-page">
      <div className="page-heading">
        <div>
          <h1>{t('Combivoorstellen')}</h1>
          <p>{t('Vergelijk compacte voorstellen met verschillende markten en wedstrijden.')}</p>
        </div>
      </div>
      <label className="combo-start-date">
        {t('Vanaf')}{' '}
        <input
          type="date"
          aria-label={t('Startdatum combivoorstellen')}
          min={today()}
          value={date}
          onChange={(e) => {
            if (e.target.value && e.target.value >= today()) setDate(e.target.value);
          }}
        />
      </label>
      <ComboFinder
        key={date}
        date={date}
        navigate={navigate}
        onSave={archive.add}
        onRemove={archive.remove}
        storageError={archive.error}
        savedCombos={archive.combos}
        compact
      />
      <ComboHistory
        combos={archive.combos}
        error={archive.error}
        remove={archive.remove}
        navigate={navigate}
      />
    </div>
  );
}
