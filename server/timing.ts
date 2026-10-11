import { AsyncLocalStorage } from 'node:async_hooks';

// Fixed names only: never include cache keys, source URLs, IDs or error messages.
const phases = [
  'total',
  'rate_limit',
  'database',
  'source',
  'cache_read',
  'cache_lock',
  'cache_wait',
  'cache_load',
  'cache_write',
] as const;
const counters = ['cache_hit', 'cache_miss', 'cache_join'] as const;
export type TimingPhase = (typeof phases)[number];
export type TimingCounter = (typeof counters)[number];
type Measurements = {
  durations: Map<TimingPhase, number>;
  counts: Map<TimingCounter, number>;
};
const storage = new AsyncLocalStorage<Measurements>();

export async function measurePhase<T>(name: TimingPhase, work: () => Promise<T>): Promise<T> {
  const measurements = storage.getStore();
  if (!measurements || !phases.includes(name)) return work();
  const start = performance.now();
  try {
    return await work();
  } finally {
    const duration = Math.max(0, performance.now() - start);
    measurements.durations.set(name, (measurements.durations.get(name) ?? 0) + duration);
  }
}

export function countTiming(name: TimingCounter): void {
  const measurements = storage.getStore();
  if (measurements && counters.includes(name))
    measurements.counts.set(name, (measurements.counts.get(name) ?? 0) + 1);
}

/**
 * Request-local origin diagnostics. CDN responses can replay these headers; they
 * are NOT the current browser's TTFB. Nested/parallel phase durations are inclusive
 * aggregates and must not be summed. Fixed names bound header size and cardinality.
 */
export async function withServerTiming(work: () => Promise<Response>): Promise<Response> {
  if (process.env.SERVER_TIMING_ENABLED === 'false') return work();
  return storage.run({ durations: new Map(), counts: new Map() }, async () => {
    const response = await measurePhase('total', work);
    const measurements = storage.getStore()!;
    const values = phases.flatMap((phase) => {
      const value = measurements.durations.get(phase);
      return value === undefined ? [] : [`${phase};dur=${value.toFixed(1)}`];
    });
    for (const counter of counters) {
      const value = measurements.counts.get(counter);
      if (value !== undefined) values.push(`${counter};desc="${value} calls"`);
    }
    response.headers.set('Server-Timing', values.join(', '));
    return response;
  });
}
