export const analysisWeights = {
  recent5: 1,
  recent10: 0.75,
  recent20: 0.45,
  homeAway: 1.1,
  h2hRecent: 0.35,
  h2hHalfLifeDays: 365,
  priorSuccesses: 1,
  priorFailures: 1,
  version: '1.1.0',
};

/** H2H is a small contextual signal, with continuous decay rather than a two-year cliff. */
export function h2hWeight(kickoff: string, historicalKickoff: string) {
  const days = Math.max(0, (Date.parse(kickoff) - Date.parse(historicalKickoff)) / 86400000);
  return analysisWeights.h2hRecent * Math.pow(0.5, days / analysisWeights.h2hHalfLifeDays);
}
