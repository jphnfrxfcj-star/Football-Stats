import { getJson } from './http';

const values = new Map<string, { value: unknown; expires: number }>();
const pending = new Map<string, Promise<unknown>>();
const limit = 32;

/** Tab-local successful reads; caller cancellation does not cancel other readers. */
export async function cachedRead<T>(
  path: string,
  signal?: AbortSignal,
  refresh = false,
): Promise<T> {
  signal?.throwIfAborted();
  const cached = values.get(path);
  if (!refresh && cached && cached.expires > Date.now()) {
    values.delete(path);
    values.set(path, cached);
    return cached.value as T;
  }
  let request = pending.get(path);
  if (!request) {
    request = getJson<T>(path)
      .then((value) => {
        values.delete(path);
        values.set(path, { value, expires: Date.now() + 5 * 60000 });
        while (values.size > limit) values.delete(values.keys().next().value!);
        return value;
      })
      .finally(() => pending.delete(path));
    pending.set(path, request);
  }
  const value = await request;
  signal?.throwIfAborted();
  return value as T;
}
