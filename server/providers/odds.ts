import { unibetOdds } from './unibet';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { canonicalClubName } from '../../src/domain/club-names';
import type { OddsSnapshot, OddsQuote } from '../../src/domain/spotlight';
import { downloadSource, type SourceDocument } from './free-football';
import { ServiceError } from '../errors';
import type { FootballService } from '../service';
export function csvOdds(doc: SourceDocument): OddsSnapshot {
  const rows = parse(doc.text, { bom: true, columns: true, skip_empty_lines: true }) as Record<
    string,
    string
  >[];
  const quotes: OddsQuote[] = [];
  const books = {
    B365: 'bet365',
    BFD: 'Betfred',
    BV: 'BetVictor',
    BW: 'bwin',
    PP: 'Paddy Power',
    SKB: 'Sky Bet',
  };
  for (const row of rows) {
    if (row.Div !== 'E0') continue;
    const home = canonicalClubName(row.HomeTeam ?? ''),
      away = canonicalClubName(row.AwayTeam ?? '');
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(row.Date ?? '');
    if (!home || !away || !match) continue;
    const date = `${match[3]}-${match[2]}-${match[1]}`;
    for (const [prefix, bookmaker] of Object.entries(books)) {
      for (const [suffix, market] of [
        ['H', 'home'],
        ['D', 'draw'],
        ['A', 'away'],
        ['>2.5', 'over25'],
        ['<2.5', 'under25'],
      ]) {
        const decimal = Number(row[prefix + suffix]);
        if (Number.isFinite(decimal) && decimal > 1)
          quotes.push({
            home,
            away,
            date,
            kickoff: null,
            market,
            bookmaker,
            decimal,
            updatedAt: null,
          });
      }
    }
  }
  return {
    source: 'Football-Data.co.uk',
    kind: 'snapshot',
    fetchedAt: doc.fetchedAt,
    quotes,
    message:
      'Periodieke bookmakerodds uit het bronbestand. Het oorspronkelijke quoteringstijdstip is onbekend; dit zijn geen liveodds of bevestigde actuele deals.',
  };
}
const outcome = z.object({
  name: z.string(),
  price: z.number().finite().gt(1),
  point: z.number().optional(),
});
const feed = z.array(
  z.object({
    home_team: z.string(),
    away_team: z.string(),
    commence_time: z.string().datetime(),
    bookmakers: z.array(
      z.object({
        key: z.string(),
        title: z.string(),
        last_update: z.string().datetime().optional(),
        markets: z.array(
          z.object({
            key: z.string(),
            last_update: z.string().datetime().optional(),
            outcomes: z.array(outcome),
          }),
        ),
      }),
    ),
  }),
);
export function normalizeOdds(raw: unknown, now = new Date().toISOString()): OddsSnapshot {
  const quotes: OddsQuote[] = [];
  for (const event of feed.parse(raw)) {
    const home = canonicalClubName(event.home_team),
      away = canonicalClubName(event.away_team);
    if (!home || !away) continue;
    for (const book of event.bookmakers.filter(
      (b) => !b.key.includes('_ex_') && !['matchbook', 'smarkets'].includes(b.key),
    ))
      for (const market of book.markets)
        for (const o of market.outcomes) {
          const key =
            market.key === 'h2h'
              ? o.name === event.home_team
                ? 'home'
                : o.name === event.away_team
                  ? 'away'
                  : o.name === 'Draw'
                    ? 'draw'
                    : null
              : market.key === 'totals' && o.point === 2.5
                ? o.name === 'Over'
                  ? 'over25'
                  : o.name === 'Under'
                    ? 'under25'
                    : null
                : null;
          if (key)
            quotes.push({
              home,
              away,
              date: event.commence_time.slice(0, 10),
              kickoff: event.commence_time,
              market: key,
              bookmaker: book.title,
              decimal: o.price,
              updatedAt: market.last_update ?? book.last_update ?? null,
            });
        }
  }
  return {
    source: 'The Odds API',
    kind: 'feed',
    fetchedAt: now,
    quotes,
    message:
      'Bookmakerfeed wordt op aanvraag ververst en gedeeld gecacht. Alleen quoteringen van maximaal 15 minuten oud tellen als mogelijke value. Beschikbaarheid verschilt per bookmaker en regio.',
  };
}
async function comparisonOdds(service: FootballService): Promise<OddsSnapshot> {
  const key = process.env.ODDS_API_KEY?.trim();
  if (!key)
    return service.cached('odds:football-data:v2', 3600, async () =>
      csvOdds(await downloadSource('https://www.football-data.co.uk/fixtures.csv')),
    );
  const region = z.enum(['eu', 'uk', 'us', 'au']).parse(process.env.ODDS_REGION ?? 'eu');
  // One region and one market costs one credit per refresh. Default fits the 500-credit free tier.
  const ttl = z.coerce
    .number()
    .int()
    .min(60)
    .max(86400)
    .parse(process.env.ODDS_CACHE_SECONDS ?? '7200');
  return service.cached(`odds:the-odds-api:v1:${region}:${ttl}`, ttl, async () => {
    const url = new URL('https://api.the-odds-api.com/v4/sports/soccer_epl/odds');
    url.search = new URLSearchParams({
      apiKey: key,
      regions: region,
      markets: 'h2h',
      oddsFormat: 'decimal',
    }).toString();
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!r.ok) throw new Error('Odds provider unavailable');
      return normalizeOdds(await r.json());
    } catch {
      throw new ServiceError(
        'ODDS_UNAVAILABLE',
        'De bookmakerfeed is tijdelijk niet beschikbaar of het quotum is bereikt.',
      );
    }
  });
}

export async function getOdds(service: FootballService): Promise<OddsSnapshot> {
  const [unibet, comparison] = await Promise.allSettled([
    unibetOdds(service),
    comparisonOdds(service),
  ]);
  if (unibet.status === 'fulfilled')
    return {
      ...unibet.value,
      quotes: [
        ...unibet.value.quotes,
        ...(comparison.status === 'fulfilled' ? comparison.value.quotes : []),
      ],
      source: `${unibet.value.source}${comparison.status === 'fulfilled' ? ` + ${comparison.value.source}` : ''}`,
      message: `${unibet.value.message} Andere bookmakers zijn vergelijkingsprijzen; CSV-prijzen zijn momentopnames met onbekend quoteringstijdstip.`,
    };
  if (comparison.status === 'fulfilled')
    return {
      ...comparison.value,
      message: `Unibet België is tijdelijk niet beschikbaar. ${comparison.value.message}`,
    };
  throw new ServiceError('ODDS_UNAVAILABLE', 'Bookmakerodds zijn tijdelijk niet beschikbaar.');
}
