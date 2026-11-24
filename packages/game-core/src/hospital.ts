import { applyCitizenEvent } from "./play.js";
import { moveOnGround, residentPath } from "./resident-path.js";
import type { TimberState, VillageResident } from "./timber.js";
import { facilityDoor, reconcileTownHealth, townObstacles } from "./town.js";

export const HOSPITAL_RULES = {
  beds: [5, 15, 25],
  hours: [12, 8, 4],
  recovery: { minor: 720, major: 1440, critical: 2880 },
} as const;
export const hospitalBeds = (level: number) =>
  HOSPITAL_RULES.beds[level - 1] ?? 5;
export const hospitalHours = (level: number) =>
  HOSPITAL_RULES.hours[level - 1] ?? 12;
export type InjurySeverity = keyof typeof HOSPITAL_RULES.recovery;
export interface Patient {
  resident: string;
  severity: InjurySeverity;
  progress: number;
  hospital: string | null;
}
export const recoveryRequired = (p: Patient) =>
  HOSPITAL_RULES.recovery[p.severity];
export const atHospital = (s: TimberState, r: VillageResident) => {
  const p = s.town.patients.find((p) => p.resident === r.id);
  const f = s.town.facilities.find(
    (f) => f.id === p?.hospital && f.kind === "hospital",
  );
  return (
    !!f &&
    r.health === "sick" &&
    Math.hypot(
      r.position.x - facilityDoor(f).x,
      r.position.z - facilityDoor(f).z,
    ) < 0.01
  );
};
export function reconcilePatients(
  s: TimberState,
  severity: InjurySeverity = "minor",
  changed: readonly string[] = [],
): TimberState {
  const patients = s.residents
    .filter((r) => r.health === "sick")
    .map((r): Patient => {
      const old = s.town.patients.find((p) => p.resident === r.id);
      if (old)
        return changed.includes(r.id) &&
          HOSPITAL_RULES.recovery[severity] > recoveryRequired(old)
          ? { ...old, severity }
          : old;
      return {
        resident: r.id,
        severity: changed.includes(r.id) ? severity : "minor",
        progress: 0,
        hospital: null,
      };
    });
  return { ...s, town: { ...s.town, patients } };
}
export function advanceHospital(
  input: TimberState,
  minutes: number,
): TimberState {
  let s = reconcilePatients(input);
  for (const original of s.town.patients) {
    const p = { ...original };
    let r = s.residents.find((r) => r.id === p.resident);
    if (!r || s.mutants?.some((m) => m.id === r?.id)) continue;
    if (p.hospital === null) {
      const hospitals = s.town.facilities
        .filter(
          (f) =>
            f.kind === "hospital" &&
            s.mutantDamage?.[f.id] !== 100 &&
            s.town.patients.filter((q) => q.hospital === f.id).length <
              hospitalBeds(f.level),
        )
        .sort(
          (a, b) =>
            Math.hypot(
              (r?.position.x ?? 0) - a.position.x,
              (r?.position.z ?? 0) - a.position.z,
            ) -
            Math.hypot(
              (r?.position.x ?? 0) - b.position.x,
              (r?.position.z ?? 0) - b.position.z,
            ),
        );
      const hospital = hospitals.find(
        (f) =>
          r &&
          residentPath(r.position, facilityDoor(f), townObstacles(s)).length,
      );
      if (hospital) p.hospital = hospital.id;
    }
    const f = s.town.facilities.find((f) => f.id === p.hospital);
    if (f) {
      const door = facilityDoor(f);
      const arrived =
        Math.hypot(r.position.x - door.x, r.position.z - door.z) < 0.01;
      const staffed = s.residents.some(
        (q) => q.workplaceId === `facility:${f.id}` && q.health === "healthy",
      );
      if (arrived && staffed && s.mutantDamage?.[f.id] !== 100)
        p.progress += (minutes * 12) / hospitalHours(f.level);
      r = {
        ...r,
        position: arrived
          ? r.position
          : moveOnGround(r.position, door, minutes, 2, townObstacles(s)),
        routine: "resting",
        task: null,
        nextWork: null,
        workplaceId: null,
        insideHome: false,
        eatingUntil: null,
        diningSeat: null,
        request: null,
      };
    }
    s = {
      ...s,
      residents: s.residents.map((q) => (q.id === r?.id ? r : q)),
      town: {
        ...s.town,
        patients: s.town.patients.map((q) =>
          q.resident === p.resident ? p : q,
        ),
      },
    };
    if (p.progress >= recoveryRequired(p)) {
      const world = applyCitizenEvent(s.world, {
        type: "recovery",
        id: `hospital-${s.world.day}-${s.elapsed}-${r.id}`,
        citizenIds: [r.id],
      });
      s = {
        ...s,
        world,
        residents: s.residents.map((q) =>
          q.id === r?.id ? { ...q, health: "healthy", routine: "idle" } : q,
        ),
        town: {
          ...s.town,
          patients: s.town.patients.filter((q) => q.resident !== p.resident),
        },
      };
    }
  }
  return reconcileTownHealth(s);
}
export function hospitalValid(s: TimberState): boolean {
  const patients = s.town.patients;
  if (
    !Array.isArray(patients) ||
    patients.length > 1000 ||
    patients.some((p) => !p || typeof p !== "object") ||
    new Set(patients.map((p) => p.resident)).size !== patients.length
  )
    return false;
  for (const p of patients) {
    const r = s.residents.find((r) => r.id === p.resident);
    if (
      r?.health !== "sick" ||
      !Object.hasOwn(HOSPITAL_RULES.recovery, p.severity) ||
      !Number.isFinite(p.progress) ||
      p.progress < 0 ||
      p.progress >= recoveryRequired(p) ||
      (p.hospital !== null &&
        !s.town.facilities.some(
          (f) => f.id === p.hospital && f.kind === "hospital",
        )) ||
      false
    )
      return false;
    if (
      p.hospital !== null &&
      (r.task !== null ||
        r.nextWork !== null ||
        r.workplaceId !== null ||
        r.insideHome)
    )
      return false;
  }
  return (
    patients.length === s.residents.filter((r) => r.health === "sick").length &&
    s.town.facilities
      .filter((f) => f.kind === "hospital")
      .every(
        (f) =>
          patients.filter((p) => p.hospital === f.id).length <=
          hospitalBeds(f.level),
      )
  );
}
