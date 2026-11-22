import {
  CHAPTERS,
  CONVOY_GOALS,
  CONVOY_ITEMS,
  campaignOf,
  canDispatchConvoy,
  canPay,
  capitalMealsReady,
  capitalRoad,
  convoyLoad,
  convoyTarget,
  type Difficulty,
  foodWarnings,
  GAME_RULES,
  isDifficulty,
  mutantNames,
  mutantRepairCost,
  mutantStructure,
  policyWait,
  type TimberCommand,
  type TimberState,
  villageDefenseActive,
  villageTemperature,
} from "@dynosty/game-core";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useAudio } from "./AudioProvider.js";
import {
  CampaignFilm,
  fadeOut,
  filmSeen,
  rememberFilm,
} from "./CampaignFilm.js";
import {
  campaignPage,
  firstVillageTask,
  gatheringRumor,
  moraleAdvice,
  PATROL_NAMES,
  type ScenePage,
} from "./campaign-scenes.js";
import { EndingMenu } from "./EndingMenu.js";
import { completedChapters } from "./stage-replay.js";
import { VillageBulletin } from "./VillageBulletin.js";

import "./campaign.css";

const gateLevels = [0, 4, 8, 16] as const;
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
  difficulty,
  close,
  act,
  advisory,
}: {
  page: ScenePage;
  difficulty: Difficulty;
  advisory: ReactNode;
  close: () => void;
  act: (action: string, difficulty?: Difficulty) => void;
}) {
  const palaceFilm = page.illustration === "king-palace-night";
  const dialog = useRef<HTMLDialogElement>(null);
  const [cursor, setCursor] = useState(0);
  const [pending, setPending] = useState(page.key === "opening" ? "next" : "");
  const [filmDone, setFilmDone] = useState(
    () => page.clip === "one" && filmSeen("one"),
  );
  const [entryFilm, setEntryFilm] = useState("");
  const [replayIntro, setReplayIntro] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [level, setLevel] = useState(difficulty);
  const stage = page.nextStage;
  const frameIndex = cursor - page.lines.length;
  const frame = page.frames?.[frameIndex];
  const flashback = page.key === "summit" && page.lines[cursor]?.[1] === "";
  const familyScene = page.key === "summit" && cursor > 0 && cursor <= 5;
  const storyLength = page.lines.length + (page.frames?.length ?? 0);
  const total = storyLength + Number(!!page.resultQuote);
  const result = cursor === storyLength ? page.resultQuote : undefined;
  const backdrop = page.frames?.at(-1)?.image;
  const lineIndex = Math.min(cursor, page.lines.length - 1);
  const frameImage = frame?.image;
  useEffect(() => {
    if (!frameImage || cursor >= total - 1) return;
    const timer = window.setTimeout(() => setCursor(cursor + 1), 7500);
    return () => window.clearTimeout(timer);
  }, [cursor, frameImage, total]);
  const [name, words] = page.lines[lineIndex] ?? ["", ""];
  const firstChoice = page.choices[0];
  const later =
    page.lineImages?.[cursor] ??
    (page.lineIllustration?.at === cursor
      ? page.lineIllustration
      : page.laterIllustration && cursor >= page.laterIllustration.from
        ? page.laterIllustration
        : undefined);
  const face = PATROL_NAMES.findIndex((x) => x === name);
  const last = cursor === total - 1;
  const film = page.clip === "one" && !filmDone ? page.clip : undefined;
  const filmLine = page.resultQuote
    ? 1
    : page.lines.findIndex(
        (_, index) =>
          !page.lineImages?.[index] && index !== page.lineIllustration?.at,
      );
  const inlineFilm =
    page.clip &&
    !["opening", "one", "two", "three", "escort", "four", "five"].includes(
      page.clip,
    ) &&
    !pending &&
    cursor === filmLine &&
    !later &&
    !frame
      ? page.clip
      : undefined;
  const bubble =
    !pending &&
    !film &&
    !inlineFilm &&
    !page.resultQuote &&
    !page.nextStage &&
    !page.illustration &&
    !frame &&
    !familyScene &&
    !flashback &&
    !later;
  const cinematic = !!(
    inlineFilm ||
    frame ||
    flashback ||
    later ||
    page.illustration ||
    familyScene
  );
  const dock = bubble
    ? document.getElementById("campaign-dialogue-dock")
    : null;
  function step(next: number) {
    if (cinematic) fadeOut(dialog.current, () => setCursor(next));
    else setCursor(next);
  }
  useEffect(() => {
    if (page.illustration === "gori-exile") rememberFilm("collapse");
    if (palaceFilm) rememberFilm("king-palace-night");
    if (inlineFilm) rememberFilm(inlineFilm);
    if (frame) rememberFilm("ending-" + frame.image.charAt(4));
  }, [frame, inlineFilm, page.illustration, palaceFilm]);
  const openDialog = useCallback(
    (element: HTMLDialogElement | null) => {
      dialog.current = element;
      if (!element) return;
      if (bubble) element.setAttribute("open", "");
      else element.showModal();
      return () => element.close();
    },
    [bubble],
  );
  const stageFilm =
    stage === "escort"
      ? stage
      : stage
        ? ["one", "two", "three", "four", "five"][stage - 1]
        : undefined;
  const playing = entryFilm || film;
  if (playing) {
    const finish = () =>
      fadeOut(dialog.current, () => {
        rememberFilm(playing);
        if (entryFilm) act(pending, level);
        else setFilmDone(true);
      });
    return (
      <dialog
        key={playing}
        ref={openDialog}
        className="film-screen"
        aria-label={page.title}
        onCancel={(e) => {
          e.preventDefault();
          finish();
        }}
      >
        <CampaignFilm
          key={playing}
          id={playing}
          title={page.title}
          finish={finish}
        />
      </dialog>
    );
  }
  if (pending && stage)
    return (
      <dialog
        ref={openDialog}
        className="campaign-dialog result-screen mission-entry"
        aria-label="미션 시작 준비"
        style={{
          backgroundImage: `linear-gradient(0deg,#0b111aeb,transparent 78%),url(${media}mission-${stage}.webp)`,
        }}
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
      >
        <h2>{stage === "escort" ? "충녕의 남하" : CHAPTERS[stage - 1]}</h2>
        {selecting && (
          <label>
            난이도{" "}
            <select
              value={level}
              onChange={(e) =>
                setLevel(
                  isDifficulty(e.target.value) ? e.target.value : "normal",
                )
              }
            >
              <option value="easy">쉬움</option>
              <option value="normal">보통</option>
              <option value="hard">어려움</option>
            </select>
          </label>
        )}
        {selecting && stageFilm && filmSeen(stageFilm) && (
          <label className="entry-replay-choice">
            <input
              type="checkbox"
              checked={replayIntro}
              onChange={(e) => setReplayIntro(e.target.checked)}
            />{" "}
            도입 영상 다시 보기
          </label>
        )}
        <footer>
          <button type="button" onClick={() => setSelecting(!selecting)}>
            난이도 설정
          </button>
          <button
            type="button"
            onClick={() =>
              stageFilm &&
              (replayIntro || (stage !== 1 && !filmSeen(stageFilm)))
                ? setEntryFilm(stageFilm)
                : act(pending, level)
            }
          >
            시작하기
          </button>
          <button type="button" onClick={close}>
            돌아가기
          </button>
        </footer>
      </dialog>
    );
  const content = (
    <dialog
      ref={openDialog}
      className={
        result
          ? "campaign-dialog result-screen"
          : bubble
            ? "campaign-dialog scene-bubble"
            : cinematic
              ? "campaign-dialog scene-cinema"
              : "campaign-dialog"
      }
      style={
        result && backdrop
          ? {
              backgroundImage: `linear-gradient(#10141985,#101419ad),url(${media}${backdrop}.webp)`,
            }
          : undefined
      }
      aria-label={page.title}
      onKeyDown={(event) => {
        if (
          event.target === event.currentTarget &&
          (event.key === "Enter" || event.key === " ")
        ) {
          event.preventDefault();
          event.currentTarget.click();
        }
      }}
      onClick={(event) => {
        if (
          !(bubble || cinematic) ||
          (event.target as HTMLElement).closest("button,video,select")
        )
          return;
        if (!last) step(cursor + 1);
        else if (
          bubble &&
          !stage &&
          page.choices.length === 1 &&
          firstChoice &&
          !firstChoice.disabled
        )
          act(firstChoice.action);
      }}
      onCancel={(e) => {
        e.preventDefault();
        if (cinematic) fadeOut(dialog.current, close);
        else close();
      }}
    >
      {result ? (
        <>
          <h2 className="result-heading">{page.title}</h2>
          {!backdrop && page.clip && (
            <video
              className="result-film"
              src={media + page.clip + ".mp4"}
              autoPlay
              muted
              playsInline
              loop
            />
          )}
          <blockquote className="result-quote">
            <p>{result[1]}</p>
            <footer>{result[0]}</footer>
          </blockquote>
        </>
      ) : (
        <>
          <header>
            <h2>{page.title}</h2>
            <button
              type="button"
              onClick={() =>
                cinematic ? fadeOut(dialog.current, close) : close()
              }
              aria-label="장면 접기"
            >
              접기
            </button>
          </header>
          {inlineFilm && <CampaignFilm id={inlineFilm} title={page.title} />}
          {frame && (
            <video
              key={frame.image}
              className="campaign-still"
              aria-label={page.title + " 엔딩 영상"}
              src={
                media +
                "ending-" +
                frame.image.charAt(4) +
                ".mp4#t=" +
                frameIndex * 7.5 +
                "," +
                (frameIndex + 1) * 7.5
              }
              poster={media + frame.image + ".webp"}
              playsInline
              muted
              autoPlay
            />
          )}
          {flashback && (
            <img
              className="campaign-still"
              src={media + "end-3b.webp"}
              alt="도성 광장에 홀로 선 왕의 뒷모습"
            />
          )}
          {palaceFilm && (
            <img
              className="campaign-still"
              src={media + "king-palace-night-half-speed.gif"}
              alt="궁궐 침전에서 피습당한 왕"
            />
          )}
          {!palaceFilm &&
            !flashback &&
            !frame &&
            (familyScene || later || page.illustration) && (
              <img
                key={later?.image ?? page.illustration ?? "family"}
                className="campaign-still"
                alt={
                  familyScene
                    ? "복홀 성문 앞의 양녕과 새끼 스피노사우르스 포와 혜"
                    : (later?.alt ?? page.title)
                }
                src={`/story/campaign/${familyScene ? "royal-family" : (later?.image ?? page.illustration)}.webp`}
              />
            )}
          {page.key === "summit" && cursor === 1 && (
            <section className="prince-greetings" aria-label="두 왕자의 인사">
              <p>
                <strong>포</strong> 복홀 어른들, 안녕하세요! 쥬신의 왕자 포예요!
              </p>
              <p>
                <strong>혜</strong> 저도 왕자예요! 혜라고 불러 주세요!
              </p>
            </section>
          )}
          {!flashback &&
            !bubble &&
            page.goal &&
            !["departure", "after"].includes(page.key) && (
              <p className="campaign-goal">{page.goal}</p>
            )}
          {!flashback && (frame ? frame.words : words) && (
            <div className="campaign-speech" aria-live="polite">
              {frame ? null : face >= 0 ? (
                <PatrolPortrait index={face} />
              ) : name === "나르미" || name === "달이" ? (
                <img
                  alt=""
                  src={`/art/advisers/${name === "나르미" ? "nareumi" : "dali"}/${["12", "10", "11", "13"].includes(page.music) ? "concern" : "neutral"}.png`}
                />
              ) : ["고리", "가솔을 이끄는 귀족", "노귀족"].includes(name) ? (
                <span
                  aria-hidden="true"
                  className={
                    "story-face " +
                    (name === "고리"
                      ? "gori"
                      : name === "노귀족"
                        ? "elder"
                        : "noble")
                  }
                />
              ) : null}
              <div>
                <strong>{frame ? "복홀의 기록" : name}</strong>
                <p>{frame?.words ?? words}</p>
              </div>
            </div>
          )}
          {bubble && advisory}
        </>
      )}
      <footer>
        {["departure", "after"].includes(page.key) && firstChoice && !last && (
          <button
            type="button"
            onClick={() => {
              if (
                page.key === "departure" &&
                page.lineIllustration &&
                cursor < page.lineIllustration.at
              )
                step(page.lineIllustration.at);
              else if (cinematic)
                fadeOut(dialog.current, () => act(firstChoice.action));
              else act(firstChoice.action);
            }}
          >
            대화 건너뛰기
          </button>
        )}
        {cursor > 0 && (
          <button type="button" onClick={() => step(cursor - 1)}>
            이전 대사
          </button>
        )}
        {!last ? (
          <button type="button" onClick={() => step(cursor + 1)}>
            다음 대사 · {cursor + 1}/{total}
          </button>
        ) : (
          page.choices.map((x) => (
            <button
              type="button"
              key={x.action}
              disabled={x.disabled}
              onClick={() => {
                if (stage) {
                  setLevel(
                    page.key === "opening"
                      ? isDifficulty(x.action)
                        ? x.action
                        : "normal"
                      : difficulty,
                  );
                  setPending(x.action);
                } else if (cinematic)
                  fadeOut(dialog.current, () => act(x.action));
                else act(x.action);
              }}
            >
              {x.label}
            </button>
          ))
        )}
        {last && !["departure", "after"].includes(page.key) && (
          <button type="button" onClick={close}>
            {page.title.includes("완료") ? "지금 단계에 머물기" : "마을 보기"}
          </button>
        )}
      </footer>
    </dialog>
  );
  return dock ? createPortal(content, dock) : content;
}
export function CampaignPanel({
  state: s,
  command,
  trade,
  resetView,
  onFirstTask,
  officeSelected,
  workspaceOpen,
  onPatrolMap,
  gateSelected,
  southVisits,
  defenseOpen,
  setDefenseOpen,
  work,
}: {
  state: TimberState;
  command: (cmd: TimberCommand) => void;
  trade: boolean;
  resetView?: () => void;
  onFirstTask?: () => void;
  workspaceOpen?: boolean;
  officeSelected?: boolean;
  onPatrolMap?: (visible: boolean) => void;
  gateSelected?: boolean;
  southVisits?: number;
  defenseOpen?: boolean;
  setDefenseOpen?: (open: boolean) => void;
  work: boolean;
}) {
  const [heating, setHeating] = useState(s.heating ?? 0);
  useEffect(() => {
    setHeating(s.heating ?? 0);
  }, [s.heating]);
  const c = campaignOf(s);
  const p = campaignPage(s);
  const firstTask = firstVillageTask(s);
  const gateCrew = s.residents.filter(
    (r) => r.workplaceId === "gate" && r.health === "healthy",
  ).length;
  const advice = moraleAdvice(s);
  const rumor = gatheringRumor(s);
  const advisory = (
    <aside className="village-advice">
      {" "}
      {rumor && (
        <p className="campaign-advisory" role="status">
          <strong>{rumor[0]}</strong> {rumor[1]}
        </p>
      )}{" "}
      {advice && (
        <p className="campaign-advisory" role="status">
          <strong>{advice[0]}</strong> {advice[1]}
        </p>
      )}
    </aside>
  );
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [mainMenu, setMainMenu] = useState(c.beat === "opening");
  const [intro, setIntro] = useState(
    c.beat === "opening" && !filmSeen("opening"),
  );
  const [preparingNewGame, setPreparingNewGame] = useState(false);
  const [pauseMenu, setPauseMenu] = useState(false);
  const wasRunning = useRef(false);
  const introDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (intro) introDialog.current?.showModal();
  }, [intro]);
  function finishIntro() {
    fadeOut(introDialog.current, () => {
      rememberFilm("opening");
      setIntro(false);
    });
  }
  useEffect(() => {
    function pause(event: KeyboardEvent) {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        intro ||
        mainMenu ||
        pauseMenu ||
        c.beat === "finished" ||
        document.querySelector(
          "dialog:modal, [data-testid=home-placement-status]",
        )
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      wasRunning.current = !s.paused;
      if (!s.paused) command({ type: "pause", paused: true });
      setPauseMenu(true);
    }
    document.addEventListener("keydown", pause, true);
    return () => document.removeEventListener("keydown", pause, true);
  }, [intro, mainMenu, pauseMenu, s.paused, command, c.beat]);
  const [opened, setOpened] = useState<string | null>(null);
  const [petition, setPetition] = useState(false);
  const [south, setSouth] = useState(false);
  useEffect(() => {
    if (southVisits) setSouth(true);
  }, [southVisits]);
  const [office, setOffice] = useState(false);
  useEffect(() => {
    onPatrolMap?.(office && !mainMenu && !pauseMenu);
    return () => onPatrolMap?.(false);
  }, [office, mainMenu, pauseMenu, onPatrolMap]);
  useEffect(() => {
    if (officeSelected) setOffice(true);
  }, [officeSelected]);
  useEffect(() => {
    if (gateSelected && c.beat === "capital") setSouth(true);
    else if (gateSelected) setDefenseOpen?.(true);
  }, [gateSelected, setDefenseOpen, c.beat]);
  const { audioRef, galleryMusic, filmHasAudio } = useAudio();
  const canPetition =
    [
      "patrol",
      "roads",
      "capital",
      "arrival",
      "winter",
      "forecast",
      "vigil",
    ].includes(c.beat) &&
    policyWait(s) === 0 &&
    c.petitionDay !== s.world.day;
  const presentedDay = useRef(0);
  useEffect(() => {
    if (
      canPetition &&
      s.world.minute >= 17 * 60 &&
      !mainMenu &&
      !pauseMenu &&
      !trade &&
      !workspaceOpen &&
      opened !== p.key &&
      (!p.auto || dismissed === p.key) &&
      presentedDay.current !== s.world.day
    ) {
      presentedDay.current = s.world.day;
      setPetition(true);
    }
  }, [
    canPetition,
    s.world.day,
    s.world.minute,
    mainMenu,
    pauseMenu,
    trade,
    workspaceOpen,
    opened,
    p.auto,
    p.key,
    dismissed,
  ]);
  const petitionOpen =
    petition && canPetition && !workspaceOpen && opened !== p.key;
  const [lossShown, setLossShown] = useState(false);
  useEffect(() => {
    if (c.ending !== "collapse") {
      setLossShown(false);
      return;
    }
    const timer = window.setTimeout(() => setLossShown(true), 4500);
    return () => window.clearTimeout(timer);
  }, [c.ending]);
  const open =
    (c.ending !== "collapse" || s.chapter === 3 || lossShown) &&
    (petitionOpen || opened === p.key || (p.auto && dismissed !== p.key));
  const petitionPage: ScenePage = {
    key: "petition-" + s.world.day,
    title: "배식 줄에서 온 청",
    music: "10",
    goal: "오늘 저녁 배식",
    auto: false,
    lines:
      c.beat === "capital"
        ? [
            [
              "의원",
              "전하, 남문 병상에 누운 넷이 배식을 받으러 나올 수 없습니다. 생선 넷을 따로 내주시면 제가 살을 발라 먹이겠습니다.",
            ],
            ["왕", "병상 넷이라 했느냐. 곳간에 남은 몫도 함께 적어 올리라."],
          ]
        : [
            [
              "덕순이",
              "공자님, 부상자 넷이 식당 줄에 설 수가 없어요. 오늘 잡은 물고기 넷만 따로 빼 주시면 살을 발라다 먹일 수 있어요.",
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
        label:
          c.beat === "capital"
            ? "병상 배식 반포 · 어류 4 (개량 연구·2단계 병원·식당 필요)"
            : "어류 4를 내어 병상까지 배달",
        disabled:
          !canPay(s, "RES_FISH", 4) ||
          (c.beat === "capital" && !capitalMealsReady(s)),
      },
      { action: "reserve", label: "오늘은 창고의 비축 유지" },
    ],
  };
  const scene = petitionOpen ? petitionPage : p;
  const chapterLimit =
    c.beat === "finished" && c.ending !== "collapse"
      ? CHAPTERS.length
      : (s.chapter ?? 1) - 1;
  const titleScreen = mainMenu || c.beat === "finished";
  const sceneTrack = open
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
  const trackUrl = galleryMusic
    ? media + galleryMusic + ".ogg"
    : titleScreen
      ? media +
        (completedChapters(chapterLimit) === CHAPTERS.length
          ? "Steps_Upon_the_Permafrost.mp3"
          : "Steps_Through_The_Frost.mp3")
      : media + sceneTrack + ".ogg";
  useEffect(() => {
    if (filmHasAudio || intro) return;
    let live = true;
    function stopRetry() {
      document.removeEventListener("pointerdown", play);
      document.removeEventListener("keydown", play);
    }
    function play() {
      void audioRef.current
        ?.playMedia(
          "bgm",
          trackUrl,
          () => {},
          () => {},
        )
        .then((started) => {
          if (live && started) stopRetry();
        })
        .catch(() => {
          /* Browsers may require a gesture to start audio. */
        });
    }
    document.addEventListener("pointerdown", play);
    document.addEventListener("keydown", play);
    play();
    return () => {
      live = false;
      stopRetry();
      audioRef.current?.stopMedia("bgm");
    };
  }, [trackUrl, audioRef, intro, filmHasAudio]);
  const close = () => {
    setOpened(null);
    setDismissed(p.key);
    setPetition(false);
  };
  function act(action: string, difficulty?: Difficulty) {
    command({
      type: "campaign",
      beat: c.beat,
      action,
      ...(difficulty ? { difficulty } : {}),
    });
    setOpened(
      c.beat === "verdict" &&
        action === "next" &&
        s.town.development.story.route === "mechanical"
        ? "vigil"
        : null,
    );
    if (petitionOpen) {
      setPetition(false);
      return;
    }
    setDismissed(p.key);
  }
  if (intro)
    return createPortal(
      <dialog
        className="film-screen"
        aria-label="서막"
        ref={introDialog}
        onCancel={(e) => {
          e.preventDefault();
          finishIntro();
        }}
      >
        <CampaignFilm id="opening" title="서막" finish={finishIntro} />
      </dialog>,
      document.body,
    );
  if (preparingNewGame)
    return createPortal(
      <SceneDialog
        page={campaignPage({ ...s, campaign: { ...c, beat: "opening" } })}
        difficulty={c.difficulty ?? "normal"}
        advisory={null}
        close={() => setPreparingNewGame(false)}
        act={(action, difficulty) => {
          resetView?.();
          setPetition(false);
          setSouth(false);
          setOffice(false);
          setDefenseOpen?.(false);
          command({ type: "restart" });
          command({
            type: "campaign",
            beat: "opening",
            action,
            difficulty: difficulty ?? "normal",
          });
          setDismissed(null);
          setOpened(null);
          setMainMenu(false);
          setPreparingNewGame(false);
          wasRunning.current = false;
        }}
      />,
      document.body,
    );
  if (c.beat === "finished" || mainMenu || pauseMenu) {
    return !mainMenu && !pauseMenu && dismissed === p.key ? (
      <button type="button" onClick={() => setMainMenu(true)}>
        메인 메뉴
      </button>
    ) : (
      createPortal(
        <EndingMenu
          key={pauseMenu ? "pause" : "title"}
          initialView={pauseMenu ? "pause" : "menu"}
          exit={() => {
            resetView?.();
            setDefenseOpen?.(false);
            setPetition(false);
            setSouth(false);
            setOffice(false);
            setPauseMenu(false);
            setMainMenu(true);
          }}
          state={s}
          limit={chapterLimit}
          resume={() => {
            setPauseMenu(false);
            if (wasRunning.current) {
              command({ type: "pause", paused: false });
              wasRunning.current = false;
            }
            setMainMenu(false);
            if (c.beat === "finished") close();
          }}
          replayIntro={() => setIntro(true)}
          restart={() => setPreparingNewGame(true)}
        />,
        document.body,
      )
    );
  }
  return (
    <div className="campaign-quest">
      {!["opening", "departure", "after", "finished", "ending"].includes(
        c.beat,
      ) && (
        <VillageBulletin
          state={s}
          command={command}
          showEvents={!open && !trade}
          heat={() => setDefenseOpen?.(true)}
        />
      )}
      <button
        type="button"
        className="scout-all"
        onClick={() => {
          if (firstTask && onFirstTask) {
            onFirstTask();
            return;
          }
          setOpened(p.key);
          setDismissed(null);
        }}
      >
        {s.chapter ?? 1}단계 · {CHAPTERS[(s.chapter ?? 1) - 1]}
        <small>{firstTask?.words ?? (p.goal || p.title)}</small>
      </button>
      {c.beat === "capital" && (
        <>
          <button
            type="button"
            aria-expanded={south}
            onClick={() => setSouth(!south)}
          >
            남문 · 피난 수레
          </button>
          {south && (
            <section className="south-gate-panel" aria-label="남문 피난 수레">
              <h3>남문 피난 수레</h3>
              <p>
                북문 · 변종 접근　동문·서문 · 다섯 마을 교역{" "}
                {capitalRoad(s) === "closed"
                  ? "두절"
                  : capitalRoad(s) === "slow"
                    ? "지연"
                    : "통행 가능"}
              </p>
              {!c.relief ? (
                <p>먼저 어전에서 남문의 장부를 받으십시오.</p>
              ) : (
                <>
                  <p>
                    왕 “내 겨울 몫까지 풀어라. 양녕아, 남쪽 길에 솥을 걸거든
                    뒤처진 이들도 먹이고 가거라.”
                  </p>
                  {(c.storeBatches ?? 0) < 4 && (
                    <button
                      type="button"
                      disabled={
                        Math.floor((s.elapsed - c.since) / 360) <=
                        (c.storeBatches ?? 0)
                      }
                      onClick={() => act("open-stores")}
                    >
                      도성 각처에서 모아온 물자 인수 · 여섯 시간마다
                    </button>
                  )}
                  {CONVOY_ITEMS.map((item) => (
                    <div key={item}>
                      {GAME_RULES.resources[item].name} · {c.cargo?.[item] ?? 0}{" "}
                      / {CONVOY_GOALS[item]} · 이번 출발까지 누적{" "}
                      {convoyTarget(s, item)}{" "}
                      <button
                        type="button"
                        disabled={!convoyLoad(s, item)}
                        onClick={() => act("load:" + item)}
                      >
                        {GAME_RULES.resources[item].name} {convoyLoad(s, item)}{" "}
                        수레에 싣기
                      </button>
                    </div>
                  ))}
                  {c.departures === 2 && (
                    <figure className="south-gate-farewell">
                      <img
                        src="/story/campaign/king-grandsons.webp"
                        alt="도성 남문에서 왕이 수레 난간에 기댄 두 손자를 바라본다"
                      />
                      <figcaption>
                        양녕의 세 아들이 마지막 행렬에 올랐다. 광장에 선 왕이
                        수레 쪽을 한 번 보았다.
                      </figcaption>
                    </figure>
                  )}
                  <p>출발한 행렬 {c.departures ?? 0} / 3</p>
                  {(c.departures ?? 0) < 3 && (
                    <button
                      type="button"
                      disabled={!canDispatchConvoy(s)}
                      onClick={() =>
                        act("dispatch:" + ((c.departures ?? 0) + 1))
                      }
                    >
                      {(c.departures ?? 0) + 1}차 수레 출발
                    </button>
                  )}
                  <p>피난 명부 {c.evacuees ?? 0}명 · 목표 200명</p>
                  <button type="button" onClick={() => act("muster")}>
                    백성을 남문에 소집하기 · 50명씩
                  </button>
                </>
              )}
            </section>
          )}
        </>
      )}
      {!["opening", "departure", "after"].includes(c.beat) && (
        <button
          type="button"
          className="scout-all"
          aria-expanded={office}
          onClick={() => setOffice(!office)}
        >
          관아 · 순라 배치
        </button>
      )}
      {c.beat !== "after" && villageDefenseActive(s) && (
        <>
          <div className="village-temperature">
            기온 {villageTemperature(s)} °C
            <meter
              aria-label="마을 기온"
              min={-25}
              max={15}
              low={0}
              high={5}
              optimum={10}
              value={villageTemperature(s)}
            />
          </div>
          {defenseOpen && (
            <section className="office-panel" aria-label="성문과 온돌">
              {gateSelected && (
                <>
                  <strong>성문 수비병 {gateCrew}명</strong>
                  <p>
                    수비병이 많으면 습격 때 다치거나 숨지는 주민이 줄어듭니다.
                  </p>
                  <label className="village-slider">
                    성문 병력
                    <input
                      type="range"
                      min="0"
                      max="3"
                      step="1"
                      value={gateLevels.filter((n) => n <= gateCrew).length - 1}
                      aria-valuetext={gateCrew + "명 배치"}
                      onChange={(e) =>
                        command({
                          type: "set-gate",
                          count: gateLevels[Number(e.target.value)] ?? gateCrew,
                        })
                      }
                    />
                    <span aria-hidden="true">
                      {gateLevels.map((n) => (
                        <i key={n}>{n}명</i>
                      ))}
                    </span>
                  </label>
                </>
              )}
              <strong>온돌 · 현재 화력 {s.firedHeat ?? 0}단계</strong>
              <p>
                추워지면 집집마다 불을 더 땝니다. 거주 중인 집 한 채가 화력 한
                단계마다 한 시간에 목재 1을 써서 10 °C를 덥힙니다. 땔감이
                모자라면 남은 만큼만 땝니다.
              </p>
              <label className="village-slider">
                온돌 화력
                <input
                  type="range"
                  min="0"
                  max="3"
                  step="1"
                  value={heating}
                  aria-valuetext={s.heating ? s.heating + "단계" : "자동"}
                  onChange={(e) => {
                    const level = Number(e.target.value);
                    setHeating(level);
                    command({ type: "set-heating", level });
                  }}
                />
                <span aria-hidden="true">
                  {["자동", "1단계", "2단계", "3단계"].map((t) => (
                    <i key={t}>{t}</i>
                  ))}
                </span>
              </label>
            </section>
          )}
          {s.sighting && (
            <section className="office-panel" aria-label="변종 목격 기록">
              <button
                type="button"
                onClick={() => command({ type: "dismiss-sighting" })}
              >
                보고 닫기
              </button>
              <img
                src={"/art/mutant-" + s.sighting.species + ".webp"}
                alt={"붉어진 눈의 " + mutantNames[s.sighting.species]}
              />
              <strong>
                {s.sighting.source === "gate"
                  ? "성문 야경 보고"
                  : "정찰대 목격 보고"}{" "}
                · {mutantNames[s.sighting.species]}
              </strong>
              <p>
                {s.sighting.source === "gate"
                  ? "문지기: 저놈, 지난겨울엔 내 손에서 여물을 받아먹었습니다. 오늘 밤엔 제 이름을 불러도 문짝만 들이받더군요."
                  : "정찰대원: 처음엔 횃불인 줄 알았습니다. 불 두 점이 같이 깜박이더니 눈밭을 가로질러 우리한테 달려들었습니다."}
              </p>
            </section>
          )}
          {s.mutants?.map((m) => {
            const species = s.world.citizens.find(
              (r) => r.id === m.id,
            )?.species;
            if (!species) return null;
            return (
              <section
                key={m.id}
                className="office-panel"
                aria-label="마을 안 변종"
              >
                <img
                  src={"/art/mutant-" + species + ".webp"}
                  alt={"눈이 붉어진 " + mutantNames[species]}
                />
                <strong>마을 안 변종 · {mutantNames[species]}</strong>
                <p>
                  달이: 붕대를 갈아 주던 손을 뿌리쳤어. 저 힘으로 기둥을 밀면
                  지붕이 내려앉아. 새끼들은 이쪽으로 데려올게!
                </p>
                {s.campaign?.beat === "capital" ? (
                  <p>도성 치안대가 출동했습니다.</p>
                ) : (
                  <button
                    type="button"
                    disabled={
                      !s.residents.some(
                        (r) =>
                          r.workplaceId === "office" && r.health === "healthy",
                      )
                    }
                    onClick={() =>
                      command({ type: "contain-mutant", resident: m.id })
                    }
                  >
                    치안대 출동
                  </button>
                )}
              </section>
            );
          })}
          {Object.entries(s.mutantDamage ?? {}).map(([id, damage]) => {
            const target =
              s.homes.find((h) => h.id === id) ??
              s.town.facilities.find((f) => f.id === id);
            if (!target) return null;
            const cost = mutantRepairCost(s, id);
            return (
              <section className="office-panel" key={id}>
                <strong>
                  {mutantStructure(s, id)?.name} · 내구도 {100 - damage}/100
                </strong>
                <small>
                  위치 {Math.round(target.position.x)},{" "}
                  {Math.round(target.position.z)}
                </small>
                <button
                  type="button"
                  disabled={
                    !canPay(s, "RES_WOOD", cost.RES_WOOD) ||
                    !canPay(s, "RES_STONE", cost.RES_STONE)
                  }
                  onClick={() =>
                    command({ type: "repair-mutant", building: id })
                  }
                >
                  수리 · 목재 {cost.RES_WOOD}, 석재 {cost.RES_STONE}
                </button>
              </section>
            );
          })}
          {s.raid && (
            <section className="office-panel" aria-label="성문 전투 보고">
              <img
                src={"/art/raid-" + (s.raid.picture + 1) + ".webp"}
                alt="복홀 성문의 수비 기록"
              />
              <strong>성문 전투 보고</strong>
              <p>
                붉은 눈의 변종들이 성문에서 물러났습니다.{" "}
                {s.raid.dead || s.raid.injured
                  ? `사망 ${s.raid.dead}명 · 부상 ${s.raid.injured}명`
                  : "모두 무사합니다."}
              </p>
              <button
                type="button"
                onClick={() => command({ type: "dismiss-raid" })}
              >
                보고 확인
              </button>
            </section>
          )}
        </>
      )}
      {office && (
        <section className="office-panel" aria-label="관아">
          <button
            type="button"
            disabled={
              !!s.childLabor ||
              policyWait(s) > 0 ||
              (!!firstTask && !s.firstRationSet)
            }
            onClick={() => command({ type: "enact-child-labor" })}
          >
            {s.childLabor ? "아동 노동 허용 시행 중" : "아동 노동 허용 반포"}
          </button>
          <strong>관아에서 반포할 배급령</strong>
          {(["needs", "cap"] as const).map((policy) => (
            <button
              key={policy}
              type="button"
              aria-pressed={s.rationPolicy === policy}
              disabled={
                policyWait(s) > 0 ||
                (s.rationPolicy === policy && (s.firstRationSet || !firstTask))
              }
              onClick={() => command({ type: "set-ration-policy", policy })}
            >
              {policy === "needs" ? "필요량에 따른 배급" : "식단별 배급 상한"}{" "}
              {s.rationPolicy === policy && (s.firstRationSet || !firstTask)
                ? "시행 중"
                : "반포"}
            </button>
          ))}
          {c.beat === "capital" && (
            <p>
              {capitalMealsReady(s)
                ? "병상 배식을 맡길 병원과 식당이 준비됐습니다."
                : "병상 배식에는 병원 개량 연구와 운영 가능한 2단계 병원·식당이 필요합니다."}
            </p>
          )}
          {canPetition && (
            <button type="button" onClick={() => setPetition(true)}>
              청원을 읽고 반포
            </button>
          )}
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
      {policyWait(s) > 0 && (
        <small>
          다음 반포까지 {Math.floor(policyWait(s) / 60)}시간{" "}
          {policyWait(s) % 60}분
        </small>
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
      {open ? (
        <SceneDialog
          key={scene.key}
          page={scene}
          difficulty={c.difficulty ?? "normal"}
          close={() => {
            if (c.beat === "opening") setMainMenu(true);
            else close();
          }}
          act={act}
          advisory={advisory}
        />
      ) : (
        advisory
      )}
    </div>
  );
}
