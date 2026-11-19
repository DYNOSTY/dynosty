interface ClickSurface extends EventTarget {
  focus?(options?: FocusOptions): void;
  getBoundingClientRect(): {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

// 카메라 입력을 가로채지 않고, 이동 6px 이내의 단일 왼쪽 클릭만 전달한다.
// 탭 간격 제한이 없어 서로 다른 대상을 빠르게 눌러도 입력이 누락되지 않는다.
export function observeSceneClicks(
  canvas: ClickSurface,
  onClick: (x: number, y: number) => void,
  releaseTarget: EventTarget = window,
) {
  const pointers = new Map<number, { x: number; y: number; valid: boolean }>();
  const down = (event: Event) => {
    // Babylon의 기본 focus가 캔버스를 스크롤해 누른 위치를 바꾸지 않게 먼저 초점을 둔다.
    canvas.focus?.({ preventScroll: true });
    const p = event as PointerEvent;
    pointers.set(p.pointerId, {
      x: p.clientX,
      y: p.clientY,
      valid: p.button === 0,
    });
    if (pointers.size > 1)
      for (const start of pointers.values()) start.valid = false;
  };
  const move = (event: Event) => {
    const p = event as PointerEvent;
    const start = pointers.get(p.pointerId);
    if (start && Math.hypot(p.clientX - start.x, p.clientY - start.y) > 6)
      start.valid = false;
  };
  const cancel = (event: Event) => {
    pointers.delete((event as PointerEvent).pointerId);
  };
  const up = (event: Event) => {
    const p = event as PointerEvent;
    const start = pointers.get(p.pointerId);
    pointers.delete(p.pointerId);
    if (
      !start?.valid ||
      p.button !== 0 ||
      Math.hypot(p.clientX - start.x, p.clientY - start.y) > 6
    )
      return;
    const rect = canvas.getBoundingClientRect();
    const x = p.clientX - rect.left;
    const y = p.clientY - rect.top;
    if (x >= 0 && y >= 0 && x < rect.width && y < rect.height) onClick(x, y);
  };
  canvas.addEventListener("pointerdown", down, true);
  releaseTarget.addEventListener("pointermove", move);
  releaseTarget.addEventListener("pointerup", up);
  releaseTarget.addEventListener("pointercancel", cancel);
  canvas.addEventListener("lostpointercapture", cancel);
  return () => {
    pointers.clear();
    canvas.removeEventListener("pointerdown", down, true);
    releaseTarget.removeEventListener("pointermove", move);
    releaseTarget.removeEventListener("pointerup", up);
    releaseTarget.removeEventListener("pointercancel", cancel);
    canvas.removeEventListener("lostpointercapture", cancel);
  };
}
