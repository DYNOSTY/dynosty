import {
  AMOUNT_SCALE,
  BUILDING_RULES,
  canDirectStaff,
  encounterReady,
  facilityStaffLimit,
  GAME_RULES,
  idleTownResidents,
  SCOUT_SITES,
  scoutFinding,
  type TimberCommand,
  type TimberState,
  usableHomes,
  villageTemperature,
} from "@dynosty/game-core";
import { useState } from "react";
import { createPortal } from "react-dom";
import { residentName } from "./resident-names.js";

export function VillageBulletin({
  state: s,
  command,
  showEvents,
  heat,
}: {
  state: TimberState;
  command: (cmd: TimberCommand) => void;
  showEvents: boolean;
  heat: () => void;
}) {
  const [hiddenCold, setHiddenCold] = useState("");
  const [census, setCensus] = useState(false);
  const [filter, setFilter] = useState("");
  const alive = s.residents.filter((r) => r.health !== "dead");
  const idle = idleTownResidents(s).length;
  const children = new Set(
    s.world.citizens
      .filter((c) => c.alive && c.age === "child")
      .map((c) => c.id),
  );
  const skilled = new Set(
    s.town.facilities
      .filter((f) => f.kind === "workshop" || f.kind === "hospital")
      .map((f) => "facility:" + f.id),
  );
  const specialists = alive.filter(
    (r) => !children.has(r.id) && skilled.has(r.workplaceId ?? ""),
  ).length;
  const homes = new Set(usableHomes(s).map((h) => h.id));
  const homeless = alive.filter(
    (r) => !r.homeId || !homes.has(r.homeId),
  ).length;
  const sick = alive.filter((r) => r.health === "sick").length;
  const bulletin = s.bulletins?.[0];
  const site = SCOUT_SITES.find((site) => encounterReady(s, site.id));
  const find = site && s.scoutFinds?.[site.id];
  const reportId = site ? site.id + "-" + find?.due : "";
  const finding = find ? scoutFinding(find.kind) : undefined;
  const arrival = s.mission === "register-policy" || (s.scoutVisitors ?? 0) > 0;
  const temp = villageTemperature(s);
  const next = s.world.minute + 60;
  const forecast = villageTemperature({
    ...s,
    elapsed: s.elapsed + 60,
    world: {
      ...s.world,
      day: s.world.day + Math.floor(next / 1440),
      minute: next % 1440,
    },
  });
  const occupied = new Set(
    alive.filter((r) => r.homeId && homes.has(r.homeId)).map((r) => r.homeId),
  ).size;
  const needed = Math.max(0, Math.ceil(-Math.min(temp, forecast) / 10));
  const setting = s.heating || Math.min(3, needed);
  const fuel =
    Math.max(
      0,
      Math.floor(s.world.resources.RES_WOOD / AMOUNT_SCALE) - s.reservedWood,
    ) +
    (s.campaign?.beat === "capital"
      ? Math.floor(s.world.resources.RES_COAL / AMOUNT_SCALE) *
        GAME_RULES.fuel.coalToWood
      : 0);
  const missing = occupied > 0 && fuel < Math.min(3, needed) * occupied;
  const cold = needed > 0 && (missing || setting < needed || homeless > 0);
  const coldId = [
    s.world.day,
    needed,
    missing,
    setting < needed,
    homeless > 0,
  ].join("-");
  const isNight = s.world.minute < 360 || s.world.minute >= 1080;
  const coldWords = missing
    ? "불씨는 살아 있는데 다음 번에 넣을 땔감이 모자라. 곳간을 살펴 줘."
    : setting < needed
      ? "문을 닫아도 방바닥이 자꾸 식어. 아궁이에 불을 더 때야겠어."
      : "아직 눈밭에 자리를 편 이들이 있어. 날이 더 차지기 전에 둥지를 마련해 줘.";
  const workers = new Map<string, number>();
  const citizens = new Map(s.world.citizens.map((c) => [c.id, c]));
  const facilityNames = new Map<string, string>();
  const ordinals = new Map<string, number>();
  if (census) {
    for (const r of alive)
      if (r.workplaceId)
        workers.set(r.workplaceId, (workers.get(r.workplaceId) ?? 0) + 1);
    for (const f of s.town.facilities) {
      const n = (ordinals.get(f.kind) ?? 0) + 1;
      ordinals.set(f.kind, n);
      facilityNames.set(f.id, BUILDING_RULES[f.kind].name + " " + n);
    }
  }
  return (
    <>
      <div className="village-census">
        <button
          type="button"
          aria-expanded={census}
          onClick={() => setCensus(!census)}
        >
          <strong>유휴 일손 {idle}명</strong> · 전체 주민 {alive.length}명
        </button>
        {census && (
          <div className="resident-ledger">
            <dl>
              {[
                ["지금 배치 가능한 일손", idle],
                ["거처 없는 공룡", homeless],
                ["환자", sick],
                ["기술 공룡 · 연구소와 병원", specialists],
                ["아동", children.size],
                ["일반 성체", alive.length - children.size - specialists],
              ].map(([name, n]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>{n}마리</dd>
                </div>
              ))}
            </dl>
            <details>
              <summary>주민별 근무지와 배치</summary>
              <label>
                주민 찾기{" "}
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="이름 · 종 · 근무지"
                />
              </label>
              <ul>
                {s.residents.map((r, index) => {
                  if (r.health === "dead") return null;
                  const citizen = citizens.get(r.id);
                  const facility = s.town.facilities.find(
                    (f) => "facility:" + f.id === r.workplaceId,
                  );
                  const workplace = facility
                    ? facilityNames.get(facility.id)
                    : r.workplaceId === "restaurant"
                      ? "공동 식당"
                      : r.workplaceId === "office"
                        ? "관아"
                        : r.workplaceId?.startsWith("logging")
                          ? "자원 작업장"
                          : r.workplaceId
                            ? "마을 업무"
                            : "미배치";
                  const species =
                    citizen?.species === "R02"
                      ? "트리케라톱스"
                      : citizen?.species === "R03"
                        ? "벨로키랍토르"
                        : "스피노사우루스";
                  const job = s.town.orders.find((o) => o.crew.includes(r.id));
                  const status =
                    r.health === "sick"
                      ? "치료 중"
                      : r.insideHome
                        ? "둥지"
                        : job
                          ? BUILDING_RULES[job.kind].name + " 공사 배정"
                          : r.task
                            ? "업무 중"
                            : {
                                idle: "대기",
                                home: "귀가 중",
                                warmth: "온기로 이동",
                                restaurant: "식당으로 이동",
                                eating: "식사 중",
                                "next-work": "이동 중",
                                "to-work": "출근 중",
                                working: "근무 중",
                                resting: "휴식 중",
                              }[r.routine];
                  const name = residentName(index);
                  if (
                    ![name, species, workplace, status]
                      .join(" ")
                      .includes(filter.trim())
                  )
                    return null;
                  const available =
                    citizen?.alive &&
                    (s.childLabor || citizen.age !== "child") &&
                    r.health === "healthy" &&
                    !r.task &&
                    !r.nextWork &&
                    r.routine !== "eating" &&
                    !s.workerIds.includes(r.id) &&
                    !s.town.trips.some((t) => t.ids.includes(r.id)) &&
                    (!r.workplaceId ||
                      (facility && canDirectStaff(facility.kind)));
                  return (
                    <li key={r.id}>
                      <strong>{name}</strong> · {species} ·{" "}
                      {children.has(r.id) ? "아동" : "성체"}
                      <small>
                        {workplace} · {status}
                      </small>
                      {available && (
                        <select
                          aria-label={name + " 근무지"}
                          value={facility?.id ?? ""}
                          onChange={(e) =>
                            command({
                              type: "direct-staff",
                              resident: r.id,
                              destination: e.target.value || null,
                            })
                          }
                        >
                          <option value="">미배치</option>
                          {s.town.facilities
                            .filter((f) => canDirectStaff(f.kind))
                            .map((f) => {
                              const count =
                                workers.get("facility:" + f.id) ?? 0;
                              return (
                                <option
                                  key={f.id}
                                  value={f.id}
                                  disabled={
                                    count >= facilityStaffLimit(f) &&
                                    facility?.id !== f.id
                                  }
                                >
                                  {facilityNames.get(f.id)} · {count}/
                                  {facilityStaffLimit(f)}
                                </option>
                              );
                            })}
                        </select>
                      )}
                    </li>
                  );
                })}
              </ul>
            </details>
          </div>
        )}
      </div>
      {showEvents &&
        (finding || bulletin || arrival || (cold && coldId !== hiddenCold)) &&
        createPortal(
          <section
            className="village-bulletin"
            aria-label={
              finding
                ? "정찰 중 발견"
                : bulletin
                  ? "마을 사건"
                  : arrival
                    ? "주민 도착"
                    : "추위 경고"
            }
            aria-live="polite"
          >
            {(finding || bulletin) && (
              <img
                alt=""
                src={
                  finding || bulletin?.kind === "scout"
                    ? "/story/campaign/scout-encounter.webp"
                    : bulletin?.kind === "loss"
                      ? "/story/campaign/casualty-vigil.webp"
                      : "/art/village-office.webp"
                }
              />
            )}
            <div>
              {!finding && !bulletin && arrival && (
                <img
                  className="village-bulletin__portrait"
                  src="/art/advisers/dali/concern.webp"
                  alt="아픈 주민을 걱정하는 달이"
                />
              )}
              <small>
                {finding && site
                  ? site.name + " 방면 · 정찰대의 전갈"
                  : bulletin?.kind === "decree"
                    ? "관아의 방"
                    : bulletin
                      ? s.chapter === 3
                        ? "도성의 기록"
                        : "복홀의 기록"
                      : arrival
                        ? "달이 · 성문"
                        : (isNight ? "달이" : "나르미") + " · 추위 경고"}
              </small>
              <h3>
                {finding?.[0] ??
                  bulletin?.title ??
                  (arrival
                    ? "마을 문에 주민 3명이 도착했습니다"
                    : "둥지에 찬 기운이 듭니다")}
              </h3>
              <p>
                {finding?.[1] ??
                  bulletin?.detail ??
                  (arrival
                    ? "트리케라톱스 둘과 벨로키랍토르 하나예요. 한 명은 치료가 필요해요."
                    : coldWords)}
              </p>
              {finding && site ? (
                <>
                  <p>
                    {finding[2]} · 함께 돌아오면 마을에 도착할 때 인계합니다.
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      command({
                        type: "scout-choice",
                        site: site.id,
                        take: true,
                      })
                    }
                  >
                    {find?.kind === "survivors"
                      ? "함께 복홀로 돌아온다"
                      : "챙겨서 복홀로 돌아온다"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      command({
                        type: "scout-choice",
                        site: site.id,
                        take: false,
                      })
                    }
                  >
                    남겨 두고 정찰을 마친다
                  </button>
                </>
              ) : bulletin ? (
                <button
                  type="button"
                  onClick={() =>
                    command({ type: "read-bulletin", key: bulletin.key })
                  }
                >
                  확인
                </button>
              ) : arrival ? (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      command({ type: "gate-decision", accept: true })
                    }
                  >
                    받아준다
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      command({ type: "gate-decision", accept: false })
                    }
                  >
                    성문을 닫고 돌려보낸다
                  </button>
                </>
              ) : (
                <>
                  <p>
                    현재 {temp} °C · 한 시간 뒤 {forecast} °C
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setHiddenCold(coldId);
                      heat();
                    }}
                  >
                    온돌 살피기
                  </button>{" "}
                  <button type="button" onClick={() => setHiddenCold(coldId)}>
                    확인
                  </button>
                </>
              )}
            </div>
          </section>,
          document.body,
          finding ? reportId : (bulletin?.key ?? coldId),
        )}
    </>
  );
}
