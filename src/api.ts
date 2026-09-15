import type { ComboResult } from './domain/combo-history';
import { buildMarkets, type MarketsReport } from './analysis/combinations';
import { getJson as get } from './lib/http';
import type { PlayerReport } from './domain/players';
import type { SpotlightReport, OddsSnapshot } from './domain/spotlight';
import { buildSpotlight } from './analysis/spotlight';
import { demoFixtures, demoLeague, demoMatch } from './demo/data';
import type { Fixture, League, MatchData } from './domain/models';
import { analyze, type Analysis } from './analysis/engine';
import { probabilities, type Probability } from './analysis/probability';
// An unconfigured first deployment is explicitly a demo; false opts into live mode.
export const isDemo = import.meta.env.VITE_DEMO_MODE !== 'false';
export interface AnalysisResponse {
  data: MatchData;
  analysis: Analysis;
  probabilities: Probability[];
}
export const api = {
  results: (
    ids: string[],
    signal?: AbortSignal,
  ): Promise<{ checkedAt: string; results: ComboResult[] }> =>
    isDemo
      ? Promise.resolve({
          checkedAt: new Date().toISOString(),
          results: ids.flatMap((id) => {
            const d = demoMatch(id);
            return d ? [d.fixture] : [];
          }),
        })
      : get(`results?ids=${ids.map(encodeURIComponent).join(',')}`, signal),
  programOdds: (date: string, signal?: AbortSignal): Promise<OddsSnapshot> =>
    isDemo
      ? Promise.resolve({
          source: 'Demo',
          kind: 'snapshot',
          fetchedAt: new Date().toISOString(),
          quotes: [],
          message: 'Geen bookmakerprijzen in de demo.',
        })
      : get(`odds?date=${date}`, signal),
  markets: (
    date: string,
    window: number,
    signal?: AbortSignal,
    days = 1,
    minimumRate = 100,
  ): Promise<MarketsReport> =>
    isDemo
      ? Promise.resolve(
          buildMarkets(
            Array.from({ length: days }, (_, i) =>
              new Date(Date.parse(date) + i * 86400000).toISOString().slice(0, 10),
            ).flatMap((day) => demoFixtures(day).map((f) => ({ ...demoMatch(f.id)!, fixture: f }))),
            {
              source: 'Demo',
              kind: 'snapshot',
              fetchedAt: new Date().toISOString(),
              quotes: [],
              message: 'Fictieve wedstrijdhistorie. De demo bevat geen bookmakerodds.',
            },
            window,
            Date.parse(`${date}T00:00:00Z`),
            minimumRate,
          ),
        )
      : get(
          `markets?date=${date}&window=${window}&days=${days}&minimumRate=${minimumRate}`,
          signal,
        ),
  odds: (id: string, signal?: AbortSignal): Promise<OddsSnapshot> =>
    isDemo
      ? Promise.resolve({
          source: 'Demo',
          kind: 'snapshot',
          fetchedAt: new Date().toISOString(),
          quotes: [],
          message: 'De demo bevat geen bookmakerodds.',
        })
      : get(`match/${encodeURIComponent(id)}/odds`, signal),
  players: (id: string, signal?: AbortSignal): Promise<PlayerReport> =>
    isDemo
      ? Promise.resolve({
          source: 'Demo',
          fetchedAt: new Date().toISOString(),
          teams: [],
          matches: [],
          warnings: [
            'Spelergegevens zijn beschikbaar bij echte wedstrijden; de demo bevat geen verzonnen spelers.',
          ],
        })
      : get(`match/${encodeURIComponent(id)}/players`, signal),
  spotlight: (date: string, signal?: AbortSignal): Promise<SpotlightReport> => {
    if (!isDemo) return get(`spotlight?date=${date}`, signal);
    const matches = demoFixtures(date).map((fixture) => {
      const data = demoMatch(fixture.id)!,
        analysis = analyze(data);
      return {
        fixture,
        probabilities: probabilities(data, analysis),
        homeSamples: analysis.home[2].available,
        awaySamples: analysis.away[2].available,
      };
    });
    return Promise.resolve(
      buildSpotlight(
        matches,
        {
          source: 'Demo',
          kind: 'snapshot',
          fetchedAt: new Date().toISOString(),
          quotes: [],
          message: 'Voorbeeld van modelkansen op fictieve wedstrijden. Geen bookmakerodds.',
        },
        Date.parse(`${date}T00:00:00Z`),
      ),
    );
  },
  fixtures: (date: string, signal?: AbortSignal): Promise<Fixture[]> =>
    isDemo ? Promise.resolve(demoFixtures(date)) : get(`fixtures?date=${date}`, signal),
  leagues: (signal?: AbortSignal): Promise<League[]> =>
    isDemo ? Promise.resolve([demoLeague]) : get('leagues', signal),
  analysis: (id: string, signal?: AbortSignal): Promise<AnalysisResponse> => {
    if (!isDemo) return get(`match/${encodeURIComponent(id)}/analysis`, signal);
    const data = demoMatch(id);
    return data
      ? Promise.resolve({ data, analysis: analyze(data), probabilities: probabilities(data) })
      : Promise.reject(new Error('Wedstrijd niet gevonden'));
  },
};
