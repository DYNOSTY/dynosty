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

export async function clickExample(
  page: Page,
  kind: "building" | "resident",
  updated = false,
) {
  const point = await examplePoint(page, kind, updated);
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
