type Props = {
  busy: boolean;
  ready: boolean;
  status: string;
  error: string | null;
  onSave: () => void;
  onLoad: (previous: boolean) => void;
};
export function PlaySavePanel({
  busy,
  ready,
  status,
  error,
  onSave,
  onLoad,
}: Props) {
  return (
    <section className="panel" aria-label="생존 게임 저장">
      <h2>생존 게임 저장</h2>
      <p>
        주민·7종 재고·시간을 이 브라우저에 저장합니다. 불러온 게임은 일시정지로
        시작합니다.
      </p>
      <div className="media-actions">
        <button type="button" disabled={busy || !ready} onClick={onSave}>
          게임 저장
        </button>
        <button
          type="button"
          disabled={busy || !ready}
          onClick={() => onLoad(false)}
        >
          게임 불러오기
        </button>
        <button
          type="button"
          disabled={busy || !ready}
          onClick={() => onLoad(true)}
        >
          이전 게임 불러오기
        </button>
      </div>
      <p aria-live="polite" data-testid="play-save-status">
        {busy ? "게임 저장 처리 중" : status}
      </p>
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
