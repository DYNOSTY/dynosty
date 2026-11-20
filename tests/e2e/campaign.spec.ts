import { expect, type Page, test } from "@playwright/test";
import {
  CONVOY_GOALS,
  commandTimber,
  createCapital,
  createTimberSave,
  createVillageGame,
  payTown,
  RESEARCH_CATALOG,
  SCOUT_SITES,
} from "../../packages/game-core/dist/index.js";

test.use({ storageState: { cookies: [], origins: [] } });

async function readScene(page: Page, label: string) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const next = dialog.getByRole("button", { name: /^다음 대사/ });
  while (await next.count()) await next.click();
  await dialog.getByRole("button", { name: label, exact: true }).click();
}
test("출문을 눈으로 확인하고 장면을 접었다 돌아와도 재고가 중복 차감되지 않는다", async ({
  page,
}) => {
  // Three 3D loads and the complete prologue share this budget on software-rendered CI.
  test.setTimeout(240_000);
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAccessibleName("별이 진 뒤, 복홀");
  await expect(page.getByTestId("play-population")).toContainText("600");
  await expect(page.getByTestId("resource-RES_WOOD")).toHaveText("10,000");
  await readScene(page, "어려움 · 복홀 성문으로");
  await expect(dialog).toHaveAccessibleName("귀족들이 출문을 청했다");
  await page.reload();
  await expect(dialog).toHaveAccessibleName("귀족들이 출문을 청했다");
  await readScene(page, "성문을 열고 남은 장부 확인");
  await expect(page.getByTestId("play-population")).toContainText("60");
  await expect(page.getByTestId("resource-RES_WOOD")).toHaveText("1,000");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("dynosty.village.resume")!).state
          .campaign.difficulty,
    ),
  ).toBe("hard");
  await readScene(page, "남은 예순 명과 시작");
  await page.getByRole("button", { name: "관아 · 순라 배치" }).click();
  const office = page.getByRole("region", { name: "관아" });
  await office.getByRole("button", { name: "1단계 · 4명" }).click();
  await expect(office).toContainText("순라 포졸 4명");
  await page.getByRole("button", { name: "관아 · 순라 배치" }).click();
  await page.getByRole("button", { name: "주민의 청 듣기" }).click();
  await expect(dialog.locator(".patrol-portrait")).toBeVisible();
  await readScene(page, "어류 4를 내어 병상까지 배달");
  await expect(page.getByTestId("resource-RES_FISH")).toHaveText("996");
  await page.reload();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("resource-RES_FISH")).toHaveText("996");
});
test("함께 돌아온 정찰대는 보고별로 열리고 완료 뒤 다음 단계는 플레이어가 선택한다", async ({
  page,
}) => {
  const sent = commandTimber(
    createVillageGame(),
    { type: "scout-sites", ids: SCOUT_SITES.map((x) => x.id) },
    "send",
  );
  const save = createTimberSave({ ...sent, world: { ...sent.world, day: 4 } });
  await page.addInitScript((value) => {
    if (!localStorage.getItem("dynosty.village.resume"))
      localStorage.setItem("dynosty.village.resume", JSON.stringify(value));
  }, save);
  await page.goto("/");
  for (const x of SCOUT_SITES) {
    await expect(page.getByRole("dialog")).toHaveAccessibleName(
      x.name + " · 정찰 결과",
    );
    await readScene(
      page,
      x.id === "forge"
        ? "추가 파견을 멈추고 두 이름을 추모 장부에"
        : "보고를 장부에 적기",
    );
  }
  await page.getByRole("button", { name: /^다음 대사/ }).click();
  await expect(
    page.getByRole("dialog").locator("video.campaign-still"),
  ).toHaveAttribute("src", "/story/campaign/ending-1.mp4#t=0,7.5");
  await page.getByRole("button", { name: "지금 단계에 머물기" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: /1단계 · 복홀의 첫 명령/ }).click();
  await readScene(page, "2단계로 넘어갈까요? · 다섯 마을로");
  await expect(page.getByRole("dialog")).toHaveAccessibleName(
    "끊어진 길을 잇다",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^다음 대사/ })
    .click();
  for (const name of ["당성", "압해", "한다사", "새금", "굴아화"]) {
    await expect(
      page
        .getByRole("dialog")
        .getByRole("button", { name: new RegExp("^" + name + " ·") }),
    ).toBeVisible();
  }
});
test("밤에 달이가 배급령 변경을 재촉하고 주민 청을 거절하면 그 자리에서 추방된다", async ({
  page,
}) => {
  const start = createVillageGame();
  const save = createTimberSave({
    ...start,
    world: { ...start.world, minute: 1080, pessimism: 94 },
    campaign: { ...start.campaign!, difficulty: "hard" },
  });
  await page.addInitScript((value) => {
    if (!localStorage.getItem("dynosty.village.resume"))
      localStorage.setItem("dynosty.village.resume", JSON.stringify(value));
  }, save);
  await page.goto("/");
  const warning = page.locator(".campaign-advisory");
  await expect(warning).toContainText("달이");
  await expect(warning).toContainText("오늘 밤 배급령부터 바꾸자");
  await page.getByRole("button", { name: "주민의 청 듣기" }).click();
  await readScene(page, "오늘은 창고의 비축 유지");
  await expect(page.getByRole("dialog")).toHaveAccessibleName(
    "아무도 깨우지 않는 아침",
  );
  await expect(warning).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("dialog")).toHaveAccessibleName(
    "아무도 깨우지 않는 아침",
  );
});
test("어려움으로 저장된 5단계에서 지지가 사라지면 시간 진행 없이 추방된다", async ({
  page,
}) => {
  const s = createVillageGame();
  const save = createTimberSave({
    ...s,
    chapter: 5,
    campaign: { ...s.campaign!, beat: "vigil", difficulty: "hard" },
    world: { ...s.world, optimism: 0, pessimism: 20 },
  });
  await page.addInitScript(
    (value) =>
      localStorage.setItem("dynosty.village.resume", JSON.stringify(value)),
    save,
  );
  await page.goto("/");
  await expect(page.getByRole("dialog")).toHaveAccessibleName(
    "아무도 깨우지 않는 아침",
  );
});
test("옛 저장은 기본 보통 난이도로 남은 유예 시간을 이어간다", async ({
  page,
}) => {
  const s = createVillageGame();
  const save = createTimberSave({
    ...s,
    chapter: 5,
    campaign: { ...s.campaign!, beat: "vigil", pessimismExtremeSince: 0 },
    elapsed: 1439,
    world: { ...s.world, pessimism: 100 },
  });
  delete save.state.campaign!.difficulty;
  await page.addInitScript(
    (value) =>
      localStorage.setItem("dynosty.village.resume", JSON.stringify(value)),
    save,
  );
  await page.goto("/");
  await expect(page.locator(".campaign-advisory")).toContainText("배급령");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "마을 하루 진행" }).click();
  await expect(page.getByRole("dialog")).toHaveAccessibleName(
    "아무도 깨우지 않는 아침",
  );
});
test("좁은 화면의 5단계 컷씬, 반란 대응과 충녕 시해를 이어 본다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const start = createVillageGame();
  const save = createTimberSave({
    ...start,
    chapter: 5,
    world: { ...start.world, pessimism: 55 },
    campaign: { ...start.campaign!, beat: "summit" },
  });
  await page.addInitScript(
    (data) =>
      localStorage.setItem("dynosty.village.resume", JSON.stringify(data)),
    save,
  );
  const tracks: string[] = [];
  page.on("request", (req) => {
    if (req.url().endsWith(".ogg")) tracks.push(req.url());
  });
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAccessibleName("두 그릇을 놓고");
  await expect
    .poll(() => dialog.locator("video").evaluate((v) => v.readyState))
    .toBeGreaterThan(1);
  await dialog.getByRole("button", { name: /^다음 대사/ }).click();
  const family = dialog.getByRole("img", { name: /포와 혜/ });
  await expect
    .poll(() => family.evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await expect(dialog).toContainText("포야, 혜야");
  await expect(
    dialog.getByRole("region", { name: "두 왕자의 인사" }),
  ).toContainText("혜라고 불러 주세요!");
  const advance = dialog.getByRole("button", { name: /^다음 대사/ });
  await advance.click();
  await advance.click();
  await expect(dialog).toContainText("두 분이 먼저 와서 발 좀 녹이실래요?");
  await advance.click();
  const memory = dialog.getByRole("img", {
    name: "도성 광장에 홀로 선 왕의 뒷모습",
  });
  await expect(memory).toBeVisible();
  await expect
    .poll(() => memory.evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await expect(dialog.locator("img")).toHaveCount(1);
  await expect(
    dialog.locator(
      ".campaign-speech, .campaign-advisory, .campaign-goal, video",
    ),
  ).toHaveCount(0);
  await advance.click();
  await expect(memory).toHaveCount(0);
  await expect(family).toBeVisible();
  await expect(dialog).toContainText("그날은 나도 아버지처럼 홀로 남겠다.");
  const rect = await dialog.boundingBox();
  expect(rect?.width).toBeLessThanOrEqual(390);
  await readScene(page, "양녕 · 지휘권을 합치고 징발 허용");
  for (let day = 0; day < 5; day++) {
    await page.getByRole("button", { name: "마을 하루 진행" }).click();
    if (day === 1 || day === 2)
      await expect(
        page.getByText(
          /푸른 보자기 맨 아주머니를 봤어요|빈 창고 쪽으로 혼자|문틈으로 불빛이 새더라/,
        ),
      ).toHaveCount(0);
    if (day === 3)
      await expect(page.getByText(/관측패를 모두 맞춰/)).toBeVisible();
  }
  await expect(dialog).toHaveAccessibleName("혹한 닷새 전 · 배반자의 외침");
  await readScene(page, "풀 12를 풀고 대표들과 함께 식사");
  await expect(dialog).toHaveAccessibleName("성문 빗장이 들리던 밤");
  await dialog.getByRole("button", { name: /^다음 대사/ }).click();
  await expect(dialog).toContainText("푸른 보자기를 맨 주민");
  await expect(dialog).toContainText("이쪽 빗장은 내가 들 테니");
  await dialog.getByRole("button", { name: /^다음 대사/ }).click();
  await expect(dialog).toContainText("충녕 마마가 돌아가셨어요");
  await readScene(page, "판결을 기록하고 의원으로");
  await expect(dialog).toHaveAccessibleName("의원의 등잔");
  await dialog.getByRole("button", { name: /^다음 대사/ }).click();
  await expect(dialog).toContainText("이제는 그 목소리를 되찾을 수 없습니다");
  await expect
    .poll(() => tracks.some((url) => url.endsWith("/13.ogg")))
    .toBe(true);
});

test("성문 수비와 온돌을 배치하고 삽화가 있는 전투 보고를 닫는다", async ({
  page,
}) => {
  const s = createVillageGame(false, true);
  await page.addInitScript(
    (save) => {
      if (!localStorage.getItem("dynosty.village.resume"))
        localStorage.setItem("dynosty.village.resume", JSON.stringify(save));
    },
    createTimberSave({
      ...s,
      raid: { minute: 0, picture: 5, dead: 0, injured: 1 },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: /기온.*성문과 온돌/ }).click();
  const panel = page.getByRole("region", { name: "성문과 온돌", exact: true });
  await panel.getByRole("button", { name: "4명 배치", exact: true }).click();
  await expect(panel).toContainText("성문 수비병 4명");
  await panel.getByRole("button", { name: "2단계", exact: true }).click();
  await expect(
    panel.getByRole("button", { name: "2단계", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const report = page.getByRole("region", { name: "성문 전투 보고" });
  await expect(report).toContainText("부상 1명");
  await expect
    .poll(() =>
      report
        .getByRole("img")
        .evaluate((el) => (el as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await report.getByRole("button", { name: "보고 확인" }).click();
  await expect(report).toHaveCount(0);
});

test("붉은 눈의 주민에게 치안대를 보내고 훼손된 둥지만 수리한다", async ({
  page,
}) => {
  const base = createVillageGame(false, true);
  const guard = commandTimber(base, { type: "set-guards", count: 4 }, "guard");
  const patient = guard.residents.find((r) => !r.workplaceId)!;
  const injured = commandTimber(
    guard,
    {
      type: "citizen-event",
      event: {
        type: "illness",
        id: "wounded",
        citizenIds: [patient.id],
        severity: "major",
      },
    },
    "wounded",
  );
  const save = createTimberSave({
    ...injured,
    mutants: [{ id: patient.id, due: 30 }],
    mutantDamage: { [injured.homes[0]!.id]: 25 },
  });
  await page.addInitScript((value) => {
    if (!localStorage.getItem("dynosty.village.resume"))
      localStorage.setItem("dynosty.village.resume", JSON.stringify(value));
  }, save);
  await page.goto("/");
  const active = page.getByRole("region", { name: "마을 안 변종" });
  await expect
    .poll(() =>
      active
        .getByRole("img")
        .evaluate((el) => (el as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await active.getByRole("button", { name: "치안대 출동" }).click();
  await expect(active).toHaveCount(0);
  const repair = page.getByRole("button", { name: "수리 · 목재 4, 석재 1" });
  await repair.click();
  await expect(repair).toHaveCount(0);
  await page.reload();
  await expect(active).toHaveCount(0);
  await expect(repair).toHaveCount(0);
});

test("쥬신 왕으로 도성 구호를 명하고 설정에서 변종 야습 기록을 읽는다", async ({
  page,
}) => {
  const s = createVillageGame();
  const save = createTimberSave(
    createCapital({ ...s, campaign: { ...s.campaign!, beat: "roads" } }),
  );
  await page.addInitScript((value) => {
    if (!localStorage.getItem("dynosty.village.resume"))
      localStorage.setItem("dynosty.village.resume", JSON.stringify(value));
  }, save);
  await page.goto("/");
  await expect(page.getByRole("dialog")).toHaveAccessibleName(
    "쥬신 왕의 어전 · 도성 남문",
  );
  await expect(page.getByRole("heading", { name: "도성 현황" })).toBeVisible();
  await expect(page.getByTestId("play-population")).toContainText(/1,?000/);
  await readScene(page, "남문의 장부를 받아 도성을 살핀다");
  await expect(page.getByTestId("resource-RES_COAL")).toHaveText("1,000");
  await expect(
    page.getByRole("button", { name: "도성 반나절 경영" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "명령 열기", exact: true }).click();
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await page.getByText("세계관 · 밤에 벌어지는 일", { exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "왕도는 함락되고 쥬신은 멸망했다",
  );
});

function awakenedVillageSave(completed: string[], days: number) {
  let base = createVillageGame();
  for (const id of completed)
    base = payTown(base, RESEARCH_CATALOG.find((r) => r.id === id)!.cost);
  return createTimberSave({
  await page
    .getByRole("button", { name: "남문 · 피난 수레", exact: true })
    .first()
    .click();
  const carts = page.getByRole("region", { name: "남문 피난 수레" });
  await carts.getByRole("button", { name: "석탄 1000 수레에 싣기" }).click();
  await expect(page.getByTestId("resource-RES_COAL")).toHaveText("0");
  await expect(carts).toContainText("석탄 · 1000 / 6000");
    ...base,
    chapter: 5,
    elapsed: base.elapsed + days * 1440,
    world: { ...base.world, day: base.world.day + days },
    campaign: {
      ...base.campaign!,
      beat: "vigil",
      side: "control",
      revivalPrepared: true,
    },
    town: {
      ...base.town,
      development: {
        ...base.town.development,
        completed,
        story: {
          rebellion: true,
          route: "mechanical",
          chungnyeong: "mechanical",
        },
      },
    },
  });
}

test("충녕의 소생 소식을 전한 뒤 이어 하면 의원 후일담을 듣는다", async ({
  page,
}) => {
  const save = awakenedVillageSave(["R17", "R18", "TECH_MECHA2"], 0);
  await page.addInitScript((value) => {
    if (!localStorage.getItem("dynosty.village.resume"))
      localStorage.setItem("dynosty.village.resume", JSON.stringify(value));
  }, save);
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAccessibleName("다시 들린 목소리");
  await dialog.getByRole("button", { name: /^다음 대사/ }).click();
  await expect(dialog).toContainText("그날 내 옆에 누웠던 아이는요?");
  await readScene(page, "의원 밖에 소식을 전한다");
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: /^5단계 ·/ }).click();
  await expect(dialog).toContainText("혼자 문턱을 넘던걸요");
});

test("복홀 성곽 엔딩은 기록과 경구 뒤에 무성 영상과 두 공룡의 대화를 보여 준다", async ({
  page,
}) => {
  const save = awakenedVillageSave(["R17", "R18", "TECH_MECHA2", "R19"], 11);
  await page.addInitScript(
    (value) =>
      localStorage.setItem("dynosty.village.resume", JSON.stringify(value)),
    save,
  );
  const music = page.waitForResponse(
    (response) => response.url().endsWith("/B.ogg") && response.ok(),
  );
  await page.goto("/");
  await expect(page.getByRole("dialog")).toHaveAccessibleName(
    "다시 들린 목소리",
  );
  await readScene(page, "의원 밖에 소식을 전한다");
  const dialog = page.getByRole("dialog", { name: "복홀에 아침이 오면" });
  const next = dialog.getByRole("button", { name: /^다음 대사/ });
  await expect(dialog).toContainText("당신이 우리 곁을 지켜 준 덕입니다");
  await next.click();
  await expect(dialog.locator("video")).toHaveCount(0);
  await next.click();
  const clip = dialog.locator("video");
  await expect(clip).toHaveAttribute("src", "/story/campaign/escape.mp4");
  await expect
    .poll(() => clip.evaluate((v) => v.muted && v.currentTime > 0))
    .toBe(true);
  await music;
  await expect(dialog).toContainText("공자님, 손 좀 내어 주실래요?");
  await next.click();
  await expect(dialog).toContainText("네, 공주 마마.");
  await next.click();
  await expect(dialog).toContainText("저도 그 말을 하려던 참이었어요.");
});

test("양녕의 피난 명부와 입고 장부가 복홀 인구와 네 재고 증가분에 맞는다", async ({
  page,
}) => {
  const village = createVillageGame();
  const save = createTimberSave({
    ...village,
    chapter: 4,
    paused: true,
    campaign: {
      ...village.campaign!,
      beat: "thaw",
      departures: 3,
      evacuees: 200,
      cargo: { ...CONVOY_GOALS },
    },
  });
test("남문에서 손자들을 본 왕이 세 번째 행렬을 보내고 성안에 남는다", async ({
  page,
}) => {
  const village = createVillageGame();
  const capital = createCapital({
    ...village,
    campaign: { ...village.campaign!, beat: "roads" },
  });
  const save = createTimberSave({
    ...capital,
    campaign: {
      ...capital.campaign!,
      relief: "report",
      departures: 2,
      evacuees: 200,
      cargo: { ...CONVOY_GOALS },
    },
  });
  await page.addInitScript(
    (value) =>
      localStorage.setItem("dynosty.village.resume", JSON.stringify(value)),
    save,
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "남문 · 피난 수레", exact: true })
    .first()
    .click();
  const carts = page.getByRole("region", { name: "남문 피난 수레" });
  const portrait = carts.getByRole("img", { name: /두 손자/ });
  await expect
    .poll(() =>
      portrait.evaluate((el) => (el as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await expect(carts).toContainText("양녕의 세 아들이 마지막 행렬에 올랐다");
  await carts.getByRole("button", { name: "3차 수레 출발" }).click();
  const ending = page.getByRole("dialog", {
    name: "3단계 완료 · 남문에 남은 왕",
  });
  await expect(ending).toContainText("전하, 북문이 뚫렸습니다");
  const next = ending.getByRole("button", { name: /^다음 대사/ });
  await next.click();
  await expect(ending.locator(".campaign-speech")).toHaveCount(0);
  await expect(ending.locator("video")).toHaveAttribute("src", /ending-3\.mp4/);
});

  await page.addInitScript(
    (value) =>
      localStorage.setItem("dynosty.village.resume", JSON.stringify(value)),
    save,
  );
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAccessibleName(/^4단계 완료/);
  const counts = async () =>
    Promise.all(
      [
        "play-population",
        "resource-RES_WOOD",
        "resource-RES_MEAT",
        "resource-RES_FISH",
        "resource-RES_COAL",
      ].map(async (id) => {
        const label = await page.getByTestId(id).innerText();
        const match = label.match(/[\d,]+/);
        if (!match) throw Error(id + " 수량 누락");
        return Number(match[0].replaceAll(",", ""));
      }),
    );
  const before = await counts();
  await readScene(page, "5단계로 넘어갈까요? · 성문 앞으로");
  await expect(dialog).toHaveAccessibleName("두 그릇을 놓고");
  const delta = (await counts()).map((n, i) => n - before[i]);
  expect(delta).toEqual([120, 3000, 1500, 1500, 1800]);
  const advance = dialog.getByRole("button", { name: /^다음 대사/ });
  while (
    !(await dialog.getByText(/남문 명부 여기 있습니다/).count()) &&
    (await advance.count())
  )
    await advance.click();
  await expect(dialog).toContainText(
    `오늘 이 문 안에 든 식구는 모두 ${delta[0]}명입니다.`,
  );
  await advance.click();
  await advance.click();
  await expect(dialog).toContainText("입고 장부");
  await expect(dialog).toContainText(
    ["목재", "고기", "어류", "석탄"]
      .map((label, i) => label + " " + delta[i + 1]!.toLocaleString("ko-KR"))
      .join(" · "),
  );
});
