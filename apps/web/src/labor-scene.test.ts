import { readFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import {
  commandLabor,
  createLaborState,
  type LaborCommand,
} from "@dynosty/game-core";
import { expect, it, vi } from "vitest";
import { createLaborVisual } from "./labor-scene.js";
import { parseModel } from "./model-assets.js";

it("네 일손의 실제 이동·다른 조합 수리 위치·대기 줄·반복 갱신과 정리를 검증한다", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    v = createLaborVisual(scene);
  let s = createLaborState(),
    id = 0;
  const step = (c: LaborCommand) => {
    s = commandLabor(s, c, `visual-${++id}`);
    v.update(s);
  };
  v.update(s);
  expect(scene.meshes.filter((m) => m.name.startsWith("crew-")).length).toBe(4);
  step({ type: "timber", command: { type: "choose", offer: "A" } });
  step({ type: "timber", command: { type: "contract" } });
  step({ type: "timber", command: { type: "depart" } });
  step({ type: "next" });
  step({ type: "timber", command: { type: "inspect" } });
  step({ type: "next" });
  step({ type: "timber", command: { type: "receive" } });
  expect(scene.getMeshByName("labor-queue-2")?.isEnabled()).toBe(true);
  const old = scene.getMeshByName("crew-1")?.position.clone();
  if (!old) throw new Error("일손 모델 없음");
  step({ type: "assign", worker: "crew-1", job: "repair" });
  step({ type: "assign", worker: "crew-3", job: "repair" });
  v.animate(0.1);
  expect(scene.getMeshByName("crew-1")?.position.equals(old)).toBe(false);
  for (let i = 0; i < 80; i++) v.animate(0.1);
  const third = scene.getMeshByName("crew-3");
  if (!third) throw new Error("세 번째 일손 모델 없음");
  expect(scene.getMeshByName("crew-1")?.position.equals(third.position)).toBe(
    false,
  );
  step({ type: "assign", worker: "crew-2", job: "prep" });
  step({ type: "assign", worker: "crew-4", job: "prep" });
  step({ type: "advance", minutes: 60 });
  expect(scene.getMeshByName("labor-queue-2")?.isEnabled()).toBe(false);
  expect(scene.getMeshByName("labor-queue-1")?.isEnabled()).toBe(true);
  const count = scene.meshes.length;
  for (let i = 0; i < 100; i++) {
    v.update(s);
    v.animate(0.016);
  }
  expect(scene.meshes.length).toBe(count);
  step({ type: "next" });
  expect(scene.getMeshByName("labor-queue-0")?.isEnabled()).toBe(false);
  v.update(null);
  expect(scene.meshes.some((m) => m.name.startsWith("crew-"))).toBe(false);
  expect(scene.getMeshByName("labor-prep-station")?.isEnabled()).toBe(false);
  v.dispose();
  expect(scene.meshes).toHaveLength(0);
  expect(
    scene.materials.filter(
      (m) => m.name.startsWith("labor-") || m.name.startsWith("crew-"),
    ),
  ).toHaveLength(0);
  scene.dispose();
  engine.dispose();
});

it("배치가 정지한100프레임은 좌표를 반복 갱신하지 않고 늦게 도착한 모델은 적용한다", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    v = createLaborVisual(scene);
  v.update(createLaborState());
  v.animate(0.1);
  const first = scene.getMeshByName("crew-1");
  if (!first) throw new Error("일손 모델 없음");
  const set = vi.spyOn(first.position, "set");
  for (let i = 0; i < 100; i++) v.animate(0.016);
  expect(set).toHaveBeenCalledTimes(0);
  const asset = parseModel(
    JSON.parse(
      readFileSync(
        new URL("../public/models/triceratops.json", import.meta.url),
        "utf8",
      ),
    ),
    "resident",
  );
  v.setModels({ resident: asset });
  v.animate(0.016);
  expect(first.isVisible).toBe(false);
  expect(first.getChildMeshes().length).toBeGreaterThan(0);
  set.mockRestore();
  v.dispose();
  scene.dispose();
  engine.dispose();
});
