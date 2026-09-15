import { useEffect, useState } from 'react';
import { api } from '../api';
import { marketLabels } from '../analysis/engine';
import {
  evaluateProposal,
  historyLabels,
  type ComboResult,
  type SavedCombo,
} from '../domain/combo-history';
export default function ComboHistory({
  combos,
  error,
  remove,
  navigate,
}: {
  combos: SavedCombo[];
  error: string;
  remove: (id: string) => void;
  navigate: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState(new Map<string, ComboResult>());
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState('');
  const [checked, setChecked] = useState('');
  const ids = [...new Set(combos.flatMap((c) => c.legs.map((l) => l.fixtureId)))].sort().join(',');
  useEffect(() => {
    if (!open || !ids) return;
    const controller = new AbortController();
    setLoading(true);
    setFailure('');
    async function refresh() {
      const list = ids.split(',');
      const collected = new Map<string, ComboResult>();
      let checkedAt = '';
      for (let i = 0; i < list.length; i += 50) {
        const response = await api.results(list.slice(i, i + 50), controller.signal);
        response.results.forEach((r) => collected.set(r.id, r));
        checkedAt = response.checkedAt;
      }
      if (!controller.signal.aborted) {
        setResults(collected);
        setChecked(checkedAt);
      }
    }
    refresh()
      .catch((e) => {
        if (!controller.signal.aborted) setFailure(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, ids, attempt]);
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ version: 1, combos }, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'matchday-combihistoriek.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="combo-history" id="combo-history" aria-label="Combihistoriek">
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary>
          Combihistoriek <span>({combos.length} bewaard)</span>
        </summary>
        <p className="section-intro">
          Getoonde voorstellen worden vóór de aftrap automatisch bewaard in deze browser op dit
          toestel. De oorspronkelijke odds en historie blijven vaststaan. Dit is een controle van
          wedstrijdresultaten, geen afrekening door de bookmaker.
        </p>
        {error && <p role="alert">{error}</p>}
        {!combos.length ? (
          <p>
            Nog geen voorstellen bewaard. Eerdere voorstellen kunnen we niet achteraf reconstrueren.
            Demovoorstellen worden niet opgeslagen.
          </p>
        ) : (
          <>
            <div className="market-controls">
              <button
                className="secondary-button"
                disabled={loading}
                onClick={() => setAttempt((n) => n + 1)}
              >
                {loading ? 'Uitslagen laden…' : 'Uitslagen verversen'}
              </button>
              <button className="secondary-button" onClick={download}>
                Historiek exporteren
              </button>
            </div>
            {failure && <p role="alert">{failure} Eerder geladen uitslagen blijven zichtbaar.</p>}
            {checked && (
              <p className="spotlight-note">
                Laatst gecontroleerd: {new Date(checked).toLocaleString('nl-BE')}. Nieuwe uitslagen
                verschijnen na de gegevensupdate.
              </p>
            )}
            <div className="combo-grid">
              {combos.map((combo) => {
                const evaluated = evaluateProposal(combo, results);
                return (
                  <article className="combo-card" key={combo.id}>
                    <div className="combo-heading">
                      <strong>{historyLabels[evaluated.status]}</strong>
                      <span className="combo-total">×{evaluated.decimal.toFixed(2)}</span>
                    </div>
                    <p>
                      {combo.bookmaker} · bewaard {new Date(combo.savedAt).toLocaleString('nl-BE')}
                    </p>
                    <small>
                      Minstens {combo.minimumRate}% in de laatste {combo.window} duels per team
                    </small>
                    <ol>
                      {evaluated.legs.map(({ leg, result, status }) => (
                        <li className="finder-leg" key={leg.fixtureId}>
                          <button
                            className="text-button"
                            onClick={() => navigate(`/match/${leg.fixtureId}`)}
                          >
                            {leg.home} – {leg.away}
                          </button>
                          <small>{new Date(leg.kickoff).toLocaleString('nl-BE')}</small>
                          <div>
                            <strong>{marketLabels[leg.market]}</strong>
                            <strong>{leg.decimal.toFixed(2)}</strong>
                          </div>
                          <small>
                            Historie: {leg.homeHits}/{combo.window} thuisploeg · {leg.awayHits}/
                            {combo.window} uitploeg
                          </small>
                          <small>
                            {historyLabels[status]}
                            {result?.status === 'finished' &&
                              ` · Uitslag ${result.homeGoals ?? '–'}–${result.awayGoals ?? '–'}${leg.market.startsWith('firstHalf') ? ` (rust ${result.halfHomeGoals ?? '–'}–${result.halfAwayGoals ?? '–'})` : ''}`}
                          </small>
                        </li>
                      ))}
                    </ol>
                    <button className="text-button" onClick={() => remove(combo.id)}>
                      Verwijderen uit historiek
                    </button>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </details>
      {!open && error && <p role="alert">{error}</p>}
    </section>
  );
}
