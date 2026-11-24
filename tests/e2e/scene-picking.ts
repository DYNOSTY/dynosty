import type { Page } from "@playwright/test";
import { PNG } from "pngjs";

// 기존 예제의 고정 카메라(거리 12, 고도 π/3, FOV 0.8)로 월드 좌표를
// 화면 좌표로 투영한다. 앱의 선택 API를 주입하지 않고 실제 포인터를 누른다.
export async function examplePoint(
  page: Page,
  kind: "building" | "resident",
  updated = false,
) {
  return worldPoint(
    page,
    kind === "building" ? [0, 1.87, -1] : [updated ? 2 : -2, 0.5, 1],
    false,
  );
}
export async function worldPoint(
  page: Page,
  point: readonly [number, number, number],
  scroll = true,
) {
  const canvas = page.locator("canvas");
  if (scroll) await canvas.scrollIntoViewIfNeeded();
  await canvas.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const box = await canvas.boundingBox();
  if (!box) throw new Error("장면 캔버스가 없습니다.");
  // 실제 카메라 행렬을 읽기만 한다. 선택/게임 상태를 주입하지 않는다.
  // 마을 전체 시점과 현장 확대 시점 모두 같은 포인터 경로를 검증한다.
  return canvas.evaluate(
    (el, world) => {
      const scene = (
        window as unknown as {
          __scene: { getTransformMatrix(): { m: number[] } };
        }
      ).__scene;
      const m = scene.getTransformMatrix().m;
      const [x, y, z] = world;
      const w =
        x * (m[3] ?? 0) + y * (m[7] ?? 0) + z * (m[11] ?? 0) + (m[15] ?? 0);
      const px =
        (x * (m[0] ?? 0) + y * (m[4] ?? 0) + z * (m[8] ?? 0) + (m[12] ?? 0)) /
        w;
      const py =
        (x * (m[1] ?? 0) + y * (m[5] ?? 0) + z * (m[9] ?? 0) + (m[13] ?? 0)) /
        w;
      const r = el.getBoundingClientRect();
      return {
        x: r.x + ((px + 1) / 2) * r.width,
        y: r.y + ((1 - py) / 2) * r.height,
      };
    },
    [...point],
  );
}

// 살아 있는 장면에서 노드(id)의 실제 위치를 읽고, 실제 카메라 광선이 그 노드(또는
// 얇은 인스턴스 주인)에 닿는 화면 지점을 고른다. 선택 상태는 주입하지 않고 좌표만 읽는다.
export async function nodePoint(page: Page, id: string, scroll = false) {
  const canvas = page.locator("canvas");
  if (scroll) await canvas.scrollIntoViewIfNeeded();
  const timeout = Date.now() + 10_000;
  for (;;) {
    await canvas.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const point = await canvas.evaluate((el, target) => {
      type V = { x: number; y: number; z: number };
      type N = {
        id: string;
        parent: N | null;
        metadata?: { thinOwners?: N[] } | null;
        getAbsolutePosition(): V;
        getHierarchyBoundingVectors?(withChildren?: boolean): {
          min: V;
          max: V;
        };
      };
      const scene = (
        window as unknown as {
          __scene: {
            getTransformMatrix(): { m: number[] };
            getMeshById(id: string): N | null;
            getTransformNodeById(id: string): N | null;
            pick(
              x: number,
              y: number,
            ): { pickedMesh: N | null; thinInstanceIndex?: number } | null;
          };
        }
      ).__scene;
      const node =
        scene.getMeshById(target) ?? scene.getTransformNodeById(target);
      if (!node) return null;
      const m = scene.getTransformMatrix().m;
      const r = el.getBoundingClientRect();
      const project = (x: number, y: number, z: number) => {
        const w =
          x * (m[3] ?? 0) + y * (m[7] ?? 0) + z * (m[11] ?? 0) + (m[15] ?? 0);
        const px =
          (x * (m[0] ?? 0) + y * (m[4] ?? 0) + z * (m[8] ?? 0) + (m[12] ?? 0)) /
          w;
        const py =
          (x * (m[1] ?? 0) + y * (m[5] ?? 0) + z * (m[9] ?? 0) + (m[13] ?? 0)) /
          w;
        return {
          x: ((px + 1) / 2) * r.width,
          y: ((1 - py) / 2) * r.height,
        };
      };
      const hits = (x: number, y: number) => {
        const info = scene.pick(x, y);
        const mesh = info?.pickedMesh ?? null;
        let n: N | null =
          mesh?.metadata?.thinOwners?.[info?.thinInstanceIndex ?? -1] ?? mesh;
        while (n) {
          if (n.id === target) return true;
          n = n.parent;
        }
        return false;
      };
      const at = node.getAbsolutePosition();
      let min = { x: at.x - 0.5, y: at.y, z: at.z - 0.5 },
        max = { x: at.x + 0.5, y: at.y + 1.6, z: at.z + 0.5 };
      const box = node.getHierarchyBoundingVectors?.(true);
      if (
        box &&
        Number.isFinite(box.min.x) &&
        box.max.x - box.min.x > 0.2 &&
        box.max.y - box.min.y > 0.2
      )
        ({ min, max } = box);
      // 중심에 가까운 표본부터 시험해 가장 안정적인 지점을 누른다.
      const samples: Array<[number, number, number]> = [];
      for (const fy of [0.5, 0.35, 0.65, 0.2, 0.8])
        for (const fx of [0.5, 0.3, 0.7, 0.15, 0.85])
          for (const fz of [0.5, 0.3, 0.7]) samples.push([fx, fy, fz]);
      for (const [fx, fy, fz] of samples) {
        const s = project(
          min.x + (max.x - min.x) * fx,
          min.y + (max.y - min.y) * fy,
          min.z + (max.z - min.z) * fz,
        );
        if (s.x < 1 || s.y < 1 || s.x > r.width - 1 || s.y > r.height - 1)
          continue;
        if (hits(s.x, s.y)) return { x: r.x + s.x, y: r.y + s.y };
      }
      return null;
    }, id);
    if (point) return point;
    if (Date.now() > timeout)
      throw new Error(`장면에서 ${id}를 누를 수 있는 지점을 찾지 못했습니다.`);
    await page.waitForTimeout(250);
  }
}

// 예제 대상은 마을 장면의 현재 배치를 따른다: 첫 온돌 둥지(example-building-1)와
// 첫 주민(example-resident-1). 위치를 상수로 두지 않고 장면 노드에서 읽는다.
export const EXAMPLE_IDS = {
  building: "example-building-1",
  resident: "example-resident-1",
  board: "notice-board",
} as const;

export async function clickExample(
  page: Page,
  kind: "building" | "resident",
  updated = false,
) {
  // 건물 예제는 현재 배치(첫 온돌 둥지)를 장면에서 읽는다. 주민은 기존 좌표를 유지한다.
  const point =
    kind === "building"
      ? await nodePoint(page, EXAMPLE_IDS.building)
      : await examplePoint(page, kind, updated);
  await page.mouse.click(point.x, point.y);
}

export async function clickNode(page: Page, id: string) {
  const point = await nodePoint(page, id);
  await page.mouse.click(point.x, point.y);
}

export async function clickFloor(page: Page) {
  if (!(await page.locator(".is-procurement").count())) {
    const point = await worldPoint(page, [3, 0, -3]);
    await page.mouse.click(point.x, point.y);
    return;
  }
  const canvas = page.locator("canvas");
  await canvas.evaluate((el) =>
    el.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "instant",
    }),
  );
  const box = await canvas.boundingBox();
  if (!box) throw new Error("장면 캔버스가 없습니다.");
  const x = box.x + box.width / 2;
  let bottom = box.y + box.height;
  for (const selector of [".g-console", ".g-console__cmd"]) {
    const bar = await page.locator(selector).boundingBox();
    if (bar && x >= bar.x && x <= bar.x + bar.width && bar.y > box.y)
      bottom = Math.min(bottom, bar.y);
  }
  await page.mouse.click(x, box.y + (bottom - box.y) * 0.85);
}

export function outlinePixels(buffer: Buffer) {
  const image = PNG.sync.read(buffer);
  let count = 0;
  for (let i = 0; i < image.data.length; i += 4) {
    const r = image.data[i] ?? 0,
      g = image.data[i + 1] ?? 0,
      b = image.data[i + 2] ?? 0;
    if (r < 135 && g > 205 && b > 225) count += 1;
  }
  return count;
}
