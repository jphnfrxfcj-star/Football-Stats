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

it('waits for another instance to finish without unlocking its work', async () => {
  const { service, repo } = setup(null, false);
  repo.cached.mockResolvedValueOnce(null).mockResolvedValueOnce([7]);
  const load = vi.fn(async () => [8]);
  expect(await service.cached('shared', 60, load)).toEqual([7]);
  expect(load).not.toHaveBeenCalled();
  expect(repo.unlock).not.toHaveBeenCalled();
});
it('does not discard valid results or mask the original error when maintenance fails', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const { service, repo } = setup();
    repo.log.mockRejectedValue(new Error('logging failed'));
    repo.unlock.mockRejectedValue(new Error('unlock failed'));
    expect(await service.cached('maintenance', 60, async () => [3])).toEqual([3]);
    const second = setup();
    second.repo.log.mockRejectedValue(new Error('logging failed'));
    second.repo.unlock.mockRejectedValue(new Error('unlock failed'));
    await expect(
      second.service.cached('original', 60, async () => {
        throw new Error('original failure');
      }),
    ).rejects.toThrow('original failure');
  } finally {
    warn.mockRestore();
  }
});
