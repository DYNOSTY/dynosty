import {
  CHAPTERS,
  campaignOf,
  canPay,
  capitalMealsReady,
  foodWarnings,
  mutantNames,
  mutantRepairCost,
  mutantStructure,
  policyWait,
  type TimberCommand,
  type TimberState,
  villageDefenseActive,
  villageTemperature,
} from "@dynosty/game-core";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useAudio } from "./AudioProvider.js";
import {
  campaignPage,
  gatheringRumor,
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
  const frameIndex = cursor - page.lines.length;
  const frame = page.frames?.[frameIndex];
  const flashback = page.key === "summit" && page.lines[cursor]?.[1] === "";
  const familyScene = page.key === "summit" && cursor > 0 && cursor <= 5;
  const total = page.lines.length + (page.frames?.length ?? 0);
  const lineIndex = Math.min(cursor, page.lines.length - 1);
  useEffect(() => {
    if (!frame || cursor >= total - 1) return;
    const timer = window.setTimeout(
      () => setCursor((i) => Math.min(i + 1, total - 1)),
      7500,
    );
    return () => window.clearTimeout(timer);
  }, [cursor, frame, total]);
  const [name, words] = page.lines[lineIndex]!;
  const face = PATROL_NAMES.findIndex((x) => x === name);
  const last = cursor === total - 1;
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
      {!flashback && !frame && (familyScene || page.illustration) && (
        <img
          className="campaign-still"
          alt={
            familyScene
              ? "복홀 성문 앞의 양녕과 새끼 스피노사우르스 포와 혜"
              : page.title
          }
          src={`/story/campaign/${familyScene ? "royal-family" : page.illustration}.webp`}
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
      {page.clip &&
        !familyScene &&
        !frame &&
        (!(
          page.clip === "hope" ||
          page.clip === "escape" ||
          page.clip === "order"
        ) ||
          cursor >= 2) && (
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
      {!flashback && page.goal && <p className="campaign-goal">{page.goal}</p>}
      {!flashback && (!frame || frame.words) && (
        <div className="campaign-speech" aria-live="polite">
          {frame ? null : face >= 0 ? (
            <PatrolPortrait index={face} />
          ) : name === "나르미" || name === "달이" ? (
            <img
              alt=""
              src={`/art/advisers/${name === "나르미" ? "nareumi" : "dali"}/${["12", "10", "11", "13"].includes(page.music) ? "concern" : "neutral"}.png`}
            />
          ) : null}
          <div>
            <strong>{frame ? "복홀의 기록" : name}</strong>
            <p>{frame?.words ?? words}</p>
          </div>
        </div>
      )}
      {!flashback && (!frame || frame.words) && advisory}
      <footer>
        {cursor > 0 && (
          <button type="button" onClick={() => setCursor(cursor - 1)}>
            이전 대사
          </button>
        )}
        {!last ? (
          <button type="button" onClick={() => setCursor(cursor + 1)}>
            다음 대사 · {cursor + 1}/{total}
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
  gateSelected,
  defenseOpen,
  setDefenseOpen,
  work,
}: {
  state: TimberState;
  command: (cmd: TimberCommand) => void;
  trade: boolean;
  officeSelected?: boolean;
  gateSelected?: boolean;
  defenseOpen?: boolean;
  setDefenseOpen?: (open: boolean) => void;
  work: boolean;
}) {
  const c = campaignOf(s);
  const p = campaignPage(s);
  const advice = moraleAdvice(s);
  const rumor = gatheringRumor(s);
  const advisory = (
    <>
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
    </>
  );
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [petition, setPetition] = useState(false);
  const [office, setOffice] = useState(false);
  useEffect(() => {
    if (officeSelected) setOffice(true);
  }, [officeSelected]);
  useEffect(() => {
    if (gateSelected) setDefenseOpen?.(true);
  }, [gateSelected, setDefenseOpen]);
  const [sound, setSound] = useState(false);
  const { audioRef } = useAudio();
  const canPetition =
    [
      "patrol",
      "roads",
      "capital",
      "arrival",
      "winter",
      "forecast",
      "vigil",
    ].includes(c.beat) && policyWait(s) === 0;
  const petitionOpen = petition && canPetition;
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
    (c.ending !== "collapse" || lossShown) &&
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
    setOpened(
      c.beat === "verdict" &&
        action === "next" &&
        s.town.development.story.chungnyeong === "dead"
        ? "vigil"
        : null,
    );
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
      {!["opening", "departure"].includes(c.beat) && (
        <button
          type="button"
          className="scout-all"
          aria-expanded={office}
          onClick={() => setOffice(!office)}
        >
          관아 · 순라 배치
        </button>
      )}
      {villageDefenseActive(s) && (
        <>
          <button
            type="button"
            className="scout-all"
            aria-expanded={!!defenseOpen}
            onClick={() => setDefenseOpen?.(!defenseOpen)}
          >
            기온 {villageTemperature(s)} °C · 성문과 온돌
            <meter
              aria-label="마을 기온"
              min={-25}
              max={15}
              low={0}
              high={5}
              optimum={10}
              value={villageTemperature(s)}
            />
          </button>
          {defenseOpen && (
            <section className="office-panel" aria-label="성문과 온돌">
              <strong>
                성문 수비병{" "}
                {
                  s.residents.filter(
                    (r) => r.workplaceId === "gate" && r.health === "healthy",
                  ).length
                }
                명
              </strong>
              <p>수비병이 많으면 습격 때 다치거나 숨지는 주민이 줄어듭니다.</p>
              {([0, 4, 8, 16] as const).map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => command({ type: "set-gate", count })}
                >
                  {count}명 배치
                </button>
              ))}
              <strong>온돌 · 현재 화력 {s.firedHeat ?? 0}단계</strong>
              <p>
                추워지면 집집마다 불을 더 땝니다. 거주 중인 집 한 채가 화력 한
                단계마다 한 시간에 목재 1을 써서 8 °C를 덥힙니다. 땔감이
                모자라면 남은 만큼만 땝니다.
              </p>
              {[0, 1, 2, 3].map((level) => (
                <button
                  key={level}
                  type="button"
                  aria-pressed={(s.heating ?? 0) === level}
                  onClick={() => command({ type: "set-heating", level })}
                >
                  {level ? "최소 " + level + "단계" : "자동"}
                </button>
              ))}
            </section>
          )}
          {s.sighting && (
            <section className="office-panel" aria-label="변종 목격 기록">
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
            )!.species;
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
          <strong>관아에서 반포할 배급령</strong>
          {(["needs", "cap"] as const).map((policy) => (
            <button
              key={policy}
              type="button"
              aria-pressed={s.rationPolicy === policy}
              disabled={policyWait(s) > 0 || s.rationPolicy === policy}
              onClick={() => command({ type: "set-ration-policy", policy })}
            >
              {policy === "needs" ? "필요량에 따른 배급" : "식단별 배급 상한"}{" "}
              {s.rationPolicy === policy ? "시행 중" : "반포"}
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
      {[
        "patrol",
        "roads",
        "capital",
        "arrival",
        "winter",
        "forecast",
        "vigil",
      ].includes(c.beat) && (
        <button
          type="button"
          className="scout-all"
          onClick={() =>
            command({
              type: "advance",
              minutes: c.beat === "capital" ? 720 : 1440,
            })
          }
        >
          {c.beat === "capital" ? "도성 반나절 경영" : "마을 하루 진행"}
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
