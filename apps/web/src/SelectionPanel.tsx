import type { SceneEntity } from "@dynosty/game-core";

// 하단 콘솔은 이름·설명만 — 개발용 예제 상태는 그 아래 작은 한 줄 (칸·상자 없이)
export function SelectionMeta({ entity }: { entity: SceneEntity | null }) {
  if (!entity) return null;
  const state =
    entity.kind === "resident"
      ? entity.motion === "walking"
        ? "걷기 표시"
        : "대기 표시"
      : entity.highlighted
        ? "강조 외형"
        : "기본 외형";
  return (
    <p className="g-sel__meta" aria-live="polite" aria-atomic="true">
      <span>
        {entity.kind === "building"
          ? "건물 예제 · 온돌 둥지"
          : "주민 예제 · 트리케라톱스"}
      </span>
      <span>{state}</span>
      <span>
        {entity.position.x}, {entity.position.y}, {entity.position.z}
      </span>
    </p>
  );
}
