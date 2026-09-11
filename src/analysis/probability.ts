import type { MatchData } from '../domain/models';
import { before } from '../domain/models';
import { analyze, marketLabels, type Market } from './engine';
import { analysisWeights as w } from './config';
export interface Probability {
  key: string;
  label: string;
  value: number | null;
  confidence: 'Onvoldoende' | 'Laag' | 'Gemiddeld';
  factors: string[];
  sampleSize: number;
}
const confidence = (n: number): Probability['confidence'] =>
  n < 5 ? 'Onvoldoende' : n < 25 ? 'Laag' : 'Gemiddeld';
function goalRate(data: MatchData, side: 'home' | 'away', conceded: boolean) {
  const team = data.fixture[side];
  const history = before(
    side === 'home' ? data.homeHistory : data.awayHistory,
    data.fixture.kickoff,
  )
    .filter((f) => f.home.id === team.id || f.away.id === team.id)
    .slice(0, 20);
  let sum = 0,
    total = 0;
  history.forEach((f, i) => {
    const home = f.home.id === team.id;
    const goal = conceded ? (home ? f.awayGoals : f.homeGoals) : home ? f.homeGoals : f.awayGoals;
    if (goal !== null) {
      const weight =
        (i < 5 ? w.recent5 : i < 10 ? w.recent10 : w.recent20) *
        (f[side].id === team.id ? w.homeAway : 1);
      sum += goal * weight;
      total += weight;
    }
  });
  return total ? sum / total : null;
}
function poisson(lambda: number, k: number) {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}
export function probabilities(data: MatchData, analysis = analyze(data)): Probability[] {
  const rates = [
    goalRate(data, 'home', false),
    goalRate(data, 'home', true),
    goalRate(data, 'away', false),
    goalRate(data, 'away', true),
  ];
  const n = Math.min(analysis.home[2].available, analysis.away[2].available);
  let outcomes: number[] | null = null;
  let explanation = 'Onvoldoende historische goals voor een Poisson-model.';
  if (rates.every((r): r is number => r !== null) && n >= 3) {
    const homeLambda = Math.sqrt(rates[0]! * rates[3]!),
      awayLambda = Math.sqrt(rates[2]! * rates[1]!);
    outcomes = [0, 0, 0];
    for (let h = 0; h <= 30; h++)
      for (let a = 0; a <= 30; a++)
        outcomes[h > a ? 0 : h === a ? 1 : 2] += poisson(homeLambda, h) * poisson(awayLambda, a);
    const total = outcomes.reduce((a, b) => a + b, 0);
    outcomes = outcomes.map((v) => (v / total) * 100);
    explanation = `Poisson met gewogen aanval × verdediging (geometrisch gemiddelde): λ thuis ${homeLambda.toFixed(2)}, λ uit ${awayLambda.toFixed(2)}. Geen odds of externe predictions.`;
  }
  const result: Probability[] = ['Thuis wint', 'Gelijkspel', 'Uit wint'].map((label, i) => ({
    key: ['home', 'draw', 'away'][i],
    label,
    value: outcomes?.[i] ?? null,
    confidence: confidence(n),
    sampleSize: n,
    factors: [explanation, `${n} recente wedstrijden per team beschikbaar (kleinste steekproef).`],
  }));
  for (const m of ['over15', 'over25', 'over35', 'btts'] as Market[]) {
    const c = analysis.combined[m];
    const h = analysis.home[1].markets[m],
      a = analysis.away[1].markets[m],
      hs = analysis.homeSplit[1].markets[m],
      as = analysis.awaySplit[1].markets[m],
      head = analysis.h2h[1].markets[m];
    result.push({
      key: m,
      label: marketLabels[m],
      value: c.probability,
      confidence: confidence(c.sampleSize),
      sampleSize: c.sampleSize,
      factors: [
        `${data.fixture.home.name}: ${h.successes}/${h.total} recent.`,
        `${data.fixture.away.name}: ${a.successes}/${a.total} recent.`,
        `Thuis/uit: ${hs.successes + as.successes}/${hs.total + as.total}; H2H: ${head.successes}/${head.total}.`,
        `Gewogen frequentie met Beta(${w.priorSuccesses},${w.priorFailures})-prior; ${c.sampleSize} unieke duels. Oude H2H telt minder zwaar.`,
      ],
    });
  }
  return result;
}
