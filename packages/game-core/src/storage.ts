import { productionSites } from "./logging.js";
import { AMOUNT_SCALE, type ResourceId } from "./play.js";
import type { TimberState } from "./timber.js";

export const STORAGE_SPACE = [500, 1000, 2000] as const;
export function storageResearchLevel(s: TimberState): number {
  const completed = s.town.development.completed;
  return completed.includes("SPACE_3")
    ? 3
    : completed.includes("SPACE_2")
      ? 2
      : 1;
}
export function storageCapacity(s: TimberState): number {
  const rank = storageResearchLevel(s);
  const legacy = productionSites(s).filter((l) => l.storageBuilt).length;
  return Math.max(
    500,
    legacy * (STORAGE_SPACE[rank - 1] ?? 500) +
      s.town.facilities
        .filter((f) => f.kind === "storage")
        .reduce(
          (n, f) => n + (STORAGE_SPACE[Math.max(f.level, rank) - 1] ?? 500),
          0,
        ),
  );
}
export function storageRoom(
  s: TimberState,
  resource: ResourceId,
  ownProcurement = false,
): number {
  const reserved =
    resource === "RES_WOOD" && !ownProcurement
      ? s.stock.cart + s.stock.waiting + s.stock.quarantine
      : 0;
  return Math.max(
    0,
    Math.floor(
      storageCapacity(s) -
        s.world.resources[resource] / AMOUNT_SCALE -
        reserved,
    ),
  );
}
