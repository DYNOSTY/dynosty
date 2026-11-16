import type { ReactNode } from "react";

type Props = {
  id: string;
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

// 숨길 때도 자식의 저장 미리보기·파일 연결·재생 상태를 유지한다.
export function WorkspacePanel({ id, title, open, onClose, children }: Props) {
  return (
    <section
      id={id}
      aria-label={`${title} 패널`}
      hidden={!open}
      className="workspace-panel"
    >
      <div className="workspace-panel-heading">
        <h2>{title}</h2>
        <button
          type="button"
          className="quiet-button"
          onClick={onClose}
          aria-label={`${title} 닫기`}
        >
          닫기
        </button>
      </div>
      {children}
    </section>
  );
}
