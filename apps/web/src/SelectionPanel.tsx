import type { SceneEntity } from "@dynosty/game-core";

type Props = {
  entity: SceneEntity | null;
  notices?: string[] | undefined;
  onClear: () => void;
};

export function SelectionPanel({ entity, notices, onClear }: Props) {
  if (!entity) return null;
  const name = notices
    ? "복홀 방 게시판"
    : entity.kind === "building"
      ? "건물 예제 · 온돌 둥지"
      : "주민 예제 · 트리케라톱스";
  return (
    <section className="workspace-panel selection-info" aria-label="선택 정보">
      <div aria-live="polite" aria-atomic="true">
        <h2 className="selection-name">{name}</h2>
        <button
          type="button"
          className="selection-clear"
          onClick={onClear}
          aria-label="선택 해제"
        >
          ×
        </button>
        {notices ? (
          notices.length ? (
            <ul>
              {notices.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : (
            <p>아직 붙은 방이 없습니다.</p>
          )
        ) : (
          <dl className="selection-facts">
            <div>
              <dt>종류</dt>
              <dd>{entity.kind === "building" ? "건물" : "주민"}</dd>
            </div>
            <div>
              <dt>예제 표시 상태</dt>
              <dd>
                {entity.kind === "resident"
                  ? entity.motion === "walking"
                    ? "걷기 표시"
                    : "대기 표시"
                  : entity.highlighted
                    ? "강조 외형"
                    : "기본 외형"}
              </dd>
            </div>
            <div>
              <dt>예제 좌표 (X, Y, Z)</dt>
              <dd>
                {entity.position.x}, {entity.position.y}, {entity.position.z}
              </dd>
            </div>
          </dl>
        )}
      </div>
    </section>
  );
}
