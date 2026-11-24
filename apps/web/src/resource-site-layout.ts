// 자원 터 모델의 자리 (3D 엔진 없이 배치 검사에서도 읽는다).
// 모델은 tools/blender/site3d.py로 깎아 구운 입체(SITE3_*.glb + .jpg)다.
// 제출본 복홀 지도의 실제 자원지(광맥·물고기 못)에 앉히고, 짝이 없는 터는
// 광맥의 둥지 금지 반경(24m) 안 빈 땅에 둔다. 플레이어가 그 자리에 채굴 시설을
// 지으면 장식 모델은 숨긴다.
import {
  BOKHOL_MINERALS,
  BOKHOL_WATERS,
  type GroundPoint,
  type TimberState,
} from "@dynosty/game-core";

/** 블렌더 1 = 게임 1.3. 광맥 중심의 건설 금지 반경(10m) 안에 들어가는 크기 */
export const RESOURCE_SITE_SCALE = 1.3;
/** 얼음판 윗면. 물고기 못 원기둥(y 0.1, 높이 0.12)보다 살짝 위 */
export const POND_ICE_TOP = 0.18;
/** 건물 한 채의 회전을 감안한 반경(반폭 2.25 × √2) */
const BUILDING_REACH = 2.25 * Math.SQRT2;

type Bounds = readonly [minX: number, maxX: number, minZ: number, maxZ: number];
export type ResourceSite = {
  readonly id: string;
  readonly name: string;
  readonly file: string;
  /** 짝지은 제출본 자원지 (BOKHOL_MINERALS·BOKHOL_WATERS의 id) */
  readonly anchor: string;
  /** terrain: 지형을 따름, ice: 물고기 못 얼음판 높이 아래로는 내려가지 않음 */
  readonly ground: "terrain" | "ice";
  /** 광맥 자리 표시용 임시 바위를 이 모델로 대신하는지 */
  readonly replacesDeposit: boolean;
  readonly x: number;
  readonly z: number;
  /** GLB 원본 좌표의 위치 범위(x·z). 단위 시험이 실제 파일과 맞춰 본다. */
  readonly bounds: Bounds;
};

const mineral = (id: string) => {
  const m = BOKHOL_MINERALS.find((site) => site.id === id);
  if (!m) throw new RangeError(`알 수 없는 광맥: ${id}`);
  return m;
};
const water = (id: string) => {
  const w = BOKHOL_WATERS.find((site) => site.id === id);
  if (!w) throw new RangeError(`알 수 없는 물가: ${id}`);
  return w;
};
const coal = mineral("coal-bokhol"),
  iron = mineral("iron-bokhol"),
  stone = mineral("stone-bokhol-south"),
  eastPond = water("east-pond"),
  southPond = water("south-pond");

export const RESOURCE_SITES: readonly ResourceSite[] = [
  {
    id: "coal",
    name: "석탄 노두",
    file: "SITE3_COAL",
    anchor: coal.id,
    ground: "terrain",
    replacesDeposit: true,
    x: coal.x,
    z: coal.z,
    bounds: [-3.56, 3.84, -2.8, 3.41],
  },
  {
    id: "iron",
    name: "철광 노두",
    file: "SITE3_IRON",
    anchor: iron.id,
    ground: "terrain",
    replacesDeposit: true,
    x: iron.x,
    z: iron.z,
    bounds: [-3.48, 3.72, -2.68, 3.3],
  },
  {
    // 얼음판 앞쪽(기본 시점 카메라 쪽). 뒤쪽 얼음 구멍·물고기 표시는 그대로 보인다.
    id: "fish",
    name: "얼음 낚시 못",
    file: "SITE3_FISH",
    anchor: eastPond.id,
    ground: "ice",
    replacesDeposit: false,
    x: eastPond.x,
    z: eastPond.z - 4.5,
    bounds: [-3.47, 3.73, -2.81, 3.2],
  },
  {
    id: "spring",
    name: "얼지 않는 샘",
    file: "SITE3_SPRING",
    anchor: southPond.id,
    ground: "ice",
    replacesDeposit: false,
    x: southPond.x,
    z: southPond.z - 5,
    bounds: [-3.47, 3.73, -2.81, 3.2],
  },
  {
    // 남문 밖 남쪽 암반 앞. 둥지를 지을 수 없는 암반 반경 안이다.
    id: "store",
    name: "버려진 곳간",
    file: "SITE3_STORE",
    anchor: stone.id,
    ground: "terrain",
    replacesDeposit: false,
    x: stone.x + 1,
    z: stone.z - 15,
    bounds: [-3.44, 3.8, -2.9, 3.35],
  },
  {
    // 북동 둘레 숲 남쪽 끝과 철광맥 사이. 둥지를 지을 수 없는 철광맥 반경 안이다.
    id: "pine",
    name: "쓰러진 적송",
    file: "SITE3_PINE",
    anchor: iron.id,
    ground: "terrain",
    replacesDeposit: false,
    x: iron.x - 15,
    z: iron.z,
    bounds: [-3.76, 3.83, -2.78, 3.2],
  },
];

/** 모델의 앞(트인 쪽)이 기본 시점의 카메라(-z)를 보도록 반 바퀴 돌린다. */
export const RESOURCE_SITE_HEADING = Math.PI;

/**
 * 세상 좌표의 모델 바닥 범위 (배율 반영).
 * glTF 불러오기가 오른손 좌표를 바꾸며 (x, z)를 (-x, z)로 놓고, 반 바퀴 회전이
 * 다시 (x, -z)로 돌리므로 x는 그대로, z만 뒤집힌다.
 */
export function resourceSiteRect(site: ResourceSite) {
  const [minX, maxX, minZ, maxZ] = site.bounds;
  const s = RESOURCE_SITE_SCALE;
  return {
    minX: site.x + s * minX,
    maxX: site.x + s * maxX,
    minZ: site.z - s * maxZ,
    maxZ: site.z - s * minZ,
  };
}

/** 점에서 모델 바닥 범위까지의 거리 (안쪽이면 0) */
export function distanceToResourceSite(site: ResourceSite, p: GroundPoint) {
  const r = resourceSiteRect(site);
  return Math.hypot(
    Math.max(r.minX - p.x, 0, p.x - r.maxX),
    Math.max(r.minZ - p.z, 0, p.z - r.maxZ),
  );
}

/** 모델 중심에서 가장 먼 바닥 모서리까지의 거리 */
export function resourceSiteReach(site: ResourceSite, from: GroundPoint) {
  const r = resourceSiteRect(site);
  return Math.max(
    ...[r.minX, r.maxX].flatMap((x) =>
      [r.minZ, r.maxZ].map((z) => Math.hypot(x - from.x, z - from.z)),
    ),
  );
}

/** 둥지·시설·건설 대기 부지가 모델 바닥과 겹치면 장식 모델을 숨긴다. */
export function resourceSiteBlocked(site: ResourceSite, s: TimberState) {
  const buildings: GroundPoint[] = [
    ...s.homes.map((h) => h.position),
    ...s.town.facilities.map((f) => f.position),
    ...s.town.orders.map((o) => o.position),
    ...(s.construction ? [s.construction.position] : []),
  ];
  return buildings.some(
    (p) => distanceToResourceSite(site, p) < BUILDING_REACH,
  );
}

export function resourceSiteVisible(site: ResourceSite, s: TimberState | null) {
  return !!s && !resourceSiteBlocked(site, s);
}

/** 모델 바닥 높이: 물고기 못 위에서는 얼음판 높이 아래로 내려가지 않는다. */
export function resourceSiteGround(
  site: ResourceSite,
  elevation: (x: number, z: number) => number,
) {
  return site.ground === "ice"
    ? (x: number, z: number) => Math.max(elevation(x, z), POND_ICE_TOP)
    : elevation;
}
