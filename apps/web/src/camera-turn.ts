// 화면 좌우 회전 (Q·E): 한 번에 20도, 서서히 빨라졌다 서서히 멈춤 (사용자 2026-11-22 "20도로, 넘어갈 때 부드럽게")
export const TURN_STEP = (20 * Math.PI) / 180;
/** 따라붙는 세기: 클수록 빨리 돈다 (7.5면 0.13초에 걸쳐 빨라지고 한 걸음이 0.8초쯤에 멎음) */
const SNAP = 7.5;

/**
 * 남은 각(left)과 지금 도는 빠르기(speed)에서 이번 프레임에 돌 각과 새 빠르기를 구함.
 * 넘치지 않는 용수철(임계 감쇠)이라 출발과 도착이 모두 부드럽고, 도는 중에 또 눌러도 끊기지 않고 이어짐.
 */
export function turnStep(left: number, speed: number, dt: number) {
  const next = speed + (SNAP * SNAP * left - 2 * SNAP * speed) * dt;
  // 다 왔으면 남은 만큼만 돌고 멈춤 (끝없이 조금씩 도는 것을 막음)
  if (Math.abs(left) < 1e-4 && Math.abs(next) < 1e-3)
    return { step: left, speed: 0 };
  return { step: next * dt, speed: next };
}
