import {
  advancePlayMinutes,
  createPlaySave,
  createPlayState,
} from "@dynosty/game-core";
import { describe, expect, it } from "vitest";
import { loadPlay, PLAY_SAVE_KEY, savePlay } from "./play-save.js";

function storage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
}
describe("실제 게임 저장 보존", () => {
  it("주민·재고·분 정산 잔여값을 최근·직전으로 복원하고 예제 저장을 보존한다", () => {
    const s = storage();
    s.setItem("dynosty.example.saves", "keep example");
    const first = createPlaySave(advancePlayMinutes(createPlayState(), 17));
    savePlay(s, first);
    const next = createPlaySave(advancePlayMinutes(first.state, 1440));
    savePlay(s, next);
    expect(loadPlay(s)).toEqual(next);
    expect(loadPlay(s, "previous")).toEqual(first);
    expect(s.getItem("dynosty.example.saves")).toBe("keep example");
  });
  it.each([
    "{broken",
    '{"format":"dynosty-play-archive","storageVersion":2}',
    JSON.stringify({
      format: "dynosty-play-archive",
      storageVersion: 1,
      current: {},
      previous: null,
    }),
  ])("손상·미지원 묶음은 읽기·쓰기에서 보존한다: %s", (raw) => {
    const s = storage();
    s.setItem(PLAY_SAVE_KEY, raw);
    expect(() => loadPlay(s)).toThrow();
    expect(() => savePlay(s, createPlaySave(createPlayState()))).toThrow();
    expect(s.getItem(PLAY_SAVE_KEY)).toBe(raw);
  });
  it("기록이 없거나 이전 슬롯이 없을 때 안내하고 쓰기 실패는 기존 슬롯을 유지한다", () => {
    const s = storage();
    expect(() => loadPlay(s)).toThrow();
    savePlay(s, createPlaySave(createPlayState()));
    expect(() => loadPlay(s, "previous")).toThrow();
    const before = s.getItem(PLAY_SAVE_KEY);
    expect(() =>
      savePlay(
        {
          ...s,
          setItem: () => {
            throw new Error("quota");
          },
        },
        createPlaySave(advancePlayMinutes(createPlayState(), 10)),
      ),
    ).toThrow();
    expect(s.getItem(PLAY_SAVE_KEY)).toBe(before);
  });
});
