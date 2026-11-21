import { expect, type Page } from "@playwright/test";
import { press, startTimber } from "./labor-tabs.js";
export const progressButton = (p: Page, name: string) =>
  p.getByRole("button", { name, exact: true });
export const progressCard = (p: Page, id: string) =>
  p.getByTestId(`progress-site-${id}`);
export async function enterProgress(p: Page) {
  await p.goto("/");
  await startTimber(p);
  await press(p, "일손 배치·배급 체험하기");
  await expect(p.getByTestId("labor-clock")).toContainText("0시간 0분");
}
export async function receiveProgress(p: Page) {
  await enterProgress(p);
  for (const n of [
    "확장 제안 A 선택",
    "확장 약정하기",
    "확장 수레 출발",
    "다음 일손 사건까지",
    "확장 전량 검사 시작",
    "다음 일손 사건까지",
    "확장 정상분 16 받기",
  ])
    await press(p, n);
}
export async function siteAction(p: Page, site: string, action: string) {
  await press(p, `${site} 작업 보기`);
  await press(p, action);
}
