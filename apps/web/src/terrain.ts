import {
  bokholElevation,
  loggingSiteRules,
  type ProductionSiteId,
  productionSites,
  type TimberState,
} from "@dynosty/game-core";
export function terrainElevation(s: TimberState | null) {
  const sites = [...(s?.homes.map((h) => h.position) ?? [])];
  const forests: Partial<Record<ProductionSiteId, number>> = {};
  if (s)
    for (const l of productionSites(s)) {
      forests[l.siteId] = l.remaining;
      const rules = loggingSiteRules(l.siteId);
      if (l.built) sites.push(rules.workshop);
      if (l.storageBuilt)
        sites.push({ x: rules.storage.x - 3, z: rules.storage.z });
    }
  if (s)
    sites.push(
      ...s.town.facilities.map((f) => f.position),
      ...s.town.orders.map((f) => f.position),
    );
  if (s?.construction) sites.push(s.construction.position);
  return (x: number, z: number) => bokholElevation(x, z, forests, sites);
}
