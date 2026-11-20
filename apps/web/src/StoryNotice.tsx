import type { StoryNoticeData } from "./story-notice.js";

// 이야기 알림 칸: 위 가운데 작은 2.5D 나무 틀. 7초 뒤 App이 지운다 (story-notice.ts가 내용을 만듦)
export function StoryNotice({
  notice,
}: {
  notice: (StoryNoticeData & { key: number }) | null;
}) {
  if (!notice) return null;
  return (
    <div key={notice.key} className="g-notice" role="status">
      <img src="/ui/resources/RES_WOOD.png" alt="" />
      <div>
        <b>{notice.title}</b>
        {notice.note ? <p>{notice.note}</p> : null}
        {notice.gain || notice.loss ? (
          <span className="story-gl">
            {notice.gain ? (
              <span className="is-gain">
                <i>얻음</i>
                {notice.gain}
              </span>
            ) : null}
            {notice.loss ? (
              <span className="is-loss">
                <i>잃음</i>
                {notice.loss}
              </span>
            ) : null}
          </span>
        ) : null}
      </div>
    </div>
  );
}
