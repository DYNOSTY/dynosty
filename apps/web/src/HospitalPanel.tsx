import {
  atHospital,
  GAME_RULES,
  hospitalBeds,
  hospitalHours,
  recoveryRequired,
  type TimberState,
} from "@dynosty/game-core";
import { useEffect, useRef } from "react";
import { residentName } from "./resident-names.js";

const injuryNames = { minor: "경상", major: "부상", critical: "중상" };
export function HospitalPanel({
  state,
  selected,
}: {
  state: TimberState;
  selected: string | null;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selected) panel.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  const hospitals = state.town.facilities.filter((f) => f.kind === "hospital");
  const waiting = state.town.patients.filter((p) => p.hospital === null).length;
  if (!hospitals.length && !waiting) return null;
  return (
    <section
      ref={panel}
      className="village-service"
      aria-label="병원 치료 현황"
    >
      <h3>병원 · 자동 치료</h3>
      <p>
        병원 {hospitals.length}곳 · 병상 대기 {waiting}명
      </p>
      <p>
        건강한 의료 인원을 배치한 병원은 입원 중 밤에도 회복합니다. 회복량을
        채우면 자동 퇴원해 일상으로 돌아갑니다.
      </p>
      {hospitals
        .filter((f) => !selected || f.id === selected)
        .map((f) => {
          const patients = state.town.patients.filter(
            (p) => p.hospital === f.id,
          );
          return (
            <details
              key={f.id}
              open={selected === f.id}
              data-testid={`hospital-${f.id}`}
            >
              <summary>
                병원 {f.id} 치료 현황 · {patients.length}/
                {hospitalBeds(f.level)}
                병상
              </summary>
              <p>
                {f.level}단계 · 경상 회복 {hospitalHours(f.level)}시간 ·
                부상2배/중상4배
              </p>
              <p>
                {state.residents.filter(
                  (r) =>
                    r.workplaceId === `facility:${f.id}` &&
                    r.health === "healthy",
                ).length
                  ? "의료 인원 배치됨"
                  : "의료 인원을 배치해야 회복합니다."}
              </p>
              {patients.length === 0 ? (
                <p>치료 중인 주민이 없습니다.</p>
              ) : (
                <ul>
                  {patients.map((p) => {
                    const r = state.residents.find((r) => r.id === p.resident);
                    const c = state.world.citizens.find(
                      (c) => c.id === p.resident,
                    );
                    if (!r || !c) return null;
                    const species =
                      GAME_RULES.population.find((g) => g.species === c.species)
                        ?.name ?? c.species;
                    const required = recoveryRequired(p);
                    return (
                      <li key={p.resident}>
                        주민{" "}
                        {residentName(
                          state.residents.findIndex((r) => r.id === p.resident),
                        )}{" "}
                        · {species} · {injuryNames[p.severity]} ·{" "}
                        {atHospital(state, r) ? "입원 중" : "병원으로 이동 중"}
                        <progress
                          aria-label={`${p.resident} 회복`}
                          value={p.progress}
                          max={required}
                        />
                        회복 {Math.floor(p.progress)}/{required} (
                        {Math.floor((p.progress / required) * 100)}%)
                      </li>
                    );
                  })}
                </ul>
              )}
            </details>
          );
        })}
      {waiting ? (
        <p>
          빈 병상이 있는 가까운 병원으로 자동 이동합니다. 병원이 없거나 가득
          차면 대기합니다.
        </p>
      ) : null}
    </section>
  );
}
