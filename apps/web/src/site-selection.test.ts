import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import {
  commandLabor,
  createLaborState,
  type LaborCommand,
  laborStock,
} from "@dynosty/game-core";
import { expect, it } from "vitest";
import { createLaborVisual } from "./labor-scene.js";
import { createLegacyTimberVisual as createTimberVisual } from "./legacy-timber-scene.js";
import { createSiteSelection } from "./site-selection.js";

function fixture() {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    timber = createTimberVisual(scene),
    labor = createLaborVisual(scene),
    changes: (string | null)[] = [],
    sites = createSiteSelection(scene, (id) => changes.push(id));
  let state = createLaborState(),
    n = 0;
  const update = () => {
    timber.update({ ...state.timber, stock: laborStock(state) });
    labor.update(state);
    sites.update(state);
  };
  const step = (c: LaborCommand) => {
    state = commandLabor(state, c, `site-${++n}`);
    update();
  };
  update();
  return {
    scene,
    sites,
    changes,
    step,
    get state() {
      return state;
    },
    end() {
      sites.dispose();
      labor.dispose();
      timber.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
function inspected() {
  const f = fixture();
  for (const c of [
    { type: "choose", offer: "A" },
    { type: "contract" },
    { type: "depart" },
  ] as const)
    f.step({ type: "timber", command: c });
  f.step({ type: "next" });
  f.step({ type: "timber", command: { type: "inspect" } });
  f.step({ type: "next" });
  return f;
}
it("표시 중인 대상만 선택하고 테두리를 한 장소로 전환한다", () => {
  const f = fixture();
  expect(f.scene.getMeshByName("exchange-inspection-table")?.isPickable).toBe(
    true,
  );
  expect(f.scene.getMeshByName("timber-quarantine")?.isPickable).toBe(false);
  f.sites.select("site-inspection");
  expect(
    f.scene.getMeshByName("exchange-inspection-table")?.renderOutline,
  ).toBe(true);
  f.sites.select("site-ration");
  expect(
    f.scene.getMeshByName("exchange-inspection-table")?.renderOutline,
  ).toBe(false);
  expect(f.scene.getMeshByName("labor-prep-station")?.renderOutline).toBe(true);
  f.sites.select(null);
  expect(f.scene.getMeshByName("labor-prep-station")?.renderOutline).toBe(
    false,
  );
  expect(f.changes).toEqual(["site-inspection", "site-ration", null]);
  f.end();
});
it("격리품은 열린 위치에 표시하고 회수 시 선택과 테두리를 해제한다", () => {
  const f = inspected(),
    q = f.scene.getMeshByName("timber-quarantine");
  expect(q?.position.asArray()).toEqual([4.8, 0.175, -3.7]);
  expect(f.sites.idForMesh(q ?? null)).toBe("site-quarantine");
  f.sites.select("site-quarantine");
  expect(q?.renderOutline).toBe(true);
  f.step({ type: "timber", command: { type: "receive" } });
  f.step({ type: "exchange-request" });
  f.step({ type: "exchange-depart" });
  expect(q?.isPickable).toBe(false);
  expect(q?.renderOutline).toBe(false);
  expect(f.changes.at(-1)).toBeNull();
  expect(f.sites.idForMesh(q ?? null)).toBeNull();
  f.sites.select("site-inspection");
  f.step({ type: "next" });
  expect(
    f.scene.getMeshByName("exchange-inspection-table")?.renderOutline,
  ).toBe(true);
  f.sites.update(null);
  expect(f.changes.at(-1)).toBeNull();
  expect(f.scene.getMeshByName("exchange-inspection-table")?.isPickable).toBe(
    false,
  );
  f.end();
});
it("원납품 검수대와 수레에 물량을 중복 표시하지 않고 수령 후에도 장소 선택은 유지한다", () => {
  const f = fixture();
  for (const c of [
    { type: "choose", offer: "A" },
    { type: "contract" },
    { type: "depart" },
  ] as const)
    f.step({ type: "timber", command: c });
  f.step({ type: "next" });
  expect(f.scene.getMeshByName("timber-cargo")?.isEnabled()).toBe(false);
  expect(f.scene.getMeshByName("exchange-inspection-parcel")?.isEnabled()).toBe(
    true,
  );
  expect(
    f.sites.idForMesh(f.scene.getMeshByName("exchange-inspection-parcel")),
  ).toBe("site-inspection");
  f.sites.select("site-inspection");
  f.step({ type: "timber", command: { type: "inspect" } });
  f.step({ type: "next" });
  f.step({ type: "timber", command: { type: "receive" } });
  expect(f.scene.getMeshByName("exchange-inspection-parcel")?.isEnabled()).toBe(
    false,
  );
  expect(
    f.scene.getMeshByName("exchange-inspection-table")?.renderOutline,
  ).toBe(true);
  const meshes = f.scene.meshes.length,
    materials = f.scene.materials.length;
  for (let i = 0; i < 100; i++) {
    f.sites.select("site-ration");
    f.sites.select("site-inspection");
  }
  expect(f.scene.meshes).toHaveLength(meshes);
  expect(f.scene.materials).toHaveLength(materials);
  f.end();
});
