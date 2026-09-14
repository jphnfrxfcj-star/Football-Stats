import { expect, it, vi, afterEach } from 'vitest';
import { normalizeUnibet, unibetMatchOdds } from '../server/providers/unibet';
const now = Date.parse('2026-09-13T10:00:00Z');
const event = {
  id: 1,
  homeName: 'Leeds United',
  awayName: 'Newcastle United',
  start: '2026-09-14T19:00:00Z',
  state: 'NOT_STARTED',
  sport: 'FOOTBALL',
  groupId: 1000094985,
};
const offer = {
  eventId: 1,
  criterion: { id: 1001159926 },
  tags: ['BET_BUILDER'],
  outcomes: [
    {
      id: 2,
      odds: 1350,
      line: 1500,
      type: 'OT_OVER',
      status: 'OPEN',
      changedDate: '2026-09-13T09:00:00Z',
    },
  ],
};
it('maps reviewed Belgian total lines and thousandth odds with identifiers', () => {
  expect(normalizeUnibet({ events: [event], betOffers: [offer] }, now)[0]).toMatchObject({
    home: 'Leeds',
    away: 'Newcastle',
    bookmaker: 'Unibet België',
    market: 'over15',
    decimal: 1.35,
    eventId: '1',
    outcomeId: '2',
    betBuilderEligible: true,
  });
});
it('never treats other periods, team totals, suspended prices or started events as prematch odds', () => {
  for (const changed of [
    { ...offer, criterion: { id: 999 } },
    { ...offer, eventId: 2 },
    { ...offer, outcomes: [{ ...offer.outcomes[0], status: 'SUSPENDED' }] },
    { ...offer, outcomes: [{ ...offer.outcomes[0], line: 2000 }] },
    { ...offer, outcomes: [{ ...offer.outcomes[0], odds: 1000 }] },
  ])
    expect(normalizeUnibet({ events: [event], betOffers: [changed] }, now)).toHaveLength(0);
  for (const changed of [
    { ...event, state: 'STARTED' },
    { ...event, groupId: 2 },
    { ...event, start: '2026-09-12T19:00:00Z' },
    { ...event, homeName: 'Unknown club' },
  ])
    expect(normalizeUnibet({ events: [changed], betOffers: [offer] }, now)).toHaveLength(0);
});
it('maps full-time result and BTTS but does not confuse draw-no-bet with a win', () => {
  const offers = [
    {
      ...offer,
      criterion: { id: 1001159858 },
      outcomes: [{ ...offer.outcomes[0], type: 'OT_ONE' }],
    },
    {
      ...offer,
      criterion: { id: 1001642858 },
      outcomes: [{ ...offer.outcomes[0], type: 'OT_YES' }],
    },
    {
      ...offer,
      criterion: { id: 1001159666 },
      outcomes: [{ ...offer.outcomes[0], type: 'OT_ONE' }],
    },
  ];
  expect(normalizeUnibet({ events: [event], betOffers: offers }, now).map((q) => q.market)).toEqual(
    ['home', 'btts'],
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('loads only the requested event and rejects matching teams on a different date', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const { demoFixtures } = await import('../src/demo/data');
  const fixture = {
    ...demoFixtures('2026-09-14')[0],
    kickoff: event.start,
    home: { ...demoFixtures('2026-09-14')[0].home, name: 'Leeds' },
    away: { ...demoFixtures('2026-09-14')[0].away, name: 'Newcastle' },
  };
  const call = vi
    .fn<typeof fetch>()
    .mockImplementation(
      async (url) =>
        new Response(
          JSON.stringify(
            String(url).includes('listView')
              ? { events: [{ event: { ...event, id: 999, homeName: 'Arsenal' } }, { event }] }
              : { events: [event], betOffers: [offer] },
          ),
        ),
    );
  vi.stubGlobal('fetch', call);
  const service = {
    cached: async (_key: string, _ttl: number, loader: () => Promise<unknown>) => loader(),
  };
  const report = await unibetMatchOdds(service as never, fixture);
  expect(report.quotes).toHaveLength(1);
  expect(call).toHaveBeenCalledTimes(2);
  expect(String(call.mock.calls[1][0])).toContain('/event/1.json');
  call.mockClear();
  expect(
    (await unibetMatchOdds(service as never, { ...fixture, kickoff: '2026-09-15T19:00:00Z' }))
      .quotes,
  ).toHaveLength(0);
  expect(call).toHaveBeenCalledTimes(1);
});
