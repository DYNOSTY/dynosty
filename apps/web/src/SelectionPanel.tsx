import type { SceneEntity } from "@dynosty/game-core";

type Props = { entity: SceneEntity | null; onClear: () => void };

export function SelectionPanel({ entity, onClear }: Props) {
  if (!entity) return null;
  const name = entity.kind === "building" ? "건물 예제" : "주민 예제";
  return (
    <section className="workspace-panel selection-info" aria-label="선택 정보">
      <div className="workspace-panel-heading">
        <h2>선택 정보</h2>
        <button type="button" className="quiet-button" onClick={onClear}>
          선택 해제
        </button>
      </div>
      <div aria-live="polite" aria-atomic="true">
        <p className="selection-name">
          {name} <span className="selection-badge">선택됨</span>
        </p>
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
      </div>
      <p className="hint">
        기존 예제의 표시 정보입니다. 선택은 날짜나 게임 저장 내용을 바꾸지
        않습니다.
      </p>
      <p className="hint">빈 바닥을 클릭해도 선택을 해제할 수 있습니다.</p>
    </section>
  );
}
