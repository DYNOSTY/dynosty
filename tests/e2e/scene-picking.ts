import type { Page } from "@playwright/test";
import { PNG } from "pngjs";

// 기존 예제의 고정 카메라(거리 12, 고도 π/3, FOV 0.8)로 월드 좌표를
// 화면 좌표로 투영한다. 앱의 선택 API를 주입하지 않고 실제 포인터를 누른다.
export async function examplePoint(
  page: Page,
  kind: "building" | "resident",
  updated = false,
) {
  const canvas = page.locator("canvas");
  await canvas.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const box = await canvas.boundingBox();
  if (!box) throw new Error("장면 캔버스가 없습니다.");
  const [x, y, z] =
    kind === "building" ? [0, 0.75, -1] : [updated ? 2 : -2, 0.5, 1];
  const depth = 12 - y * 0.5 + (z * Math.sqrt(3)) / 2;
  const focal = box.height / (2 * Math.tan(0.4));
  return {
    x: box.x + box.width / 2 + (x * focal) / depth,
    y:
      box.y +
      box.height / 2 -
      (((y * Math.sqrt(3)) / 2 + z * 0.5) * focal) / depth,
  };
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
  const box = await page.locator("canvas").boundingBox();
  if (!box) throw new Error("장면 캔버스가 없습니다.");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.85);
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
