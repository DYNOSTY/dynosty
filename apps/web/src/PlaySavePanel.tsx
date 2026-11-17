type Props = {
  busy: boolean;
  ready: boolean;
  status: string;
  error: string | null;
  onSave: () => void;
  onLoad: (previous: boolean) => void;
};
// 저장 창 첫 단계: 큰 저장 단추 1개 + 기록 2칸 (최근 · 직전)
export function PlaySavePanel({
  busy,
  ready,
  status,
  error,
  onSave,
  onLoad,
}: Props) {
  const off = busy || !ready;
  return (
    <section className="panel g-save" aria-label="생존 게임 저장">
      <button type="button" className="g-save__main" disabled={off} onClick={onSave}>
        <img src="/ui/cmd/records.png" alt="" />
        게임 저장
      </button>
      <div className="g-save__slots">
        <button type="button" className="g-slot" aria-label="게임 불러오기" disabled={off} onClick={() => onLoad(false)}>
          <b>최근 기록</b>
          <small>불러오기</small>
        </button>
        <button type="button" className="g-slot" aria-label="이전 게임 불러오기" disabled={off} onClick={() => onLoad(true)}>
          <b>직전 기록</b>
          <small>불러오기</small>
        </button>
      </div>
      <p className="hint">주민·재고 7종·시간을 이 브라우저에 남깁니다. 불러오면 일시정지로 시작합니다.</p>
      <p aria-live="polite" data-testid="play-save-status" className="g-save__status">
        {busy ? "게임 저장 처리 중" : status}
      </p>
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
