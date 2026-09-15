import { t } from '../i18n';
import type { Fixture } from '../domain/models';
import { dayRecap, matchRecap } from '../analysis/recap';
import { SectionTitle } from './ui';
export function DayRecap({ fixtures }: { fixtures: Fixture[] }) {
  const r = dayRecap(fixtures);
  if (!r.finished) return null;
  return (
    <section className="recap-section" aria-label={t('Dagrecap')}>
      <SectionTitle eyebrow={t('DE UITSLAGEN')} title={t('Terugblik op deze speeldag')} />
      <div className="recap-summary">
        <div>
          <strong>{t(r.finished)}</strong>
          <span>{t('Afgelopen wedstrijden')}</span>
        </div>
        <div>
          <strong>{t(r.goals)}</strong>
          <span>
            {t('Goals · ')}
            {t(r.scored)}
            {t(' bekende eindstanden')}
          </span>
        </div>
        {r.markets.map((m) => (
          <div key={m.market}>
            <strong>
              {t(m.successes)}
              {'/'}
              {t(m.total)}
            </strong>
            <span>{t(m.market === 'over25' ? 'Over 2.5 goals' : 'Beide teams scoorden')}</span>
          </div>
        ))}
      </div>
      <p className="spotlight-note">
        {t(
          'Feitelijke uitslagen van de gefilterde wedstrijden. Dit is geen rendementsoverzicht of beoordeling van eerder opgeslagen tips.',
        )}
      </p>
    </section>
  );
}
export function MatchRecap({ fixture: f }: { fixture: Fixture }) {
  const rows = matchRecap(f);
  if (!rows.length) return null;
  return (
    <section className="recap-section" aria-label={t('Wedstrijdrecap')}>
      <SectionTitle eyebrow={t('NA HET FLUITSIGNAAL')} title={t('Wat is uitgekomen?')} />
      <p className="section-intro">
        {t('Eindstand ')}
        {t(f.homeGoals ?? '?')}
        {'–'}
        {t(f.awayGoals ?? '?')}
        {t(' · rust ')}
        {t(f.halfHomeGoals ?? '?')}
        {'–'}
        {t(f.halfAwayGoals ?? '?')}
        {t('. Hieronder zie je welke voorwaarden de uitslag heeft vervuld.')}
      </p>
      <div className="recap-grid">
        {rows.map((row) => (
          <div key={row.market} className={`recap-outcome ${row.result === true ? 'met' : ''}`}>
            <span>{t(row.label)}</span>
            <strong>
              {t(row.result === null ? 'Onbekend' : row.result ? 'Uitgekomen' : 'Niet uitgekomen')}
            </strong>
          </div>
        ))}
      </div>
      <p className="spotlight-note">
        {t(
          'Controle achteraf op officiële speelperioden, geen opgeslagen voorspelling of betslip. Ontbrekende ruststanden blijven onbekend.',
        )}
      </p>
      {f.statistics && (
        <div className="player-table-scroll">
          <table className="player-table">
            <thead>
              <tr>
                <th>{t('Statistiek')}</th>
                <th>{t(f.home.name)}</th>
                <th>{t(f.away.name)}</th>
              </tr>
            </thead>
            <tbody>
              {(
                ['shots', 'shotsOnTarget', 'corners', 'fouls', 'yellowCards', 'redCards'] as const
              ).map((key, i) => (
                <tr key={key}>
                  <th>
                    {t(
                      [
                        'Schoten',
                        'Schoten op doel',
                        'Corners',
                        'Overtredingen',
                        'Gele kaarten',
                        'Rode kaarten',
                      ][i],
                    )}
                  </th>
                  <td>{t(f.statistics?.home[key] ?? '—')}</td>
                  <td>{t(f.statistics?.away[key] ?? '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
