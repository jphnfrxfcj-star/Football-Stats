import type { Fixture } from '../../src/domain/models';
/** A missing/delayed source response must not erase an already stored final score. */
export function preserveResult(incoming: Fixture, stored: Fixture | undefined): Fixture {
  if (
    stored &&
    stored.id === incoming.id &&
    stored.home.id === incoming.home.id &&
    stored.away.id === incoming.away.id &&
    stored.status === 'finished' &&
    incoming.status === 'finished' &&
    stored.homeGoals !== null &&
    stored.awayGoals !== null &&
    stored.homeGoals === incoming.homeGoals &&
    stored.awayGoals === incoming.awayGoals
  ) {
    return {
      ...incoming,
      statistics: incoming.statistics ?? stored.statistics,
      halfHomeGoals: incoming.halfHomeGoals ?? stored.halfHomeGoals,
      halfAwayGoals: incoming.halfAwayGoals ?? stored.halfAwayGoals,
      provenance:
        incoming.provenance && stored.provenance
          ? {
              ...incoming.provenance,
              sources: [
                ...new Map(
                  [...stored.provenance.sources, ...incoming.provenance.sources].map((s) => [
                    s.name + s.url,
                    s,
                  ]),
                ).values(),
              ],
              fields: {
                ...stored.provenance.fields,
                ...incoming.provenance.fields,
                ...(!incoming.statistics && stored.statistics
                  ? { statistics: stored.provenance.fields.statistics }
                  : {}),
                ...(incoming.halfHomeGoals === null && stored.halfHomeGoals !== null
                  ? { halfTime: stored.provenance.fields.halfTime }
                  : {}),
              },
            }
          : (incoming.provenance ?? stored.provenance),
    };
  }
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
    availability: incoming.availability ?? stored.availability,
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
