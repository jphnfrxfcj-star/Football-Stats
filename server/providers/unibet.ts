import { z } from 'zod';
import { canonicalClubName } from '../../src/domain/club-names';
import type { OddsQuote, OddsSnapshot } from '../../src/domain/spotlight';
import type { FootballService } from '../service';
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
      event.groupId !== 1000094985 ||
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
  return service.cached('odds:unibet-be:v1', 300, async () => {
    const now = Date.now();
    const list = z
      .object({ events: z.array(z.object({ event: eventSchema })) })
      .parse(await read('listView/football/england/premier_league/all/matches.json'));
    const upcoming = list.events
      .map((e) => e.event)
      .filter(
        (e) =>
          e.state === 'NOT_STARTED' &&
          Date.parse(e.start) > now &&
          Date.parse(e.start) < now + 8 * 86400000,
      )
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
      .slice(0, 12);
    const quotes: OddsQuote[] = [];
    let failed = 0;
    for (let i = 0; i < upcoming.length; i += 3) {
      const batch = await Promise.allSettled(
        upcoming
          .slice(i, i + 3)
          .map((e) =>
            service.cached(`odds:unibet-be:event:v1:${e.id}`, 300, async () =>
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
