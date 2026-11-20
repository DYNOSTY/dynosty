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
    kind === "building" ? [0, 0.75, -1] : [updated ? 2 : -2, 0.5, 1],
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

export async function clickExample(
  page: Page,
  kind: "building" | "resident",
  updated = false,
) {
  const point = await examplePoint(page, kind, updated);
  await page.mouse.click(point.x, point.y);
}

// The example's center can be behind the ondol roof. Click exposed geometry.
export async function clickVisibleResident(page: Page) {
  const canvas = page.locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  for (const alpha of [Math.PI / 2, Math.PI, 0, -Math.PI / 2]) {
    // Set only the test camera; selection still uses a real mouse click.
    await canvas.evaluate((_, angle) => {
      const { __scene } = window as unknown as {
        __scene: {
          activeCamera: {
            alpha: number;
            beta: number;
            radius: number;
            target: { set(x: number, y: number, z: number): void };
          };
        };
      };
      const camera = __scene.activeCamera;
      camera.target.set(-2, 0.5, 1);
      camera.alpha = angle;
      camera.beta = Math.PI / 3;
      camera.radius = 8;
    }, alpha);
    const center = await examplePoint(page, "resident");
    const point = await canvas.evaluate((el, origin) => {
      type Mesh = { name: string; parent: Mesh | null };
      const { __scene } = window as unknown as {
        __scene: { pick(x: number, y: number): { pickedMesh: Mesh | null } };
      };
      const rect = el.getBoundingClientRect();
      for (let radius = 0; radius <= 80; radius += 6) {
        for (let i = 0; i < (radius ? 16 : 1); i++) {
          const angle = (i * 2 * Math.PI) / 16;
          const x = Math.round(origin.x + radius * Math.cos(angle));
          const y = Math.round(origin.y + radius * Math.sin(angle));
          if (document.elementFromPoint(x, y) !== el) continue;
          for (
            let m = __scene.pick(x - rect.left, y - rect.top).pickedMesh;
            m;
            m = m.parent
          ) {
            if (m.name === "example-resident-1") return { x, y };
          }
        }
      }
      return null;
    }, center);
    if (point) {
      await page.mouse.click(point.x, point.y);
      return;
    }
  }
  throw new Error("가려지지 않은 주민 표면 없음");
}

export async function clickUnoccupiedGround(page: Page) {
  const point = await page.locator("canvas").evaluate((el) => {
    const { __scene } = window as unknown as {
      __scene: {
        pick(x: number, y: number): { pickedMesh: { name: string } | null };
      };
    };
    const rect = el.getBoundingClientRect();
    for (const fy of [0.6, 0.5, 0.7, 0.4, 0.8, 0.3]) {
      for (const fx of [0.5, 0.35, 0.65, 0.2, 0.8]) {
        const x = Math.round(rect.left + rect.width * fx);
        const y = Math.round(rect.top + rect.height * fy);
        if (document.elementFromPoint(x, y) !== el) continue;
        if (
          __scene.pick(x - rect.left, y - rect.top).pickedMesh?.name ===
          "ground"
        )
          return { x, y };
      }
    }
    return null;
  });
  if (!point) throw new Error("캔버스에서 비어 있는 바닥을 찾지 못했습니다.");
  await page.mouse.click(point.x, point.y);
}

export async function clickFloor(page: Page) {
  const canvas = page.locator("canvas");
  const floorPoint = () =>
    canvas.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const x = Math.round(rect.left + rect.width / 2);
      let bottom = rect.bottom;
      for (const selector of [".g-console", ".g-console__cmd"]) {
        const bar = document.querySelector(selector)?.getBoundingClientRect();
        if (bar && x >= bar.left && x <= bar.right && bar.top > rect.top)
          bottom = Math.min(bottom, bar.top);
      }
      const y = Math.round(rect.top + (bottom - rect.top) * 0.85);
      return document.elementFromPoint(x, y) === el ? { x, y } : null;
    });
  let point = await floorPoint();
  if (!point) {
    await canvas.evaluate((el) =>
      el.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: "instant",
      }),
    );
    point = await floorPoint();
  }
  if (!point) throw new Error("바닥 클릭 좌표가 캔버스에 닿지 않습니다.");
  await page.mouse.click(point.x, point.y);
}

export function cyanEdgePixels(before: Buffer, after: Buffer) {
  const a = PNG.sync.read(before);
  const b = PNG.sync.read(after);
  if (a.width !== b.width || a.height !== b.height)
    throw new Error("윤곽선 비교 영역의 크기가 바뀌었습니다.");

  const pixels: number[] = [];
  for (let i = 0; i < b.data.length; i += 4) {
    const r = b.data[i] ?? 0;
    const g = b.data[i + 1] ?? 0;
    const blue = b.data[i + 2] ?? 0;
    // 안티앨리어싱된 선은 순수한 청록색이 아니다. PNG 내 같은 위치의
    // 기준색보다 녹색과 파란색이 밝아진 부분만 셈해 기존 표지는 제외한다.
    if (
      g - r >= 15 &&
      blue - r >= 15 &&
      g - (a.data[i + 1] ?? 0) >= 20 &&
      blue - (a.data[i + 2] ?? 0) >= 20
    )
      pixels.push(i);
  }
  return pixels;
}

export function outlinePixels(buffer: Buffer) {
  const image = PNG.sync.read(buffer);
  let count = 0;
  for (let i = 0; i < image.data.length; i += 4) {
    const r = image.data[i] ?? 0,
      g = image.data[i + 1] ?? 0,
      b = image.data[i + 2] ?? 0;
    // 하늘색 윤곽선(주민) 또는 금빛 고리(건물·온돌)
    // 금빛 고리는 색 보정을 받지 않아 늘 (255,217,13) — 창 불빛·석등과 섞이지 않게 그 색만
    if (
      (r < 135 && g > 205 && b > 225) ||
      (r > 249 && Math.abs(g - 217) < 7 && b < 22)
    )
      count += 1;
  }
  return count;
}
