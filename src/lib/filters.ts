/** Combines Mongo filters whose $and clauses would otherwise overwrite each
 *  other when spread. Spreading two filters that each carry $or silently drops
 *  one of them, so composed filters nest their clauses under $and and merge here. */
export function andFilters(...filters: Record<string, unknown>[]): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  const clauses: unknown[] = [];
  for (const filter of filters) {
    for (const [key, value] of Object.entries(filter)) {
      if (key === "$and") clauses.push(...(value as unknown[]));
      else merged[key] = value;
    }
  }
  if (clauses.length > 0) merged.$and = clauses;
  return merged;
}
