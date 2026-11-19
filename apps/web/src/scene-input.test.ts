import { describe, expect, it } from "vitest";
import { observeSceneClicks } from "./scene-input.js";

function fixture() {
  const focusCalls: FocusOptions[] = [];
  class Surface extends EventTarget {
    focus(options?: FocusOptions) {
      focusCalls.push(options ?? {});
    }
    getBoundingClientRect() {
      return { left: 10, top: 20, width: 200, height: 100 };
    }
  }
  const canvas = new Surface();
  const release = new EventTarget();
  const clicks: number[][] = [];
  const stop = observeSceneClicks(
    canvas,
    (x, y) => clicks.push([x, y]),
    release,
  );
  const send = (type: string, x = 30, y = 40, pointerId = 1, button = 0) => {
    const event = Object.assign(new Event(type), {
      clientX: x,
      clientY: y,
      pointerId,
      button,
    });
    (type === "pointerdown" || type === "lostpointercapture"
      ? canvas
      : release
    ).dispatchEvent(event);
  };
  return { clicks, send, stop, focusCalls };
}

describe("장면 클릭 입력", () => {
  it("누를 때 스크롤 없이 초점을 주고 종료 뒤에는 초점도 바꾸지 않는다", () => {
    const f = fixture();
    f.send("pointerdown");
    expect(f.focusCalls).toEqual([{ preventScroll: true }]);
    f.stop();
    f.send("pointerdown");
    expect(f.focusCalls).toHaveLength(1);
  });
  it("빠른 연속 클릭을 모두 전달하고 캔버스 기준 좌표로 변환한다", () => {
    const f = fixture();
    try {
      f.send("pointerdown");
      f.send("pointerup");
      f.send("pointerdown", 50, 60);
      f.send("pointerup", 50, 60);
      expect(f.clicks).toEqual([
        [20, 20],
        [40, 40],
      ]);
    } finally {
      f.stop();
    }
  });
  it("드래그 후 출발점으로 돌아와도 선택하지 않고 우클릭·영역 밖 해제를 제외한다", () => {
    const f = fixture();
    try {
      f.send("pointerdown");
      f.send("pointermove", 60, 40);
      f.send("pointermove");
      f.send("pointerup");
      f.send("pointerdown", 30, 40, 1, 2);
      f.send("pointerup", 30, 40, 1, 2);
      f.send("pointerdown", 209, 40);
      f.send("pointerup", 215, 40);
      expect(f.clicks).toEqual([]);
    } finally {
      f.stop();
    }
  });
  it("다중 터치·취소·포인터 캡처 해제에서 선택하지 않고 다음 단일 입력은 복구한다", () => {
    const f = fixture();
    try {
      f.send("pointerdown", 30, 40, 1);
      f.send("pointerdown", 50, 40, 2);
      f.send("pointerup", 50, 40, 2);
      f.send("pointerup", 30, 40, 1);
      f.send("pointerdown");
      f.send("pointercancel");
      f.send("pointerup");
      f.send("pointerdown");
      f.send("lostpointercapture");
      f.send("pointerup");
      expect(f.clicks).toEqual([]);
      f.send("pointerdown");
      f.send("pointerup");
      expect(f.clicks).toEqual([[20, 20]]);
    } finally {
      f.stop();
    }
  });
  it("종료 시 입력과 대기 중인 포인터를 정리한다", () => {
    const f = fixture();
    f.send("pointerdown");
    f.stop();
    f.send("pointerup");
    f.send("pointerdown");
    f.send("pointerup");
    expect(f.clicks).toEqual([]);
  });
});
