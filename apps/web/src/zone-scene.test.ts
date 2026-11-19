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
import { createQualityVisual } from "./quality-scene.js";
import { createSiteSelection } from "./site-selection.js";
import { SCENE_SIGNS, ZONES } from "./site-zones.js";
import { createZoneVisual } from "./zone-scene.js";

function fixture() {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    t = createTimberVisual(scene),
    l = createLaborVisual(scene),
    q = createQualityVisual(scene),
    z = createZoneVisual(scene),
    changes: unknown[] = [],
    selection = createSiteSelection(scene, (id) => changes.push(id));
  let state = createLaborState(),
    n = 0;
  const show = () => {
    t.update({ ...state.timber, stock: laborStock(state) });
    l.update(state);
    q.update(state);
    z.update(state);
    selection.update(state);
  };
  const step = (c: LaborCommand) => {
    state = commandLabor(state, c, `zones-${++n}`);
    show();
  };
  show();
  return {
    scene,
    show,
    selection,
    changes,
    step,
    get state() {
      return state;
    },
    off() {
      l.update(null);
      q.update(null);
      z.update(null);
      selection.update(null);
    },
    end() {
      selection.dispose();
      z.dispose();
      q.dispose();
      l.dispose();
      t.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
it("물량0에서도 네 구역 바닥·무늬·표지가 남고 배급 표식과 구분한다", () => {
  const f = fixture();
  expect(ZONES).toHaveLength(4);
  for (let i = 0; i < ZONES.length; i++)
    for (const b of ZONES.slice(i + 1)) {
      const a = ZONES[i];
      if (!a) continue;
      expect(
        Math.abs(a.point[0] - b.point[0]) > (a.width + b.width) / 2 ||
          Math.abs(a.point[2] - b.point[2]) > (a.depth + b.depth) / 2,
      ).toBe(true);
    }

  expect(
    f.scene.meshes.filter((m) => m.name.includes("-plank-")).length,
  ).toBeLessThanOrEqual(4);
  expect(
    f.scene.meshes.filter((m) => m.name.startsWith("zone-")).length,
  ).toBeLessThanOrEqual(10);
  expect(new Set(SCENE_SIGNS.map((s) => s.label)).size).toBe(5);
  for (const z of ZONES) {
    expect(f.scene.getMeshByName(`zone-${z.id}-floor`)?.isEnabled()).toBe(true);
    expect(f.scene.getMeshByName(`zone-${z.id}-floor`)?.isPickable).toBe(false);
  }
  expect(f.scene.getMeshByName("timber-quarantine")?.isEnabled()).toBe(false);
  expect(f.scene.getMeshByName("zone-quarantine-cross-0.65")?.isEnabled()).toBe(
    true,
  );
  f.end();
});
it("실제 목재 묶음 클릭 매핑과 테두리는 유지하고 처리 후 더미만 숨긴다", () => {
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
  const plank = f.scene.getMeshByName("timber-quarantine-plank-0");
  expect(plank?.isEnabled()).toBe(true);
  plank?.computeWorldMatrix(true);
  const root = f.scene.getMeshByName("timber-quarantine");
  if (!plank || !root) throw new Error("목재 표시 없음");
  const delta = plank
    .getBoundingInfo()
    .boundingBox.centerWorld.subtract(root.position);
  expect(Math.abs(delta.x)).toBeLessThan(0.5);
  expect(Math.abs(delta.z)).toBeLessThan(0.5);

  expect(f.selection.idForMesh(plank ?? null)).toBe("site-quarantine");
  expect(plank?.isPickable).toBe(true);
  f.selection.select("site-quarantine");
  expect(plank?.renderOutline).toBe(true);
  f.step({ type: "timber", command: { type: "receive" } });
  f.step({ type: "exchange-request" });
  f.step({ type: "exchange-depart" });
  expect(plank?.isEnabled()).toBe(false);
  expect(plank?.renderOutline).toBe(false);
  expect(f.changes.at(-1)).toBeNull();
  expect(f.scene.getMeshByName("zone-quarantine-floor")?.isEnabled()).toBe(
    true,
  );
  f.end();
});
it("표시 갱신은 상태·객체 수를 바꾸지 않고 모드 종료 시 원래 상자 높이를 복원한다", () => {
  const f = fixture();
  const before = JSON.stringify(f.state),
    meshes = f.scene.meshes.length,
    materials = f.scene.materials.length;
  for (let i = 0; i < 100; i++) f.show();
  expect(f.scene.meshes).toHaveLength(meshes);
  expect(f.scene.materials).toHaveLength(materials);
  expect(JSON.stringify(f.state)).toBe(before);
  f.off();
  expect(f.scene.getMeshByName("timber-quarantine")?.position.y).toBe(0.175);
  expect(f.scene.getMeshByName("timber-quarantine")?.scaling.y).toBe(1);
  for (const z of ZONES)
    expect(f.scene.getMeshByName(`zone-${z.id}-floor`)?.isEnabled()).toBe(
      false,
    );
  expect(f.scene.getMeshByName("timber-quarantine-plank-0")?.isEnabled()).toBe(
    false,
  );
  f.end();
});
