import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import {
  commandLabor,
  createLaborState,
  type LaborCommand,
} from "@dynosty/game-core";
import { expect, it } from "vitest";
import { focusSiteCamera, resetSceneCamera } from "./site-camera.js";
import { SITE_IDS, SITE_POINTS } from "./site-targets.js";
import { CREW_BADGES, cartBadge } from "./visual-badges.js";

it("현장 세 곳 이동은 회전/줌 관성을 지우고 기본 시점은 원점으로 복귀한다", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    camera = new ArcRotateCamera("test", 0, 0.8, 20, Vector3.Zero(), scene);
  try {
    for (const id of SITE_IDS) {
      camera.inertialAlphaOffset = 1;
      camera.inertialBetaOffset = 1;
      camera.inertialRadiusOffset = 1;
      camera.inertialPanningX = 1;
      camera.inertialPanningY = 1;
      focusSiteCamera(camera, id);
      expect(camera.target.asArray()).toEqual([...SITE_POINTS[id]]);
      expect(camera.radius).toBe(8);
      expect([
        camera.inertialAlphaOffset,
        camera.inertialBetaOffset,
        camera.inertialRadiusOffset,
        camera.inertialPanningX,
        camera.inertialPanningY,
      ]).toEqual([0, 0, 0, 0, 0]);
    }
    resetSceneCamera(camera);
    expect(camera.target.asArray()).toEqual([0, 0, 0]);
    expect(camera.radius).toBe(12);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
it("역할은 색상 없이도 서로 다른 기호·글자로 구분하고 수레의 회수/납품 방향은 기존 상태를 따른다", () => {
  expect(new Set(Object.values(CREW_BADGES)).size).toBe(5);
  let s = createLaborState(),
    i = 0;
  const step = (c: LaborCommand) => {
    s = commandLabor(s, c, `badges-${++i}`);
  };
  expect(cartBadge(s)).toBeNull();
  for (const c of [
    { type: "choose", offer: "A" },
    { type: "contract" },
    { type: "depart" },
  ] as const)
    step({ type: "timber", command: c });
  expect(cartBadge(s)).toBe("→ 원납품 운송 20");
  step({ type: "next" });
  expect(cartBadge(s)).toBeNull();
  step({ type: "timber", command: { type: "inspect" } });
  step({ type: "next" });
  step({ type: "timber", command: { type: "receive" } });
  step({ type: "exchange-request" });
  expect(cartBadge(s)).toContain("출발 대기");
  step({ type: "exchange-depart" });
  expect(cartBadge(s)).toBe("← 불량품 회수 4");
  step({ type: "next" });
  expect(cartBadge(s)).toBe("→ 교환품 재납품 4");
  step({ type: "next" });
  expect(cartBadge(s)).toBeNull();
});
