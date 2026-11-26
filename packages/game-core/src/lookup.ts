// Id lookups over immutable state lists. Simulation code replaces lists instead of
// editing them, so an index built once per list can be reused by every resident in
// the same minute. The length check rebuilds the index if a list is still being filled.
type Index = { length: number; at: Map<string, number> };
const indexes = new WeakMap<readonly { id: string }[], Index>();

export function indexById(list: readonly { id: string }[], id: string): number {
  let index = indexes.get(list);
  if (!index || index.length !== list.length) {
    const at = new Map<string, number>();
    // Keep the first match, like Array.prototype.find/findIndex.
    for (const [i, item] of list.entries())
      if (!at.has(item.id)) at.set(item.id, i);
    index = { length: list.length, at };
    indexes.set(list, index);
  }
  return index.at.get(id) ?? -1;
}

export function findById<T extends { id: string }>(
  list: readonly T[],
  id: string,
): T | undefined {
  const i = indexById(list, id);
  return i < 0 ? undefined : list[i];
}
