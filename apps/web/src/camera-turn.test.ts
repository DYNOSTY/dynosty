import { expect, it } from "vitest";
import { TURN_STEP, turnStep } from "./camera-turn.js";

/** 한 번 눌렀을 때 프레임마다 돈 각을 모음 */
const run = (fps: number, seconds = 3) => {
  let left = TURN_STEP,
    speed = 0,
    turned = 0;
  const steps: number[] = [];
  for (let i = 0; i < fps * seconds; i++) {
    const t = turnStep(left, speed, 1 / fps);
    left -= t.step;
    speed = t.speed;
    turned += t.step;
    steps.push(t.step);
  }
  return { left, speed, turned, steps };
};

it("한 번 누르면 정확히 20도를 돌고 멈춘다 (느린 화면에서도)", () => {
  for (const fps of [60, 30, 13]) {
    const r = run(fps);
    expect(r.turned).toBeCloseTo(TURN_STEP, 6);
    expect(r.left).toBe(0);
    expect(r.speed).toBe(0);
  }
});

it("출발과 도착이 부드럽고 넘치지 않는다", () => {
  const { steps } = run(60);
  const fastest = steps.indexOf(Math.max(...steps));
  // 첫 프레임에 휙 돌지 않음 (예전 방식은 첫 프레임에 전체의 2할을 돌았음)
  expect(steps[0]).toBeLessThan(TURN_STEP * 0.05);
  // 서서히 빨라졌다가(여러 프레임에 걸쳐) 서서히 느려지기만 함
  expect(fastest).toBeGreaterThan(3);
  for (let i = 1; i <= fastest; i++)
    expect(steps[i]).toBeGreaterThanOrEqual(steps[i - 1] ?? 0);
  // (맨 끝에 남은 각을 딱 맞추는 한 걸음은 0.006도보다 작아 눈에 안 보이므로 빼고 봄)
  for (let i = fastest + 1; i < steps.length; i++)
    if ((steps[i] ?? 0) > 1e-4)
      expect(steps[i]).toBeLessThanOrEqual(steps[i - 1] ?? 0);
  expect(Math.min(...steps)).toBeGreaterThanOrEqual(0); // 되돌아가지 않음 (넘침 없음)
});
