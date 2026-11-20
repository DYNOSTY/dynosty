import {
  CHAPTERS,
  campaignOf,
  canPay,
  foodWarnings,
  type TimberCommand,
  type TimberState,
} from "@dynosty/game-core";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useAudio } from "./AudioProvider.js";
import {
  campaignPage,
  moraleAdvice,
  PATROL_NAMES,
  type ScenePage,
} from "./campaign-scenes.js";

import "./campaign.css";

const media = "/story/campaign/";
export function PatrolPortrait({ index }: { index: number }) {
  return (
    <span
      className="patrol-portrait"
      aria-hidden="true"
      style={{
        backgroundPosition: `${(index % 2) * 100}% ${(Math.floor(index / 2) % 2) * 100}%`,
      }}
    />
  );
}
function SceneDialog({
  page,
  close,
  act,
  advisory,
}: {
  page: ScenePage;
  advisory: ReactNode;
  close: () => void;
  act: (action: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [cursor, setCursor] = useState(0);
  const lineIndex = Math.min(cursor, page.lines.length - 1);
  const [name, words] = page.lines[lineIndex]!;
  const face = PATROL_NAMES.findIndex((x) => x === name);
  const last = lineIndex === page.lines.length - 1;
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="campaign-dialog"
      aria-label={page.title}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header>
        <h2>{page.title}</h2>
        <button type="button" onClick={close} aria-label="장면 접기">
          접기
        </button>
      </header>
      {page.illustration && (
        <img
          className="campaign-still"
          alt={page.title}
          src={`/story/campaign/${page.illustration}.webp`}
        />
      )}
      {page.clip && (
        <video
          key={page.clip}
          src={media + page.clip + ".mp4"}
          muted
          playsInline
          autoPlay
          controls
          preload="metadata"
          aria-label={page.title + " 무성 컷씬"}
        />
      )}
      {page.goal && <p className="campaign-goal">{page.goal}</p>}
      <div className="campaign-speech" aria-live="polite">
        {face >= 0 ? (
          <PatrolPortrait index={face} />
        ) : name === "나르미" || name === "달이" ? (
          <img
            alt=""
            src={`/art/advisers/${name === "나르미" ? "nareumi" : "dali"}/${["12", "10", "11", "13"].includes(page.music) ? "concern" : "neutral"}.png`}
          />
        ) : null}
        <div>
          <strong>{name}</strong>
          <p>{words}</p>
        </div>
      </div>
      {advisory}
      <footer>
        {cursor > 0 && (
          <button type="button" onClick={() => setCursor(lineIndex - 1)}>
            이전 대사
          </button>
        )}
        {!last ? (
          <button type="button" onClick={() => setCursor(lineIndex + 1)}>
            다음 대사 · {lineIndex + 1}/{page.lines.length}
          </button>
        ) : (
          page.choices.map((x) => (
            <button
              type="button"
              key={x.action}
              disabled={x.disabled}
              onClick={() => act(x.action)}
            >
              {x.label}
            </button>
          ))
        )}
        {last && (
          <button type="button" onClick={close}>
            {page.title.includes("완료") ? "지금 단계에 머물기" : "마을 보기"}
          </button>
        )}
      </footer>
    </dialog>
  );
}
export function CampaignPanel({
  state: s,
  command,
  trade,
  officeSelected,
  clearOfficeSelection,
  work,
}: {
  state: TimberState;
  command: (cmd: TimberCommand) => void;
  trade: boolean;
  officeSelected?: boolean;
  clearOfficeSelection: () => void;
  work: boolean;
}) {
  const c = campaignOf(s);
  const p = campaignPage(s);
  const advice = moraleAdvice(s);
  const advisory = advice && (
    <p className="campaign-advisory" role="status">
      <strong>{advice[0]}</strong> {advice[1]}
    </p>
  );
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [petition, setPetition] = useState(false);
  const [manualOffice, setManualOffice] = useState(false);
  const canOpenOffice = !["opening", "departure"].includes(c.beat);
  const office = canOpenOffice && (manualOffice || officeSelected);
  const [sound, setSound] = useState(false);
  const { audioRef } = useAudio();
  const canPetition =
    ["patrol", "roads", "capital", "arrival", "winter", "vigil"].includes(
      c.beat,
    ) && c.petitionDay !== s.world.day;
  const petitionOpen = petition && canPetition;
  const open =
    petitionOpen || opened === p.key || (p.auto && dismissed !== p.key);
  const petitionPage: ScenePage = {
    key: "petition-" + s.world.day,
    title: "배식 줄에서 온 청",
    music: "10",
    goal: "오늘 저녁 배식",
    auto: false,
    lines: [
      [
        "덕순이",
        "고리님, 부상자 넷이 식당 줄에 설 수가 없어요. 오늘 잡은 물고기 넷만 따로 빼 주시면 살을 발라다 먹일 수 있어요.",
      ],
      [
        "길룡",
        "제 고깃국도 한 그릇 맡아 주세요. 일어나서 못 받는다고 제 몫이 사라지는 건 아니지요?",
      ],
      [
        "나르미",
        "생선 넷을 풀면 오늘 저녁은 제가 가져다드릴게요. 비축을 지키신다면 그 사정도 제가 가서 전할게요.",
      ],
    ],
    choices: [
      {
        action: "share",
        label: "어류 4를 내어 병상까지 배달",
        disabled: !canPay(s, "RES_FISH", 4),
      },
      { action: "reserve", label: "오늘은 창고의 비축 유지" },
    ],
  };
  const scene = petitionOpen ? petitionPage : p;
  const track = open
    ? scene.music
    : c.ending
      ? p.music
      : trade
        ? "03"
        : foodWarnings(s.world).length
          ? "10"
          : c.beat === "winter"
            ? "11"
            : work
              ? "02"
              : c.beat === "patrol" &&
                  Object.keys(s.scoutDepartures ?? {}).length > c.reports.length
                ? "05"
                : s.world.minute < 360 || s.world.minute >= 1080
                  ? "04"
                  : "01";
  useEffect(() => {
    if (!sound) return;
    const audio = audioRef.current;
    void audio
      ?.playMedia(
        "bgm",
        media + track + ".ogg",
        () => {},
        () => setSound(false),
      )
      .catch(() => setSound(false));
    return () => audio?.stopMedia("bgm");
  }, [track, sound, audioRef]);
  useEffect(() => {
    const start = () => setSound(true);
    document.addEventListener("pointerdown", start, { once: true });
    document.addEventListener("keydown", start, { once: true });
    return () => {
      document.removeEventListener("pointerdown", start);
      document.removeEventListener("keydown", start);
    };
  }, []);
  const close = () => {
    setOpened(null);
    setDismissed(p.key);
    setPetition(false);
  };
  function act(action: string) {
    command({ type: "campaign", beat: c.beat, action });
    setOpened(null);
    if (petitionOpen) {
      setPetition(false);
      return;
    }
    setDismissed(p.key);
  }
  return (
    <div className="campaign-quest">
      <button
        type="button"
        className="scout-all"
        onClick={() => {
          setOpened(p.key);
          setDismissed(null);
        }}
      >
        {s.chapter ?? 1}단계 · {CHAPTERS[(s.chapter ?? 1) - 1]}
        <small>{p.goal || p.title}</small>
      </button>
      {canOpenOffice && (
        <button
          type="button"
          className="scout-all"
          aria-expanded={office}
          onClick={() => {
            if (office && officeSelected) clearOfficeSelection();
            setManualOffice(!office);
          }}
        >
          관아 · 순라 배치
        </button>
      )}
      {office && (
        <section className="office-panel" aria-label="관아">
          <img
            src="/art/village-office.webp"
            alt="마을 북쪽 관아와 방을 붙이는 포졸"
          />
          <strong>
            관아 · 순라 포졸{" "}
            {
              s.residents.filter(
                (r) => r.workplaceId === "office" && r.health === "healthy",
              ).length
            }
            명
          </strong>
          <p>
            순라 단계를 높일 때마다 다툼과 화재가 일어날 확률이 절반으로 줄어요.
          </p>
          {([0, 4, 8, 16] as const).map((count, i) => (
            <button
              type="button"
              key={count}
              onClick={() => command({ type: "set-guards", count })}
            >
              {i ? i + "단계 · " + count + "명" : "순라 해제"}
            </button>
          ))}
        </section>
      )}
      {s.decree && (
        <aside
          className="office-decree"
          key={s.decree.serial}
          aria-live="polite"
        >
          <span aria-hidden="true" className="office-herald">
            🦖
          </span>
          <strong>방 · {s.decree.title}</strong>
          <small>“{s.decree.reaction}”</small>
        </aside>
      )}
      {canPetition && (
        <button
          type="button"
          className="scout-all"
          onClick={() => setPetition(true)}
        >
          주민의 청 듣기
        </button>
      )}
      {["patrol", "roads", "capital", "arrival", "winter", "vigil"].includes(
        c.beat,
      ) && (
        <button
          type="button"
          className="scout-all"
          onClick={() => command({ type: "advance", minutes: 1440 })}
        >
          마을 하루 진행
        </button>
      )}
      {open ? (
        <SceneDialog
          key={scene.key}
          page={scene}
          close={close}
          act={act}
          advisory={advisory}
        />
      ) : (
        advisory
      )}
    </div>
  );
}
