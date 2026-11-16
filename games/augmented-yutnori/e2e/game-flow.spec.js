import { expect, test } from "@playwright/test";

const pageErrors = new WeakMap();

test.beforeEach(async ({ page }) => {
  pageErrors.set(page, []);
  page.on("pageerror", (error) => pageErrors.get(page).push(error.message));
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("e2e-initialized")) {
      localStorage.clear();
      sessionStorage.setItem("e2e-initialized", "1");
    }
    Math.random = () => 0.42;
  });
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

async function resolveLocalInteraction(page) {
  for (let guard = 0; guard < 12 && await page.locator(".interaction-overlay").count(); guard += 1) {
    const button = page.locator(".interaction-overlay button:not([disabled])").first();
    await expect(button).toBeVisible();
    await button.click();
    await page.waitForTimeout(40);
  }
}

async function finishDraft(page) {
  for (let guard = 0; guard < 16 && await page.locator(".augment-draft").count(); guard += 1) {
    const cards = page.locator("[data-draft-augment]");
    const count = await cards.count();
    let index = 0;
    for (let candidate = 0; candidate < count; candidate += 1) {
      if (!(await cards.nth(candidate).innerText()).includes("획득 즉시")) { index = candidate; break; }
    }
    await cards.nth(index).click();
    await page.waitForTimeout(370);
    await resolveLocalInteraction(page);
  }
  await expect(page.locator(".augment-draft")).toHaveCount(0);
}

async function startGame(page, players = 2) {
  await page.goto("/");
  await page.getByRole("button", { name: "오프라인 플레이" }).click();
  await page.locator(`input[name="playerCount"][value="${players}"]`).check();
  await page.locator('input[name="animationSpeed"]').fill("1.8");
  await page.getByRole("button", { name: "순서를 섞고 게임 시작" }).click();
  await finishDraft(page);
  await expect(page.locator(".game-screen")).toBeVisible();
}

test("starts, selects augments, throws, moves, reloads, and resumes the save", async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => { window.__YUT_APP__.game.currentPlayer.pendingThrowOverride = "도"; });
  await page.locator('[data-action="throw"]').click();
  await expect(page.locator(".yut-tray")).toHaveClass(/is-throwing/);
  await expect(page.locator(".log-panel")).toHaveCount(0);
  await page.locator(".player-card.current [data-direct-piece]").first().click();
  await expect.poll(() => page.evaluate(() => window.__YUT_APP__.game.currentPlayer.pieces.filter((piece) => piece.node === "WAIT").length)).toBe(3);
  const savedNode = await page.evaluate(() => window.__YUT_APP__.game.currentPlayer.pieces[0].node);
  await page.reload();
  await page.getByRole("button", { name: "이어하기" }).click();
  await expect.poll(() => page.evaluate(() => window.__YUT_APP__.game.currentPlayer.pieces[0].node)).toBe(savedNode);
});

test("lays out four offline player fields horizontally on desktop", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "오프라인 플레이" }).click();
  await page.locator('input[name="playerCount"][value="4"]').check();
  const fields = page.locator(".player-name-field");
  await expect(fields).toHaveCount(4);
  const boxes = await fields.evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect();
    return { x: box.x, y: box.y };
  }));
  expect(new Set(boxes.map((box) => Math.round(box.y))).size).toBe(1);
  expect(boxes.map((box) => box.x)).toEqual([...boxes.map((box) => box.x)].sort((a, b) => a - b));
});

test("asks whether to stack or stay separate and captures both separate groups", async ({ page }) => {
  await startGame(page, 2);
  await page.evaluate(() => {
    const app = window.__YUT_APP__;
    const player = app.game.currentPlayer;
    player.pieces[0].node = "R1";
    player.pieces[1].node = "R2";
    app.game.turn.throwsRemaining = 0;
    app.game.turn.results = [{ id: `e2e-${++app.game.resultSequence}`, label: "도", steps: 1, extra: false, isNak: false, sticks: [] }];
    app.renderGame();
  });
  await page.locator(".result-chip").click();
  await page.locator('[data-piece$="-m1"]:not([disabled])').click();
  await page.locator(".route-choice").click();
  await expect(page.locator(".stack-choice-card")).toBeVisible();
  await page.getByRole("button", { name: /따로 두기/ }).click();
  await expect.poll(() => page.evaluate(() => {
    const pieces = window.__YUT_APP__.game.currentPlayer.pieces.slice(0, 2);
    return pieces[0].node === "R2" && pieces[1].node === "R2" && pieces[0].stackId !== pieces[1].stackId;
  })).toBe(true);
  await expect(page.locator(".event-announcement")).toContainText("따로 두기");
});

test("completes a two-player match through the final UI move", async ({ page }) => {
  await startGame(page, 2);
  await page.evaluate(() => {
    const app = window.__YUT_APP__;
    const player = app.game.currentPlayer;
    player.pieces.slice(0, 3).forEach((piece) => { piece.node = "HOME"; });
    player.pieces[3].node = "B4";
    player.pieces[3].route = "outer";
    app.game.turn.throwsRemaining = 0;
    app.game.turn.results = [{ id: `e2e-${++app.game.resultSequence}`, label: "도", steps: 1, extra: false, isNak: false, sticks: [] }];
    app.renderGame();
  });
  await page.locator(".result-chip").click();
  await page.locator(".piece-choice:not([disabled])").click();
  await page.locator(".route-choice").click();
  await expect(page.locator(".victory-card")).toBeVisible();
  await expect(page.locator(".victory-card")).toContainText("승리");
});

test("starts a four-player game with four responsive player panels", async ({ page }) => {
  await startGame(page, 4);
  await expect(page.locator("[data-player-card]")).toHaveCount(4);
  await expect(page.locator(".player-card.current")).toHaveCount(1);
  await expect(page.locator(".turn-title")).toContainText("차례");
});

test("runs augment drafts at rounds 1, 6, and 12 through the card UI", async ({ page }) => {
  await startGame(page, 2);
  for (const round of [6, 12]) {
    await page.evaluate((value) => {
      const app = window.__YUT_APP__;
      app.game.round = value;
      app.game.augments.startDraft(value);
      app.renderGame();
    }, round);
    await expect(page.locator(".augment-draft")).toContainText(`ROUND ${round}`);
    if (round === 6) await expect(page.locator(".augment-card-grid")).not.toContainText("시작 전용");
    if (round === 12) await expect(page.locator(".augment-card-grid")).not.toContainText("중간 전용");
    await finishDraft(page);
  }
});

test("uses a manual augment with target selection and shows its detail", async ({ page }) => {
  await startGame(page, 2);
  await page.evaluate(() => {
    const app = window.__YUT_APP__;
    const player = app.game.currentPlayer;
    player.pieces[0].node = "R1";
    if (!player.augments.some((augment) => augment.id === "celestial_shield")) player.augments.push({ id: "celestial_shield", usesRemaining: 1, active: true, acquiredRound: app.game.round });
    app.renderGame();
  });
  await page.locator('.player-card.current [data-owned-detail="celestial_shield"]').click();
  await expect(page.locator(".augment-detail-card")).toContainText("천상의 보호막");
  await page.locator("[data-detail-close]").click();
  await page.locator('[data-augment="celestial_shield"]').first().click();
  await expect(page.locator(".ability-modal")).toBeVisible();
  await page.locator("[data-ability-piece]").first().click();
  await expect.poll(() => page.evaluate(() => window.__YUT_APP__.game.currentPlayer.pieces[0].effects.some((effect) => effect.type === "shield"))).toBe(true);
});

test("previews and chooses a top-right branch path", async ({ page }) => {
  await startGame(page, 2);
  const canvasBox = await page.locator("#yut-board").boundingBox();
  await page.locator("#yut-board").hover({ position: { x: canvasBox.width / 2, y: canvasBox.height / 2 } });
  await expect(page.locator(".board-tooltip")).toHaveClass(/visible/);
  await expect(page.locator(".board-tooltip")).toContainText("중앙");
  await page.evaluate(() => {
    const app = window.__YUT_APP__;
    app.game.currentPlayer.pieces[0].node = "TR";
    app.game.currentPlayer.pieces[0].route = "outer";
    app.game.turn.throwsRemaining = 0;
    app.game.turn.results = [{ id: `e2e-${++app.game.resultSequence}`, label: "도", steps: 1, extra: false, isNak: false, sticks: [] }];
    app.renderGame();
  });
  await page.locator(".result-chip").click();
  await page.locator(".piece-choice:not([disabled])").first().click();
  await expect(page.locator(".route-choice")).toHaveCount(2);
  await page.locator(".route-choice").first().click();
  await expect.poll(() => page.evaluate(() => window.__YUT_APP__.game.currentPlayer.pieces[0].node)).toBe("DTR2");
});

test("handles player elimination and victory presentation", async ({ page }) => {
  await startGame(page, 3);
  await page.evaluate(() => {
    const app = window.__YUT_APP__;
    const [survivor, second, third] = app.game.players;
    app.game.eliminatePlayer(third, "E2E 탈락");
    app.game.eliminatePlayer(second, "E2E 탈락");
    if (app.game.status === "playing") app.game.declareVictory(survivor, "E2E 승리");
    app.renderGame();
  });
  await expect(page.locator(".victory-card")).toBeVisible();
  await expect(page.locator(".ranking-list li")).toHaveCount(3);
  await expect(page.locator(".elimination-cross")).toHaveCount(2);
});

test("supports mobile touch layout and collapsible player information", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startGame(page, 2);
  const board = await page.locator("#yut-board").boundingBox();
  expect(board.width).toBeLessThanOrEqual(390);
  const toggle = page.locator("[data-player-toggle]").last();
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator("[data-player-card]").last()).toHaveClass(/expanded/);
  const throwButton = await page.locator('[data-action="throw"]').boundingBox();
  expect(throwButton.height).toBeGreaterThanOrEqual(44);
});

test("prevents duplicate throw input while the result animation is running", async ({ page }) => {
  await startGame(page, 2);
  await page.evaluate(() => {
    const app = window.__YUT_APP__;
    app.game.currentPlayer.pendingThrowOverride = "도";
    const button = document.querySelector('[data-action="throw"]');
    button.click();
    button.click();
  });
  await expect(page.locator(".yut-tray")).toHaveClass(/is-throwing/);
  await expect(page.locator('[data-action="throw"]')).toBeDisabled();
  await expect.poll(() => page.evaluate(() => window.__YUT_APP__.game.turn.results.length)).toBe(1);
});

test("searches and filters all 87 augments in the codex", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "증강 도감" }).click();
  await expect(page.locator(".codex-grid article")).toHaveCount(87);
  await page.locator("[data-codex-search]").fill("중전마마");
  await expect(page.locator("[data-codex-item]:visible")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "시작 변환: 중전마마" })).toBeVisible();
  await page.locator("[data-codex-search]").fill("");
  await page.locator("[data-codex-filter]").selectOption("finish");
  await expect(page.locator("[data-codex-item]:visible")).toHaveCount(8);
  await expect(page.locator("[data-codex-visible]")).toHaveText("8");
});

test("captures the renewed desktop and mobile game screens", async ({ page }) => {
  await startGame(page, 4);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await page.screenshot({ path: "test-results/phase4-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await page.screenshot({ path: "test-results/phase4-mobile.png", fullPage: true });
  await expect(page.locator("#yut-board")).toBeVisible();
});
