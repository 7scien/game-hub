import { expect, test } from "@playwright/test";

async function openOnline(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "온라인 플레이" }).click();
  await expect(page.locator(".beta-hosting-notice").first()).toContainText("Render Free");
}

async function createRoom(page, name, maxPlayers = 2) {
  await openOnline(page);
  const form = page.locator("#online-create-form");
  await form.locator('[name="name"]').fill(name);
  await form.locator('[name="maxPlayers"]').selectOption(String(maxPlayers));
  await form.getByRole("button", { name: "방 만들기" }).click();
  const code = (await page.locator(".room-code-panel strong").textContent()).trim();
  expect(code).toMatch(/^\d{6}$/);
  return code;
}

async function joinRoom(page, code, name, password = "") {
  await openOnline(page);
  const form = page.locator("#online-join-form");
  await form.locator('[name="name"]').fill(name);
  await form.locator('[name="code"]').fill(code);
  if (password) await form.locator('[name="password"]').fill(password);
  await form.getByRole("button", { name: "코드로 참가" }).click();
  await expect(page.locator(".room-code-panel strong")).toHaveText(code);
}

async function chooseDraftCards(pages) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let acted = false;
    for (const page of pages) {
      const cards = page.locator(".augment-card:visible");
      if (await cards.count()) {
        await cards.first().click();
        acted = true;
      }
    }
    if (!acted) break;
    await pages[0].waitForTimeout(450);
  }
}

async function resolveOnlineInteractions(pages) {
  const choices = ["[data-start-transform]", "[data-freeze-player]", "[data-ranking-player]", "[data-fold]", "[data-give-piece]", "[data-color-guess]", "[data-vote-player]", "[data-catalog-pick]", "[data-ride-action]", "[data-bluff-judge]", "[data-prisoner]"];
  for (let attempt = 0; attempt < 16; attempt += 1) {
    let acted = false;
    for (const page of pages) {
      const button = page.locator(choices.map((selector) => `${selector}:visible`).join(", ")).first();
      if (await button.count()) {
        await button.click();
        acted = true;
        break;
      }
    }
    if (!acted) return;
    await pages[0].waitForTimeout(120);
  }
}

async function clickBoardNode(page, node) {
  const board = page.locator("#yut-board");
  const position = await page.evaluate((targetNode) => {
    const app = window.__YUT_APP__;
    const canvas = document.querySelector("#yut-board");
    const rect = canvas.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height);
    const [x, y] = app.board.mapPoint(targetNode, size);
    return { x: (rect.width - size) / 2 + x, y: (rect.height - size) / 2 + y };
  }, node);
  await board.click({ position });
}

test("두 브라우저 컨텍스트가 방 생성·동기화·재접속을 수행한다", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  try {
    const code = await createRoom(host, "호스트", 2);
    await joinRoom(guest, code, "게스트");
    await expect(host.locator(".lobby-player")).toHaveCount(2);
    await host.getByRole("button", { name: "준비 완료" }).click();
    await guest.getByRole("button", { name: "준비 완료" }).click();
    await expect(host.locator("[data-start-online]")).toBeEnabled();
    await host.locator("[data-start-online]").click();

    await expect(host.locator(".augment-draft")).toBeVisible();
    await expect(guest.locator(".augment-draft")).toBeVisible();
    const hostChoices = await host.locator(".augment-card h3").allTextContents();
    const guestChoices = await guest.locator(".augment-card h3").allTextContents();
    expect(hostChoices).toHaveLength(3);
    expect(guestChoices).toHaveLength(3);
    await chooseDraftCards([host, guest]);
    await resolveOnlineInteractions([host, guest]);
    await expect(host.locator(".game-screen")).toBeVisible();
    await expect(guest.locator(".game-screen")).toBeVisible();

    const pages = [host, guest];
    const actor = (await host.locator('[data-action="throw"]:not([disabled]), [data-throw-label]:not([disabled])').count()) ? host : guest;
    const throwButton = actor.locator('[data-action="throw"]:not([disabled]), [data-throw-label]:not([disabled])').first();
    await throwButton.click();
    await expect.poll(async () => (await pages[0].locator(".yut-result-label").textContent()).trim()).not.toBe("준비");
    const hostResult = (await host.locator(".yut-result-label").textContent()).trim();
    await expect(guest.locator(".yut-result-label")).toHaveText(hostResult);

    await guest.reload();
    await guest.getByRole("button", { name: "온라인 플레이" }).click();
    await guest.getByRole("button", { name: "이전 온라인 게임 재접속" }).click();
    await expect(guest.locator(".online-game-badge")).toContainText(code);
    await expect(guest.locator(".yut-result-label")).toHaveText(hostResult);

    const replacement = await guestContext.newPage();
    await replacement.goto("/");
    await replacement.getByRole("button", { name: "온라인 플레이" }).click();
    await replacement.getByRole("button", { name: "이전 온라인 게임 재접속" }).click();
    await expect(replacement.locator(".online-game-badge")).toContainText(code);
    await expect(guest.locator(".online-home-screen")).toBeVisible();

    await guestContext.setOffline(true);
    await expect(replacement.locator(".network-warning")).toBeVisible();
    await guestContext.setOffline(false);
    await expect(replacement.locator(".online-game-badge.connected")).toBeVisible({ timeout: 30_000 });
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});

test("비밀번호와 방장 승인, 참가자 강퇴를 실제 대기실에서 처리한다", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  try {
    await openOnline(host);
    const createForm = host.locator("#online-create-form");
    await createForm.locator('[name="name"]').fill("보안 방장");
    await createForm.locator('[name="maxPlayers"]').selectOption("2");
    await createForm.getByText("비밀번호 사용").click();
    await createForm.getByText("방장 참가 승인").click();
    await expect(createForm.locator('[name="passwordRequired"]')).toBeChecked();
    await expect(createForm.locator('[name="approvalRequired"]')).toBeChecked();
    await createForm.locator('[name="password"]').fill("safe-room");
    await createForm.getByRole("button", { name: "방 만들기" }).click();
    const code = (await host.locator(".room-code-panel strong").textContent()).trim();

    await openOnline(guest);
    let joinForm = guest.locator("#online-join-form");
    await joinForm.locator('[name="name"]').fill("승인 친구");
    await joinForm.locator('[name="code"]').fill(code);
    await joinForm.locator('[name="password"]').fill("wrong-room");
    await joinForm.getByRole("button", { name: "코드로 참가" }).click();
    await expect(guest.locator(".online-form-message")).toContainText("비밀번호");

    joinForm = guest.locator("#online-join-form");
    await joinForm.locator('[name="name"]').fill("승인 친구");
    await joinForm.locator('[name="code"]').fill(code);
    await joinForm.locator('[name="password"]').fill("safe-room");
    await joinForm.getByRole("button", { name: "코드로 참가" }).click();
    await expect(guest.locator(".approval-wait-card")).toBeVisible();
    await expect(host.locator(".join-request-list")).toContainText("승인 친구");
    await host.locator("[data-approve-request]").click();
    await expect(guest.locator(".online-lobby-screen")).toBeVisible();
    await expect(host.locator(".lobby-player")).toHaveCount(2);

    host.once("dialog", (dialog) => dialog.accept());
    await host.locator("[data-kick-player]").click();
    await expect(host.locator(".lobby-player")).toHaveCount(1);
    await expect(guest.locator(".online-home-screen")).toBeVisible();
    await expect(guest.locator(".online-form-message")).toContainText("내보냈습니다");
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});

test("네 브라우저 컨텍스트가 한 대기실에서 준비하고 시작한다", async ({ browser }) => {
  const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext()));
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  try {
    const code = await createRoom(pages[0], "P1", 4);
    await Promise.all(pages.slice(1).map((page, index) => joinRoom(page, code, `P${index + 2}`)));
    await expect(pages[0].locator(".lobby-player")).toHaveCount(4);
    for (const page of pages) await page.getByRole("button", { name: "준비 완료" }).click();
    await expect(pages[0].locator("[data-start-online]")).toBeEnabled();
    await pages[0].locator("[data-start-online]").click();
    for (const page of pages) {
      await expect(page.locator(".augment-card-grid")).toBeVisible();
      await expect(page.locator(".augment-card")).toHaveCount(3);
    }
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test("네 브라우저에서 1·6·12라운드 개인 증강 선택을 동기화한다", async ({ browser }) => {
  const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext()));
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  try {
    const code = await createRoom(pages[0], "D1", 4);
    await Promise.all(pages.slice(1).map((page, index) => joinRoom(page, code, `D${index + 2}`)));
    for (const page of pages) await page.getByRole("button", { name: "준비 완료" }).click();
    await pages[0].locator("[data-start-online]").click();
    for (const round of [1, 6, 12]) {
      if (round !== 1) {
        const response = await pages[0].evaluate((nextRound) => new Promise((resolve) => {
          window.__YUT_APP__.onlineClient.socket.emit("test:set-draft-round", { round: nextRound }, resolve);
        }), round);
        expect(response.ok).toBe(true);
      }
      for (const page of pages) {
        await expect(page.locator(".augment-card-grid")).toBeVisible();
        await expect(page.locator(".augment-card")).toHaveCount(3);
      }
      await chooseDraftCards(pages);
      await resolveOnlineInteractions(pages);
      for (const page of pages) await expect(page.locator(".augment-draft")).toHaveCount(0);
    }
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test("두 브라우저가 서버 판정만으로 게임 시작부터 승리 화면까지 진행한다", async ({ browser }) => {
  test.setTimeout(90_000);
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  try {
    const code = await createRoom(host, "완주 방장", 2);
    await joinRoom(guest, code, "완주 친구");
    await host.getByRole("button", { name: "준비 완료" }).click();
    await guest.getByRole("button", { name: "준비 완료" }).click();
    await host.locator("[data-start-online]").click();
    await chooseDraftCards([host, guest]);
    await resolveOnlineInteractions([host, guest]);

    for (let action = 0; action < 24; action += 1) {
      await expect.poll(async () => (
        await host.locator(".victory-card").count()
        + await guest.locator(".victory-card").count()
        + await host.locator('[data-action="throw"]:not([disabled])').count()
        + await guest.locator('[data-action="throw"]:not([disabled])').count()
      )).toBeGreaterThan(0);
      if (await host.locator(".victory-card").count()) break;
      const actor = await host.locator('[data-action="throw"]:not([disabled])').count() ? host : guest;
      await actor.locator('[data-action="throw"]:not([disabled])').click();
      await expect(actor.locator(".result-chip").first()).toBeVisible();
      await expect.poll(() => actor.evaluate(() => {
        const app = window.__YUT_APP__;
        if (app.locked) return null;
        const selectable = app.selectablePieceIds();
        const owner = app.game.players.find((player) => player.pieces.some((piece) => selectable.has(piece.id)));
        const piece = owner?.pieces.find((candidate) => selectable.has(candidate.id));
        const target = piece ? app.moveCandidatesForPiece(piece, owner)[0] : null;
        return piece && target ? { pieceId: piece.id, node: piece.node, target: target.displayTarget } : null;
      })).not.toBeNull();
      const selectedMove = await actor.evaluate(() => {
        const app = window.__YUT_APP__;
        const selectable = app.selectablePieceIds();
        const owner = app.game.players.find((player) => player.pieces.some((piece) => selectable.has(piece.id)));
        const piece = owner.pieces.find((candidate) => selectable.has(candidate.id));
        const target = app.moveCandidatesForPiece(piece, owner)[0];
        return { pieceId: piece.id, node: piece.node, target: target.displayTarget };
      });
      if (selectedMove.node === "WAIT") await actor.locator(`[data-direct-piece="${selectedMove.pieceId}"]`).click();
      else await clickBoardNode(actor, selectedMove.node);
      await clickBoardNode(actor, selectedMove.target);
      if (await actor.locator(".stack-choice-card").count()) await actor.locator('[data-stack-choice="stack"]').click();
      await expect.poll(() => actor.evaluate(() => window.__YUT_APP__.selectedPieceId)).toBeNull();
    }
    await expect(host.locator(".victory-card")).toBeVisible();
    await expect(guest.locator(".victory-card")).toBeVisible();
    await expect(host.locator(".victory-card")).toContainText("승리");
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});

test("모바일 터치 컨텍스트가 데스크톱 방에 참가해 준비한다", async ({ browser }) => {
  const desktopContext = await browser.newContext();
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const desktop = await desktopContext.newPage();
  const mobile = await mobileContext.newPage();
  try {
    const code = await createRoom(desktop, "PC 방장", 2);
    await joinRoom(mobile, code, "모바일 친구");
    const readyButton = mobile.locator("[data-ready]");
    await expect(readyButton).toBeVisible();
    expect((await readyButton.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await desktop.getByRole("button", { name: "준비 완료" }).click();
    await readyButton.tap();
    await expect(desktop.locator("[data-start-online]")).toBeEnabled();
  } finally {
    await desktopContext.close();
    await mobileContext.close();
  }
});
