const store = new Map<string, { at: number; value: Promise<unknown> }>();
const MAX_ENTRIES = 200;

/** Per-instance TTL cache that also dedupes concurrent loads; failures are never cached. */
export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>, fresh = false): Promise<T> {
  const hit = store.get(key);
  if (!fresh && hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = load();
  store.delete(key);
  store.set(key, { at: Date.now(), value });
  value.catch(() => store.get(key)?.value === value && store.delete(key));
  if (store.size > MAX_ENTRIES) store.delete(store.keys().next().value as string);
  return value;
}
