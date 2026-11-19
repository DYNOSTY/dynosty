import {
  commandLabor,
  createLaborSave,
  createLaborState,
} from "@dynosty/game-core";
import { expect, it } from "vitest";
import {
  LABOR_SAVE_KEY,
  laborSaveError,
  loadLabor,
  saveLabor,
} from "./labor-save.js";

function storage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  };
}
it("기존 교환 저장의 검증 사유를 표시하고 원문을 보존하며 일반 오류는 숨긴다", () => {
  const s = storage();
  saveLabor(s, createLaborSave(createLaborState()));
  const archive = JSON.parse(s.getItem(LABOR_SAVE_KEY) ?? "");
  archive.current.state.exchange.phase = "unsupported";
  const raw = JSON.stringify(archive);
  s.setItem(LABOR_SAVE_KEY, raw);
  let failure: unknown;
  try {
    loadLabor(s);
  } catch (error) {
    failure = error;
  }
  expect(laborSaveError(failure)).toContain("교환 저장");
  expect(s.getItem(LABOR_SAVE_KEY)).toBe(raw);
  expect(laborSaveError(new Error("private storage details"))).not.toContain(
    "private",
  );
});
it("현재·이전 일손 저장을 분리하고 기존 목재·생존 원문을 보존한다", () => {
  const s = storage();
  s.setItem("dynosty.timber.saves", "original timber");
  s.setItem("dynosty.play.saves", "original survival");
  const a = createLaborSave(createLaborState());
  const b = createLaborSave(
    commandLabor(a.state, { type: "advance", minutes: 60 }, "advance"),
  );
  saveLabor(s, a);
  saveLabor(s, b);
  expect(loadLabor(s)).toEqual(b);
  expect(loadLabor(s, true)).toEqual(a);
  expect(s.getItem("dynosty.timber.saves")).toBe("original timber");
  expect(s.getItem("dynosty.play.saves")).toBe("original survival");
});
it.each([
  "{broken",
  JSON.stringify({ format: "future", storageVersion: 2 }),
  JSON.stringify({
    format: "dynosty-labor-archive",
    storageVersion: 1,
    current: {},
    previous: null,
  }),
])(
  "잘못된 기존 저장은 읽기와 덮어쓰기를 거부하며 원문을 보존한다: %s",
  (raw) => {
    const s = storage();
    s.setItem(LABOR_SAVE_KEY, raw);
    expect(() => loadLabor(s)).toThrow();
    expect(() => saveLabor(s, createLaborSave(createLaborState()))).toThrow();
    expect(s.getItem(LABOR_SAVE_KEY)).toBe(raw);
  },
);
it("저장 공간 부족 시 최근·이전 묶음은 그대로 남는다", () => {
  const s = storage();
  const save = createLaborSave(createLaborState());
  saveLabor(s, save);
  saveLabor(s, save);
  const before = s.getItem(LABOR_SAVE_KEY);
  expect(() =>
    saveLabor(
      {
        ...s,
        setItem: () => {
          throw new Error("quota");
        },
      },
      save,
    ),
  ).toThrow("quota");
  expect(s.getItem(LABOR_SAVE_KEY)).toBe(before);
});
it("중복 일손 저장과 손상된 이전 저장도 묶음 전체를 보존한다", () => {
  const s = storage();
  saveLabor(s, createLaborSave(createLaborState()));
  const value = JSON.parse(s.getItem(LABOR_SAVE_KEY) ?? "");
  value.current.state.crew[1].id = "crew-1";
  const raw = JSON.stringify(value);
  s.setItem(LABOR_SAVE_KEY, raw);
  expect(() => loadLabor(s)).toThrow();
  expect(() => saveLabor(s, createLaborSave(createLaborState()))).toThrow();
  expect(s.getItem(LABOR_SAVE_KEY)).toBe(raw);
});
it("이전 저장만 손상돼도 현재 저장 읽기·덮어쓰기를 거부하고 묶음을 보존한다", () => {
  const s = storage();
  const a = createLaborSave(createLaborState());
  saveLabor(s, a);
  saveLabor(s, a);
  const archive = JSON.parse(s.getItem(LABOR_SAVE_KEY) ?? "");
  archive.previous.state.crew[1].id = "crew-1";
  const raw = JSON.stringify(archive);
  s.setItem(LABOR_SAVE_KEY, raw);
  expect(() => loadLabor(s)).toThrow();
  expect(() => loadLabor(s, true)).toThrow();
  expect(() => saveLabor(s, a)).toThrow();
  expect(s.getItem(LABOR_SAVE_KEY)).toBe(raw);
});
