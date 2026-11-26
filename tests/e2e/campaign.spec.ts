import { expect, test } from "@playwright/test";
import {
  CONVOY_GOALS,
  campaignOf,
  commandTimber,
  createCapital,
  createTimberSave,
  createVillageGame,
  deposit,
  mutantRepairCost,
  payTown,
  RESEARCH_CATALOG,
  requireValue,
  SCOUT_SITES,
} from "../../packages/game-core/dist/index.js";
import { readScene } from "./campaign-scene.js";
import { advanceVillageDay, readVillage } from "./read-village.js";
import { worldPoint } from "./scene-picking.js";

test.use({ storageState: { cookies: [], origins: [] } });

for (const [level, label] of [
  ["easy", "쉬움"],
  ["hard", "어려움"],
] as const) {
  test(
    label +
      " · 출문을 눈으로 확인하고 장면을 접었다 돌아와도 재고가 중복 차감되지 않는다",
    async ({ page }) => {
      // Three 3D loads and the complete prologue share this budget on software-rendered CI.
      test.setTimeout(240_000);
      await page.goto("/");
      const dialog = page.getByRole("dialog");
      await expect(dialog).toHaveAccessibleName("서막");
      await expect(dialog.locator("video")).toHaveJSProperty("muted", false);
      const opening = dialog.locator("video");
      await expect
        .poll(async () => {
          const play = dialog.getByRole("button", { name: "영상 재생" });
          if (await play.isVisible()) await play.click();
          return opening.evaluate(
            (v) =>
              (v as HTMLVideoElement).videoWidth > 0 &&
              (v as HTMLVideoElement).currentTime > 0.2,
          );
        })
        .toBe(true);
      await dialog.getByRole("button", { name: "건너뛰기" }).click();
      await expect(
        dialog.getByRole("button", { name: "이어하기" }),
      ).toHaveCount(0);
      await expect(
        dialog.getByRole("button", { name: "마을 보기" }),
      ).toHaveCount(0);
      await dialog.getByRole("button", { name: "돌아보기" }).click();
      await expect(dialog.getByRole("heading", { name: "서막" })).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: "다음 장면" }),
      ).toBeDisabled();
      await expect(dialog).not.toContainText("양녕의 질서");
      await dialog.getByRole("button", { name: "뒤로" }).click();
      await dialog.getByRole("button", { name: "새로 시작" }).click();
      await expect(page.getByTestId("play-population")).toContainText("600");
      await expect(page.getByTestId("resource-RES_WOOD")).toHaveText("10,000");
      await expect(dialog.getByRole("heading")).toHaveText("복홀의 첫 명령");
      await dialog.getByRole("button", { name: "난이도 설정" }).click();
      await dialog.getByRole("combobox").selectOption(level);
      await dialog.getByRole("button", { name: "시작하기" }).click();
      await expect(dialog).toHaveAccessibleName("귀족들이 출문을 청했다");
      await dialog.getByRole("button", { name: "건너뛰기" }).click();
      await expect(
        page.locator("#campaign-dialogue-dock .campaign-speech"),
      ).toBeVisible();
      const firstSpeech = page.locator(
        "#campaign-dialogue-dock .campaign-speech",
      );
      await expect(firstSpeech.locator("strong")).toHaveText(
        "가솔을 이끄는 귀족",
      );
      const portrait = requireValue(
          await firstSpeech.locator(".story-face").boundingBox(),
          "화면 위치",
        ),
        speaker = requireValue(
          await firstSpeech.locator("strong").boundingBox(),
          "화면 위치",
        ),
        words = requireValue(
          await firstSpeech.locator("p").boundingBox(),
          "화면 위치",
        );
      expect(portrait.x + portrait.width).toBeLessThanOrEqual(speaker.x);
      expect(Math.abs(speaker.x - words.x)).toBeLessThan(2);
      await page.reload();
      await expect(dialog).toHaveAccessibleName("귀족들이 출문을 청했다");
      await expect(dialog.locator("video")).toHaveCount(0);
      await expect(page.locator("dialog:modal")).toHaveCount(0);
      await dialog.locator(".campaign-speech").click();
      await expect(dialog.locator(".campaign-speech strong")).toHaveText(
        "고리",
      );
      for (let i = 0; i < 3; i++)
        await dialog.locator(".campaign-speech").click();
      await expect(dialog).toHaveClass(/scene-cinema/);
      const still = requireValue(
        await dialog.locator(".campaign-still").boundingBox(),
        "화면 위치",
      );
      expect(still.height).toBeGreaterThan(
        requireValue(page.viewportSize(), "page.viewportSize()").height * 0.95,
      );
      await expect(dialog.locator(".campaign-still")).toHaveAttribute(
        "src",
        /mokjin-exodus.webp$/,
      );
      expect(
        await dialog.evaluate((el) => el.clientWidth >= innerWidth - 2),
      ).toBe(true);
      await dialog.locator(".campaign-speech").click();
      await expect(
        page.locator("#campaign-dialogue-dock .campaign-speech"),
      ).toBeVisible();
      await dialog.getByRole("button", { name: "대화 건너뛰기" }).click();
      await expect(page.getByTestId("play-population")).toContainText("60");
      await expect(page.getByTestId("resource-RES_WOOD")).toHaveText("1,000");
      expect(
        await page.evaluate(readVillage).then((s) => s.campaign?.difficulty),
      ).toBe(level);
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
    },
  );
  test(
    label +
      " · 함께 돌아온 정찰대는 보고별로 열리고 완료 뒤 다음 단계는 플레이어가 선택한다",
    async ({ page }) => {
      test.setTimeout(240_000);
      const sent = commandTimber(
        createVillageGame(),
        { type: "scout-sites", ids: SCOUT_SITES.map((x) => x.id) },
        "send",
      );
      const save = createTimberSave({
        ...sent,
        campaign: { ...campaignOf(sent), difficulty: level },
        world: { ...sent.world, day: 4 },
      });
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
      await expect(
        page.locator(".result-screen .result-quote p"),
      ).toBeVisible();
      await expect(
        page.locator(".result-screen .result-quote footer"),
      ).toContainText("『");
      const transition = page.getByRole("button", {
        name: "2단계로 넘어갈까요? · 다섯 마을로",
      });
      const settings = page.getByRole("button", {
        name: "난이도 설정",
        exact: true,
      });
      const difficulty = page.getByRole("combobox", { name: "난이도" });
      await transition.click();
      await settings.click();
      await expect(difficulty).toHaveValue(level);
      await page.getByRole("button", { name: "돌아가기" }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page
        .getByRole("button", { name: /1단계 · 복홀의 첫 명령/ })
        .click();
      const nextLine = page.getByRole("button", { name: /^다음 대사/ });
      await nextLine.click();
      await expect(
        page.getByRole("dialog").locator("video.campaign-still"),
      ).toBeVisible();
      await expect(transition).toBeVisible();
      await transition.click();
      await settings.click();
      await difficulty.selectOption(level);
      await page.getByRole("button", { name: "시작하기" }).click();
      const missionFilm = page.locator("dialog.film-screen");
      await expect(missionFilm.locator("video")).toHaveAttribute(
        "src",
        /two\.mp4$/,
      );
      await missionFilm.locator(".film-skip").click();
      await expect
        .poll(() =>
          page.evaluate(readVillage).then((state) => {
            return [state.chapter, state.campaign?.difficulty];
          }),
        )
        .toEqual([2, level]);
      await page.reload();
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
      await page.getByRole("button", { name: "장면 접기" }).click();
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "나가기", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveAccessibleName("메인 메뉴");
      await page.getByRole("button", { name: "다시하기" }).click();
      await page.getByLabel("시작 난이도").selectOption("normal");
      await page
        .getByRole("button", { name: "현재 2단계 처음부터 시작" })
        .click();
      await expect(page.getByRole("dialog")).toHaveAccessibleName(
        "끊어진 길을 잇다",
      );
      await expect
        .poll(() =>
          page.evaluate(readVillage).then((s) => s.campaign?.difficulty),
        )
        .toBe("normal");
    },
  );
}
test("밤에 달이가 배급령 변경을 재촉하고 주민 청을 거절하면 그 자리에서 추방된다", async ({
  page,
}) => {
  const start = createVillageGame();
  const save = createTimberSave({
    ...start,
    world: { ...start.world, minute: 1080, pessimism: 94 },
    campaign: { ...campaignOf(start), difficulty: "hard" },
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
  await expect(page.locator(".fallen-caption")).toHaveText(
    "당신이 알던 대로 공룡 문명은 멸망했습니다.과거의 편린",
    { useInnerText: false },
  );
  const caption = page.locator(".fallen-caption");
  const alignedBelow = await caption.evaluate((element) => {
    const range = document.createRange();
    const sentenceNode = element.firstChild;
    const creditNode = element.querySelector("small");
    if (!sentenceNode || !creditNode) return false;
    range.selectNodeContents(sentenceNode);
    const sentence = range.getBoundingClientRect();
    range.selectNodeContents(creditNode);
    const credit = range.getBoundingClientRect();
    return (
      credit.top >= sentence.bottom &&
      Math.abs(credit.right - sentence.right) <= 1
    );
  });
  expect(alignedBelow).toBe(true);
  await expect(page.getByRole("dialog")).toHaveAccessibleName(
    "아무도 깨우지 않는 아침",
  );
  await expect(
    page.getByRole("dialog").locator('img[src$="gori-exile.webp"]'),
  ).toBeVisible();
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
    campaign: { ...campaignOf(s), beat: "vigil", difficulty: "hard" },
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
    campaign: { ...campaignOf(s), beat: "vigil", pessimismExtremeSince: 0 },
    elapsed: 1439,
    world: { ...s.world, pessimism: 100 },
  });
  delete requireValue(save.state.campaign, "save.state.campaign").difficulty;
  await page.addInitScript(
    (value) =>
      localStorage.setItem("dynosty.village.resume", JSON.stringify(value)),
    save,
  );
  await page.goto("/");
  await expect(page.locator(".campaign-advisory")).toContainText("배급령");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await advanceVillageDay(page);
  await expect(page.getByRole("dialog")).toHaveAccessibleName(
    "아무도 깨우지 않는 아침",
  );
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
  await expect(page.getByText("성문 수비병 0명", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "성문", exact: true }).click();
  const panel = page.getByRole("region", { name: "성문과 온돌", exact: true });
  await panel.getByRole("slider", { name: /성문 병력/ }).press("ArrowRight");
  await expect(panel).toContainText("성문 수비병 4명");
  const heat = panel.getByRole("slider", { name: /온돌 화력/ });
  await heat.press("ArrowRight");
  await heat.press("ArrowRight");
  await expect(heat).toHaveValue("2");
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
  const patient = requireValue(
    guard.residents.find((r) => !r.workplaceId),
    "시나리오 대상",
  );
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
    mutantDamage: {
      [requireValue(injured.homes[0], "injured.homes[0]").id]: 25,
    },
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
  const cost = mutantRepairCost(
    save.state,
    requireValue(injured.homes[0], "손상된 둥지").id,
  );
  const repair = page.getByRole("button", {
    name: `수리 · 목재 ${cost.RES_WOOD}, 석재 ${cost.RES_STONE}`,
  });
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
    createCapital({ ...s, campaign: { ...campaignOf(s), beat: "roads" } }),
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
  await page
    .getByRole("button", { name: "남문 · 피난 수레", exact: true })
    .first()
    .click();
  const carts = page.getByRole("region", { name: "남문 피난 수레" });
  await carts.getByRole("button", { name: "석탄 1000 수레에 싣기" }).click();
  await expect(page.getByTestId("resource-RES_COAL")).toHaveText("0");
  await expect(carts).toContainText("석탄 · 1000 / 6000");
  await expect(
    page.getByRole("button", { name: "도성 반나절 경영" }),
  ).toHaveCount(0);
  if (
    await page
      .getByRole("button", { name: "명령 열기", exact: true })
      .isVisible()
  )
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
    base = payTown(
      base,
      requireValue(
        RESEARCH_CATALOG.find((r) => r.id === id),
        "연구 항목",
      ).cost,
    );
  return createTimberSave({
    ...base,
    chapter: 5,
    elapsed: base.elapsed + days * 1440,
    world: { ...base.world, day: base.world.day + days },
    campaign: {
      ...campaignOf(base),
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

for (const prepared of [true, false]) {
  test(
    "기계 충녕의 결말 영상과 첫인사 · " +
      (prepared ? "생전 연구" : "늦은 연구"),
    async ({ page }) => {
      const base = awakenedVillageSave(["R17", "R18", "TECH_MECHA2"], 11);
      const save = createTimberSave({
        ...base.state,
        campaign: {
          ...campaignOf(base.state),
          beat: "ending",
          ending: "escape",
          revivalPrepared: prepared,
        },
      });
      await page.addInitScript(
        (value) =>
          localStorage.setItem("dynosty.village.resume", JSON.stringify(value)),
        save,
      );
      await page.goto("/");
      const dialog = page.getByRole("dialog");
      const next = dialog.getByRole("button", { name: /^다음 대사/ });
      await next.click();
      await expect(dialog).toContainText("공주마마?");
      const clip = dialog.locator("video");
      await expect(clip).toHaveAttribute(
        "src",
        "/story/campaign/" + (prepared ? "escape" : "mechanical-late") + ".mp4",
      );
      await expect
        .poll(() => clip.evaluate((v) => v.currentTime))
        .toBeGreaterThan(0);
      await next.click();
      await expect(dialog).toContainText(
        "안.녕.하.세.요. 저.는. 충.녕.입.니.다.",
      );
    },
  );
}

test("양녕의 피난 명부와 입고 장부가 복홀 인구와 네 재고 증가분에 맞는다", async ({
  page,
}) => {
  const village = createVillageGame();
  const save = createTimberSave({
    ...village,
    chapter: 4,
    paused: true,
    campaign: {
      ...campaignOf(village),
      beat: "thaw",
      departures: 3,
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
        const label = (await page.getByTestId(id).textContent()) ?? "";
        const match = label.match(/[\d,]+/);
        if (!match) throw Error(id + " 수량 누락");
        return Number(match[0].replaceAll(",", ""));
      }),
    );
  const before = await counts();
  await expect(dialog).toContainText("나루 밑으로 물이 한 줄 갑니다");
  await dialog.getByRole("button", { name: /^다음 대사/ }).click();
  const film = dialog.locator("video");
  await expect(film).toHaveAttribute("src", /ending-4\.mp4/);
  await expect
    .poll(() => film.evaluate((el) => el.currentTime))
    .toBeGreaterThan(0);
  await expect(dialog).toContainText("당신이 지켜냈습니다");
  const quote = dialog.locator(".result-quote");
  await expect(quote).toBeVisible({ timeout: 15000 });
  await expect(quote.locator("p")).toHaveText(/\S/);
  await expect(quote.locator("footer")).toHaveText(/\S/);
  await dialog
    .getByRole("button", { name: "5단계로 넘어갈까요? · 성문 앞으로" })
    .click();
  const prep = page.getByRole("dialog", { name: "미션 시작 준비" });
  await expect(prep).toBeVisible();
  expect(await counts()).toEqual(before);
  await prep.getByRole("button", { name: "시작하기" }).click();
  await expect(dialog.locator("video")).toHaveAttribute("src", /five\.mp4$/);
  await dialog.getByRole("button", { name: "건너뛰기" }).click();
  await expect(dialog).toHaveAccessibleName("두 그릇을 놓고");
  const delta = (await counts()).map((n, i) => n - before[i]);
  expect(delta).toEqual([120, 3000, 1500, 1500, 1800]);
  const advance = dialog.getByRole("button", { name: /^다음 대사/ });
  while (
    !(await dialog.getByText("남문에서 온 짐꾼", { exact: true }).isVisible())
  ) {
    const label = (await advance.textContent()) ?? "";
    await advance.click();
    await expect(advance).not.toHaveText(label);
  }
  await expect(dialog).toContainText(
    `오늘 이 문 안에 든 식구는 모두 ${delta[0]}명입니다.`,
  );
  await advance.click();
  await advance.click();
  await expect(dialog).toContainText("입고 장부");
  await expect(dialog).toContainText(
    ["목재", "고기", "어류", "석탄"]
      .map(
        (label, i) =>
          label +
          " " +
          requireValue(delta[i + 1], "delta[i + 1]").toLocaleString("ko-KR"),
      )
      .join(" · "),
  );
});

for (const [label, raided, rally, verdict] of [
  ["습격", true, "성문에 붉은 눈이 들이닥쳤소", "성문에 붉은 눈이 붙은 걸"],
  ["조용한 밤", false, "창고에서 나와 약조한 이들", "문을 열기로 했잖소"],
] as const) {
  test("닷새째 목진의 외침과 판결 · " + label, async ({ page }) => {
    const base = createVillageGame();
    const save = createTimberSave({
      ...base,
      chapter: 5,
      paused: true,
      campaign: {
        ...campaignOf(base),
        beat: "rally",
        side: "control",
        uprising: true,
        coupGateRaided: raided,
        revivalPrepared: false,
      },
    });
    await page.addInitScript((value) => {
      if (!localStorage.getItem("dynosty.village.resume"))
        localStorage.setItem("dynosty.village.resume", JSON.stringify(value));
    }, save);
    await page.goto("/");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveAccessibleName("혹한 닷새 전 · 배반자의 외침");
    await expect(dialog).toContainText(rally);
    await readScene(page, "양녕의 반란에 맞선다");
    await expect(dialog).toHaveAccessibleName("성문 빗장이 들리던 밤");
    await expect(dialog).toContainText(verdict);
    await page.reload();
    await expect(dialog).toHaveAccessibleName("성문 빗장이 들리던 밤");
    await expect(dialog).toContainText(verdict);
  });
}
for (const [hope, allegiance, film] of [
  [69, "양녕의 반란에 맞선다", "mechanical-late"],
  [70, "양녕의 반란에 맞선다", "hope"],
  [70, "양녕의 반란에 동조한다", "order"],
] as const) {
  test("반란 선택부터 결말 재생까지 · " + film, async ({ page }) => {
    test.setTimeout(240_000);
    // The rebellion takes place in an established settlement with winter fuel.
    let village = deposit(createVillageGame(), "RES_WOOD", 3500);
    const send = (cmd: Parameters<typeof commandTimber>[1]) => {
      village = commandTimber(
        village,
        cmd,
        "setup-" + village.processed.length,
      );
    };
    send({
      type: "plan-building",
      kind: "workshop",
      position: { x: 12, z: 12 },
      headingRadians: Math.PI,
    });
    send({
      type: "plan-building",
      kind: "restaurant",
      position: { x: 0, z: 16 },
      headingRadians: Math.PI,
    });
    send({ type: "advance", minutes: 1440 });
    for (const facility of village.town.facilities) {
      send({ type: "facility-staff", id: facility.id, count: 2 });
    }
    send({ type: "set-gate", count: 16 });
    send({ type: "set-guards", count: 8 });
    send({ type: "set-heating", level: 2 });
    const save = createTimberSave({
      ...village,
      chapter: 5,
      paused: true,
      elapsed: 5 * 1440,
      world: { ...village.world, day: 6, minute: 1260, optimism: hope },
      campaign: {
        ...campaignOf(village),
        beat: "rally",
        since: 0,
        side: "coexist",
        hopeAtCoup: hope,
        revivalPrepared: false,
      },
    });
    await page.addInitScript((value) => {
      if (!localStorage.getItem("dynosty.village.resume"))
        localStorage.setItem("dynosty.village.resume", JSON.stringify(value));
    }, save);
    await page.goto("/");
    const dialog = page.getByRole("dialog");
    await readScene(page, allegiance);
    await readScene(
      page,
      film === "mechanical-late"
        ? "판결을 기록하고 의원으로"
        : "판결을 기록하고 마을로",
    );
    const readProgress = () =>
      page.evaluate(readVillage).then((s) => {
        return {
          elapsed: s.elapsed as number,
          completed: s.town.development.completed as string[],
          ending: s.campaign?.ending,
        };
      });
    const dismissNotices = async () => {
      const petition = page.getByRole("dialog", { name: "배식 줄에서 온 청" });
      if (await petition.isVisible())
        await petition.getByRole("button", { name: "장면 접기" }).click();
      const confirm = page
        .getByRole("region", { name: /^(마을 사건|추위 경고)$/ })
        .getByRole("button", { name: "확인", exact: true });
      while (await confirm.isVisible()) {
        const current = await confirm.elementHandle();
        await current.click();
        await current.waitForElementState("hidden");
        await current.dispose();
      }
    };
    const day = async () => {
      await dismissNotices();
      const before = await readProgress();
      if (before.ending) return;
      await advanceVillageDay(page);
      await expect
        .poll(async () => (await readProgress()).elapsed)
        .toBeGreaterThan(before.elapsed);
    };
    if (film === "mechanical-late") {
      await expect(dialog).toContainText("유산 기록 대조");
      await dialog.getByRole("button", { name: "장면 접기" }).click();
      for (const tech of ["R17", "R18", "TECH_MECHA2"]) {
        await dismissNotices();
        const opener = page.getByRole("button", {
          name: /^(명령 열기|거래 제안 열기)$/,
        });
        if (await opener.isVisible()) await opener.click();
        await page.getByRole("button", { name: "연구", exact: true }).click();
        await page.getByLabel("연구 기술", { exact: true }).selectOption(tech);
        await page
          .getByRole("button", { name: "연구 시작", exact: true })
          .click();
        await expect(page.getByTestId("research-status")).toContainText(
          "연구 중",
        );
        await page
          .getByRole("button", { name: "마을로 돌아가기", exact: true })
          .click();
        for (
          let i = 0;
          i < 12 && !(await readProgress()).completed.includes(tech);
          i++
        )
          await day();
        expect((await readProgress()).completed).toContain(tech);
      }
    }
    for (let i = 0; i < 12 && !(await readProgress()).ending; i++) await day();
    const next = dialog.getByRole("button", { name: /^다음 대사/ });
    await next.click();
    const clip = dialog.locator("video");
    await expect(clip).toHaveAttribute(
      "src",
      "/story/campaign/" + film + ".mp4",
    );
    await expect
      .poll(() => clip.evaluate((v) => v.currentTime))
      .toBeGreaterThan(0);
    if (film === "mechanical-late") {
      await expect(dialog).toContainText("공주마마?");
      await next.click();
      await expect(dialog).toContainText(
        "안.녕.하.세.요. 저.는. 충.녕.입.니.다.",
      );
    }
  });
}
test("마지막 장을 덮은 뒤 다시 하기로 복홀의 5단계 시작 장부를 복원한다", async ({
  page,
}) => {
  // Five full 3D page loads (start, two reloads, slot load, replay) share this budget.
  test.setTimeout(240_000);
  const village = createVillageGame();
  const checkpoint = createTimberSave({
    ...village,
    chapter: 5,
    paused: true,
    campaign: { ...campaignOf(village), beat: "summit" },
  });
  const ending = createTimberSave({
    ...checkpoint.state,
    campaign: {
      ...campaignOf(checkpoint.state),
      beat: "ending",
      ending: "hope",
    },
  });
  await page.addInitScript((value) => {
    if (!localStorage.getItem("dynosty.village.resume"))
      localStorage.setItem("dynosty.village.resume", JSON.stringify(value));
  }, checkpoint);
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAccessibleName("두 그릇을 놓고");
  await readScene(page, "충녕 · 먹는 것과 필요한 양에 맞춰 배급한다");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "나가기", exact: true }).click();
  await page.evaluate(() =>
    localStorage.setItem("dynosty.film.opening", "seen"),
  );
  await dialog.getByRole("button", { name: "돌아보기" }).click();
  await dialog.getByRole("button", { name: "영상 보기" }).click();
  await expect(dialog.locator("video")).toHaveAttribute(
    "src",
    "/story/campaign/opening.mp4",
  );
  await dialog.getByRole("button", { name: "뒤로" }).click();
  await dialog.getByRole("button", { name: "이어하기" }).click();
  await dialog.getByRole("button", { name: "현재 진행 이어하기" }).click();
  await page.keyboard.press("Escape");
  await dialog.getByRole("button", { name: "저장하기", exact: true }).click();
  await expect(dialog.getByRole("button", { name: /^슬롯 / })).toHaveCount(10);
  await dialog.getByRole("button", { name: /슬롯 10 · 빈 슬롯/ }).click();
  await expect(dialog).toContainText("슬롯 10에 저장했습니다.");
  const manual = await page.evaluate(readVillage);
  await page.evaluate(
    (value) =>
      localStorage.setItem("dynosty.village.resume", JSON.stringify(value)),
    ending,
  );
  await page.reload();
  await readScene(page, "5단계 완료 · 마지막 장을 덮을까요?");
  await expect(dialog).toHaveAccessibleName("메인 메뉴");
  await page.reload();
  await expect(dialog).toHaveAccessibleName("메인 메뉴");
  await dialog.getByRole("button", { name: "이어하기" }).click();
  // 슬롯을 불러오면 페이지가 다시 열리므로 새 문서가 뜬 뒤 기록을 읽는다.
  const reloaded = page.waitForEvent("load");
  await dialog.getByRole("button", { name: /슬롯 10 · 5단계/ }).click();
  await reloaded;
  await expect
    .poll(() => page.evaluate(readVillage).then((s) => s.campaign?.beat))
    .toBe("forecast");
  const loaded = await page.evaluate(readVillage);
  expect(loaded.world).toEqual(manual.world);
  expect(loaded.town).toEqual(manual.town);
  await expect(
    page.getByRole("button", { name: /5단계 · 누굴 위한 복홀인가/ }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "나가기", exact: true }).click();
  await dialog.getByRole("button", { name: "다시하기" }).click();
  await dialog.getByRole("button", { name: /^5단계 ·/ }).click();
  await expect(dialog.locator("video")).toHaveAttribute("src", /five\.mp4$/);
  await dialog.getByRole("button", { name: "건너뛰기" }).click();
  await expect(dialog).toHaveAccessibleName("두 그릇을 놓고");
  const resumed = await page.evaluate(readVillage);
  expect(resumed.world.resources).toEqual(checkpoint.state.world.resources);
  expect(resumed.world.citizens).toEqual(checkpoint.state.world.citizens);
});

test("도성 실패 화면에 무음 피습 장면이 열린다", async ({ page }) => {
  const village = createVillageGame();
  const capital = createCapital({
    ...village,
    campaign: { ...campaignOf(village), beat: "roads" },
  });
  const expired = commandTimber(
    {
      ...capital,
      elapsed:
        requireValue(capital.campaign, "capital.campaign").since + 36 * 60,
    },
    { type: "campaign", beat: "capital", action: "report" },
    "deadline",
  );
  expect(expired.campaign?.ending).toBe("collapse");
  await page.addInitScript((save) => {
    localStorage.setItem("dynosty.village.resume", JSON.stringify(save));
  }, createTimberSave(expired));
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  const scene = dialog.getByRole("img", { name: "궁궐 침전에서 피습당한 왕" });
  await expect(scene).toBeVisible();
  await expect(scene).toHaveAttribute(
    "src",
    "/story/campaign/king-palace-night-half-speed.gif",
  );
  await expect
    .poll(() => scene.evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await expect(dialog.locator("audio, video")).toHaveCount(0);
  await dialog.getByRole("button", { name: "다시 시작" }).click();
  await expect(dialog).toHaveAccessibleName("쥬신 왕의 어전 · 도성 남문");
  await expect(page.getByTestId("play-population")).toContainText("1000명");
});

for (const [choice, words] of [
  [
    "식량 12 · 난민까지 열 명과 함께 남하",
    "함께 온 아이들이 어느 솥 앞에 서야 할지 몰라요. 풀죽과 생선죽 솥에 다른 매듭을 달아 두면 어떨까요?",
  ],
  [
    "식량 6 · 현지에 남기고 의원 일행 네 명 호송",
    "길에 남은 집이 마음에 걸립니다. 길이 열리는 대로 빈 솥부터 돌려받으러 가겠다고 약속했어요.",
  ],
] as const) {
  test("4단계 도착 대사 · " + choice, async ({ page }) => {
    const village = createVillageGame();
    const save = createTimberSave({
      ...village,
      chapter: 3,
      campaign: { ...campaignOf(village), beat: "escort" },
    });
    await page.addInitScript(
      (value) =>
        localStorage.setItem("dynosty.village.resume", JSON.stringify(value)),
      save,
    );
    await page.goto("/");
    await readScene(page, choice);
    const arrival = page.getByRole("dialog", { name: "함께 견디는 보름 혹한" });
    await expect(arrival).toBeVisible();
    const next = arrival.getByRole("button", { name: /^다음 대사/ });
    await next.click();
    await next.click();
    const speech = arrival.locator(".campaign-speech");
    await expect(speech.locator("strong")).toHaveText("충녕");
    await expect(speech.locator("p")).toHaveText(words);
  });
}

test("출문 대화 중 실제 3D 장면에서 불길이 그려진다", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  // Start at the actual departure beat without replaying the prologue.
  const save = createTimberSave(
    commandTimber(
      createVillageGame(true),
      { type: "campaign", beat: "opening", action: "hard" },
      "visual-departure",
    ),
  );
  await page.addInitScript(
    (value) =>
      localStorage.setItem("dynosty.village.resume", JSON.stringify(value)),
    save,
  );
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAccessibleName("귀족들이 출문을 청했다");
  // The departure opens with its film; skip it to see the burning village.
  await dialog.getByRole("button", { name: "건너뛰기" }).click();
  await expect(page.getByTestId("play-scene-status")).toHaveText(
    "3D 준비 완료",
    { timeout: 60_000 },
  );
  const losses = requireValue(
    save.state.campaign?.openingLosses,
    "출문 피해 건물",
  );
  expect(losses.length).toBeGreaterThan(0);
  await expect
    .poll(() =>
      page.evaluate((ids) => {
        const { __scene } = window as unknown as {
          __scene: {
            particleSystems: { name: string; getActiveCount(): number }[];
          };
        };
        return ids.every((id) =>
          __scene.particleSystems.some(
            (system) =>
              system.name === "건물 화재-" + id && system.getActiveCount() > 0,
          ),
        );
      }, losses),
    )
    .toBe(true);
});

test("3D 관아 선택과 해제가 순라 패널에 반영된다", async ({ page }) => {
  const save = createTimberSave(createVillageGame(false, true));
  await page.addInitScript(
    (value) =>
      localStorage.setItem("dynosty.village.resume", JSON.stringify(value)),
    save,
  );
  await page.goto("/");
  await expect(page.getByTestId("play-scene-status")).toHaveText(
    "3D 준비 완료",
  );
  const commands = page.getByRole("button", { name: "명령 열기", exact: true });
  if (await commands.isVisible()) await commands.click();
  const office = page.getByRole("region", { name: "관아", exact: true });
  const selection = page.getByRole("region", {
    name: "선택 정보",
    exact: true,
  });
  const pickOffice = async (scroll = false) => {
    const point = await worldPoint(page, [0, 1.4, -16], scroll);
    await page.mouse.click(point.x, point.y);
    await expect(office).toBeVisible();
  };
  // The office panel only opens from a real canvas pick of the 3D office.
  await expect(office).toHaveCount(0);
  await pickOffice();
  await office.getByRole("button", { name: "1단계 · 4명" }).click();
  await expect(office).toContainText("순라 포졸 4명");
  await selection.getByRole("button", { name: "가까이 보기" }).click();
  await selection.getByRole("button", { name: "선택 해제" }).click();
  await expect(office).toHaveCount(0, { timeout: 5_000 });
  await pickOffice(true);
  await expect(office).toContainText("순라 포졸 4명");
});
