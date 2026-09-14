/** Small per-function cache for public football data. Never extends the database expiry. */
export class MemoryCache {
  private entries = new Map<string, { json: string; bytes: number; expires: number }>();
  private bytes = 0;
  constructor(
    private maxBytes = 12 * 1024 * 1024,
    private maxEntries = 64,
    private maxAge = 30000,
  ) {}
  delete(key: string) {
    const entry = this.entries.get(key);
    if (entry) this.bytes -= entry.bytes;
    this.entries.delete(key);
  }
  get<T>(key: string): T | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expires <= Date.now()) {
      this.delete(key);
      return null;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return JSON.parse(entry.json) as T;
  }
  set(key: string, value: unknown, expires: number) {
    this.delete(key);
    if (value == null || !Number.isFinite(expires) || expires <= Date.now()) return;
    const json = JSON.stringify(value);
    if (json === undefined) return;
    const bytes = Buffer.byteLength(json);
    if (bytes > Math.min(this.maxBytes, 2 * 1024 * 1024)) return;
    for (const [k, entry] of this.entries) if (entry.expires <= Date.now()) this.delete(k);
    while (
      this.entries.size &&
      (this.bytes + bytes > this.maxBytes || this.entries.size >= this.maxEntries)
    )
      this.delete(this.entries.keys().next().value!);
    this.entries.set(key, { json, bytes, expires: Math.min(expires, Date.now() + this.maxAge) });
    this.bytes += bytes;
  }
}
