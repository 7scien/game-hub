import { expect, test } from "@playwright/test";

test("Game Hub 카드에서 증강 윷놀이를 열고 허브로 돌아간다", async ({ page }) => {
  await page.goto("/");
  const card = page.locator('a[href="./games/augmented-yutnori/"]');
  await expect(card).toContainText("증강 윷놀이");
  await expect(card).toContainText("87가지 증강으로 즐기는 특별한 윷놀이");
  await expect(card).toContainText("2–4명");
  await expect(card).toContainText("오프라인 · 온라인");

  await card.click();
  await expect(page).toHaveURL(/\/games\/augmented-yutnori\/$/u);
  await expect(page.getByRole("heading", { name: "증강 윷놀이" })).toBeVisible();
  await expect(page.getByText("범용 57개 + 전용 30개 · 전체 87개 구현")).toBeVisible();
  await expect(page.getByRole("button", { name: "오프라인 플레이" })).toBeVisible();
  await expect(page.getByRole("button", { name: "온라인 플레이" })).toBeVisible();

  const home = page.locator("#game-hub-home");
  await expect(home).toBeVisible();
  await home.click();
  await expect(page).toHaveURL(/\/$/u);
  await expect(page.getByRole("heading", { name: /오늘은 어떤 게임/u })).toBeVisible();
});

test("기존 게임 카드와 모바일 증강 윷놀이 진입이 유지된다", async ({ browser, request }) => {
  for (const slug of ["world-tycoon", "forest-party", "forest-party-3d"]) {
    const response = await request.get(`/games/${slug}/`);
    expect(response.ok()).toBeTruthy();
  }

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  try {
    await page.goto("/");
    const card = page.locator('a[href="./games/augmented-yutnori/"]');
    await card.scrollIntoViewIfNeeded();
    await card.tap();
    await expect(page.getByRole("button", { name: "오프라인 플레이" })).toBeVisible();
    await page.getByRole("button", { name: "오프라인 플레이" }).tap();
    await expect(page.getByRole("heading", { name: "오늘의 판을 꾸려볼까요?" })).toBeVisible();
  } finally {
    await context.close();
  }
});
