import type { Fixture } from '../domain/models';
import { dayRecap, matchRecap } from '../analysis/recap';
import { SectionTitle } from './ui';
export function DayRecap({ fixtures }: { fixtures: Fixture[] }) {
  const r = dayRecap(fixtures);
  if (!r.finished) return null;
  return (
    <section className="recap-section" aria-label="Dagrecap">
      <SectionTitle eyebrow="DE UITSLAGEN" title="Terugblik op deze speeldag" />
      <div className="recap-summary">
        <div>
          <strong>{r.finished}</strong>
          <span>Afgelopen wedstrijden</span>
        </div>
        <div>
          <strong>{r.goals}</strong>
          <span>Goals · {r.scored} bekende eindstanden</span>
        </div>
        {r.markets.map((m) => (
          <div key={m.market}>
            <strong>
              {m.successes}/{m.total}
            </strong>
            <span>{m.market === 'over25' ? 'Over 2.5 goals' : 'Beide teams scoorden'}</span>
          </div>
        ))}
      </div>
      <p className="spotlight-note">
        Feitelijke uitslagen van de gefilterde wedstrijden. Dit is geen rendementsoverzicht of
        beoordeling van eerder opgeslagen tips.
      </p>
    </section>
  );
}
export function MatchRecap({ fixture: f }: { fixture: Fixture }) {
  const rows = matchRecap(f);
  if (!rows.length) return null;
  return (
    <section className="recap-section" aria-label="Wedstrijdrecap">
      <SectionTitle eyebrow="NA HET FLUITSIGNAAL" title="Wat is uitgekomen?" />
      <p className="section-intro">
        Eindstand {f.homeGoals ?? '?'}–{f.awayGoals ?? '?'} · rust {f.halfHomeGoals ?? '?'}–
        {f.halfAwayGoals ?? '?'}. Hieronder zie je welke voorwaarden de uitslag heeft vervuld.
      </p>
      <div className="recap-grid">
        {rows.map((row) => (
          <div key={row.market} className={`recap-outcome ${row.result === true ? 'met' : ''}`}>
            <span>{row.label}</span>
            <strong>
              {row.result === null ? 'Onbekend' : row.result ? 'Uitgekomen' : 'Niet uitgekomen'}
            </strong>
          </div>
        ))}
      </div>
      <p className="spotlight-note">
        Controle achteraf op officiële speelperioden, geen opgeslagen voorspelling of betslip.
        Ontbrekende ruststanden blijven onbekend.
      </p>
      {f.statistics && (
        <div className="player-table-scroll">
          <table className="player-table">
            <thead>
              <tr>
                <th>Statistiek</th>
                <th>{f.home.name}</th>
                <th>{f.away.name}</th>
              </tr>
            </thead>
            <tbody>
              {(
                ['shots', 'shotsOnTarget', 'corners', 'fouls', 'yellowCards', 'redCards'] as const
              ).map((key, i) => (
                <tr key={key}>
                  <th>
                    {
                      [
                        'Schoten',
                        'Schoten op doel',
                        'Corners',
                        'Overtredingen',
                        'Gele kaarten',
                        'Rode kaarten',
                      ][i]
                    }
                  </th>
                  <td>{f.statistics?.home[key] ?? '—'}</td>
                  <td>{f.statistics?.away[key] ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
