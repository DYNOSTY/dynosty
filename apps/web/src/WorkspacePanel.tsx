import type { ReactNode } from "react";

type Props = {
  id: string;
  title: string;
  /** 둘째 단계 화면 이름. 제목 옆에 붙는다 */
  subtitle?: string | undefined;
  open: boolean;
  onClose: () => void;
  /** 있으면 제목 앞에 ← 뒤로 */
  onBack?: (() => void) | undefined;
  children: ReactNode;
};

// 숨길 때도 자식의 저장 미리보기·파일 연결·재생 상태를 유지한다.
export function WorkspacePanel({
  id,
  title,
  subtitle,
  open,
  onClose,
  onBack,
  children,
}: Props) {
  return (
    <section
      id={id}
      aria-label={`${title} 패널`}
      hidden={!open}
      className="workspace-panel"
    >
      <div className="workspace-panel-heading">
        {onBack ? (
          <button
            type="button"
            className="g-knob g-knob--back"
            onClick={onBack}
            aria-label="뒤로"
            title="뒤로"
          />
        ) : null}
        <h2>
          {title}
          {subtitle ? <span className="g-sub"> · {subtitle}</span> : null}
        </h2>
        <button
          type="button"
          className="g-knob g-knob--close"
          onClick={onClose}
          aria-label={`${title} 닫기`}
          title="닫기 (Esc)"
        />
      </div>
      {children}
    </section>
  );
}
