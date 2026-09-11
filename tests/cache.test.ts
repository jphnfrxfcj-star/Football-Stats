import { describe, expect, it, vi } from 'vitest';
import { FootballService, BusyError } from '../server/service';
import type { Repository } from '../server/repositories/supabase';
import type { FootballDataProvider } from '../server/providers/provider';
function setup(initial: unknown = null, lock = true) {
  let value = initial;
  const repo = {
    cached: vi.fn(async () => value),
    cache: vi.fn(async (_k: string, data: unknown) => {
      value = data;
    }),
    lock: vi.fn(async () => lock),
    unlock: vi.fn(async () => {}),
    log: vi.fn(async () => {}),
  };
  return {
    repo,
    service: new FootballService(
      { name: 'test' } as FootballDataProvider,
      repo as unknown as Repository,
    ),
  };
}
describe('persistent cache coordination', () => {
  it('reads the database before calling the provider', async () => {
    const { service } = setup([1]);
    const load = vi.fn(async () => [2]);
    expect(await service.cached('hit', 60, load)).toEqual([1]);
    expect(load).not.toHaveBeenCalled();
  });
  it('coalesces concurrent misses and persists the result', async () => {
    const { service, repo } = setup();
    const load = vi.fn(async () => [2]);
    expect(
      await Promise.all([service.cached('miss', 60, load), service.cached('miss', 60, load)]),
    ).toEqual([[2], [2]]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(repo.cache).toHaveBeenCalledTimes(1);
    expect(repo.unlock).toHaveBeenCalledTimes(1);
  });
  it('does not duplicate provider work owned by another function instance', async () => {
    const { service } = setup(null, false);
    const load = vi.fn(async () => [2]);
    await expect(service.cached('locked', 60, load)).rejects.toBeInstanceOf(BusyError);
    expect(load).not.toHaveBeenCalled();
  });
  it('never caches a provider failure and releases the lock', async () => {
    const { service, repo } = setup();
    await expect(
      service.cached('failure', 60, async () => {
        throw new Error('quota');
      }),
    ).rejects.toThrow('quota');
    expect(repo.cache).not.toHaveBeenCalled();
    expect(repo.unlock).toHaveBeenCalled();
  });
});
