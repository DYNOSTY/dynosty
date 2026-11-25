import {
  AMOUNT_SCALE,
  BOKHOL_FORESTS,
  BOKHOL_MAP,
  BOKHOL_MINERALS,
  BOKHOL_PRODUCTION_SITES,
  BUILDING_RULES,
  type BuildingKind,
  createLogging,
  dailyFoodDemand,
  facilityStaffLimit,
  formatRation,
  GAME_RULES,
  HAUL_PHASE_NAMES,
  type HomePlacement,
  homeUsage,
  idleTownResidents,
  type LaborState,
  LOGGING_RULES,
  loggingSite,
  loggingSiteRules,
  loggingSites,
  loggingStaff,
  type PlayState,
  type ProductionSiteId,
  policyWait,
  productionSiteDefinition,
  productionSites,
  RESIDENT_REQUEST_TEXT,
  restaurantOpen,
  restaurantSeats,
  restaurantStaff,
  TIMBER_RULES,
  type TimberCommand,
  type TimberState,
  townShiftOpen,
  VILLAGE_RULES,
  warehouseDoor,
  workplaceOpen,
} from "@dynosty/game-core";
import { useEffect, useRef, useState } from "react";
import { EndingMenu } from "./EndingMenu.js";
import { LaborDemo } from "./LaborDemo.js";
import { MerchantOffers, merchantCards } from "./MerchantOffers.js";
import { residentName } from "./resident-names.js";
import type { SiteId } from "./site-targets.js";
import { saveStageStart } from "./stage-replay.js";
import { buildingCost, TownPanel } from "./TownPanel.js";
import type { TimberRequest, TimberResponse } from "./timber-protocol.js";
import { readWorkerSnapshot } from "./timber-protocol.js";
import { loadTimber, saveTimber, timberSaveError } from "./timber-save.js";

const time = (m: number) => `${Math.floor(m / 60)}시간 ${m % 60}분`;
const phaseNames = {
  select: "공급 제안 비교",
  relief: "유휴 주민이 업무 교대하러 이동",
  "crew-wait": "교대할 유휴 인력 대기",
  approaching: "운송 주민 자동 배정",
  transport: "야적장으로 운반",
  parking: "수레 내려놓기",
  releasing: "손잡이에서 물러나기",
  unloading: "자동 하역",
  inspecting: "자동 전량 검수",
  returning: "운송 주민 자동 복귀",
  "waiting-labor": "보완 인력 대기",
  "drying-travel": "보완 주민 이동",
  drying: "자동 건조·재검사",
  ready: "조달 완료",
  "building-travel": "명령받은 보수로 이동",
  building: "명령받은 건물 보수",
};
type Props = {
  active: boolean;
  commandRef: { current: ((c: TimberCommand) => void) | null };
  focusSection?: { label: string } | null;
  onLaborState: (state: LaborState, reset?: boolean) => void;
  onLaborModeChange: (mode: boolean) => void;
  selectedSite: SiteId | null;
  onClearSelection: () => void;
  selectedWorkplace?: string | null;
  showDevTools?: boolean;
  saveOpen?: boolean;
  savePanelId?: string;
  onCloseSave?: () => void;
  onState: (state: TimberState, lines?: string[], reset?: boolean) => void;
  world: PlayState | null;
  onExit: (world: PlayState) => void;
  onOverview: () => void;
  onHomePlacement: (
    confirm: (pose: HomePlacement) => void,
    feedback: (message: string, active: boolean) => void,
    kind?: BuildingKind,
  ) => void;
  onCancelHomePlacement: () => void;
  onView: (position: { x: number; z: number }, distance?: number) => void;
};
export function TimberDemo({
  active,
  commandRef,
  focusSection,
  onLaborState,
  onLaborModeChange,
  selectedSite: selectedLaborSite,
  onClearSelection,
  selectedWorkplace = null,
  onState,
  onExit,
  onView,
  onOverview,
  onHomePlacement,
  onCancelHomePlacement,
  showDevTools = false,
  saveOpen = false,
  savePanelId,
  onCloseSave,
  world,
}: Props) {
  const [laborMode, setLaborMode] = useState(false);
  const [slotPicker, setSlotPicker] = useState(false);
  useEffect(() => onLaborModeChange(laborMode), [laborMode, onLaborModeChange]);
  const [placingKind, setPlacingKind] = useState<BuildingKind>("home");
  const [placingHome, setPlacingHome] = useState(false);
  const [placementStatus, setPlacementStatus] = useState("");
  const [selectedSiteId, setSelectedSiteId] =
    useState<ProductionSiteId>("west");
  const [state, setState] = useState<TimberState | null>(null),
    [error, setError] = useState<string | null>(null),
    [saveStatus, setSaveStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [restart, setRestart] = useState(false);
  const ready = state !== null;
  useEffect(() => {
    if (!active || !ready || !focusSection) return;
    setLaborMode(false);
    const section = document.querySelector<HTMLElement>(
      `.timber-demo [aria-label="${focusSection.label}"]`,
    );
    section?.scrollIntoView({ block: "start" });
    if (
      focusSection.label === "교역소 방문" ||
      focusSection.label === "다음 임무"
    ) {
      // 캠페인에서는 입촌 요청이 조달 패널 대신 마을 소식 카드(VillageBulletin)에 뜬다.
      // 사용자가 표식을 눌러 열었을 때만 여기로 오므로, 카드가 저절로 뜰 때는 초점을 뺏지 않는다.
      const target =
        section ??
        (focusSection.label === "다음 임무"
          ? document.querySelector<HTMLElement>(
              '.village-bulletin[aria-label="주민 도착"]',
            )
          : null);
      target?.querySelector("button")?.focus({ preventScroll: true });
    }
  }, [active, ready, focusSection]);
  const selectedFacility = state?.town.facilities.find(
    (f) => f.sourceId === selectedSiteId,
  );
  const selectedLedger = state
    ? loggingSite(state, selectedSiteId)
    : createLogging(selectedSiteId);
  const selectedSite = selectedFacility
    ? {
        ...selectedLedger,
        built: true,
        storageBuilt: true,
        target: selectedFacility.target,
        buffer: selectedFacility.buffer,
        delivered: selectedLedger.delivered + selectedFacility.delivered,
        haul: null,
      }
    : selectedLedger;
  const selectedStaff =
    state && selectedFacility
      ? {
          assigned: state.residents.filter(
            (r) =>
              r.workplaceId === `facility:${selectedFacility.id}` &&
              r.health === "healthy",
          ).length,
          working: townShiftOpen(state, selectedFacility.id)
            ? state.residents.filter(
                (r) =>
                  r.workplaceId === `facility:${selectedFacility.id}` &&
                  r.routine === "working" &&
                  r.health === "healthy",
              ).length
            : 0,
        }
      : state
        ? loggingStaff(state, selectedSiteId)
        : { assigned: 0, working: 0 };
  const selectedDefinition = productionSiteDefinition(selectedSiteId);
  const selectedName =
    selectedDefinition.kind === "forest"
      ? "숲가 제재소"
      : selectedDefinition.kind === "coal"
        ? "석탄광"
        : selectedDefinition.kind === "iron"
          ? "철광산"
          : "채석장";
  const resourceName = GAME_RULES.resources[selectedDefinition.resource].name;
  const selectedRules = loggingSiteRules(selectedSiteId);
  const worker = useRef<Worker | null>(null),
    pending = useRef<number | null>(null),
    counter = useRef(0),
    session = useRef(""),
    initialized = useRef(false),
    exitCallback = useRef(onExit);
  useEffect(() => {
    exitCallback.current = onExit;
  }, [onExit]);
  useEffect(() => {
    session.current = crypto.randomUUID();
    const w = new Worker(new URL("./timber.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    let previousChapter: number | undefined;
    w.onmessage = (e: MessageEvent<TimberResponse>) => {
      const m = e.data;
      if (m.type === "state") {
        const state = readWorkerSnapshot(m.resumeJson);
        const stage = state.chapter ?? 1;
        const campaign = state.campaign;
        if (
          campaign &&
          stage !== previousChapter &&
          campaign.since === state.elapsed &&
          campaign.beat ===
            ["opening", "roads", "capital", "arrival", "summit"][stage - 1] &&
          (stage !== 2 || (!campaign.caravan && !campaign.treaties.length)) &&
          (stage !== 3 || !campaign.relief)
        ) {
          void saveStageStart(state).catch(() =>
            setError("단계 시작 기록을 저장하지 못했습니다."),
          );
        }
        previousChapter = stage;
        try {
          localStorage.setItem("dynosty.village.resume", m.resumeJson);
        } catch {
          setError("자동 저장 공간을 확인해 주세요.");
        }
        setState(state);
        onState(state, m.completions, m.resetNotices);
      } else if (m.type === "exited") {
        exitCallback.current(m.world);
      } else if (m.type === "error") {
        setError(m.message);
        if (m.requestId === pending.current) {
          pending.current = null;
          setBusy(false);
        }
      } else if (m.requestId === pending.current) {
        try {
          if (m.type === "saved") {
            saveTimber(localStorage, m.save);
            setSaveStatus("마을 진행을 저장했습니다.");
          } else
            setSaveStatus("마을 진행을 불러왔습니다. 일시정지 상태입니다.");
        } catch (err) {
          setError(timberSaveError(err));
        } finally {
          pending.current = null;
          setBusy(false);
        }
      }
    };
    w.onerror = () => {
      setError("마을 진행 상태를 확인하지 못했습니다. 기존 저장은 유지됩니다.");
      pending.current = null;
      setBusy(false);
    };
    return () => {
      w.terminate();
      worker.current = null;
      pending.current = null;
      initialized.current = false;
    };
  }, [onState]);
  useEffect(() => {
    if (world && !initialized.current && worker.current) {
      initialized.current = true;
      let resume: unknown;
      try {
        const raw = localStorage.getItem("dynosty.village.resume");
        if (raw) resume = JSON.parse(raw);
      } catch {
        setError("자동 저장을 읽을 수 없습니다.");
      }
      worker.current.postMessage({
        resume,
        type: "init",
        world,
      } satisfies TimberRequest);
    }
  }, [world]);
  useEffect(() => {
    commandRef.current = command;
    return () => {
      commandRef.current = null;
    };
  });
  function command(c: TimberCommand) {
    if (busy || !worker.current) return;
    setError(null);
    if (c.type === "restart") {
      setLaborMode(false);
      setSlotPicker(false);
      setRestart(false);
      setPlacementStatus("");
      setPlacingHome(false);
      setPlacingKind("home");
      setSelectedSiteId("west");
      setSaveStatus("");
    }
    worker.current.postMessage({
      type: "command",
      id: `${session.current}-${++counter.current}`,
      command: c,
    } satisfies TimberRequest);
  }
  useEffect(() => {
    // Village time stops while the tab is hidden; the player resumes it.
    const pause = () => {
      if (document.hidden)
        worker.current?.postMessage({
          type: "command",
          id: `${session.current}-${++counter.current}`,
          command: { type: "pause", paused: true },
        } satisfies TimberRequest);
    };
    pause();
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, []);
  function placeBuilding(kind: BuildingKind) {
    setError(null);
    setPlacingKind(kind);
    setPlacingHome(true);
    onHomePlacement(
      (pose) => {
        command({ type: "plan-building", kind, ...pose });
        onCancelHomePlacement();
        setPlacingHome(false);
      },
      (message, active) => {
        setPlacementStatus(message);
        setPlacingHome(active);
      },
      kind,
    );
  }
  function access(load: boolean, previous = false) {
    if (busy || !worker.current) return;
    setError(null);
    setSaveStatus("");
    try {
      const requestId = ++counter.current;
      const m: TimberRequest = load
        ? { type: "load", requestId, data: loadTimber(localStorage, previous) }
        : { type: "save", requestId };
      pending.current = requestId;
      setBusy(true);
      worker.current.postMessage(m);
    } catch (e) {
      pending.current = null;
      setBusy(false);
      setError(timberSaveError(e));
    }
  }
  useEffect(() => {
    if ((state?.construction || error || !active) && placingHome) {
      onCancelHomePlacement();
      setPlacingHome(false);
    }
  }, [state?.construction, error, active, placingHome, onCancelHomePlacement]);
  useEffect(() => () => onCancelHomePlacement(), [onCancelHomePlacement]);
  useEffect(() => {
    if (!active || saveOpen) setLaborMode(false);
  }, [active, saveOpen]);
  const merchant =
    state?.merchantItem === undefined
      ? undefined
      : merchantCards[state.merchantItem];
  const demand = state && dailyFoodDemand(state.world);
  const stock = state?.world.resources;
  const foodShortage =
    demand &&
    stock &&
    (stock.RES_PLANT < demand.RES_PLANT ||
      stock.RES_MEAT + stock.RES_FISH < demand.RES_MEAT + demand.RES_FISH);
  const metal = (state?.world.resources.RES_METAL ?? 0) / AMOUNT_SCALE;
  const chosenFacility = state?.town.facilities.find(
    (f) => f.id === selectedWorkplace,
  );
  const chosenSource = BOKHOL_PRODUCTION_SITES.find(
    (site) => site.id === selectedWorkplace,
  );
  const service = focusSection?.label ?? "교역소 방문";
  const classic = (
    <section
      hidden={!active || laborMode}
      className="timber-demo"
      data-service={showDevTools || saveOpen ? undefined : service}
      aria-label="목재 조달"
    >
      <button
        hidden={!showDevTools}
        type="button"
        onClick={() => setLaborMode(true)}
      >
        일손 배치·배급
      </button>
      <div className="timber-heading">
        <div>
          <p className="eyebrow">복홀 · 업무 지휘</p>
          <h2 className="timber-title">
            {showDevTools
              ? "복홀 마을 운영"
              : chosenFacility && service === "일터 배치"
                ? BUILDING_RULES[chosenFacility.kind].name
                : chosenSource && service === "일터 배치"
                  ? chosenSource.name
                  : service}
          </h2>
        </div>
        <button
          type="button"
          className="g-knob g-knob--close"
          aria-label="마을로 돌아가기"
          onClick={() => state && onExit(state.world)}
        />
      </div>
      {!state ? (
        <p>마을을 불러오는 중입니다.</p>
      ) : (
        <>
          {saveOpen ? (
            <div className="timber-controls" id={savePanelId}>
              <button type="button" onClick={onCloseSave}>
                저장 닫기
              </button>
              <button type="button" onClick={() => setSlotPicker(true)}>
                슬롯에 저장하기
              </button>
              {slotPicker && (
                <EndingMenu
                  state={state}
                  initialView="save"
                  limit={(state.chapter ?? 1) - 1}
                  resume={() => setSlotPicker(false)}
                  restart={() => {
                    setSlotPicker(false);
                    command({ type: "restart" });
                  }}
                />
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => access(false)}
              >
                진행 저장
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => access(true)}
              >
                진행 불러오기
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => access(true, true)}
              >
                이전 진행 불러오기
              </button>
              <p aria-live="polite" data-testid="timber-save-status">
                {busy ? "저장 처리 중" : saveStatus}
              </p>
              {error ? <p role="alert">{error}</p> : null}
            </div>
          ) : null}
          <p>
            공급안을 비교해 계약하세요. 주민 배정·운송·하역·검수·복귀·공동 재고
            정산은 자동으로 이어집니다.
          </p>
          <p data-testid="village-population">
            주민 {state.world.citizens.filter((c) => c.alive).length}명 · 치료
            필요 {state.residents.filter((r) => r.health === "sick").length}명 ·
            누적 사망 {state.world.citizens.filter((c) => !c.alive).length}명
          </p>
          <div className="timber-status">
            <span data-testid="timber-clock">
              현재{" "}
              {String(Math.floor(state.world.minute / 60)).padStart(2, "0")}:
              {String(state.world.minute % 60).padStart(2, "0")} · 경과{" "}
              {time(state.elapsed)}
            </span>
            <span data-testid="timber-iron">공동 철재 {metal}</span>
            <span data-testid="timber-workers">
              유휴 일손 {idleTownResidents(state).length}/
              {state.residents.length}
            </span>
            <strong data-testid="timber-phase">
              {state.phase === "transport" && warehouseDoor(state)
                ? "저장소로 운반"
                : phaseNames[state.phase]}
            </strong>
          </div>
          <div className="timber-controls">
            <button
              type="button"
              disabled={busy}
              onClick={() => command({ type: "pause", paused: !state.paused })}
            >
              {state.paused ? "시간 재개" : "일시정지"}
            </button>
            <label>
              진행 속도{" "}
              <select
                aria-label="진행 속도"
                value={state.speed}
                onChange={(e) =>
                  command({
                    type: "speed",
                    speed: Number(e.target.value) as 1 | 3,
                  })
                }
              >
                <option value="1">1배</option>
                <option value="3">3배</option>
              </select>
            </label>
          </div>
          {state.workerIds.some(
            (id) =>
              state.residents.find((r) => r.id === id)?.health !== "healthy",
          ) ? (
            <p role="alert">
              업무 담당자의 건강 사건으로 작업이 멈췄습니다. 담당자 회복·교대
              처리가 필요합니다.
            </p>
          ) : null}
          {service === "일터 배치" && chosenSource && (
            <section aria-label="생산지 일손 배치">
              <p>남은 자원 {loggingSite(state, chosenSource.id).remaining}</p>
              <label>
                운영 인원{" "}
                <select
                  value={loggingSite(state, chosenSource.id).target}
                  onChange={(e) =>
                    command({
                      type: "set-logging-workers",
                      siteId: chosenSource.id,
                      count: Number(e.target.value),
                    })
                  }
                >
                  {[0, 1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n}명
                    </option>
                  ))}
                </select>
              </label>
            </section>
          )}
          <TownPanel
            mode={showDevTools ? undefined : service}
            facilityId={chosenFacility?.id}
            state={state}
            selectedHospital={
              chosenFacility?.kind === "hospital" ? chosenFacility.id : null
            }
            showDevTools={showDevTools}
            command={command}
            place={placeBuilding}
            view={onView}
          />
          <section aria-label="공동 식당" className="village-service">
            <h3>공동 식당</h3>
            <p>
              식당 주간 06:00–18:00 · 야간 18:00–06:00 (2명 이상 배치) ·
              작업·건설 09:00–18:00
            </p>
            <p>
              1배: 게임 1시간 = 실제 1분 · 09~18시 9분 · 건물별 공사 시간 + 자재
              운반
            </p>
            <p data-testid="restaurant-status">
              {state.restaurantBuilt
                ? !restaurantOpen(state.world.minute)
                  ? "영업 종료 · 다음 개장 06:00"
                  : restaurantStaff(state).serving > 0
                    ? "영업 중"
                    : state.restaurantWorkerTarget === 0
                      ? "운영 인력을 배치해 주세요"
                      : "직원 도착·식사 대기"
                : state.construction?.kind === "restaurant"
                  ? workplaceOpen(state.world.minute)
                    ? "건설 중 · 주민이 자동으로 이동·작업합니다"
                    : "퇴근 · 09:00에 공사를 재개합니다"
                  : "아직 지어지지 않았습니다"}
            </p>
            {!state.restaurantBuilt ? (
              <button
                type="button"
                disabled={
                  busy ||
                  state.construction !== null ||
                  state.world.resources.RES_WOOD -
                    state.reservedWood * AMOUNT_SCALE <
                    20 * AMOUNT_SCALE
                }
                onClick={() => placeBuilding("restaurant")}
              >
                공동 식당 배치 · {buildingCost("restaurant")}
              </button>
            ) : null}
            <label>
              운영 인원{" "}
              <select
                aria-label="식당 운영 인원"
                disabled={busy || !state.restaurantBuilt}
                value={state.restaurantWorkerTarget}
                onChange={(e) =>
                  command({
                    type: "set-restaurant-workers",
                    count: Number(e.target.value),
                  })
                }
              >
                {Array.from(
                  {
                    length:
                      (state.town.facilities.find(
                        (f) => f.kind === "restaurant",
                      )
                        ? facilityStaffLimit(
                            state.town.facilities.find(
                              (f) => f.kind === "restaurant",
                            ) ?? { kind: "restaurant", level: 1 },
                          )
                        : 4) + 1,
                  },
                  (_, n) => n,
                ).map((n) => (
                  <option key={n} value={n}>
                    {n}명
                  </option>
                ))}
              </select>
            </label>
            <p data-testid="restaurant-workers">
              배치{" "}
              {
                restaurantStaff(
                  state,
                  state.town.facilities.find((f) => f.kind === "restaurant")
                    ?.id,
                ).assigned
              }
              /{state.restaurantWorkerTarget}명 · 현장{" "}
              {
                restaurantStaff(
                  state,
                  state.town.facilities.find((f) => f.kind === "restaurant")
                    ?.id,
                ).present
              }
              명 · 배급 중{" "}
              {
                restaurantStaff(
                  state,
                  state.town.facilities.find((f) => f.kind === "restaurant")
                    ?.id,
                ).serving
              }
              명 · 전체 좌석 {restaurantSeats(state)}석
            </p>
            <p className="hint">
              인원수만 정하면 가까운 유휴 주민이 이동합니다. 직원은 자기
              식당에서 식사합니다.
            </p>
          </section>
          <details
            aria-label="배급 정책"
            open={focusSection?.label === "배급 정책" || undefined}
          >
            <summary>종별 배급</summary>
            <fieldset className="ration-choices" aria-label="배급 방식">
              {(["needs", "cap"] as const).map((policy) => (
                <button
                  key={policy}
                  type="button"
                  aria-pressed={
                    state.firstRationSet && state.rationPolicy === policy
                  }
                  disabled={
                    busy ||
                    (state.firstRationSet && state.rationPolicy === policy) ||
                    (!!state.campaign &&
                      policyWait(state) > 0 &&
                      policy !== state.rationPolicy)
                  }
                  onClick={() => command({ type: "set-ration-policy", policy })}
                >
                  {policy === "needs" ? "필요량 배급" : "식단별 상한"}
                  {state.firstRationSet && state.rationPolicy === policy
                    ? " · 시행 중"
                    : ""}
                </button>
              ))}
            </fieldset>
            <table data-testid="ration-table">
              <thead>
                <tr>
                  <th>주민</th>
                  <th>한 끼</th>
                  <th>하루 한도</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(VILLAGE_RULES.species).map(
                  ([species, rule]) => {
                    const portion =
                      state.rationPolicy === "cap" ? 25000 : rule.portion;
                    return (
                      <tr key={species}>
                        <th>
                          {
                            {
                              R02: "트리케라톱스",
                              R03: "벨로키랍토르",
                              SPINO: "스피노사우루스",
                            }[species as "R02" | "R03" | "SPINO"]
                          }
                        </th>
                        <td>{formatRation(portion)}</td>
                        <td>{formatRation(portion * 4)}</td>
                      </tr>
                    );
                  },
                )}
              </tbody>
            </table>
            <p>
              초식 주민은 풀, 육식·어식 주민은 선호 먹이부터 배급하고 고기·어류
              부족분을 서로 대체합니다. 상한으로 부족한 영양은 허기로 남습니다.
            </p>
          </details>
          {demand && (
            <p>
              <img
                width="64"
                height="64"
                src={
                  foodShortage
                    ? "/art/advisers/nareumi/concern.webp"
                    : "/art/advisers/nareumi/neutral.webp"
                }
                alt={foodShortage ? "걱정스러운 나르미" : "평상시의 나르미"}
              />{" "}
              {foodShortage && "고리야, 오늘 먹일 식량이 모자랍니다. "}
              나르미 · 하루 필요량 / 공동 재고{" "}
              {(["RES_PLANT", "RES_MEAT", "RES_FISH"] as const)
                .map(
                  (item, i) =>
                    ["풀", "고기", "어류"][i] +
                    " " +
                    demand[item] / AMOUNT_SCALE +
                    " / " +
                    state.world.resources[item] / AMOUNT_SCALE,
                )
                .join(" · ")}
            </p>
          )}
          {showDevTools && merchant && (
            <aside aria-label="교역소 방문" className="village-service">
              <h3>
                ❗ 교역소 · {merchant[1]} 상인 {merchant[2]} 방문
              </h3>
              <img
                src={"/art/merchants/" + merchant[0] + ".webp"}
                alt={merchant[1] + " 상인 " + merchant[2] + "의 초상"}
                width="112"
                height="112"
              />
              <p>“{merchant[3]}”</p>
              <p>
                <strong>거래 제안</strong> · {merchant[4]}
              </p>
              <MerchantOffers state={state} command={command} busy={busy} />
            </aside>
          )}
          {state.merchantRepair && (
            <p role="status">
              교역소 보완 · {merchantCards[state.merchantRepair.item]?.[1]}{" "}
              {state.merchantRepair.quantity}개 · 남은 작업{" "}
              {state.merchantRepair.work}인분(분)
            </p>
          )}
          <section aria-label="거주지" className="village-service">
            <h3>온돌 둥지</h3>
            {state.residents.some((r) => r.health !== "dead" && !r.homeId) && (
              <strong role="status" style={{ color: "#ff6961" }}>
                ❗ 둥지 없는 주민{" "}
                {
                  state.residents.filter(
                    (r) => r.health !== "dead" && !r.homeId,
                  ).length
                }
                명
              </strong>
            )}
            <p data-testid="housing-status">
              둥지 {state.homes.length}곳 · 입주{" "}
              {
                state.residents.filter((r) => r.health !== "dead" && r.homeId)
                  .length
              }
              /{state.world.citizens.filter((c) => c.alive).length}명 · 실내{" "}
              {
                state.residents.filter(
                  (r) => r.insideHome && r.health !== "dead",
                ).length
              }
              명
            </p>
            <button
              type="button"
              disabled={
                busy ||
                state.construction !== null ||
                state.homes.length >= BOKHOL_MAP.maxHomes
              }
              onClick={() => placeBuilding("home")}
            >
              온돌 둥지 증설 · 목재{VILLAGE_RULES.constructionWood}
            </button>
            {placingHome ? (
              <div role="status" data-testid="home-placement-status">
                <p>{placementStatus}</p>
                <p>
                  ←→키로15° 회전 · 클릭 배치 · Esc 취소 ·{" "}
                  {buildingCost(placingKind)}
                </p>
                <button type="button" onClick={onCancelHomePlacement}>
                  건물 배치 취소
                </button>
              </div>
            ) : null}
            {state.construction?.kind === "home" ? (
              <p data-testid="home-construction-status">
                자재 운반{" "}
                {state.construction.crew
                  ?.filter((w) => w.phase === "build")
                  .reduce((sum, w) => sum + w.amount, 0) ?? 20}
                /
                {state.construction.crew?.reduce(
                  (sum, w) => sum + w.amount,
                  0,
                ) ?? 20}{" "}
                ·{" "}
                {!workplaceOpen(state.world.minute)
                  ? "퇴근 · 09:00에 공사를 재개합니다"
                  : state.construction.finishAt === null
                    ? "가까운 유휴 주민이 자재를 운반합니다"
                    : "둥지를 건설하고 있습니다"}
              </p>
            ) : null}
            <p className="hint">
              잠자리는 주민마다 고정 배정합니다. 빈 둥지는 이후 합류할 주민을
              위해 남겨 둡니다.
            </p>
            <details>
              <summary>입주 현황</summary>
              <details>
                <summary>종별 주민 설계 보기</summary>
                <img
                  className="facility-reference"
                  src="/art/residents/species-turnaround-v1.webp"
                  alt="세 뿔과 목깃의 트리케라톱스, 두 다리와 깃의 벨로키랍토르, 긴 주둥이와 등돛의 스피노사우루스"
                  loading="lazy"
                  width="1536"
                  height="1024"
                />
              </details>
              <ul>
                {state.homes.map((h, i) => (
                  <li key={h.id}>
                    둥지{i + 1} ·{" "}
                    {
                      state.residents.filter(
                        (r) => r.homeId === h.id && r.health !== "dead",
                      ).length
                    }
                    명 · 공간{" "}
                    {homeUsage(h.id, state.residents, state.world.citizens)}/
                    {h.capacity}
                    <ul>
                      {state.residents
                        .filter((r) => r.homeId === h.id && r.health !== "dead")
                        .map((r) => (
                          <li key={r.id}>
                            {residentName(
                              state.residents.findIndex((q) => q.id === r.id),
                            )}{" "}
                            · 고정 잠자리 {(r.homeSlot ?? 0) + 1}
                          </li>
                        ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </details>
          </section>
          <section aria-label="자원 생산" data-testid="logging-panel">
            <h3>제재소 · 광산 · 채석장</h3>
            <p data-testid="forest-expansion">
              숲 권역 {BOKHOL_FORESTS.length}곳 · 광산·채석장{" "}
              {BOKHOL_MINERALS.length}곳 · 확보한 부지{" "}
              {loggingSites(state).filter((l) => l.remaining === 0).length}곳
            </p>
            <label>
              작업장 권역
              <select
                aria-label="작업장 권역"
                value={selectedSiteId}
                onChange={(e) =>
                  setSelectedSiteId(e.target.value as ProductionSiteId)
                }
              >
                {BOKHOL_PRODUCTION_SITES.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <details>
              <summary>권역별 자원과 작업장</summary>
              <ul>
                {productionSites(state).map((l) => (
                  <li key={l.siteId}>
                    {
                      BOKHOL_PRODUCTION_SITES.find((f) => f.id === l.siteId)
                        ?.name
                    }{" "}
                    · 잔량 {l.remaining} ·{" "}
                    {l.remaining === 0
                      ? productionSiteDefinition(l.siteId).kind === "forest"
                        ? "평탄화된 부지"
                        : "광맥 고갈"
                      : l.built
                        ? "작업장 운영 권역"
                        : "미개발 자원"}{" "}
                    · 배치 {loggingStaff(state, l.siteId).assigned}/{l.target}명
                  </li>
                ))}
              </ul>
            </details>
            <button type="button" onClick={onOverview}>
              복홀 전체 보기
            </button>
            <button
              type="button"
              onClick={() =>
                selectedDefinition.kind === "forest"
                  ? onView({
                      x: selectedRules.workshop.x + 2,
                      z: selectedRules.workshop.z + 5,
                    })
                  : onView(
                      {
                        x: selectedDefinition.x + 4,
                        z: selectedDefinition.z + 3,
                      },
                      48,
                    )
              }
            >
              {selectedDefinition.kind === "forest"
                ? "벌목 현장 보기"
                : "채굴 현장 보기"}
            </button>
            <button type="button" onClick={() => onView({ x: 0, z: 0 })}>
              마을 보기
            </button>
            <p>
              {selectedDefinition.kind === "forest"
                ? "숲의 목재"
                : resourceName}{" "}
              {selectedSite.remaining} · 현장 적재 {selectedSite.buffer}/
              {LOGGING_RULES.buffer} · 운반 중 {selectedSite.haul?.cargo ?? 0} ·
              누적 입고 {selectedSite.delivered}
            </p>
            {(["logging", "storage"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                disabled={
                  busy ||
                  state.construction !== null ||
                  (kind === "logging"
                    ? selectedSite.built
                    : selectedSite.storageBuilt) ||
                  state.world.resources.RES_WOOD -
                    state.reservedWood * AMOUNT_SCALE <
                    20 * AMOUNT_SCALE
                }
                onClick={() =>
                  placeBuilding(
                    kind === "storage"
                      ? "storage"
                      : selectedDefinition.kind === "forest"
                        ? "logging"
                        : selectedDefinition.kind === "stone"
                          ? "quarry"
                          : selectedDefinition.kind,
                  )
                }
              >
                {kind === "logging"
                  ? selectedName
                  : selectedDefinition.kind === "forest"
                    ? "목재 저장소"
                    : "광물 저장소"}{" "}
                자유 배치
              </button>
            ))}
            {state.construction &&
            ["logging", "storage"].includes(state.construction.kind) ? (
              <p>유휴 주민이 현장으로 이동해 건설합니다.</p>
            ) : null}
            <label>
              작업 인원
              <select
                aria-label="작업 인원"
                value={selectedSite.target}
                disabled={!selectedSite.built || busy}
                onChange={(e) =>
                  command(
                    selectedFacility
                      ? {
                          type: "facility-staff",
                          id: selectedFacility.id,
                          count: Number(e.target.value),
                        }
                      : {
                          type: "set-logging-workers",
                          siteId: selectedSiteId,
                          count: Number(e.target.value),
                        },
                  )
                }
              >
                {[0, 1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}명
                  </option>
                ))}
              </select>
            </label>
            <p>
              배치 {selectedStaff.assigned}/{selectedSite.target}명 · 현장 작업{" "}
              {selectedStaff.working}명
            </p>
            <p>
              {!selectedSite.built
                ? `${selectedName} 건설이 필요합니다.`
                : selectedSite.haul
                  ? `${HAUL_PHASE_NAMES[selectedSite.haul.phase]}${selectedSite.haul.workerId === null ? " · 유휴 인력 대기" : ""}`
                  : !selectedSite.remaining
                    ? selectedDefinition.kind === "forest"
                      ? "이 숲의 목재를 모두 채취했습니다."
                      : "이 광맥의 자원을 모두 채취했습니다."
                    : !(selectedFacility
                          ? townShiftOpen(state, selectedFacility.id)
                          : workplaceOpen(state.world.minute))
                      ? "퇴근 시간입니다. 작업장은 09:00–18:00에 운영합니다."
                      : selectedSite.target === 0
                        ? "작업 인원을 배치해 주세요."
                        : selectedStaff.working === 0
                          ? "배치된 직원이 출근하고 있습니다."
                          : selectedSite.buffer >= LOGGING_RULES.buffer
                            ? "현장 적재 공간이 가득 차 생산을 멈췄습니다."
                            : !selectedSite.storageBuilt
                              ? "저장소를 짓기 전에는 현장 야적장에 쌓입니다."
                              : "운반할 자원과 유휴 인력을 기다립니다."}
            </p>
            <p className="hint">
              작업장에 배치하면 09–18시 출근한 인원만큼 해당 자원지의 잔량이
              줄어듭니다. 고갈된 숲만 평탄화하며 광산의 함지와 채석장은
              남습니다. 운반은 별도의 유휴 주민 1명이 자동 담당하며, 하역 후
              공동 재고에 입고하고 빈 수레를 정리합니다. 일꾼 한 명이 10분에
              자원1, 수레 최대5. 철광석은 제련 전 원료입니다.
            </p>
          </section>
          <section
            aria-label="주민의 요구"
            data-testid="resident-requests"
            aria-live="polite"
          >
            {Object.entries(RESIDENT_REQUEST_TEXT).map(([request, text]) => {
              const count = state.residents.filter(
                (r) => r.health !== "dead" && r.request === request,
              ).length;
              return count ? (
                <p key={request}>
                  {count}명: {text}
                </p>
              ) : null;
            })}
          </section>
          <section aria-label="조달 계약">
            {state.phase === "select" ? (
              <>
                <div className="timber-offers">
                  {(["A", "B"] as const).map((id) => {
                    const o = TIMBER_RULES.offers[id];
                    return (
                      <article
                        key={id}
                        className={`timber-offer${state.offer === id ? " selected" : ""}`}
                      >
                        <h3>
                          제안 {id} ·{" "}
                          {id === "A" ? "저렴한 자재" : "규격 적합 자재"}
                        </h3>
                        <p>
                          철재{o.cost} ↔ 목재20 · 운송{o.travel}분
                        </p>
                        <p>
                          {id === "A"
                            ? "정상16 · 젖은4는 인력2명이 자동 보완"
                            : "정상20 · 도착 후 전량 검수"}
                        </p>
                        <p>
                          검수{TIMBER_RULES.inspectionMinutes}분
                          {id === "A"
                            ? ` · 보완${TIMBER_RULES.repairMinutes}분`
                            : ""}
                        </p>
                        <button
                          type="button"
                          aria-pressed={state.offer === id}
                          disabled={busy}
                          onClick={() => command({ type: "choose", offer: id })}
                        >
                          제안 {id} 선택
                        </button>
                      </article>
                    );
                  })}
                </div>
                <button
                  type="button"
                  disabled={busy || !state.offer}
                  onClick={() => command({ type: "contract" })}
                >
                  선택한 제안 계약
                </button>
              </>
            ) : (
              <>
                <p>
                  {state.paused ? "일시정지" : "자동 업무 진행 중"} · 주민을
                  개별 선택할 필요가 없습니다.
                </p>
                {state.phase === "transport" && state.due !== null && (
                  <section className="convoy-road" aria-label="조달 수레 운송">
                    <span
                      className="convoy-road-cart"
                      style={{
                        left: `${Math.max(0, Math.min(100, 100 - ((state.due - state.elapsed) * 100) / TIMBER_RULES.offers[state.offer ?? "A"].travel))}%`,
                      }}
                    >
                      <svg
                        viewBox="0 0 72 44"
                        width="72"
                        height="44"
                        aria-hidden="true"
                      >
                        <rect
                          x="14"
                          y="2"
                          width="34"
                          height="8"
                          rx="4"
                          fill="#c2905f"
                        />
                        <rect
                          x="9"
                          y="10"
                          width="44"
                          height="8"
                          rx="4"
                          fill="#b17e4d"
                        />
                        <rect
                          x="6"
                          y="18"
                          width="50"
                          height="8"
                          rx="4"
                          fill="#a06d3e"
                        />
                        <circle
                          cx="48"
                          cy="6"
                          r="4"
                          fill="#ecd2a6"
                          stroke="#6e4a2a"
                          strokeWidth="1.2"
                        />
                        <circle
                          cx="53"
                          cy="14"
                          r="4"
                          fill="#ecd2a6"
                          stroke="#6e4a2a"
                          strokeWidth="1.2"
                        />
                        <circle
                          cx="56"
                          cy="22"
                          r="4"
                          fill="#ecd2a6"
                          stroke="#6e4a2a"
                          strokeWidth="1.2"
                        />
                        <path
                          d="M22 2v25M38 2v25"
                          stroke="#3f2a18"
                          strokeWidth="1.6"
                        />
                        <rect
                          x="2"
                          y="26"
                          width="58"
                          height="5"
                          rx="1.5"
                          fill="#55381f"
                        />
                        <path
                          d="M60 28h10"
                          stroke="#55381f"
                          strokeWidth="3"
                          strokeLinecap="round"
                        />
                        {[16, 46].map((cx) => (
                          <g key={cx} className="tm-road__wheel">
                            <circle
                              cx={cx}
                              cy="35"
                              r="7.5"
                              fill="#d2b382"
                              stroke="#33200f"
                              strokeWidth="3"
                            />
                            <path
                              d={`M${cx} 28v14M${cx - 7} 35h14M${cx - 5} 30l10 10M${cx + 5} 30l-10 10`}
                              stroke="#33200f"
                              strokeWidth="1.2"
                            />
                            <circle cx={cx} cy="35" r="1.8" fill="#33200f" />
                          </g>
                        ))}
                      </svg>
                    </span>
                    <span>
                      도착까지 {Math.max(0, state.due - state.elapsed)}분
                    </span>
                  </section>
                )}
                <section className="timber-stock" aria-label="이번 계약 물량">
                  {(
                    [
                      ["cart", "수레 위"],
                      ["waiting", "검사 대기"],
                      ["quarantine", "격리"],
                      ["available", "공동 입고분"],
                      ["used", "공동 사용분"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key}>
                      <span className="timber-stock-label">{label}</span>
                      <strong
                        className="timber-stock-value"
                        data-testid={`timber-${key}`}
                      >
                        {state.stock[key]}
                      </strong>
                    </div>
                  ))}
                </section>
                <p>
                  도착지는{" "}
                  {warehouseDoor(state)
                    ? "공동 저장소"
                    : "야적장 · 오래 둔 식량은 상할 수 있습니다"}
                  입니다. 합격 물자는 즉시 공동 재고에 더하며 건물마다 배분하지
                  않습니다.
                </p>
                {state.phase === "waiting-labor" ? (
                  <p role="status">
                    젖은 목재를 보완할 유휴 일손2명이 필요합니다. 배치된 주민을
                    강제로 빼오지 않습니다.
                  </p>
                ) : null}
              </>
            )}
          </section>
          {state.settledAt !== null ? (
            <section className="timber-result" data-testid="timber-result">
              <h3>목재20 조달 완료</h3>
              <p>
                공동 재고 정산 완료 · {time(state.settledAt)} · 철재{metal} 남음
              </p>
            </section>
          ) : null}
          {!state.campaign &&
          (state.mission === "register-policy" ||
            (state.scoutVisitors ?? 0) > 0) ? (
            <section aria-label="다음 임무" data-testid="next-mission">
              <h3>❗ 마을 문에 주민 3명이 도착했습니다</h3>
              <p>
                <img
                  width="64"
                  height="64"
                  src="/art/advisers/dali/concern.webp"
                  alt="아픈 주민을 걱정하는 달이"
                />{" "}
                달이 ·{" "}
                {(state.scoutVisitors ?? 0) > 0
                  ? "정찰대와 함께 도착"
                  : "마을 문 방문"}{" "}
                · 트리케라톱스 2명, 벨로키랍토르 1명. 한 명은 치료가 필요합니다.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => command({ type: "gate-decision", accept: true })}
              >
                받아준다
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  command({ type: "gate-decision", accept: false })
                }
              >
                성문을 닫고 돌려보낸다
              </button>
            </section>
          ) : null}
          {state.mission === "village-orders" ? (
            <section data-testid="next-mission">
              <h3>
                <img
                  width="64"
                  height="64"
                  src="/art/advisers/dali/neutral.webp"
                  alt="평상시의 달이"
                />{" "}
                달이 · 현재 인구{" "}
                {state.world.citizens.filter((c) => c.alive).length}명
              </h3>
            </section>
          ) : null}
          {state.buildingHealth > 0 && state.buildingHealth < 100 && (
            <details>
              <summary>둥지 보수</summary>
              <p>
                보수는 손상 건물에 직접 명령합니다. 공동 목재20과 가까운 유휴
                주민1명이 필요합니다.
              </p>
              <button
                type="button"
                disabled={
                  busy ||
                  state.phase !== "ready" ||
                  state.buildingHealth <= 0 ||
                  state.buildingHealth >= 100 ||
                  state.world.resources.RES_WOOD / AMOUNT_SCALE < 20
                }
                onClick={() => command({ type: "use" })}
              >
                건물 보수 명령
              </button>
              {state.repairWorkerId ? (
                <p data-testid="repair-worker">
                  보수 배정:{" "}
                  {state.residents.findIndex(
                    (r) => r.id === state.repairWorkerId,
                  ) + 1}
                  번 주민
                </p>
              ) : null}
            </details>
          )}
          {showDevTools ? (
            <section aria-label="조달 개발 검사">
              <h3>조달 개발 검사</h3>
              <button
                type="button"
                onClick={() =>
                  command({ type: "cold-weather", cold: !state.town.cold })
                }
              >
                {state.town.cold ? "해빙 검사" : "수역 결빙 검사"}
              </button>
              <button
                type="button"
                disabled={state.due === null}
                onClick={() => command({ type: "next" })}
              >
                다음 작업 완료까지
              </button>
              <button
                type="button"
                onClick={() => command({ type: "advance", minutes: 5 })}
              >
                5분 진행
              </button>
              <button type="button" onClick={() => setRestart(true)}>
                마을 다시 시작
              </button>
              <button type="button" onClick={() => onExit(state.world)}>
                마을 현황으로
              </button>
              {restart ? (
                <>
                  <p>
                    마을을 초기 시작값으로 바꿀까요? 기존 저장은 유지됩니다.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      command({ type: "restart" });
                      setRestart(false);
                    }}
                  >
                    초기화 확인
                  </button>
                  <button type="button" onClick={() => setRestart(false)}>
                    취소
                  </button>
                </>
              ) : null}
            </section>
          ) : null}
          <details>
            <summary>주민 생활 동선</summary>
            <p>
              다음 지시가 있으면 업무 장소로, 개별 허기가 쌓이면 영업 중인 공동
              식당으로, 그 외에는 집이나 따뜻한 대기 장소로 이동합니다. 현재
              외형은 트리케라톱스 임시 모델입니다.
            </p>
            <ul data-testid="resident-routines">
              {state.residents
                .filter((r) => r.health !== "dead")
                .map((r) => (
                  <li key={r.id}>
                    {residentName(state.residents.indexOf(r))}
                    {r.workplaceId === "restaurant"
                      ? "(식당 직원)"
                      : r.workplaceId?.startsWith("logging")
                        ? "(자원 작업장 직원)"
                        : r.task?.startsWith("logging-haul")
                          ? "(자원 운반)"
                          : ""}{" "}
                    ·{" "}
                    {r.insideHome
                      ? "둥지에서 휴식"
                      : state.workerIds.includes(r.id)
                        ? "지시 업무 중"
                        : r.task
                          ? "다음 업무 수행 중"
                          : {
                              idle: "휴식",
                              home: "집으로 이동",
                              warmth: "따뜻한 곳으로 이동",
                              restaurant: "식당으로 이동·대기",
                              eating: "식사 중",
                              "next-work": "다음 업무로 이동",
                              "to-work": "식당 근무지로 이동",
                              working: "근무 중",
                              resting: "건강 회복을 위해 휴식",
                            }[r.routine]}
                    <span className="hint">
                      {" "}
                      · 오늘 배급 {formatRation(r.rationUsed)}
                    </span>
                  </li>
                ))}
            </ul>
          </details>
          <details>
            <summary>업무 처리 기록</summary>
            <ol>
              {state.history.map((h) => (
                <li key={h.id}>
                  {time(h.minute)} · {h.text}
                </li>
              ))}
            </ol>
          </details>
        </>
      )}
      {error && (!saveOpen || !state) ? <p role="alert">{error}</p> : null}
    </section>
  );
  return (
    <>
      <LaborDemo
        active={active && laborMode}
        onState={onLaborState}
        selectedSite={selectedLaborSite}
        onClearSelection={onClearSelection}
        onClassic={() => setLaborMode(false)}
        onExit={() => {
          if (state) onExit(state.world);
        }}
      />
      {classic}
    </>
  );
}
