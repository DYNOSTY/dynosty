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
  it("v10 저장을 읽어 v12로 이어가되 이전 원본을 그대로 보존한다", () => {
    const f = fixture(),
      current = createTimberState();
    const {
      loggingSites: _sites,
      mineralSites: _minerals,
      initialMinerals: _initial,
      ...base
    } = current;
    const { siteId: _id, remaining, ...rest } = base.logging;
    const logging = { ...rest, forest: remaining };
    const old = JSON.stringify({
      format: "dynosty-timber-archive",
      storageVersion: 1,
      current: {
        format: "dynosty-timber",
        saveVersion: 1,
        state: { ...base, version: 10, logging },
      },
      previous: null,
    });
    f.data.set("dynosty.timber.saves.v10", old);
    const loaded = loadTimber(f);
    expect(loaded.state.version).toBe(18);
    saveTimber(f, loaded);
    expect(f.data.get("dynosty.timber.saves.v10")).toBe(old);
    expect(loadTimber(f).state.loggingSites).toHaveLength(12);
  });
  it("생존/예제 원본을 유지하고 최근과 직전 상태를 복원한다", () => {
    const f = fixture();
    f.data.set("dynosty.play.saves", "keep");
    f.data.set("dynosty.timber.saves", "older-version-keep");
    f.data.set("dynosty.timber.saves.v6", "previous-format-keep");
    f.data.set("dynosty.timber.saves.v7", "life-v7-keep");
    f.data.set("dynosty.timber.saves.v8", "life-v8-keep");
    f.data.set("dynosty.timber.saves.v9", "life-v9-keep");
    const s = createTimberState();
    saveTimber(f, createTimberSave(s));
    const next = commandTimber(s, { type: "choose", offer: "B" }, "1");
    saveTimber(f, createTimberSave(next));
    expect(loadTimber(f).state.offer).toBe("B");
    expect(loadTimber(f, true).state.offer).toBeNull();
    expect(f.data.get("dynosty.play.saves")).toBe("keep");
    expect(f.data.get("dynosty.timber.saves")).toBe("older-version-keep");
    expect(f.data.get("dynosty.timber.saves.v6")).toBe("previous-format-keep");
    expect(f.data.get("dynosty.timber.saves.v7")).toBe("life-v7-keep");
    expect(f.data.get("dynosty.timber.saves.v8")).toBe("life-v8-keep");
    expect(f.data.get("dynosty.timber.saves.v9")).toBe("life-v9-keep");
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
