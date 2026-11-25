import { describe, expect, it } from "vitest";
import { residentGlb } from "./village.js";

describe("게임 주민 GLB", () => {
  it.each([
    ["R02", "R02_Triceratops"],
    ["R03", "R03_Velociraptor"],
    ["SPINO", "SPINO_Spinosaurus"],
  ])("%s의 계절별 고유 모델을 선택한다", (species, file) => {
    expect(residentGlb(species, "summer")?.url).toBe(
      `/models/residents/${file}.glb`,
    );
    expect(residentGlb(species, "winter")?.url).toBe(
      `/models/residents/${file}_v2.glb`,
    );
    expect(residentGlb(species, "winter")?.scale).toBeGreaterThan(0);
  });
  it("알 수 없는 종은 GLB를 사용하지 않는다", () =>
    expect(residentGlb("unknown", "winter")).toBeNull());
});
