import { expect, test } from "@playwright/test";
import { press, reveal } from "./labor-tabs.js";
import {
  progressButton as b,
  enterProgress,
  progressCard,
  receiveProgress,
} from "./progress-helpers.js";

test("공급 선택부터 실제 운송·하역·검수 안내가 전환되고 안내를 접어도 게임을 유지한다", async ({
  page: p,
}) => {
  await enterProgress(p);
  await expect(p.getByTestId("timber-next-step")).toContainText(
    "공급 제안 비교",
  );
  await press(p, "확장 제안 A 선택");
  await press(p, "확장 약정하기");
  await expect(p.getByTestId("timber-next-step")).toContainText("약정·출발");
  await press(p, "확장 수레 출발");
  await expect(p.getByTestId("transport-status")).toHaveText(
    "원납품 운송 · 운송 적재 20개",
  );
  await press(p, "일손 1시간 진행");
  await expect(
    p.getByRole("progressbar", { name: "현재 운송 진행", exact: true }),
  ).toHaveAttribute("value", "17");
  await press(p, "안내 접기");
  await expect(p.getByTestId("timber-next-step")).toBeHidden();
  await press(p, "다음 일손 사건까지");
  await expect(p.getByTestId("transport-status")).toContainText("하역 완료");
  await expect(p.getByTestId("flow-waiting")).toContainText("20개");
  await press(p, "안내 펼치기");
  await press(p, "목재 다음 작업 장소 보기");
  await expect(p.getByTestId("site-name")).toHaveText("검수대");
  await expect(p.getByTestId("timber-next-step")).toContainText("전량");
});
test("교환 운송 저장·새로고침 복원과 재검수·수령·완료 안내를 보존한다", async ({
  page: p,
}) => {
  const errors: string[] = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await receiveProgress(p);
  await press(p, "확장 정상 목재 16 배분");
  await press(p, "목재 다음 작업 장소 보기");
  await press(p, "현장 불량4 교환 요청");
  await press(p, "현장 교환 회수 출발");
  await expect(p.getByTestId("transport-status")).toContainText(
    "불량품 회수 운송",
  );
  await press(p, "다음 일손 사건까지");
  await expect(p.getByTestId("transport-status")).toContainText("재납품 운송");
  await press(p, "일손 체험 저장");
  await expect(p.getByTestId("labor-save-status")).toContainText(
    "저장했습니다",
  );
  const before = await p.getByTestId("transport-status").textContent();
  await p.reload();
  await press(p, "마른 목재20 조달 체험하기");
  await press(p, "일손 배치·배급 체험하기");
  await press(p, "일손 체험 불러오기");
  await expect(p.getByTestId("labor-save-status")).toContainText(
    "불러왔습니다",
  );
  await expect(p.getByTestId("transport-status")).toHaveText(before ?? "");
  await press(p, "다음 일손 사건까지");
  await expect(p.getByTestId("timber-next-step")).toContainText("재검수");
  await press(p, "목재 다음 작업 장소 보기");
  await press(p, "현장 교환품4 재검수 시작");
  await press(p, "현장 다음 사건까지");
  await press(p, "현장 합격 교환품4 수령");
  await press(p, "확장 정상 목재 4 배분");
  await expect(p.getByTestId("timber-next-step")).toContainText("사용 확인");
  await press(p, "확장 목재 사용 확인");
  await expect(p.getByTestId("timber-next-step")).toContainText("완료");
  expect(errors).toEqual([]);
});
test("모바일에서 주민 담당·보완 인원 부족·배급 병행 안내와 선택을 확인한다", async ({
  page: p,
}) => {
  await p.setViewportSize({ width: 375, height: 812 });
  await receiveProgress(p);
  await press(p, "목재 다음 작업 장소 보기");
  await press(p, "현장 보완 인원 배정");
  await expect(p.getByRole("list", { name: "주민 담당과 동작" })).toContainText(
    "보완 중",
  );
  await press(p, "배급 준비 장소 보기");
  await expect(p.getByTestId("site-name")).toHaveText("배급소");
  await press(p, "일손 1시간 진행");
  for (const i of [3, 4, 2])
    await press(p, `현장 일손 ${i} 배급 준비로 보내기`);
  await expect(progressCard(p, "quarantine")).toContainText("1/2명");
  await press(p, "일손 1시간 진행");
  await expect(p.getByTestId("timber-next-step")).toContainText(
    "보완 이어가기",
  );
  await expect(p.getByRole("region", { name: "첫 플레이 안내" })).toContainText(
    "1/2명",
  );
  await expect(p.getByRole("list", { name: "주민 담당과 동작" })).toContainText(
    "보완 대기",
  );
  await expect(p.getByRole("list", { name: "주민 담당과 동작" })).toContainText(
    "배급 준비 중",
  );
  await b(p, "안내 접기").focus();
  await p.keyboard.press("Enter");
  await reveal(p, "안내 펼치기");
  await expect(b(p, "안내 펼치기")).toBeFocused();
  expect(
    await p.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
