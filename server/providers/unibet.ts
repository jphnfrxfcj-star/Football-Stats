import { z } from 'zod';
import { canonicalClubName } from '../../src/domain/club-names';
import type { OddsQuote, OddsSnapshot } from '../../src/domain/spotlight';
import type { FootballService } from '../service';
import type { Fixture } from '../../src/domain/models';
const root = 'https://eu.offering-api.kambicdn.com/offering/v2018/ubbe/';
const eventSchema = z.object({
  id: z.number().int(),
  homeName: z.string(),
  awayName: z.string(),
  start: z.string().datetime(),
  state: z.string(),
  sport: z.string(),
  groupId: z.number(),
});
const offerSchema = z.object({
  eventId: z.number(),
  criterion: z.object({ id: z.number() }),
  tags: z.array(z.string()).optional(),
  outcomes: z.array(
    z.object({
      id: z.number(),
      odds: z.number().optional(),
      line: z.number().optional(),
      type: z.string(),
      status: z.string(),
      changedDate: z.string().datetime().optional(),
    }),
  ),
});
export function normalizeUnibet(raw: unknown, now = Date.now()): OddsQuote[] {
  const body = z
    .object({ events: z.array(eventSchema), betOffers: z.array(offerSchema) })
    .parse(raw);
  const quotes: OddsQuote[] = [];
  for (const event of body.events) {
    if (
      event.sport !== 'FOOTBALL' ||
      ![1000094985, 1000095049].includes(event.groupId) ||
      event.state !== 'NOT_STARTED' ||
      Date.parse(event.start) <= now
    )
      continue;
    const home = canonicalClubName(event.homeName),
      away = canonicalClubName(event.awayName);
    if (!home || !away) continue;
    for (const offer of body.betOffers.filter((o) => o.eventId === event.id))
      for (const o of offer.outcomes) {
        if (o.status !== 'OPEN' || !Number.isFinite(o.odds) || o.odds! <= 1000) continue;
        let market: string | undefined;
        // Reviewed Belgian criterion IDs: never map card/corner/team/half markets by a loose label.
        if (offer.criterion.id === 1001159858)
          market = ({ OT_ONE: 'home', OT_CROSS: 'draw', OT_TWO: 'away' } as Record<string, string>)[
            o.type
          ];
        if (offer.criterion.id === 1001159926) {
          if (o.type === 'OT_OVER')
            market = (
              { 500: 'over05', 1500: 'over15', 2500: 'over25', 3500: 'over35' } as Record<
                number,
                string
              >
            )[o.line ?? -1];
          if (o.type === 'OT_UNDER' && o.line === 2500) market = 'under25';
        }
        if (offer.criterion.id === 1001642858 && o.type === 'OT_YES') market = 'btts';
        if (!market) continue;
        quotes.push({
          home,
          away,
          date: event.start.slice(0, 10),
          kickoff: event.start,
          market,
          bookmaker: 'Unibet België',
          decimal: o.odds! / 1000,
          updatedAt: o.changedDate ?? null,
          eventId: String(event.id),
          outcomeId: String(o.id),
          betBuilderEligible: offer.tags?.includes('BET_BUILDER') ?? false,
        });
      }
  }
  return quotes;
}
async function read(path: string) {
  const r = await fetch(`${root}${path}?lang=en_GB&market=BE`, {
    signal: AbortSignal.timeout(6000),
  });
  if (!r.ok) throw new Error('Unibet feed unavailable');
  const text = await r.text();
  if (text.length > 5000000) throw new Error('Unibet response too large');
  return JSON.parse(text) as unknown;
}
export async function unibetOdds(service: FootballService): Promise<OddsSnapshot> {
  return service.cached('odds:unibet-be:v2', 300, async () => {
    const now = Date.now();
    const lists = await Promise.allSettled(
      ['football/england/premier_league', 'football/spain/la_liga'].map((path) =>
        read(`listView/${path}/all/matches.json`).then((raw) =>
          z.object({ events: z.array(z.object({ event: eventSchema })) }).parse(raw),
        ),
      ),
    );
    const events = lists.flatMap((result) =>
      result.status === 'fulfilled' ? result.value.events : [],
    );
    if (lists.every((r) => r.status === 'rejected')) throw new Error('Unibet leagues unavailable');
    const list = { events };
    const upcoming = list.events
      .map((e) => e.event)
      .filter(
        (e) =>
          e.state === 'NOT_STARTED' &&
          Date.parse(e.start) > now &&
          Date.parse(e.start) < now + 8 * 86400000,
      )
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
      .slice(0, 24);
    const quotes: OddsQuote[] = [];
    let failed = 0;
    for (let i = 0; i < upcoming.length; i += 3) {
      const batch = await Promise.allSettled(
        upcoming
          .slice(i, i + 3)
          .map((e) =>
            service.cached(`odds:unibet-be:event:v2:${e.id}`, 300, async () =>
              normalizeUnibet(await read(`betoffer/event/${e.id}.json`)),
            ),
          ),
      );
      for (const result of batch)
        if (result.status === 'fulfilled') quotes.push(...result.value);
        else failed++;
    }
    if (upcoming.length && failed === upcoming.length) throw new Error('Unibet events unavailable');
    return {
      source: 'Unibet België · openbare sportsbookfeed',
      kind: 'feed',
      fetchedAt: new Date().toISOString(),
      quotes,
      message: `Unibet België: beschikbare pre-matchprijzen voor de komende acht dagen, maximaal elke vijf minuten opgehaald. Quoteringstijdstip is de laatste prijswijziging. Geen automatische betbuilderprijs.${failed ? ' Sommige wedstrijden konden niet worden opgehaald.' : ''}`,
    };
  });
}

/** Fetch only the opened match; unrelated event failures must not remove its odds. */
export async function unibetMatchOdds(
  service: FootballService,
  fixture: Fixture,
): Promise<OddsSnapshot> {
  const spanish = fixture.league.refs.some((r) => r.externalId === 'SP1' || r.externalId === '140');
  const path = spanish ? 'football/spain/la_liga' : 'football/england/premier_league';
  const events = await service.cached(
    `odds:unibet-be:list:v1:${path}`,
    300,
    async () =>
      z
        .object({ events: z.array(z.object({ event: eventSchema })) })
        .parse(await read(`listView/${path}/all/matches.json`)).events,
  );
  const event = events
    .map((e) => e.event)
    .find(
      (e) =>
        e.state === 'NOT_STARTED' &&
        Date.parse(e.start) > Date.now() &&
        canonicalClubName(e.homeName) === canonicalClubName(fixture.home.name) &&
        canonicalClubName(e.awayName) === canonicalClubName(fixture.away.name) &&
        Math.abs(Date.parse(e.start) - Date.parse(fixture.kickoff)) <= 60000,
    );
  const quotes = event
    ? await service.cached(`odds:unibet-be:event:v2:${event.id}`, 300, async () =>
        normalizeUnibet(await read(`betoffer/event/${event.id}.json`)),
      )
    : [];
  return {
    source: 'Unibet België · openbare sportsbookfeed',
    kind: 'feed',
    fetchedAt: new Date().toISOString(),
    quotes,
    message: event
      ? 'Beschikbare Unibet-prijzen voor deze wedstrijd, maximaal elke vijf minuten opgehaald. De bookmaker bevestigt de actuele prijs.'
      : 'Unibet levert momenteel geen gekoppelde pre-matchprijzen voor deze wedstrijd.',
  };
}
