// 렌더링 도구와 무관한 표시 정보. 실제 주민·건물의 게임 규칙이나 저장 형식이 아니다.
export interface ScenePosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface SceneEntityBase {
  readonly id: string;
  readonly position: ScenePosition;
  readonly headingRadians: number;
  readonly visible: boolean;
}

export type SceneEntity =
  | (SceneEntityBase & {
      readonly kind: "resident";
      readonly motion: "idle" | "walking";
      readonly jige?: {
        readonly kind: "wood" | "plant" | "fish";
        readonly loaded: boolean;
      };
      readonly needsHelp?: boolean;
      readonly indoors?: boolean;
      readonly species?: string;
    })
  | (SceneEntityBase & {
      readonly kind: "building";
      readonly highlighted: boolean;
      readonly lit?: boolean;
      readonly level?: 1 | 2 | 3;
    });

export interface SceneSnapshot {
  readonly schemaVersion: 1;
  readonly entities: readonly SceneEntity[];
}

export function validateSceneSnapshot(snapshot: SceneSnapshot): void {
  if (snapshot.schemaVersion !== 1) throw new RangeError("표시 정보 버전 오류");
  const ids = new Set<string>();
  for (const entity of snapshot.entities) {
    if (!entity.id.trim() || ids.has(entity.id))
      throw new RangeError(
        "표시 객체의 식별값은 비어 있거나 중복될 수 없습니다.",
      );
    ids.add(entity.id);
    if (
      entity.kind === "building" &&
      entity.level !== undefined &&
      ![1, 2, 3].includes(entity.level)
    )
      throw new RangeError("건물 표시 단계 오류");
    if (
      entity.kind === "resident" &&
      entity.species !== undefined &&
      !["R02", "R03", "SPINO"].includes(entity.species)
    )
      throw new RangeError("주민 표시 종 오류");
    if (
      ![
        entity.position.x,
        entity.position.y,
        entity.position.z,
        entity.headingRadians,
      ].every(Number.isFinite)
    )
      throw new RangeError("표시 위치와 방향은 유한한 숫자여야 합니다.");
  }
}

// 두 표시 상태를 오가는 연결 예제. 이동 속도·하루 정산·인구와 관계없다.
export function createSceneExample(updated = false): SceneSnapshot {
  return {
    schemaVersion: 1,
    entities: [
      {
        id: "example-resident-1",
        kind: "resident",
        position: { x: updated ? 2 : -2, y: 0, z: 1 },
        headingRadians: updated ? Math.PI / 2 : 0,
        visible: true,
        motion: updated ? "walking" : "idle",
      },
      {
        id: "example-building-1",
        kind: "building",
        position: { x: 0, y: 0, z: -1 },
        headingRadians: 0,
        visible: true,
        highlighted: updated,
      },
    ],
  };
}
