/** Check real 2026-27 schedules, five CSV seasons and public player/odds feeds. */
import assert from 'node:assert/strict';
import { normalizeCsv, normalizeSchedule } from '../server/providers/free-football';
import { competitions } from '../src/domain/competitions';
import { canonicalClubName } from '../src/domain/club-names';
import { normalizeUnibet } from '../server/providers/unibet';
import { normalizePlayerSummary } from '../server/providers/espn-players';
const doc = (text: string) => ({ text, fetchedAt: new Date().toISOString() });
async function read(url: string) {
  const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
  assert(r.ok, 'Source unavailable');
  return r.text();
}
for (const division of ['I1', 'F1'] as const) {
  const config = competitions[division];
  const raw = await read(
    `https://raw.githubusercontent.com/openfootball/football.json/master/2026-27/${config.file}.1.json`,
  );
  const schedule = normalizeSchedule(doc(raw), 2026, 'schedule', division);
  let history = 0;
  for (let year = 2022; year <= 2026; year++) {
    const rows = normalizeCsv(
      doc(
        await read(
          `https://www.football-data.co.uk/mmz4281/${String(year).slice(-2)}${String(year + 1).slice(-2)}/${division}.csv`,
        ),
      ),
      year,
      'csv',
      false,
      division,
    );
    history += rows.length;
    if (year === 2026) {
      const pairs = rows
        .map((r) => ({ r, s: schedule.find((s) => s.id === r.id) }))
        .filter((p) => p.s);
      assert(pairs.length > 0);
      const mismatches = pairs.filter(({ r, s }) => s!.kickoffKnown && r.kickoff !== s!.kickoff);
      assert.equal(mismatches.length, 0, JSON.stringify(mismatches.slice(0, 2)));
    }
  }
  const list = JSON.parse(
    await read(
      `https://eu.offering-api.kambicdn.com/offering/v2018/ubbe/listView/${config.unibet}/all/matches.json?lang=en_GB&market=BE`,
    ),
  );
  for (const { event } of list.events) {
    assert(canonicalClubName(event.homeName), event.homeName);
    assert(canonicalClubName(event.awayName), event.awayName);
  }
  const event = list.events[0].event;
  const odds = normalizeUnibet(
    await (
      await fetch(
        `https://eu.offering-api.kambicdn.com/offering/v2018/ubbe/betoffer/event/${event.id}.json?lang=en_GB&market=BE`,
      )
    ).json(),
  );
  assert(odds.length > 0);
  const past = schedule
    .filter((f) => f.status === 'finished')
    .sort((a, b) => b.kickoff.localeCompare(a.kickoff))[0];
  assert(past);
  const board = await (
    await fetch(
      `https://site.web.api.espn.com/apis/site/v2/sports/soccer/${config.espn}/scoreboard?dates=${past.sourceDate!.replaceAll('-', '')}`,
    )
  ).json();
  const game = board.events.find((e: any) =>
    e.competitions.some(
      (c: any) =>
        c.competitors.some(
          (t: any) =>
            t.homeAway === 'home' && canonicalClubName(t.team.displayName) === past.home.name,
        ) &&
        c.competitors.some(
          (t: any) =>
            t.homeAway === 'away' && canonicalClubName(t.team.displayName) === past.away.name,
        ),
    ),
  );
  assert(game);
  const players = normalizePlayerSummary(
    await (
      await fetch(
        `https://site.web.api.espn.com/apis/site/v2/sports/soccer/${config.espn}/summary?event=${game.id}`,
      )
    ).json(),
  );
  assert(players.observations.length > 20);
  console.log(
    JSON.stringify({
      division,
      schedule: schedule.length,
      history,
      odds: odds.length,
      players: players.observations.length,
      upcoming: event.homeName + ' – ' + event.awayName,
    }),
  );
}
