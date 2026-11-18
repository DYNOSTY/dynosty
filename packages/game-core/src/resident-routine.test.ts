import { expect, it } from "vitest";
import {
  advanceResidentRoutine,
  type ResidentPlaces,
  type ResidentRoutine,
  restaurantOpen,
  workplaceOpen,
} from "./resident-routine.js";

const places: ResidentPlaces = {
  warmth: { x: 0, z: 0 },
  restaurant: { x: -3, z: 0 },
  minute: 20 * 60,
  obstacles: [],
};
const resident = (): ResidentRoutine => ({
  position: { x: 3, z: 0 },
  home: { x: 1, z: 0 },
  task: null,
  workplaceId: null,
  nextWork: null,
  hunger: 0,
  diningSeat: null,
  health: "healthy",
  request: null,
  eatingUntil: null,
  routine: "idle",
});
it("업무 뒤 집 또는 따뜻한 대기 장소로 돌아간다", () => {
  expect(
    advanceResidentRoutine(resident(), 1, 1, 2, places, true),
  ).toMatchObject({ position: { x: 1, z: 0 }, routine: "idle" });
  const r = { ...resident(), home: null };
  expect(
    advanceResidentRoutine(
      advanceResidentRoutine(r, 1, 1, 2, places, true),
      2,
      1,
      2,
      places,
      true,
    ).position,
  ).toEqual(places.warmth);
});
it("허기가 생긴 개인만 식당에 가고 먹고 난 뒤 귀가한다", () => {
  let hungry = { ...resident(), hunger: 400 };
  const full = advanceResidentRoutine(resident(), 1, 1, 2, places, true);
  for (let i = 1; i <= 10; i++)
    hungry = advanceResidentRoutine(hungry, i, 1, 2, places, true);
  expect(hungry.hunger).toBe(40);
  expect(hungry.position).toEqual(hungry.home);
  expect(full.routine).toBe("idle");
});
it("식당이 없거나 닫혀 있으면 지휘관에게 요구하고 가짜 식당으로 가지 않는다", () => {
  const r = { ...resident(), hunger: 400 };
  expect(
    advanceResidentRoutine(r, 1, 1, 2, { ...places, restaurant: null }, true),
  ).toMatchObject({ request: "no-restaurant", hunger: 400, position: r.home });
  expect(
    advanceResidentRoutine(r, 1, 1, 2, { ...places, minute: 23 * 60 }, true)
      .request,
  ).toBe("restaurant-closed");
});
it("근무 중이거나 지시 업무 중에는 식사를 위해 이탈하지 않는다", () => {
  const r = { ...resident(), hunger: 400, workplaceId: "mill" };
  expect(
    advanceResidentRoutine(r, 1, 1, 2, { ...places, minute: 9 * 60 }, true),
  ).toMatchObject({ position: r.position, routine: "working" });
  expect(
    advanceResidentRoutine(r, 1, 1, 2, { ...places, minute: 19 * 60 }, true)
      .routine,
  ).toBe("restaurant");
  expect(
    advanceResidentRoutine({ ...r, task: "hauling" }, 1, 1, 2, places, true)
      .position,
  ).toEqual(r.position);
});
it("식당은 작업장보다 먼저 열고 늦게 닫는다", () => {
  expect(restaurantOpen(7 * 60) && !workplaceOpen(7 * 60)).toBe(true);
  expect(restaurantOpen(19 * 60) && !workplaceOpen(19 * 60)).toBe(true);
  expect(restaurantOpen(22 * 60)).toBe(false);
});
it("먹이가 없거나 자리가 없으면 먹었다고 처리하지 않는다", () => {
  const r = { ...resident(), hunger: 400, position: { x: -3, z: 0 } };
  expect(advanceResidentRoutine(r, 1, 1, 2, places, false)).toMatchObject({
    hunger: 400,
    request: "no-food",
    routine: "restaurant",
  });
  expect(
    advanceResidentRoutine(
      r,
      1,
      1,
      2,
      { ...places, seatAvailable: false },
      true,
    ),
  ).toMatchObject({ hunger: 400, request: "waiting-seat" });
});
it("신규와 기존 모두 같은 건강 상태를 따르고 사망자는 업무에 들어가지 않는다", () => {
  expect(
    advanceResidentRoutine(
      { ...resident(), health: "dead", task: "mill" },
      1,
      1,
      2,
      places,
      true,
    ),
  ).toMatchObject({ task: null, routine: "idle" });
  expect(
    advanceResidentRoutine(
      { ...resident(), health: "sick" },
      1,
      1,
      2,
      places,
      true,
    ).routine,
  ).toBe("resting");
});

it("배고픈 주민은 출근·예약 작업을 먼저 수행하고 퇴근 뒤 식당을 찾는다", () => {
  const job = { x: 4, z: 0 };
  const r = {
    ...resident(),
    hunger: 500,
    routine: "restaurant" as const,
    request: "waiting-seat" as const,
  };
  const shift = {
    ...places,
    minute: 540,
    workplace: job,
    seatAvailable: false,
  };
  const atWork = advanceResidentRoutine(
    { ...r, workplaceId: "facility:mill" },
    1,
    1,
    2,
    shift,
    true,
  );
  expect(atWork).toMatchObject({
    position: job,
    routine: "working",
    request: null,
  });
  expect(
    advanceResidentRoutine(atWork, 2, 1, 2, { ...shift, minute: 1080 }, true)
      .routine,
  ).toBe("restaurant");
  expect(
    advanceResidentRoutine(
      { ...r, nextWork: { id: "build", position: job } },
      1,
      1,
      2,
      shift,
      true,
    ),
  ).toMatchObject({ position: job, task: "build", request: null });
});
