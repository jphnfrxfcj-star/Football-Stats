import { useCallback, useState } from 'react';
import { isDemo } from '../api';
import { readHistory, type SavedCombo } from '../domain/combo-history';
const key = `matchday:combo-history:v1${isDemo ? ':demo' : ''}`;
export function useComboHistory() {
  const [state, setState] = useState(() => {
    try {
      return { combos: readHistory(localStorage.getItem(key)), error: '' };
    } catch {
      return {
        combos: [] as SavedCombo[],
        error:
          'De historiek kon niet worden gelezen. Nieuwe voorstellen worden niet opgeslagen om bestaande gegevens te beschermen.',
      };
    }
  });
  const [storageError, setStorageError] = useState('');
  const add = useCallback((proposals: SavedCombo[]) => {
    if (!proposals.length) return;
    try {
      const current = readHistory(localStorage.getItem(key));
      const ids = new Set(current.map((c) => c.id));
      const fresh = proposals.filter((c) => {
        if (ids.has(c.id)) return false;
        ids.add(c.id);
        return true;
      });
      if (!fresh.length) return;
      if (current.length + fresh.length > 200) {
        setStorageError(
          'De historiek is vol (200 voorstellen). Exporteer ze en verwijder enkele voorstellen om nieuwe te bewaren.',
        );
        return;
      }
      const combos = [...fresh, ...current];
      localStorage.setItem(key, JSON.stringify({ version: 1, combos }));
      setState({ combos, error: '' });
      setStorageError('');
    } catch {
      setStorageError('Bewaren is niet gelukt. Controleer of browseropslag beschikbaar is.');
    }
  }, []);
  const remove = useCallback((id: string) => {
    try {
      const combos = readHistory(localStorage.getItem(key)).filter((c) => c.id !== id);
      localStorage.setItem(key, JSON.stringify({ version: 1, combos }));
      setState({ combos, error: '' });
      setStorageError('');
    } catch {
      setStorageError('Verwijderen is niet gelukt.');
    }
  }, []);
  return { combos: state.combos, error: state.error || storageError, add, remove };
}
