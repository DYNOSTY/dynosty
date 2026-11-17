import { type GroundPoint, residentPath } from "./resident-path.js";

export const RESIDENT_ROUTINE_RULES = {
  hungryAt: 360,
  eatingMinutes: 5,
  workOpens: 9 * 60,
  workCloses: 18 * 60,
  restaurantOpens: 6 * 60,
  restaurantCloses: 22 * 60,
};
export interface ResidentRoutine {
  readonly position: GroundPoint;
  readonly home: GroundPoint | null;
  readonly workplaceId: string | null;
  readonly task: string | null;
  readonly nextWork: {
    readonly id: string;
    readonly position: GroundPoint;
  } | null;
  readonly hunger: number;
  readonly diningSeat: number | null;
  readonly health: "healthy" | "sick" | "dead";
  readonly request:
    | "no-restaurant"
    | "restaurant-closed"
    | "no-food"
    | "no-staff"
    | "ration-exhausted"
    | "no-home"
    | "waiting-seat"
    | null;
  readonly eatingUntil: number | null;
  readonly routine:
    | "idle"
    | "home"
    | "warmth"
    | "restaurant"
    | "eating"
    | "next-work"
    | "to-work"
    | "working"
    | "resting";
}
export interface ResidentPlaces {
  readonly warmth: GroundPoint;
  readonly restaurant: GroundPoint | null;
  readonly minute: number;
  readonly seatAvailable?: boolean;
  readonly restaurantStaffed?: boolean;
  readonly workplace?: GroundPoint | undefined;
  readonly workOpen?: boolean;
  readonly rationAvailable?: boolean;
  readonly hungerRelief?: number;
  readonly obstacles: readonly GroundPoint[];
}
export const restaurantOpen = (minute: number) =>
  minute >= RESIDENT_ROUTINE_RULES.restaurantOpens &&
  minute < RESIDENT_ROUTINE_RULES.restaurantCloses;
export const workplaceOpen = (minute: number) =>
  minute >= RESIDENT_ROUTINE_RULES.workOpens &&
  minute < RESIDENT_ROUTINE_RULES.workCloses;
export function afterWorkDestination(
  r: ResidentRoutine,
  _now: number,
  places: ResidentPlaces,
): GroundPoint {
  if (
    r.hunger >= RESIDENT_ROUTINE_RULES.hungryAt &&
    places.restaurant &&
    places.restaurantStaffed !== false &&
    places.rationAvailable !== false &&
    restaurantOpen(places.minute)
  )
    return places.restaurant;
  return r.nextWork?.position ?? r.home ?? places.warmth;
}
export function advanceResidentRoutine<T extends ResidentRoutine>(
  resident: T,
  now: number,
  minutes: number,
  speed: number,
  places: ResidentPlaces,
  foodAvailable: boolean,
): T {
  let r = resident;
  if (r.health === "dead")
    return {
      ...r,
      routine: "idle",
      request: null,
      eatingUntil: null,
      task: null,
      nextWork: null,
      workplaceId: null,
    };
  if (r.task !== null)
    return { ...r, routine: "working", request: null, eatingUntil: null };
  const employee = r.workplaceId === "restaurant";
  const onShift =
    r.workplaceId !== null &&
    (employee
      ? restaurantOpen(places.minute)
      : (places.workOpen ?? workplaceOpen(places.minute))) &&
    r.health === "healthy";
  if (onShift && !employee && !places.workplace)
    return { ...r, routine: "working", request: null, eatingUntil: null };
  if (r.routine === "eating") {
    if (r.eatingUntil !== null && now >= r.eatingUntil)
      r = { ...r, eatingUntil: null, routine: "idle" };
    else return r;
  }
  const hungry = r.hunger >= RESIDENT_ROUTINE_RULES.hungryAt;
  const request = !hungry
    ? null
    : !places.restaurant
      ? "no-restaurant"
      : !restaurantOpen(places.minute)
        ? "restaurant-closed"
        : !employee && places.restaurantStaffed === false
          ? "no-staff"
          : places.rationAvailable === false
            ? "ration-exhausted"
            : !foodAvailable
              ? "no-food"
              : places.seatAvailable === false
                ? "waiting-seat"
                : null;
  r = { ...r, request };
  const dining =
    hungry &&
    places.restaurant !== null &&
    restaurantOpen(places.minute) &&
    places.rationAvailable !== false &&
    (employee || places.restaurantStaffed !== false);
  const goHome =
    r.health === "sick" || places.minute < 6 * 60 || places.minute >= 18 * 60;
  const goal = onShift
    ? (places.workplace ?? places.restaurant ?? r.position)
    : dining
      ? (places.restaurant as GroundPoint)
      : r.health === "healthy" && r.nextWork
        ? r.nextWork.position
        : goHome
          ? (r.home ?? places.warmth)
          : places.warmth;
  const routine = onShift
    ? "to-work"
    : dining
      ? "restaurant"
      : r.health === "healthy" && r.nextWork
        ? "next-work"
        : r.home && goHome
          ? "home"
          : "warmth";
  const path = residentPath(r.position, goal, places.obstacles);
  if (!path.length) return { ...r, routine, eatingUntil: null };
  let position = { ...r.position },
    budget = Math.max(0, minutes) * speed;
  for (const point of path) {
    const length = Math.hypot(point.x - position.x, point.z - position.z);
    if (length > budget) {
      position = {
        x: position.x + ((point.x - position.x) * budget) / length,
        z: position.z + ((point.z - position.z) * budget) / length,
      };
      break;
    }
    position = { ...point };
    budget -= length;
  }
  const arrived =
    Math.hypot(position.x - goal.x, position.z - goal.z) < 0.00001;
  if (arrived && routine === "next-work" && r.nextWork)
    return {
      ...r,
      position,
      task: r.nextWork.id,
      nextWork: null,
      routine: "working",
      eatingUntil: null,
    };
  if (arrived && dining && (!onShift || employee))
    return {
      ...r,
      position,
      routine:
        foodAvailable && places.seatAvailable !== false
          ? "eating"
          : "restaurant",
      eatingUntil:
        foodAvailable && places.seatAvailable !== false
          ? now + RESIDENT_ROUTINE_RULES.eatingMinutes
          : null,
      hunger:
        foodAvailable && places.seatAvailable !== false
          ? Math.max(0, r.hunger - (places.hungerRelief ?? 360))
          : r.hunger,
      request: !foodAvailable
        ? "no-food"
        : places.seatAvailable === false
          ? "waiting-seat"
          : null,
    };
  return {
    ...r,
    position,
    routine: arrived
      ? onShift
        ? "working"
        : r.health === "sick"
          ? "resting"
          : "idle"
      : routine,
    eatingUntil: null,
  };
}

export const RESIDENT_REQUEST_TEXT = {
  "no-restaurant": "지휘관님, 배가 고파요. 식당을 지어 주세요!",
  "restaurant-closed": "배가 고픈데 식당이 닫혀 있어요.",
  "no-staff": "식당에서 일할 주민을 배치해 주세요!",
  "no-food": "먹을 수 있는 식량이 부족해요!",
  "ration-exhausted": "오늘 배급을 다 받았는데도 배가 고파요.",
  "no-home": "돌아갈 둥지가 없어요. 거주 공간을 늘려 주세요!",
  "waiting-seat": "식당에서 빈자리를 기다리고 있어요.",
} as const;
