import {
  commandTimber,
  createTimberSave,
  createTimberState,
} from "@dynosty/game-core";
import { describe, expect, it } from "vitest";
import { loadTimber, saveTimber, TIMBER_SAVE_KEY } from "./timber-save.js";

function fixture() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  };
}
describe("체험판의 별도 최근·직전 저장", () => {
  it("생존/예제 원본을 유지하고 최근과 직전 상태를 복원한다", () => {
    const f = fixture();
    f.data.set("dynosty.play.saves", "keep");
    const s = createTimberState();
    saveTimber(f, createTimberSave(s));
    const next = commandTimber(s, { type: "choose", offer: "B" }, "1");
    saveTimber(f, createTimberSave(next));
    expect(loadTimber(f).state.offer).toBe("B");
    expect(loadTimber(f, true).state.offer).toBeNull();
    expect(f.data.get("dynosty.play.saves")).toBe("keep");
  });
  it.each([
    "{broken",
    '{"format":"dynosty-timber-archive","storageVersion":99}',
    '{"format":"dynosty-timber-archive","storageVersion":1,"current":null,"previous":null}',
  ])("손상된 원본을 덮어쓰지 않는다: %s", (raw) => {
    const f = fixture();
    f.data.set(TIMBER_SAVE_KEY, raw);
    expect(() => loadTimber(f)).toThrow();
    expect(() =>
      saveTimber(f, createTimberSave(createTimberState())),
    ).toThrow();
    expect(f.data.get(TIMBER_SAVE_KEY)).toBe(raw);
  });
  it("저장 실패는 최근과 직전 원문을 보존한다", () => {
    const f = fixture();
    saveTimber(f, createTimberSave(createTimberState()));
    const old = f.data.get(TIMBER_SAVE_KEY);
    expect(() =>
      saveTimber(
        {
          ...f,
          setItem: () => {
            throw new Error("quota");
          },
        },
        createTimberSave(createTimberState()),
      ),
    ).toThrow();
    expect(f.data.get(TIMBER_SAVE_KEY)).toBe(old);
  });
});
