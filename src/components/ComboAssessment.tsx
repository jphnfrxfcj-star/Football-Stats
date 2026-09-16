import { t, tr, locale } from '../i18n';
import { assessComboPrice, type ComboPriceStatus } from '../analysis/combo-assessment';
import type { PerfectSelection } from '../analysis/combinations';
import type { OddsQuote } from '../domain/spotlight';
export const comboPriceLabels: Record<ComboPriceStatus, string> = {
  passes: 'Voldoet aan de prijscontrole; geen bewezen voordeel.',
  'insufficient-history': 'Onvoldoende historie voor de prijscontrole.',
  'unverified-price': 'Geen recente, controleerbare feedprijs.',
  'insufficient-margin': 'Te weinig modelmarge tegenover deze odd.',
};
export default function ComboAssessment({
  selection,
  quote,
  now,
}: {
  selection: PerfectSelection;
  quote: OddsQuote;
  now: number;
}) {
  const assessment = assessComboPrice(selection, quote, now);
  const model = selection.model;
  const percentage = (p: number | null | undefined) =>
    p == null ? t('onbekend') : `${p.toFixed(1)}%`;
  return (
    <div className="combo-assessment">
      <small>{t(comboPriceLabels[assessment.status])}</small>
      <small>
        {tr('Gewogen model: {0} · goalsmodel: {1} · break-even: {2}', [
          percentage(model?.weightedProbability),
          percentage(model?.goalsProbability),
          percentage(assessment.implied),
        ])}
      </small>
      {quote.observedAt && (
        <small>
          {tr('Prijs waargenomen: {0}', [new Date(quote.observedAt).toLocaleString(locale())])}
        </small>
      )}
      {model && (
        <details>
          <summary>{t('Bekijk de uitgebreidere beoordeling')}</summary>
          <p>
            {tr(
              'Laatste 10: {0}/{1} thuisploeg · {2}/{3} uitploeg. Thuisreeks: {4}/{5} · uitreeks: {6}/{7}. H2H: {8}/{9}.',
              [
                model.homeRecent.successes,
                model.homeRecent.total,
                model.awayRecent.successes,
                model.awayRecent.total,
                model.homeVenue.successes,
                model.homeVenue.total,
                model.awayVenue.successes,
                model.awayVenue.total,
                model.h2h.successes,
                model.h2h.total,
              ],
            )}
          </p>
          <p>
            {tr(
              'Trend thuisploeg: {0}/{1} in de laatste 5, tegenover {2}/{3} daarvoor. Trend uitploeg: {4}/{5}, tegenover {6}/{7} daarvoor.',
              [
                model.homeLast5.successes,
                model.homeLast5.total,
                model.homePrevious5.successes,
                model.homePrevious5.total,
                model.awayLast5.successes,
                model.awayLast5.total,
                model.awayPrevious5.successes,
                model.awayPrevious5.total,
              ],
            )}
          </p>
          {model.h2hResults.length > 0 && (
            <p>
              {t('H2H van nieuw naar oud:')}{' '}
              {model.h2hResults
                .map(
                  (r) =>
                    `${r.date.slice(0, 10)}: ${t(r.hit === null ? 'onbekend' : r.hit ? 'wel uitgekomen' : 'niet uitgekomen')}`,
                )
                .join(' · ')}
            </p>
          )}
          <p>
            {t(
              'De reeksen overlappen en worden niet opgeteld. Het gewogen model telt ieder duel één keer, weegt recente duels en thuis/uit mee en geeft H2H minder gewicht, dat elke 365 dagen halveert. Het goalsmodel combineert aanval en verdediging. Beide schattingen zijn ongekalibreerd. Transfers, blessures en opstellingen zijn niet als afzonderlijke gegevens opgenomen.',
            )}
          </p>
        </details>
      )}
    </div>
  );
}
