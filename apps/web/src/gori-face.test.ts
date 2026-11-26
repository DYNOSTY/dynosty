import { createTimberState, newCampaign } from "@dynosty/game-core";
import { describe, expect, it } from "vitest";
import { goriFace } from "./gori-face.js";

describe("고리 초상", () => {
  const state = createTimberState();
  const campaign = newCampaign("opening");
  it("평소와 비관의 경계를 구분한다", () => {
    expect(goriFace(null)).toBe("/ui/gori/face1.webp");
    expect(
      goriFace({ ...state, world: { ...state.world, pessimism: 49 } }),
    ).toBe("/ui/gori/face1.webp");
    expect(
      goriFace({ ...state, world: { ...state.world, pessimism: 50 } }),
    ).toBe("/ui/gori/face3.webp");
  });
  it("사망과 결말의 우선순위를 반영한다", () => {
    const lost = {
      ...state,
      world: {
        ...state.world,
        citizens: state.world.citizens.map((c, i) =>
          i === 0 ? { ...c, alive: false } : c,
        ),
      },
    };
    expect(goriFace(lost)).toBe("/ui/gori/face3.webp");
    expect(
      goriFace({ ...lost, campaign: { ...campaign, ending: "hope" } }),
    ).toBe("/ui/gori/face6.webp");
    expect(
      goriFace({ ...lost, campaign: { ...campaign, ending: "collapse" } }),
    ).toBe("/ui/gori/face4.webp");
  });
});
