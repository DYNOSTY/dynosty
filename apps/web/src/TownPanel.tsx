import {
  BOKHOL_WATERS,
  BUILDING_RULES,
  type BuildingKind,
  type FoodId,
  facilityResource,
  facilityStaffLimit,
  GAME_RULES,
  hospitalBeds,
  hospitalHours,
  orderWork,
  productionRate,
  restaurantStaff,
  STORAGE_SPACE,
  storageCapacity,
  storageResearchLevel,
  type TimberCommand,
  type TimberState,
  townShiftOpen,
  tradeRank,
  warehouseDoor,
  workplaceOpen,
} from "@dynosty/game-core";
import { useState } from "react";
import { BuildingUpgrade } from "./BuildingUpgrade.js";
import { DevelopmentPanel, OvertimeControl } from "./DevelopmentPanel.js";
import { HospitalPanel } from "./HospitalPanel.js";

const facilityReferences: Record<BuildingKind, string> = {
  home: "nest-dining",
  restaurant: "nest-dining",
  workshop: "research-hospital",
  hospital: "research-hospital",
  logging: "timber-storage",
  storage: "timber-storage",
  coal: "mining",
  iron: "mining",
  quarry: "mining",
  fishery: "fishery",
  farm: "farm-ranch",
  ranch: "farm-ranch",
  scout: "scout-trade",
  trade: "scout-trade",
};
export const buildingCost = (kind: BuildingKind) =>
  Object.entries(BUILDING_RULES[kind].cost)
    .map(
      ([r, n]) =>
        `${GAME_RULES.resources[r as keyof typeof GAME_RULES.resources].name}${n}`,
    )
    .join(" · ");
export function TownPanel({
  state,
  command,
  place,
  view,
  selectedHospital = null,
  showDevTools = false,
}: {
  state: TimberState;
  selectedHospital?: string | null;
  showDevTools?: boolean;
  command: (c: TimberCommand) => void;
  place: (kind: BuildingKind) => void;
  view: (p: { x: number; z: number }, distance?: number) => void;
}) {
  const [kind, setKind] = useState<BuildingKind>("home"),
    [food, setFood] = useState<FoodId>("RES_PLANT"),
    [range, setRange] = useState<1 | 2 | 3>(1);
  return (
    <section className="village-service" aria-label="건설과 식량 수급">
      <h3>마을 건설 · 식량 수급</h3>
      <label>
        지을 건물{" "}
        <select
          aria-label="지을 건물"
          value={kind}
          onChange={(e) => setKind(e.target.value as BuildingKind)}
        >
          {Object.entries(BUILDING_RULES).map(([id, r]) => (
            <option key={id} value={id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <p>
        {buildingCost(kind)} · 4명 기준 공사 약{" "}
        {Math.ceil(BUILDING_RULES[kind].work / 6)}초 · 운영 정원{" "}
        {BUILDING_RULES[kind].staff}명
      </p>
      <p>{BUILDING_RULES[kind].site}</p>
      <details className="facility-art">
        <summary>단계별 시설 설계 보기</summary>
        <img
          className="facility-reference"
          src={`/art/facilities/${facilityReferences[kind]}-levels-v1.png`}
          alt={`${BUILDING_RULES[kind].name} 1~3단계 설계 삽화`}
          loading="lazy"
          width="1494"
          height="1053"
        />
      </details>
      <button type="button" onClick={() => place(kind)}>
        완성 모습으로 배치
      </button>
      <p className="hint">
        개발용 정량 · 건설은 09~18시, 가까운 유휴 인력 최대4명 자동 배정. 1명도
        공사 가능하며 체격이 큰 주민은 더 빨리 작업합니다. 자재는 접수 때
        확보하고 자원 부족 시 접수하지 않습니다.
      </p>
      <div data-testid="building-queue">
        <h4>건설 대기 {state.town.orders.length}곳</h4>
        {state.town.orders.map((o) => (
          <p key={o.id}>
            {BUILDING_RULES[o.kind].name}
            {o.upgradeTarget ? ` ${o.upgradeLevel}단계 개량` : ""} ·{" "}
            {Math.min(100, Math.floor((o.workDone / orderWork(o)) * 100))}% ·{" "}
            {o.crew.length}명 ·{" "}
            {!townShiftOpen(state, o.id)
              ? "퇴근 · 09:00 재개"
              : !o.crew.length
                ? "유휴 인력 대기"
                : o.stage === "collect"
                  ? "자재 수령"
                  : o.stage === "deliver"
                    ? "자재 운반"
                    : "공사 중"}
            <OvertimeControl state={state} target={o.id} command={command} />
          </p>
        ))}
      </div>
      <p>
        수역:{" "}
        {state.town.cold ? "결빙 · 얼음 구멍 낚시 가능" : "물고기 어획 가능"}
      </p>
      {BOKHOL_WATERS.map((w) => (
        <button
          key={w.id}
          type="button"
          onClick={() => view({ x: w.x, z: w.z }, 65)}
        >
          {w.name} 보기
        </button>
      ))}
      <details>
        <summary>완공 시설 {state.town.facilities.length}곳</summary>
        <p>
          각 일터의 운영 인원을 정하면 주민이 출근합니다. 온돌 둥지와 공동
          저장소에는 상주 인원이 필요하지 않습니다.
        </p>
        {state.town.facilities.map((f) => (
          <article key={f.id}>
            <strong>
              {BUILDING_RULES[f.kind].name} · {f.level}단계 · {f.id}
            </strong>{" "}
            <button type="button" onClick={() => view(f.position, 32)}>
              현장 보기
            </button>
            {facilityResource(f) ? (
              <p>
                생산 배율×{productionRate(state, f).toFixed(2)} · 건물·채집 연구
                중 높은 배율, 최고2배
              </p>
            ) : null}
            {f.kind === "restaurant" ? (
              <p>
                좌석{[10, 20, 40][f.level - 1]} · 직원
                {restaurantStaff(state, f.id).assigned}/{facilityStaffLimit(f)}{" "}
                · 배식 중 {restaurantStaff(state, f.id).serving}명 · 식사 중{" "}
                {
                  state.residents.filter(
                    (r) =>
                      r.routine === "eating" &&
                      r.diningSeat !== null &&
                      Math.floor(r.diningSeat / 40) ===
                        state.town.facilities
                          .filter((site) => site.kind === "restaurant")
                          .findIndex((site) => site.id === f.id),
                  ).length
                }
                명 · 식사 30분 이내
              </p>
            ) : null}
            <BuildingUpgrade state={state} id={f.id} command={command} />
            {f.kind === "hospital" ? (
              <p>
                병상{hospitalBeds(f.level)} · 경상{hospitalHours(f.level)}시간 ·
                부상2배/중상4배
              </p>
            ) : null}
            {f.kind === "storage" ? (
              <p>
                이 저장소 공간{" "}
                {
                  STORAGE_SPACE[
                    Math.max(f.level, storageResearchLevel(state)) - 1
                  ]
                }
              </p>
            ) : null}
            {facilityResource(f) &&
            state.town.development.completed.includes("TECH_ELECTRICAL") ? (
              <label>
                <input
                  type="checkbox"
                  aria-label={`${f.id} 강제 작업`}
                  checked={state.town.development.electrical.includes(f.id)}
                  onChange={(e) =>
                    command({
                      type: "electrical-work",
                      id: f.id,
                      enabled: e.target.checked,
                    })
                  }
                />{" "}
                전기자극기 시행 · 기본200%
              </label>
            ) : null}
            {facilityResource(f) || f.kind === "workshop" ? (
              <OvertimeControl state={state} target={f.id} command={command} />
            ) : null}
            {facilityStaffLimit(f) > 0 ? (
              <label>
                {" "}
                운영 인원{" "}
                <select
                  aria-label={`${f.id} 운영 인원`}
                  value={
                    f.kind === "restaurant" &&
                    state.town.facilities.find((q) => q.kind === "restaurant")
                      ?.id === f.id
                      ? state.restaurantWorkerTarget
                      : f.target
                  }
                  onChange={(e) =>
                    command({
                      type: "facility-staff",
                      id: f.id,
                      count: Number(e.target.value),
                    })
                  }
                >
                  {Array.from(
                    { length: facilityStaffLimit(f) + 1 },
                    (_, n) => n,
                  ).map((n) => (
                    <option key={n} value={n}>
                      {n}명
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {[
              "logging",
              "coal",
              "iron",
              "quarry",
              "fishery",
              "farm",
              "ranch",
            ].includes(f.kind) ? (
              <p>
                {f.kind === "fishery" ? "어류 즉시 입고 · 대기" : "현장 적재"}{" "}
                {f.buffer}/20 · 운반 중 {f.haul?.cargo ?? 0} · 누적 입고{" "}
                {f.delivered}
                {f.kind === "ranch"
                  ? " · 가축 사육: 풀1·물1 → 고기2"
                  : f.kind === "farm"
                    ? " · 재배: 물1 → 풀3 · 결빙기 석탄1 추가"
                    : ""}
              </p>
            ) : null}
            {f.kind === "trade" ? (
              <label>
                {" "}
                교역 식량{" "}
                <select
                  aria-label={`${f.id} 교역 식량`}
                  value={food}
                  onChange={(e) => setFood(e.target.value as FoodId)}
                >
                  <option value="RES_PLANT">풀</option>
                  <option value="RES_MEAT">고기</option>
                  <option value="RES_FISH">어류</option>
                </select>
              </label>
            ) : null}
            {["scout", "trade"].includes(f.kind) ? (
              <label>
                {" "}
                교류 범위{" "}
                <select
                  aria-label={`${f.id} 교류 범위`}
                  value={range}
                  onChange={(e) =>
                    setRange(Number(e.target.value) as 1 | 2 | 3)
                  }
                >
                  {[1, 2, 3]
                    .filter((n) => n <= tradeRank(state))
                    .map((n) => (
                      <option key={n} value={n}>
                        {n}단계
                      </option>
                    ))}
                </select>
              </label>
            ) : null}
            {["scout", "trade"].includes(f.kind) ? (
              <>
                <button
                  type="button"
                  disabled={
                    !workplaceOpen(state.world.minute) ||
                    state.town.trips.some((t) => t.facilityId === f.id) ||
                    state.residents.filter(
                      (r) =>
                        r.workplaceId === `facility:${f.id}` &&
                        r.health === "healthy" &&
                        !r.task,
                    ).length < (f.kind === "scout" ? 2 : 1)
                  }
                  onClick={() =>
                    command({
                      type: "dispatch-food",
                      id: f.id,
                      food,
                      rank: range,
                    })
                  }
                >
                  {f.kind === "scout"
                    ? `정찰 중 사냥 파견 · 배치2명 · 고기${[8, 12, 18][range - 1]}`
                    : `목재${[5, 8, 12][range - 1]} ↔ 식량${[10, 16, 24][range - 1]} 교역 파견 · 배치1명`}
                </button>
                <p>
                  {state.town.trips.find((t) => t.facilityId === f.id)
                    ? "이동·활동·복귀 중 · 돌아온 뒤 공동 재고 입고"
                    : "일과시간에 거점 직원이 배치되어야 출발합니다."}
                </p>
              </>
            ) : null}
          </article>
        ))}
      </details>
      <HospitalPanel state={state} selected={selectedHospital} />
      <p>
        {warehouseDoor(state)
          ? "공동 저장소"
          : "임시 야적장 · 눈이 녹으면 목재가 젖을 수 있음"}
        {state.yardDryAt ? " · 목재 1개 건조 중" : ""} · 공동 저장 용량: 품목별{" "}
        {storageCapacity(state)} · 꽉 차면 새 입고 대기
      </p>
      <details>
        <summary>온돌 둥지 개량 {state.homes.length}곳</summary>
        {state.homes.map((h) => (
          <article key={h.id}>
            <strong>
              둥지 {h.id} · {h.level ?? 1}단계 · 공간{h.capacity}
            </strong>
            <BuildingUpgrade state={state} id={h.id} command={command} />
          </article>
        ))}
      </details>
      <DevelopmentPanel
        state={state}
        command={command}
        showDevTools={showDevTools}
      />
    </section>
  );
}
