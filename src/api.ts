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
async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(`/api/${path}`, { signal });
  if (!r.ok) {
    const body = await r.json().catch(() => ({ error: 'Kon gegevens niet laden' }));
    throw new Error(body.error ?? 'Kon gegevens niet laden');
  }
  return r.json();
}
export const api = {
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
