import type { Fixture } from '../../src/domain/models';
/** A missing/delayed source response must not erase an already stored final score. */
export function preserveResult(incoming: Fixture, stored: Fixture | undefined): Fixture {
  if (
    !stored ||
    stored.status !== 'finished' ||
    stored.homeGoals === null ||
    stored.awayGoals === null ||
    stored.id !== incoming.id ||
    stored.home.id !== incoming.home.id ||
    stored.away.id !== incoming.away.id ||
    (incoming.status === 'finished' && incoming.homeGoals !== null && incoming.awayGoals !== null)
  )
    return incoming;
  return {
    ...stored,
    home: incoming.home,
    away: incoming.away,
    league: incoming.league,
    refs: [
      ...new Map(
        [...stored.refs, ...incoming.refs].map((r) => [`${r.provider}:${r.externalId}`, r]),
      ).values(),
    ],
  };
}
