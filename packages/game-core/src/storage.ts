import { loggingSiteRules, productionSites } from "./logging.js";
import { AMOUNT_SCALE, type ResourceId } from "./play.js";
import type { GroundPoint } from "./resident-path.js";
import type { TimberState } from "./timber.js";
import { facilityDoor } from "./town.js";

export const STORAGE_SPACE = [500, 1000, 2000] as const;
export function warehouseDoor(
  s: TimberState,
  from?: GroundPoint,
): GroundPoint | undefined {
  const doors = [
    ...s.town.facilities.filter((f) => f.kind === "storage").map(facilityDoor),
    ...productionSites(s)
      .filter((site) => site.storageBuilt)
      .map((site) => {
        const p = loggingSiteRules(site.siteId).storage;
        return { x: p.x, z: p.z + 3.2 };
      }),
  ];
  if (from)
    doors.sort(
      (a, b) =>
        Math.hypot(a.x - from.x, a.z - from.z) -
        Math.hypot(b.x - from.x, b.z - from.z),
    );
  return doors[0];
}
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
    s.campaign ? 1000 + STORAGE_SPACE[0] : STORAGE_SPACE[0],
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
        reserved -
        (resource === "RES_WOOD" && s.yardDryAt ? 1 : 0),
    ),
  );
}
