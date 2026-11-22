// 절기·혹한 기둥: 24절기 달력과 날씨 → 바깥 기온, 집집마다 온돌(불때기·화력·구들 축열) → 연료,
// 주민이 머문 곳과 시간으로 쌓이는 냉기 노출 → 부상·동사.
// 온돌·노출 계산식은 「DYNOSTY 온돌·자원·운영 UI v0.4」(2026-11-15, 기획) 그대로:
//   석탄 = 정격×불때기 시간 비율×화력, 화력 절약0.6/보통1/긴급1.4, 석탄1=목재3, 예약 목재 보호
//   추위 부담 = |영하 기온|×0.5 + 바람 + 습기 + 구들 손상
//   축열 감쇠/시 = 2 + 직전 보온 부족×0.15 + (습기+손상)×0.1, 충전/시 = 12×연료 충족×화력 − 감쇠 (0~100)
//   실제 보호 = 벽·바닥 보온 + 온돌 가열×축열 비율×화력 + 밀집 방풍
//   냉기 노출 += 보온 부족×시간×0.1, 안전하면 −0.8×시간 (0~100), 40 피난 · 20 복귀
//   부상(하루) 40~69 1% · 70~89 4% · 90~ 8%, 중상 미치료 12시간 이상 사망 2%/일, 시간 환산 1−(1−p)^(h/24)
// 24절기 기온·바람·습기·날씨 확률은 기획에 없어 이 파일에서 정한 조정값(실록 모티브, 2026-11-19).

export const SOLAR_TERMS = [
  ["입춘", "立春", "봄", -20],
  ["우수", "雨水", "봄", -18],
  ["경칩", "驚蟄", "봄", -15],
  ["춘분", "春分", "봄", -12],
  ["청명", "淸明", "봄", -9],
  ["곡우", "穀雨", "봄", -7],
  ["입하", "立夏", "여름", -5],
  ["소만", "小滿", "여름", -3],
  ["망종", "芒種", "여름", -2],
  ["하지", "夏至", "여름", -1],
  ["소서", "小暑", "여름", 0],
  ["대서", "大暑", "여름", 1],
  ["입추", "立秋", "가을", 0],
  ["처서", "處暑", "가을", -2],
  ["백로", "白露", "가을", -5],
  ["추분", "秋分", "가을", -8],
  ["한로", "寒露", "가을", -11],
  ["상강", "霜降", "가을", -14],
  ["입동", "立冬", "겨울", -18],
  ["소설", "小雪", "겨울", -22],
  ["대설", "大雪", "겨울", -26],
  ["동지", "冬至", "겨울", -30],
  ["소한", "小寒", "겨울", -33],
  ["대한", "大寒", "겨울", -35],
] as const;
export type Season = (typeof SOLAR_TERMS)[number][2];
/** 첫날은 한로(가을 끝) — 닷새째 입동부터 첫서리 혹한 */
export const START_TERM = 16;
/** 절기 하나가 이틀, 마흔여덟 날이 한 해 — 실록(하루)보다 길게: 운석 겨울을 버티는 게임이라 겨울(입동~대한)이 12일은 돼야 함 */
export const DAYS_PER_TERM = 2;

export const WEATHERS = ["맑음", "흐림", "눈", "눈보라", "한파"] as const;
export type Weather = (typeof WEATHERS)[number];
const WEATHER_FX: Record<
  Weather,
  { temp: number; wind: number; humidity: number }
> = {
  맑음: { temp: 0, wind: 1, humidity: 0 },
  흐림: { temp: 1, wind: 2, humidity: 1 },
  눈: { temp: -1, wind: 2, humidity: 2 },
  눈보라: { temp: -6, wind: 7, humidity: 3 },
  한파: { temp: -12, wind: 4, humidity: 0 },
};
// 계절별 날씨 확률 (맑음·흐림·눈·눈보라·한파 순, 합 100)
const WEATHER_ODDS: Record<Season, readonly number[]> = {
  봄: [35, 35, 22, 6, 2],
  여름: [50, 35, 13, 2, 0],
  가을: [35, 30, 25, 8, 2],
  겨울: [22, 28, 25, 17, 8],
};

// 온돌 구역 (v0.4 「불때기 시간과 연료 배달을 정하는 화면」 표)
export const ZONES = ["nest", "farm", "shelter", "research", "clinic"] as const;
export type Zone = (typeof ZONES)[number];
export const ZONE_SPEC: Record<
  Zone,
  {
    name: string;
    count: number;
    /** 24시간 석탄 정격(곳당) */
    rating: number;
    /** 불때기 시작·끝 시각 (끝이 작으면 자정 넘김) */
    from: number;
    to: number;
    /** 벽·바닥 보온 (조정값) */
    wall: number;
    /** 밀집 방풍 (조정값) */
    crowd: number;
  }
> = {
  nest: {
    name: "온돌 둥지",
    count: 6,
    rating: 1,
    from: 18,
    to: 9,
    wall: 6,
    crowd: 2,
  },
  farm: {
    name: "온상 재배소",
    count: 2,
    rating: 2,
    from: 9,
    to: 18,
    wall: 4,
    crowd: 0,
  },
  shelter: {
    name: "공동 구들쉼터",
    count: 1,
    rating: 2,
    from: 0,
    to: 24,
    wall: 6,
    crowd: 3,
  },
  research: {
    name: "연구동",
    count: 1,
    rating: 0.5,
    from: 9,
    to: 18,
    wall: 5,
    crowd: 1,
  },
  clinic: {
    name: "치료소",
    count: 1,
    rating: 0.5,
    from: 0,
    to: 24,
    wall: 7,
    crowd: 1,
  },
};
export const HEAT_LEVELS = { 절약: 0.6, 보통: 1, 긴급: 1.4 } as const;
export type HeatLevel = keyof typeof HEAT_LEVELS;
const KITCHEN_COAL_PER_DAY = 1;
const COAL_TO_WOOD = 3;
/** 온돌 가열 (조정값) — 축열 100%·보통 화력일 때 보태는 보호 */
const ONDOL_HEAT = 22;
/** 바깥 일꾼의 겨울 차림(누빔·털·짚 장화) 보온 (조정값) */
const CLOTHING = 3;
/** 바깥 일꾼 수와 근무 시각 (v0.4: 정상 배치 40명 근무, 나머지 예비·둥지) */
export const OUTDOOR_WORKERS = 40;
const WORK_FROM = 9;
const WORK_TO = 18;
const SHELTER_AT = 40;
const RETURN_AT = 20;
const INJURY_ODDS: Array<[number, number]> = [
  [90, 0.08],
  [70, 0.04],
  [40, 0.01],
];
const DEATH_ODDS = 0.02;
const UNTREATED_DEATH_MINUTES = 720;

export type Injury = "none" | "injured" | "critical";
export interface BodyHeat {
  /** 냉기 노출 0~100 */
  readonly exposure: number;
  readonly injury: Injury;
  /** 중상이 치료받지 못한 채 지난 분 */
  readonly untreatedMinutes: number;
  /** 피난 중(노출 40 이상 → 20 이하가 될 때까지 쉼터) */
  readonly sheltering: boolean;
}
export interface ZoneHeat {
  readonly heat: HeatLevel;
  /** 구들 축열 0~100 */
  readonly storage: number;
  readonly damage: number;
  /** 직전 시간 보온 부족 */
  readonly deficit: number;
}
export interface WinterState {
  readonly seed: number;
  readonly zones: Readonly<Record<Zone, ZoneHeat>>;
  readonly bodies: Readonly<Record<string, BodyHeat>>;
  /** 연료 분자 이월(0~1439, food와 같은 고정 소수점) */
  readonly fuelCarry: number;
  /** 이번 시간에 필요했던·실제로 땐 연료(목재 기준 단위) — 정시에 축열 충전 비율로 씀 */
  readonly hourWant: number;
  readonly hourCovered: number;
  /** 지난 하루 실제로 땐 연료(단위) — 화면의 '하루 소모' */
  readonly lastDayCoal: number;
  readonly lastDayWood: number;
  readonly todayCoal: number;
  readonly todayWood: number;
  readonly frozenDead: number;
}

/** 결정적 난수 (저장·불러오기 후에도 같은 결과) */
function hash(seed: number, a: number, b = 0) {
  let h = (seed ^ Math.imul(a + 0x9e3779b9, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15) ^ Math.imul(b + 1, 0xc2b2ae35), 0x27d4eb2f);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

export function termOf(day: number) {
  const i =
    (START_TERM + Math.floor((day - 1) / DAYS_PER_TERM)) % SOLAR_TERMS.length;
  const [name, hanja, season, base] = SOLAR_TERMS[i] as (typeof SOLAR_TERMS)[0];
  return {
    index: i,
    name,
    hanja,
    season: season as Season,
    base: base as number,
  };
}
export function weatherOf(seed: number, day: number): Weather {
  const odds = WEATHER_ODDS[termOf(day).season];
  let roll = hash(seed, day, 7) * 100;
  for (let i = 0; i < WEATHERS.length; i++) {
    roll -= odds[i] ?? 0;
    if (roll < 0) return WEATHERS[i] as Weather;
  }
  return "맑음";
}
/** 바깥 기온(°C): 절기 기준 → 다음 절기로 하루 동안 이어짐 + 밤낮(04시 최저·14시 최고) + 날씨 */
/** 가장 추운 절기(대한)의 기온 — 4단계 혹한 동안은 절기와 상관없이 이 추위 (snap, campaign.ts) */
const COLDEST: number = Math.min(...SOLAR_TERMS.map((t) => t[3]));
export function outdoorTemp(
  seed: number,
  day: number,
  minute: number,
  snap = false,
) {
  const t = termOf(day);
  const next = termOf(day + DAYS_PER_TERM);
  const f = minute / 1440;
  const season = t.base + (next.base - t.base) * f;
  const base = snap ? Math.min(season, COLDEST) : season;
  const hour = minute / 60;
  const diurnal = -0.5 + 3.5 * Math.cos((2 * Math.PI * (hour - 14)) / 24);
  return base + diurnal + WEATHER_FX[weatherOf(seed, day)].temp;
}
export function climateAt(
  seed: number,
  day: number,
  minute: number,
  snap = false,
) {
  const w = weatherOf(seed, day);
  const fx = WEATHER_FX[w];
  return {
    term: termOf(day),
    weather: w,
    temp: outdoorTemp(seed, day, minute, snap),
    wind: fx.wind,
    humidity: fx.humidity,
  };
}

function firing(zone: Zone, hour: number) {
  const { from, to } = ZONE_SPEC[zone];
  return from <= to ? hour >= from && hour < to : hour >= from || hour < to;
}
const coldBurden = (
  temp: number,
  wind: number,
  humidity: number,
  damage: number,
) => Math.max(0, -temp) * 0.5 + wind + humidity + damage;
function protection(zone: Zone, z: ZoneHeat) {
  const s = ZONE_SPEC[zone];
  return (
    s.wall + ONDOL_HEAT * (z.storage / 100) * HEAT_LEVELS[z.heat] + s.crowd
  );
}

export function createWinterState(
  citizenIds: readonly string[],
  seed = 20261119,
): WinterState {
  const zone = (): ZoneHeat => ({
    heat: "보통",
    storage: 65,
    damage: 0,
    deficit: 0,
  });
  return {
    seed,
    zones: Object.fromEntries(ZONES.map((z) => [z, zone()])) as Record<
      Zone,
      ZoneHeat
    >,
    bodies: Object.fromEntries(
      citizenIds.map((id) => [
        id,
        {
          exposure: 0,
          injury: "none",
          untreatedMinutes: 0,
          sheltering: false,
        } satisfies BodyHeat,
      ]),
    ),
    fuelCarry: 0,
    hourWant: 0,
    hourCovered: 0,
    lastDayCoal: 0,
    lastDayWood: 0,
    todayCoal: 0,
    todayWood: 0,
    frozenDead: 0,
  };
}

/** 지금 시각 기준 시간당 석탄 요구(단위가 아닌 석탄 개수) */
export function coalDemandPerHour(w: WinterState, hour: number) {
  let coal = KITCHEN_COAL_PER_DAY / 24;
  for (const z of ZONES)
    if (firing(z, hour))
      coal +=
        (ZONE_SPEC[z].rating *
          ZONE_SPEC[z].count *
          HEAT_LEVELS[w.zones[z].heat]) /
        24;
  return coal;
}
/** 지금 설정으로 하루 내내 땠을 때 석탄 (기획 기준값 8.9375 = 모두 보통) */
export function coalDemandPerDay(w: WinterState) {
  let sum = 0;
  for (let h = 0; h < 24; h++) sum += coalDemandPerHour(w, h);
  return sum;
}

export interface WinterStep {
  readonly winter: WinterState;
  /** 쓴 석탄·목재(단위 = 개수×scale) */
  readonly coalUsed: number;
  readonly woodUsed: number;
  readonly deaths: readonly string[];
  readonly pessimismDelta: number;
  readonly optimismDelta: number;
}

/** 하루 석탄 요구를 정수 단위(×scale)로 — 분 단위 정수 계산용 (화력 0.6·1.4도 scale에서 정수) */
function coalUnitsPerDayAt(w: WinterState, hour: number, scale: number) {
  return Math.round(coalDemandPerHour(w, hour) * 24 * scale);
}

/**
 * 1시간 이하(정시를 넘지 않게) 진행. 연료는 분 단위 정수 계산(food와 같은 방식)이라
 * 1분씩 나눠도 한 번에 해도 같음. 축열·체온·부상 판정은 정시에 한 번 — 기획 v0.4 「시간당 판정」.
 */
export function stepWinter(input: {
  winter: WinterState;
  day: number;
  minute: number;
  minutes: number;
  coal: number;
  wood: number;
  reservedWood: number;
  scale: number;
  citizens: ReadonlyArray<{ id: string; alive: boolean }>;
  /** 4단계 혹한 중인지 (play.ts inColdSnap) */
  snap?: boolean;
}): WinterStep {
  const { day, minute, minutes, scale } = input;
  const w = input.winter;
  const hour = Math.floor(minute / 60);

  // 1) 연료: 난방이 먼저(heatingFirst), 석탄 → 모자라면 목재×3 (예약 목재 제외)
  const numerator = coalUnitsPerDayAt(w, hour, scale) * minutes + w.fuelCarry;
  const want = Math.floor(numerator / 1440);
  const fuelCarry = numerator % 1440;
  const coalUsed = Math.min(input.coal, want);
  const shortCoal = want - coalUsed;
  const woodFree = Math.max(0, input.wood - input.reservedWood);
  const woodUsed = Math.min(woodFree, shortCoal * COAL_TO_WOOD);
  const covered = coalUsed * COAL_TO_WOOD + woodUsed; // 목재 기준으로 셈(정수)
  const hourWant = w.hourWant + want * COAL_TO_WOOD;
  const hourCovered = w.hourCovered + covered;
  const dayRolled = minute + minutes >= 1440;
  const fuel = {
    fuelCarry,
    todayCoal: dayRolled ? 0 : w.todayCoal + coalUsed,
    todayWood: dayRolled ? 0 : w.todayWood + woodUsed,
    lastDayCoal: dayRolled ? w.todayCoal + coalUsed : w.lastDayCoal,
    lastDayWood: dayRolled ? w.todayWood + woodUsed : w.lastDayWood,
  };
  if ((minute + minutes) % 60 !== 0)
    return {
      winter: { ...w, ...fuel, hourWant, hourCovered },
      coalUsed,
      woodUsed,
      deaths: [],
      pessimismDelta: 0,
      optimismDelta: 0,
    };

  // 2) 정시: 지난 한 시간의 연료 충족으로 구들 축열·보호 계산
  const c = climateAt(w.seed, day, hour * 60 + 30, input.snap);
  const supply = hourWant > 0 ? hourCovered / hourWant : 1;
  const zones = {} as Record<Zone, ZoneHeat>;
  for (const z of ZONES) {
    const s = w.zones[z];
    const decay = 2 + s.deficit * 0.15 + (c.humidity + s.damage) * 0.1;
    const charge = firing(z, hour) ? 12 * supply * HEAT_LEVELS[s.heat] : 0;
    const storage = Math.min(100, Math.max(0, s.storage + charge - decay));
    const next = { ...s, storage };
    // 실내는 바람이 1/5만 들어옴 (조정값)
    const burden = coldBurden(c.temp, c.wind * 0.2, c.humidity, s.damage);
    zones[z] = { ...next, deficit: Math.max(0, burden - protection(z, next)) };
  }

  // 3) 주민마다 머문 곳 → 노출 → 부상·동사 (확률은 하루 확률을 시간으로 환산)
  const bodies: Record<string, BodyHeat> = { ...w.bodies };
  const deaths: string[] = [];
  let pess = 0,
    opt = 0,
    worker = 0;
  const outdoorBurden = coldBurden(c.temp, c.wind, c.humidity, 0);
  const working = hour >= WORK_FROM && hour < WORK_TO;
  // 치료소가 따뜻하면(축열 40 이상) 치료받는 것으로 봄 (조정값)
  const treated = zones.clinic.storage >= 40;
  const tick = day * 24 + hour;
  input.citizens.forEach((p, i) => {
    if (!p.alive) return;
    const b = bodies[p.id] ?? {
      exposure: 0,
      injury: "none" as Injury,
      untreatedMinutes: 0,
      sheltering: false,
    };
    const isWorker = worker++ < OUTDOOR_WORKERS;
    let place: Zone | "outside";
    if (b.injury !== "none") place = "clinic";
    else if (b.sheltering) place = "shelter";
    else if (isWorker && working) place = "outside";
    else place = "nest";
    const deficit =
      place === "outside"
        ? Math.max(0, outdoorBurden - CLOTHING)
        : zones[place].deficit;
    let exposure = b.exposure + deficit * 0.1;
    if (deficit === 0) exposure -= 0.8;
    exposure = Math.min(100, Math.max(0, exposure));
    let sheltering = b.sheltering;
    if (place === "outside" && exposure >= SHELTER_AT) sheltering = true;
    if (sheltering && exposure <= RETURN_AT) sheltering = false;
    let injury = b.injury;
    const odds = INJURY_ODDS.find(([at]) => exposure >= at)?.[1] ?? 0;
    if (odds > 0 && hash(w.seed, tick, i) < 1 - (1 - odds) ** (1 / 24)) {
      injury = injury === "none" ? "injured" : "critical";
      pess += injury === "critical" ? 2 : 1;
    }
    const untreatedMinutes =
      injury === "critical" && !treated ? b.untreatedMinutes + 60 : 0;
    if (
      injury === "critical" &&
      untreatedMinutes >= UNTREATED_DEATH_MINUTES &&
      hash(w.seed, tick, i + 10_000) < 1 - (1 - DEATH_ODDS) ** (1 / 24)
    ) {
      deaths.push(p.id);
      pess += 5;
      opt -= 3;
    }
    // 따뜻한 치료소에서 노출이 다 빠지면 부상이 한 단계씩 나음 (조정값)
    if (injury !== "none" && exposure === 0 && treated)
      injury = injury === "critical" ? "injured" : "none";
    bodies[p.id] = { exposure, injury, untreatedMinutes, sheltering };
  });

  return {
    winter: {
      ...w,
      ...fuel,
      zones,
      bodies,
      hourWant: 0,
      hourCovered: 0,
      frozenDead: w.frozenDead + deaths.length,
    },
    coalUsed,
    woodUsed,
    deaths,
    pessimismDelta: pess,
    optimismDelta: opt,
  };
}

export function setZoneHeat(
  w: WinterState,
  zone: Zone,
  heat: HeatLevel,
): WinterState {
  if (!ZONES.includes(zone) || !(heat in HEAT_LEVELS))
    throw new RangeError("알 수 없는 구역이나 화력입니다.");
  return { ...w, zones: { ...w.zones, [zone]: { ...w.zones[zone], heat } } };
}

/** 화면용 요약 */
export function winterReport(
  w: WinterState,
  day: number,
  minute: number,
  citizens: ReadonlyArray<{ id: string; alive: boolean }>,
  snap = false,
) {
  const c = climateAt(w.seed, day, minute, snap);
  let warm = 0,
    exposed = 0,
    injured = 0,
    critical = 0,
    sheltering = 0;
  for (const p of citizens) {
    if (!p.alive) continue;
    const b = w.bodies[p.id];
    if (!b) continue;
    if (b.injury === "critical") critical++;
    else if (b.injury === "injured") injured++;
    else if (b.exposure >= SHELTER_AT) exposed++;
    else warm++;
    if (b.sheltering) sheltering++;
  }
  return {
    term: c.term,
    weather: c.weather,
    temp: Math.round(c.temp),
    wind: c.wind,
    forecast: [1, 2, 3].map((d) => ({
      day: day + d,
      term: termOf(day + d).name,
      weather: weatherOf(w.seed, day + d),
      low: Math.round(outdoorTemp(w.seed, day + d, 4 * 60)),
    })),
    zones: ZONES.map((z) => ({
      id: z,
      name: ZONE_SPEC[z].name,
      heat: w.zones[z].heat,
      storage: Math.round(w.zones[z].storage),
      firing: firing(z, Math.floor(minute / 60)),
    })),
    coalPerDay: coalDemandPerDay(w),
    people: {
      warm,
      exposed,
      injured,
      critical,
      sheltering,
      dead: w.frozenDead,
    },
  };
}

export function parseWinterState(
  value: unknown,
  citizenIds: readonly string[],
): WinterState {
  const fresh = createWinterState(citizenIds);
  if (typeof value !== "object" || value === null) return fresh;
  const v = value as Record<string, unknown>;
  const num = (x: unknown, min: number, max: number) => {
    if (typeof x !== "number" || !Number.isFinite(x) || x < min || x > max)
      throw new RangeError("겨울 저장 값이 올바르지 않습니다.");
    return x;
  };
  const zonesIn = (v.zones ?? {}) as Record<string, Record<string, unknown>>;
  const zones = {} as Record<Zone, ZoneHeat>;
  for (const z of ZONES) {
    const s = zonesIn[z];
    if (!s) {
      zones[z] = fresh.zones[z];
      continue;
    }
    if (typeof s.heat !== "string" || !(s.heat in HEAT_LEVELS))
      throw new RangeError("겨울 저장 값이 올바르지 않습니다.");
    zones[z] = {
      heat: s.heat as HeatLevel,
      storage: num(s.storage, 0, 100),
      damage: num(s.damage, 0, 100),
      deficit: num(s.deficit, 0, 1000),
    };
  }
  const bodiesIn = (v.bodies ?? {}) as Record<string, Record<string, unknown>>;
  const bodies: Record<string, BodyHeat> = {};
  for (const id of citizenIds) {
    const b = bodiesIn[id];
    if (!b) {
      bodies[id] = fresh.bodies[id] as BodyHeat;
      continue;
    }
    if (
      !["none", "injured", "critical"].includes(b.injury as string) ||
      typeof b.sheltering !== "boolean"
    )
      throw new RangeError("겨울 저장 값이 올바르지 않습니다.");
    bodies[id] = {
      exposure: num(b.exposure, 0, 100),
      injury: b.injury as Injury,
      untreatedMinutes: num(b.untreatedMinutes, 0, Number.MAX_SAFE_INTEGER),
      sheltering: b.sheltering,
    };
  }
  return {
    seed: num(v.seed ?? fresh.seed, 0, 4294967295),
    zones,
    bodies,
    fuelCarry: num(v.fuelCarry ?? 0, 0, 1439),
    hourWant: num(v.hourWant ?? 0, 0, Number.MAX_SAFE_INTEGER),
    hourCovered: num(v.hourCovered ?? 0, 0, Number.MAX_SAFE_INTEGER),
    lastDayCoal: num(v.lastDayCoal ?? 0, 0, Number.MAX_SAFE_INTEGER),
    lastDayWood: num(v.lastDayWood ?? 0, 0, Number.MAX_SAFE_INTEGER),
    todayCoal: num(v.todayCoal ?? 0, 0, Number.MAX_SAFE_INTEGER),
    todayWood: num(v.todayWood ?? 0, 0, Number.MAX_SAFE_INTEGER),
    frozenDead: num(v.frozenDead ?? 0, 0, 100_000),
  };
}
