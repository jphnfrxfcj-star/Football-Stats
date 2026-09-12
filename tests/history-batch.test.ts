import { expect, it, vi } from 'vitest';
import { FootballService } from '../server/service';
import type { FootballDataProvider } from '../server/providers/provider';
import type { Repository } from '../server/repositories/supabase';
import { demoMatch } from '../src/demo/data';

it('persists overlapping history once and restores canonical IDs to every group', async () => {
  const data = demoMatch('demo-2026-09-12-0')!;
  const fixture = data.fixture;
  fixture.home.refs = [{ provider: 'test', externalId: 'home' }];
  fixture.away.refs = [{ provider: 'test', externalId: 'away' }];
  const played = data.homeHistory[0];
  const provider = {
    name: 'test',
    matchHistory: vi.fn(async () => ({
      homeHistory: [played],
      awayHistory: [played],
      h2h: [played],
    })),
  };
  const repo = {
    cached: vi.fn(async () => null),
    cache: vi.fn(async () => {}),
    lock: vi.fn(async () => true),
    unlock: vi.fn(async () => {}),
    log: vi.fn(async () => {}),
    saveFixtures: vi.fn(async (rows) =>
      rows.map((f: typeof played) => ({ ...f, id: 'canonical-id' })),
    ),
  };
  const service = new FootballService(
    provider as unknown as FootballDataProvider,
    repo as unknown as Repository,
  );
  vi.spyOn(service, 'fixture').mockResolvedValue(fixture);
  const result = await service.data(fixture.id);
  expect(repo.saveFixtures).toHaveBeenCalledExactlyOnceWith([played]);
  expect(result?.homeHistory[0].id).toBe('canonical-id');
  expect(result?.awayHistory[0]).toEqual(result?.homeHistory[0]);
  expect(result?.h2h[0]).toEqual(result?.homeHistory[0]);
});
