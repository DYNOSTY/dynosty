import {
  AMOUNT_SCALE,
  encounterReady,
  GAME_RULES,
  SCOUT_SITES,
  scoutFinding,
  type TimberCommand,
  type TimberState,
  usableHomes,
  villageTemperature,
} from "@dynosty/game-core";
import { useState } from "react";
import { createPortal } from "react-dom";

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
  const [folded, setFolded] = useState("");
  const [census, setCensus] = useState(false);
  const alive = s.residents.filter((r) => r.health !== "dead");
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
  const finding =
    find && reportId !== folded ? scoutFinding(find.kind) : undefined;
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
  const needed = Math.max(0, Math.ceil(-Math.min(temp, forecast) / 8));
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
  return (
    <>
      <div className="village-census">
        {site && reportId === folded && (
          <button type="button" onClick={() => setFolded("")}>
            정찰 전갈 다시 열기
          </button>
        )}
        <button
          type="button"
          aria-expanded={census}
          onClick={() => setCensus(!census)}
        >
          주민 {alive.length} · 거처 없음 {homeless} · 환자 {sick}
        </button>
        {census && (
          <dl>
            {[
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
        )}
      </div>
      {showEvents &&
        (finding || bulletin || (cold && coldId !== hiddenCold)) &&
        createPortal(
          <section
            className="village-bulletin"
            aria-label={
              finding ? "정찰 중 발견" : bulletin ? "마을 사건" : "추위 경고"
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
              <small>
                {finding && site
                  ? site.name + " 방면 · 정찰대의 전갈"
                  : bulletin?.kind === "decree"
                    ? "관아의 방"
                    : bulletin
                      ? s.chapter === 3
                        ? "도성의 기록"
                        : "복홀의 기록"
                      : (isNight ? "달이" : "나르미") + " · 추위 경고"}
              </small>
              <h3>
                {finding?.[0] ?? bulletin?.title ?? "둥지에 찬 기운이 듭니다"}
              </h3>
              <p>{finding?.[1] ?? bulletin?.detail ?? coldWords}</p>
              {finding && site ? (
                <>
                  <button type="button" onClick={() => setFolded(reportId)}>
                    보고 닫기
                  </button>
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
