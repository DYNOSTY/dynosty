import { readFileSync } from "node:fs";
import {
  BOKHOL_FORESTS,
  BOKHOL_MINERALS,
  BOKHOL_PRODUCTION_SITES,
  BOKHOL_WATERS,
  type BuildingOrder,
  createVillageGame,
  type GroundPoint,
  initialHomes,
  loggingSiteRules,
  SCOUT_SITES,
  type TimberState,
  VILLAGE_LAYOUT,
  VILLAGE_POND,
} from "@dynosty/game-core";
import { describe, expect, it } from "vitest";
import {
  distanceToResourceSite,
  POND_ICE_TOP,
  RESOURCE_SITES,
  type ResourceSite,
  resourceSiteGround,
  resourceSiteReach,
  resourceSiteRect,
  resourceSiteVisible,
} from "./resource-site-layout.js";

/** 건물 한 채(반폭 2.25)를 어느 방향으로 돌려도 닿는 거리 */
const BUILDING_REACH = 2.25 * Math.SQRT2;
const rectGap = (
  site: ResourceSite,
  c: GroundPoint,
  halfWidth: number,
  halfDepth: number,
) => {
  const r = resourceSiteRect(site);
  return Math.hypot(
    Math.max(r.minX - (c.x + halfWidth), 0, c.x - halfWidth - r.maxX),
    Math.max(r.minZ - (c.z + halfDepth), 0, c.z - halfDepth - r.maxZ),
  );
};
const byId = (id: string) => {
  const site = RESOURCE_SITES.find((s) => s.id === id);
  if (!site) throw new Error(id);
  return site;
};
const anchorOf = (site: ResourceSite) => {
  const anchor = [...BOKHOL_MINERALS, ...BOKHOL_WATERS].find(
    (a) => a.id === site.anchor,
  );
  if (!anchor) throw new Error(site.anchor);
  return anchor;
};

function glbBounds(file: string) {
  const glb = readFileSync(
    new URL(`../public/models/sites/${file}.glb`, import.meta.url),
  );
  const json = JSON.parse(
    glb.subarray(20, 20 + glb.readUInt32LE(12)).toString("utf8"),
  ) as {
    meshes: { primitives: { attributes: { POSITION: number } }[] }[];
    accessors: { min: number[]; max: number[] }[];
  };
  const b = [Infinity, -Infinity, Infinity, -Infinity];
  for (const mesh of json.meshes)
    for (const primitive of mesh.primitives) {
      const a = json.accessors[primitive.attributes.POSITION];
      if (!a) throw new Error(file);
      b[0] = Math.min(b[0] ?? 0, a.min[0] ?? 0);
      b[1] = Math.max(b[1] ?? 0, a.max[0] ?? 0);
      b[2] = Math.min(b[2] ?? 0, a.min[2] ?? 0);
      b[3] = Math.max(b[3] ?? 0, a.max[2] ?? 0);
    }
  return b;
}

describe("자원 터 모델 배치", () => {
  it("여섯 모델이 실제 GLB 크기로 계산된다", () => {
    expect(RESOURCE_SITES.map((s) => s.id).sort()).toEqual([
      "coal",
      "fish",
      "iron",
      "pine",
      "spring",
      "store",
    ]);
    for (const site of RESOURCE_SITES) {
      const actual = glbBounds(site.file);
      site.bounds.forEach((v, i) => {
        expect(v).toBeCloseTo(actual[i] ?? Number.NaN, 2);
      });
    }
  });

  it("석탄·철 모델은 제출본 광맥 한가운데, 낚시·샘은 물고기 못 얼음 위에 앉는다", () => {
    for (const id of ["coal", "iron"]) {
      const site = byId(id);
      const mineral = anchorOf(site);
      expect([site.x, site.z]).toEqual([mineral.x, mineral.z]);
      expect(site.replacesDeposit).toBe(true);
      // 광맥 중심 10m 안에는 채굴 시설도 지을 수 없다 (town.ts buildingIssue)
      expect(resourceSiteReach(site, mineral)).toBeLessThanOrEqual(
        10 - BUILDING_REACH,
      );
    }
    for (const id of ["fish", "spring"]) {
      const site = byId(id);
      const pond = BOKHOL_WATERS.find((w) => w.id === site.anchor);
      if (!pond) throw new Error(site.anchor);
      expect(site.ground).toBe("ice");
      // 물 위(반지름+0.5)에는 어떤 건물도 지을 수 없다
      expect(resourceSiteReach(site, pond)).toBeLessThanOrEqual(pond.radius);
      const ground = resourceSiteGround(site, () => -1);
      expect(ground(site.x, site.z)).toBe(POND_ICE_TOP);
    }
  });

  it("짝 없는 곳간·적송은 광맥의 둥지 금지 반경 안 빈 땅에 선다", () => {
    for (const id of ["store", "pine"]) {
      const site = byId(id);
      const mineral = anchorOf(site);
      expect(site.replacesDeposit).toBe(false);
      // 둥지는 광맥 24m 안에 지을 수 없다 (home-placement.ts)
      expect(resourceSiteReach(site, mineral)).toBeLessThanOrEqual(
        24 - BUILDING_REACH,
      );
      // 자리 표시용 바위(반지름 7 둘레, 길이 3.8)와 갱도 입구를 피한다
      expect(distanceToResourceSite(site, mineral)).toBeGreaterThan(9.5);
    }
  });

  it("마을 시설·첫 둥지·작업장·숲·정찰 거점·다른 터와 겹치지 않는다", () => {
    for (const site of RESOURCE_SITES) {
      for (const [id, x, z] of VILLAGE_LAYOUT)
        expect(
          rectGap(site, { x, z }, 4.5, 4.5),
          `${site.id}↔${id}`,
        ).toBeGreaterThan(0.5);
      for (const { position: p } of initialHomes())
        expect(
          distanceToResourceSite(site, p),
          `${site.id}↔둥지 ${p.x},${p.z}`,
        ).toBeGreaterThan(BUILDING_REACH);
      for (const f of BOKHOL_PRODUCTION_SITES) {
        const r = loggingSiteRules(f.id);
        expect(rectGap(site, r.workshopPlot, 4.5, 3.5)).toBeGreaterThan(0.5);
        expect(rectGap(site, r.storagePlot, 2.5, 3)).toBeGreaterThan(0.5);
      }
      // 숲이 남아 있는 동안 건물을 막는 범위(9.5×11.5)까지 비운다
      for (const f of BOKHOL_FORESTS)
        expect(
          rectGap(site, f, 9.5, 11.5),
          `${site.id}↔${f.id}`,
        ).toBeGreaterThan(1);
      for (const m of BOKHOL_MINERALS) {
        if (site.replacesDeposit && m.id === site.anchor) continue;
        // 다른 광맥의 자리 표시용 바위·갱도 입구(중심에서 10m)를 피한다
        expect(
          distanceToResourceSite(site, m),
          `${site.id}↔${m.id}`,
        ).toBeGreaterThan(9.5);
      }
      // 정찰 거점 모형(건물 GLB × 0.75, 발견 깃발은 중심에서 4.8m)을 피한다
      for (const s of SCOUT_SITES)
        expect(
          distanceToResourceSite(site, s),
          `${site.id}↔${s.id}`,
        ).toBeGreaterThan(5.5);
      expect(
        distanceToResourceSite(site, VILLAGE_POND) - VILLAGE_POND.r,
      ).toBeGreaterThan(3);
      for (const other of RESOURCE_SITES) {
        if (other === site) continue;
        const r = resourceSiteRect(other);
        expect(
          rectGap(
            site,
            { x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 },
            (r.maxX - r.minX) / 2,
            (r.maxZ - r.minZ) / 2,
          ),
          `${site.id}↔${other.id}`,
        ).toBeGreaterThan(2);
      }
    }
  });

  it("새 판에서는 모두 보이고, 그 자리에 건물을 놓으면 그 터만 숨긴다", () => {
    const fresh = createVillageGame();
    for (const site of RESOURCE_SITES)
      expect(resourceSiteVisible(site, fresh), site.id).toBe(true);
    for (const site of RESOURCE_SITES)
      expect(resourceSiteVisible(site, null), site.id).toBe(false);
    const store = byId("store");
    const order = {
      id: "test-quarry",
      kind: "quarry",
      position: { x: store.x, z: store.z + 4 },
      headingRadians: 0,
      sourceId: "stone-bokhol-south",
      crew: [],
      stage: "waiting",
      workDone: 0,
    } satisfies BuildingOrder;
    const built: TimberState = {
      ...fresh,
      town: { ...fresh.town, orders: [...fresh.town.orders, order] },
    };
    expect(
      RESOURCE_SITES.filter((s) => !resourceSiteVisible(s, built)).map(
        (s) => s.id,
      ),
    ).toEqual(["store"]);
  });
});
