import { bokholElevation, type ProductionSiteId } from "./bokhol.js";
import { loggingSiteRules, productionSites } from "./logging.js";
import type { TimberState } from "./timber.js";
export function terrainElevation(s: TimberState | null) {
  const plot = (f: {
    position: { x: number; z: number };
    headingRadians?: number;
  }) => ({ ...f.position, headingRadians: f.headingRadians ?? 0 });
  const sites: { x: number; z: number; headingRadians?: number }[] =
    s?.homes.map(plot) ?? [];
  const forests: Partial<Record<ProductionSiteId, number>> = {};
  if (s)
    for (const l of productionSites(s)) {
      forests[l.siteId] = l.remaining;
      const rules = loggingSiteRules(l.siteId);
      if (l.built) sites.push(rules.workshopPlot);
      if (l.storageBuilt) sites.push(rules.storagePlot);
    }
  if (s) sites.push(...s.town.facilities.map(plot), ...s.town.orders.map(plot));
  if (s?.construction) sites.push(plot(s.construction));
  return (x: number, z: number) => bokholElevation(x, z, forests, sites);
}
