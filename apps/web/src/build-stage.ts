/** 기존 공사 진행률을 표시용 세 단계로만 나눈다. */
export function buildStage(progress: number): 1 | 2 | 3 {
  if (!Number.isFinite(progress) || progress < 1 / 3) return 1;
  return progress < 2 / 3 ? 2 : 3;
}
