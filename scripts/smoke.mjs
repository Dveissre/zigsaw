import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const browserPath =
  process.env.CHROME_PATH ??
  "C:/Program Files/Google/Chrome/Application/chrome.exe";
const targetUrl = process.env.APP_URL ?? "http://127.0.0.1:5173/";
const symData = JSON.parse(
  readFileSync("public/data/char_sym.json", "utf8"),
);
const schoolData = JSON.parse(
  readFileSync("public/data/char-school.json", "utf8"),
);

const questionsByParts = new Map();
for (const [char, ways] of Object.entries(symData.chars)) {
  for (const way of ways) {
    const names = way.map(
      (symbolId) => symData.symbols[String(symbolId)],
    );
    const key = [...names]
      .sort()
      .join("\u0001");
    const chars = questionsByParts.get(key) ?? [];
    chars.push(char);
    questionsByParts.set(key, chars);
  }
}

const browser = await chromium.launch({
  executablePath: browserPath,
  headless: true,
});

try {
  const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const readDisplayedParts = () =>
    page.locator(".part").evaluateAll((parts) =>
      parts.map((part) => {
        const text = part.textContent?.trim();
        return text || part.querySelector("[role='img']")?.getAttribute("aria-label") || "";
      }),
    );

  await page.goto(targetUrl, { waitUntil: "networkidle" });
  await page.locator(".start-button:not([disabled])").waitFor();
  await page.waitForFunction(
    () =>
      Boolean(
        document
          .querySelector(".page-start")
          ?.style.getPropertyValue("--start-drop"),
      ),
  );
  assert.equal(await page.title(), "ZIGSAW");
  const startPosition = await page.evaluate(() => {
    const masthead = document
      .querySelector(".masthead")
      ?.getBoundingClientRect();
    const form = document
      .querySelector(".settings-form")
      ?.getBoundingClientRect();
    return {
      drop: Number.parseFloat(
        getComputedStyle(document.querySelector(".page-start"))
          .getPropertyValue("--start-drop"),
      ),
      centerRatio:
        masthead && form
          ? (masthead.top + form.bottom) / 2 / innerHeight
          : -1,
    };
  });
  assert.ok(startPosition.drop > 40);
  assert.ok(startPosition.centerRatio >= 0.39);
  assert.ok(startPosition.centerRatio <= 0.5);
  const tutorialTrigger = page.getByRole("button", { name: "游玩方法" });
  const tutorialPosition = await tutorialTrigger.evaluate((button) => {
    const box = button.getBoundingClientRect();
    const shell = button.closest(".app-shell")?.getBoundingClientRect();
    const actions = button
      .closest(".corner-actions")
      ?.getBoundingClientRect();
    return {
      topInset: shell ? box.top - shell.top : -1,
      rightInset: shell ? shell.right - box.right : -1,
      actionsRightInset:
        shell && actions ? shell.right - actions.right : -1,
    };
  });
  assert.ok(tutorialPosition.topInset >= 10);
  const expectedTutorialRightInset = await tutorialTrigger.evaluate(
    (button) => {
      const shell = button.closest(".app-shell");
      return shell
        ? Math.max(18, (shell.getBoundingClientRect().width - 620) / 2)
        : 18;
    },
  );
  assert.ok(
    Math.abs(
      tutorialPosition.actionsRightInset - expectedTutorialRightInset,
    ) <= 1,
  );
  assert.ok(tutorialPosition.rightInset > expectedTutorialRightInset);
  assert.equal((await tutorialTrigger.textContent())?.trim(), "");
  assert.equal(
    await tutorialTrigger.locator("svg circle").count(),
    1,
  );
  await tutorialTrigger.click();
  await page.locator("#tutorial-dialog[open]").waitFor();
  assert.equal(
    await page.getByRole("heading", { name: "游玩方法", exact: true }).count(),
    1,
  );
  const tutorialTitle = page.locator(".tutorial-title-button");
  await tutorialTitle.click();
  await page.waitForTimeout(700);
  assert.equal(
    await tutorialTitle.getAttribute("class"),
    "tutorial-title-button is-easter-egg-active",
  );
  assert.match(
    await page.locator(".tutorial-title-dye").evaluate(
      (dye) => getComputedStyle(dye).backgroundImage,
    ),
    /linear-gradient.*rgb\(128, 0, 128\).*rgb\(244, 142, 0\)/,
  );
  assert.equal(
    await page.locator(".tutorial-title-label").evaluate(
      (label) => getComputedStyle(label).clipPath,
    ),
    "inset(0px 0px 0px 100%)",
  );
  const titleGlyphAlignment = await page.evaluate(() => {
    const label = document
      .querySelector(".tutorial-title-label")
      ?.getBoundingClientRect();
    const dye = document
      .querySelector(".tutorial-title-dye")
      ?.getBoundingClientRect();
    return label && dye
      ? {
          left: Math.abs(label.left - dye.left),
          top: Math.abs(label.top - dye.top),
        }
      : { left: Infinity, top: Infinity };
  });
  assert.ok(titleGlyphAlignment.left <= 0.5);
  assert.ok(titleGlyphAlignment.top <= 0.5);
  await page.waitForTimeout(180);
  assert.equal(
    await tutorialTitle.getAttribute("class"),
    "tutorial-title-button is-easter-egg-active",
  );
  assert.equal(
    await page.locator(".tutorial-title-dye").evaluate(
      (element) => getComputedStyle(element).opacity,
    ),
    "1",
  );
  await page.evaluate(() => {
    window.__openedTutorialUrl = "";
    window.open = (url) => {
      window.__openedTutorialUrl = String(url);
      return null;
    };
  });
  await tutorialTitle.click();
  await page.waitForTimeout(600);
  assert.equal(
    await tutorialTitle.getAttribute("class"),
    "tutorial-title-button is-easter-egg-active is-sweep-active",
  );
  assert.match(
    await page.locator(".tutorial-title-reveal").innerText(),
    /BY\s+背面８回宙返り/,
  );
  await page.mouse.move(8, 8);
  await page.waitForTimeout(50);
  assert.equal(
    await tutorialTitle.getAttribute("class"),
    "tutorial-title-button is-easter-egg-active",
  );
  assert.equal(
    await page.locator(".tutorial-title-label").evaluate(
      (element) => getComputedStyle(element).clipPath,
    ),
    "inset(0px 0px 0px 100%)",
  );
  await page.waitForTimeout(550);
  assert.equal(
    await page.locator(".tutorial-title-reveal").evaluate(
      (element) => getComputedStyle(element).opacity,
    ),
    "0",
  );
  await tutorialTitle.hover();
  await page.waitForTimeout(600);
  assert.equal(
    await tutorialTitle.getAttribute("class"),
    "tutorial-title-button is-easter-egg-active is-sweep-active",
  );
  await tutorialTitle.dispatchEvent("pointerleave", {
    pointerType: "touch",
  });
  await page.waitForTimeout(100);
  assert.match(
    await tutorialTitle.getAttribute("class"),
    /is-sweep-active/,
  );
  await tutorialTitle.click();
  assert.equal(
    await page.evaluate(() => window.__openedTutorialUrl),
    "https://www.bilibili.com/video/BV1WqQVY2Euv/",
  );
  assert.deepEqual(
    await page.locator(".tutorial-part").allTextContents(),
    ["寸", "木", "又"],
  );
  const tutorialPartDot = await page
    .locator(".tutorial-part")
    .first()
    .evaluate((part) => {
      const dot = getComputedStyle(part, "::after");
      return {
        content: dot.content,
        color: dot.backgroundColor,
      };
    });
  assert.notEqual(tutorialPartDot.content, "none");
  assert.equal(tutorialPartDot.color, "rgb(161, 55, 48)");
  assert.equal(await page.locator(".tutorial-stage-card").count(), 3);
  assert.equal(await page.locator(".tutorial-mode-card").count(), 2);
  const tutorialText = await page.locator("#tutorial-dialog").innerText();
  for (const text of [
    "在倒计时耗尽前，将部件重组成正确的汉字！",
    "有些部件的不同形态会归于一类",
    "部件的归类与拆分方式包含大量主观意见，如有错讹请联系作者",
    "在渐进的难度曲线下一路向前突进！",
    "每个阶段共5题，各阶段所取的通规字表区间会逐步后移。",
    "到达字表末端后，将进入阶段EX……会有什么呢？",
    "阶段EX可在设置页关闭",
    "自由 / 无尽模式",
    "有更多可调整设置，适合对全字表进行练习。",
    "但是超时仍然会结束游戏，尽可能多地答对吧！",
    "Created by fukurei",
  ]) {
    assert.ok(tutorialText.includes(text), text);
  }
  assert.equal(
    await page.locator(".tutorial-disclaimer").first().innerText(),
    "部件的归类与拆分方式包含大量主观意见，如有错讹请联系作者",
  );
  assert.equal(
    await page.locator(".tutorial-ex-name").evaluate(
      (element) => {
        const style = getComputedStyle(element);
        return `${style.fontWeight}|${style.color}`;
      },
    ),
    "700|rgb(112, 74, 134)",
  );
  const tutorialReturn = page
    .locator("#tutorial-dialog")
    .getByRole("button", { name: "返回", exact: true });
  await tutorialReturn.waitFor();
  await tutorialReturn.click();
  assert.equal(
    await page.locator("#tutorial-dialog").evaluate(
      (dialog) => dialog.classList.contains("is-closing"),
    ),
    true,
  );
  await page
    .locator("#tutorial-dialog")
    .waitFor({ state: "hidden" });
  const atlasTrigger = page.getByRole("link", { name: "图鉴" });
  assert.equal(
    await atlasTrigger.locator("svg circle").count(),
    0,
  );
  assert.equal(await atlasTrigger.locator("svg path").count(), 3);
  assert.ok(
    (await atlasTrigger.boundingBox()).x >
      (await tutorialTrigger.boundingBox()).x,
  );
  await atlasTrigger.click();
  await page.waitForURL(/\/atlas\/$/);
  await page.waitForLoadState("networkidle");
  assert.equal(await page.title(), "ZIGSAW · 图鉴");
  assert.equal(await page.locator(".atlas-page-heading h1").innerText(), "图鉴");
  assert.equal(
    await page.locator(".atlas-page-placeholder").innerText(),
    "施工中",
  );
  await page.getByRole("link", { name: "返回", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/atlas/"));
  await page.locator(".start-button:not([disabled])").waitFor();
  assert.equal(await page.getByText("把部件拼回一个字").count(), 0);
  assert.equal(await page.getByText("打乱顺序后，在倒计时内输入对应的汉字。").count(), 0);
  assert.equal(
    await page.getByRole("button", { name: "挑战", exact: true }).getAttribute(
      "aria-pressed",
    ),
    "true",
  );
  assert.equal(
    await page.locator("[data-start-record]").innerText(),
    "纪录：0",
  );
  assert.ok(
    Number.parseFloat(
      await page.locator("[data-start-record]").evaluate(
        (element) => getComputedStyle(element).fontSize,
      ),
    ) >= 15,
  );
  assert.ok(
    Number.parseFloat(
      await page.locator(".setting-label").first().evaluate(
        (element) => getComputedStyle(element).fontSize,
      ),
    ) >= 18,
  );
  const modeAlignment = await page.locator(".mode-switch").evaluate((control) => {
      const controlBox = control.getBoundingClientRect();
      const row = control.closest(".setting-block");
      const rowBox = row?.getBoundingClientRect();
      return {
        control: controlBox.left + controlBox.width / 2,
        row: rowBox ? rowBox.left + rowBox.width / 2 : -1,
        left: controlBox.left,
      };
  });
  const exAlignment = await page.locator(".ex-toggle").evaluate((control) => {
    const box = control.getBoundingClientRect();
    return {
      center: box.left + box.width / 2,
      left: box.left,
    };
  });
  assert.ok(Math.abs(modeAlignment.control - modeAlignment.row) <= 1);
  assert.ok(exAlignment.center < modeAlignment.row);
  assert.ok(Math.abs(exAlignment.left - modeAlignment.left) <= 1);
  const challengeDecor = page.locator(".challenge-card-decor");
  assert.equal(await challengeDecor.isVisible(), true);
  assert.equal(
    await challengeDecor.locator(".challenge-decor-card").count(),
    3,
  );
  const challengeDecorLayout = await challengeDecor.evaluate((decor) => {
    const decorBox = decor.getBoundingClientRect();
    const rows = [
      ...document.querySelectorAll(".setting-block"),
    ].filter(
      (element) =>
        !element.hidden &&
        element.getBoundingClientRect().height > 0,
    );
    const lastSetting = rows.at(-1)?.getBoundingClientRect();
    const startRow = document
      .querySelector(".start-row")
      ?.getBoundingClientRect();
    return {
      decorTop: decorBox.top,
      decorBottom: decorBox.bottom,
      lastSettingBottom: lastSetting?.bottom ?? -1,
      startRowTop: startRow?.top ?? -1,
      shadow: getComputedStyle(
        decor.querySelector(".challenge-decor-card"),
      ).boxShadow,
    };
  });
  assert.ok(
    challengeDecorLayout.decorTop >=
      challengeDecorLayout.lastSettingBottom,
  );
  assert.ok(
    challengeDecorLayout.decorBottom <=
      challengeDecorLayout.startRowTop,
  );
  assert.equal(challengeDecorLayout.shadow, "none");
  assert.equal(
    await page.getByText("每题秒数", { exact: true }).isVisible(),
    false,
  );
  assert.equal(
    await page.getByText("题/阶段", { exact: true }).isVisible(),
    false,
  );
  const advancedCorner = page.getByRole("button", { name: "高级设置" });
  const cornerPosition = await advancedCorner.evaluate((button) => {
    const style = getComputedStyle(button);
    const box = button.getBoundingClientRect();
    return { position: style.position, left: box.left, top: box.top };
  });
  assert.equal(cornerPosition.position, "fixed");
  assert.equal(cornerPosition.left, 0);
  assert.equal(cornerPosition.top, 0);
  assert.equal((await advancedCorner.textContent())?.trim(), "");
  assert.equal(
    await page.getByRole("button", { name: "启用", exact: true }).getAttribute(
      "aria-pressed",
    ),
    "true",
  );
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  assert.equal(
    await page.getByRole("button", { name: "关闭", exact: true }).getAttribute(
      "aria-pressed",
    ),
    "true",
  );
  await page.getByRole("button", { name: "启用", exact: true }).click();
  await advancedCorner.click();
  await page.getByText("每题秒数", { exact: true }).waitFor();
  assert.equal(await challengeDecor.isVisible(), false);
  const stableStartLayout = await page.evaluate(() => {
    const top = (selector) =>
      document.querySelector(selector)?.getBoundingClientRect().top ?? -1;
    const firstSetting = [
      ...document.querySelectorAll(".setting-block"),
    ].find(
      (element) =>
        !element.hidden &&
        !element.querySelector("[data-mode]") &&
        element.getBoundingClientRect().height > 0,
    );
    return {
      title: top(".masthead"),
      settings: top(".settings-stack"),
      firstSetting:
        firstSetting?.getBoundingClientRect().top ?? -1,
      start: top(".start-button"),
    };
  });
  await page.getByRole("button", { name: "自由", exact: true }).click();
  await page.waitForTimeout(220);
  const stableStartLayoutAfter = await page.evaluate(() => {
    const top = (selector) =>
      document.querySelector(selector)?.getBoundingClientRect().top ?? -1;
    const firstSetting = [
      ...document.querySelectorAll(".setting-block"),
    ].find(
      (element) =>
        !element.hidden &&
        !element.querySelector("[data-mode]") &&
        element.getBoundingClientRect().height > 0,
    );
    return {
      title: top(".masthead"),
      settings: top(".settings-stack"),
      firstSetting:
        firstSetting?.getBoundingClientRect().top ?? -1,
      start: top(".start-button"),
    };
  });
  for (const key of ["title", "settings", "firstSetting", "start"]) {
    assert.ok(
      Math.abs(stableStartLayout[key] - stableStartLayoutAfter[key]) <= 1,
      key,
    );
  }
  assert.equal(
    await page.locator("[data-start-record]").isHidden(),
    true,
  );
  assert.equal(
    await page.locator(".mode-switch").evaluate(
      (element) => getComputedStyle(element).getPropertyValue("--mode-position").trim(),
    ),
    "1",
  );
  assert.equal(
    await page.locator(".mode-fields").evaluate(
      (element) => getComputedStyle(element).animationName,
    ),
    "mode-fields-right",
  );

  await page.locator("#parts-high").fill("5");
  assert.equal(await page.locator("#parts-high").inputValue(), "5");
  await page.locator("#parts-low").fill("5");
  assert.equal(await page.locator("#parts-low").inputValue(), "5");
  await page.locator("#parts-low").fill("2");
  await page.locator("#parts-high").fill("4");
  await page.waitForTimeout(180);
  const sliderLeft = await page.locator(".dual-range").evaluate(
    (element) => element.getBoundingClientRect().x,
  );
  const markerLeft = await page.locator("[data-range-marker-low]").evaluate(
    (element) => element.getBoundingClientRect().x,
  );
  const stepperLeft = await page.locator("#game-seconds").evaluate(
    (element) => element.closest(".stepper")?.getBoundingClientRect().x ?? -1,
  );
  assert.ok(Math.abs(sliderLeft - stepperLeft) <= 1);
  assert.ok(Math.abs(markerLeft - sliderLeft) <= 1);
  assert.equal(
    await page.locator(".range-ticks").evaluate(
      (element) => getComputedStyle(element).fontSize,
    ),
    "13px",
  );

  await page.getByRole("button", { name: "增加五秒" }).click();
  assert.equal(await page.locator("#game-seconds").inputValue(), "45");
  await page.getByRole("button", { name: "减少五秒" }).click();
  assert.equal(await page.locator("#game-seconds").inputValue(), "40");

  await page.getByRole("button", { name: "高级设置" }).click();
  await page.getByRole("button", { name: "挑战", exact: true }).click();
  assert.equal(
    await page.getByText("题/阶段", { exact: true }).isVisible(),
    false,
  );
  await page.getByRole("button", { name: /高级设置/ }).waitFor();
  assert.equal(await page.getByText("级别", { exact: true }).isVisible(), false);
  assert.equal(
    await page.getByRole("button", { name: "启用", exact: true }).isVisible(),
    true,
  );
  await page.getByRole("button", { name: "自由", exact: true }).click();

  await page.locator("#game-count").fill("3");
  await page.getByRole("button", { name: "开始", exact: true }).click();
  await page.locator(".play-screen").waitFor();
  await tutorialTrigger.click();
  await page.locator("#tutorial-dialog[open]").waitFor();
  await page.locator(".parts.is-paused").waitFor();
  const pausedTutorialTimer = await page.locator("[data-timer]").innerText();
  await page.waitForTimeout(1100);
  assert.equal(
    await page.locator("[data-timer]").innerText(),
    pausedTutorialTimer,
  );
  await page.keyboard.press("Escape");
  await page
    .locator("#tutorial-dialog")
    .waitFor({ state: "hidden" });
  await page.locator(".parts.is-resuming").waitFor();
  assert.equal(await page.getByText("级别", { exact: true }).count(), 0);
  assert.equal(
    await page.getByRole("textbox", { name: "答案" }).evaluate(
      (element) => getComputedStyle(element).outlineStyle,
    ),
    "none",
  );
  await page.waitForTimeout(1200);
  assert.ok(
    await page.locator("[data-timer-progress]").evaluate(
      (element) => Number.parseFloat(element.style.strokeDashoffset) > 0,
    ),
  );
  const shownPartOrders = [];
  const givenAnswers = [];

  for (let question = 1; question <= 3; question += 1) {
    const displayedParts = await readDisplayedParts();
    shownPartOrders.push(displayedParts);
    const parts = [...displayedParts].sort();
    const answers = questionsByParts.get(parts.join("\u0001"));
    assert.ok(answers?.length, `No answer for ${parts.join(" ")}`);
    const answer = answers[0];
    givenAnswers.push(answer);

    if (question === 1) {
      await page.getByRole("textbox", { name: "答案" }).fill("x");
      await page.getByRole("button", { name: "提交" }).click();
      await page.locator(".answer-stage.is-wrong").waitFor();
      assert.equal(await page.locator(".play-screen").count(), 1);
      assert.equal(await page.locator(".play-surface.question-enter").count(), 0);

      await page.keyboard.press("Escape");
      await page.locator(".parts.is-paused").waitFor();
      await page.waitForFunction(
        () =>
          getComputedStyle(document.querySelector(".part")).opacity === "0",
      );
      const pausedDot = await page.locator(".part-card").first().evaluate(
        (card) => {
          const style = getComputedStyle(card, "::after");
          return { opacity: style.opacity, color: style.backgroundColor };
        },
      );
      assert.equal(pausedDot.opacity, "1");
      assert.equal(pausedDot.color, "rgb(255, 250, 245)");
      await page.keyboard.press("Escape");
      await page.locator(".parts.is-resuming").waitFor();
      await page.waitForFunction(
        () =>
          getComputedStyle(document.querySelector(".part")).opacity === "1" &&
          getComputedStyle(
            document.querySelector(".part-card"),
            "::after",
          ).backgroundColor === "rgb(161, 55, 48)",
      );
    }

    await page.getByRole("textbox", { name: "答案" }).fill(answer);
    const geometryBefore = await page.evaluate(() => {
      const read = (selector) =>
        document.querySelector(selector)?.getBoundingClientRect().top ?? -1;
      return {
        parts: read(".parts"),
        actions: read(".play-actions"),
      };
    });
    await page.getByRole("button", { name: "提交" }).click();
    await page.locator(".reveal strong").waitFor();
    assert.equal(await page.locator(".reveal strong").innerText(), answer);
    assert.equal(await page.locator(".parts.has-correct").count(), 1);
    assert.equal(await page.locator(".play-surface.question-enter").count(), 0);
    assert.deepEqual(
      (await page.locator(".play-actions button").allTextContents()).map((text) =>
        text.trim(),
      ),
      ["暂停", "弃权", "重开", "返回"],
    );
    if (question < 3) {
      assert.equal(await page.locator("[data-advance]").count(), 0);
    }
    const geometryAfter = await page.evaluate(() => {
      const read = (selector) =>
        document.querySelector(selector)?.getBoundingClientRect().top ?? -1;
      return {
        parts: read(".parts"),
        actions: read(".play-actions"),
      };
    });
    assert.ok(Math.abs(geometryAfter.parts - geometryBefore.parts) <= 1);
    assert.ok(Math.abs(geometryAfter.actions - geometryBefore.actions) <= 1);

    if (question < 3) {
      await page.waitForFunction(
        (current) =>
          document
            .querySelector(".play-hud")
            ?.textContent?.includes(`第 ${current + 1} / 3 题`),
        question,
      );
    }
  }

  assert.equal(await page.locator("[data-advance]").count(), 0);
  await page.locator(".result-screen").waitFor();
  assert.match(await page.locator(".result-header").innerText(), /胜利/);
  assert.match(await page.locator(".result-score").innerText(), /自由模式 · 3题/);
  const scoreFont = await page.locator(".result-score").evaluate(
    (element) => getComputedStyle(element).fontFamily,
  );
  const metaFont = await page.locator(".review-meta").first().evaluate(
    (element) => getComputedStyle(element).fontFamily,
  );
  assert.equal(scoreFont, metaFont);
  assert.match(scoreFont, /Noto Serif SC/);
  assert.equal(await page.locator(".review-result.is-correct").count(), 3);
  assert.equal(await page.locator(".review-result.is-wrong").count(), 0);
  const firstReviewCard = await page.locator(".review-card").first().evaluate(
    (card) => {
      const box = card.getBoundingClientRect();
      const answer = card.querySelector(".review-answer")?.getBoundingClientRect();
      const meta = card.querySelector(".review-meta")?.getBoundingClientRect();
      const parts = card.querySelector(".review-parts")?.getBoundingClientRect();
      const partsElement = card.querySelector(".review-parts");
      const indexElement = card.querySelector(".review-index");
      const answerElement = card.querySelector(".review-answer");
      return {
        square: Math.abs(box.width - box.height) <= 1,
        noParentheses: !card.querySelector(".review-meta")?.textContent?.includes("（"),
        partsAtBottom: Boolean(parts && meta && parts.top >= meta.bottom),
        answerAboveParts: Boolean(answer && parts && answer.bottom <= parts.top),
        partColor: partsElement ? getComputedStyle(partsElement).color : "",
        partFontSize: partsElement
          ? Number.parseFloat(getComputedStyle(partsElement).fontSize)
          : 0,
        answerFontSize: answerElement
          ? Number.parseFloat(getComputedStyle(answerElement).fontSize)
          : 0,
        cardWidth: box.width,
        indexStyle: indexElement ? getComputedStyle(indexElement).fontStyle : "",
      };
    },
  );
  assert.equal(firstReviewCard.square, true);
  assert.equal(firstReviewCard.noParentheses, true);
  assert.equal(firstReviewCard.partsAtBottom, true);
  assert.equal(firstReviewCard.answerAboveParts, true);
  assert.equal(firstReviewCard.partColor, "rgb(32, 35, 31)");
  assert.ok(firstReviewCard.partFontSize >= 13);
  assert.ok(firstReviewCard.answerFontSize / firstReviewCard.cardWidth >= 0.4);
  assert.equal(firstReviewCard.indexStyle, "normal");
  assert.equal(await page.locator(".review-list.is-victory").count(), 1);
  await page.waitForFunction(
    () =>
      getComputedStyle(
        document.querySelector(".review-card .review-answer"),
      ).color === "rgb(255, 250, 245)",
    { timeout: 3000 },
  );
  assert.notEqual(
    await page.locator(".review-card").first().evaluate(
      (card) => getComputedStyle(card, "::before").transform,
    ),
    "none",
  );
  const matrixStyle = await page.locator(".review-list").evaluate((list) => {
    const style = getComputedStyle(list);
    return {
      background: style.backgroundColor,
      borderWidth: style.borderTopWidth,
      gap: style.columnGap,
    };
  });
  assert.equal(matrixStyle.background, "rgba(0, 0, 0, 0)");
  assert.equal(matrixStyle.borderWidth, "0px");
  assert.equal(matrixStyle.gap, "0px");
  const cardBorders = await page.locator(".review-card").first().evaluate(
    (card) => {
      const style = getComputedStyle(card);
      return {
        top: style.borderTopWidth,
        rightColor: style.borderRightColor,
        bottomWidth: style.borderBottomWidth,
      };
    },
  );
  assert.equal(cardBorders.top, "1px");
  assert.equal(cardBorders.rightColor, "rgb(41, 76, 50)");
  assert.equal(cardBorders.bottomWidth, "1px");
  const adjacentBorder = await page.locator(".review-card").nth(1).evaluate(
    (card) => getComputedStyle(card).borderLeftWidth,
  );
  assert.equal(adjacentBorder, "0px");
  assert.deepEqual(
    await page.locator(".review-card").evaluateAll((cards) =>
      cards.map((card) =>
        [...card.querySelectorAll(".review-part")].map(
          (part) =>
            part.textContent?.trim() ||
            part.querySelector("[role='img']")?.getAttribute("aria-label") ||
            "",
        ),
      ),
    ),
    shownPartOrders,
  );
  assert.deepEqual(
    await page.locator(".review-answer").allTextContents(),
    givenAnswers,
  );
  const detailChar = "庞";
  await page.locator(".review-card").first().evaluate((card) => {
    card.dataset.reviewChar = "庞";
    const answer = card.querySelector(".review-answer");
    const meta = card.querySelector(".review-meta");
    if (answer) {
      answer.innerHTML = "<span>庞</span>";
    }
    if (meta) {
      meta.textContent = "一级 3117";
    }
  });
  const detailRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("/data/char-detail/")) {
      detailRequests.push(request.url());
    }
  });
  const hoverCard = page.locator(".review-card").first();
  const answerBefore = await hoverCard.evaluate((card) => {
    const answer = card.querySelector(".review-answer > span");
    const answerBox = answer?.getBoundingClientRect();
    const meta = card.querySelector(".review-meta");
    return {
      center: answerBox
        ? answerBox.top + answerBox.height / 2
        : 0,
      metaTop: meta?.getBoundingClientRect().top ?? 0,
    };
  });
  await hoverCard.hover();
  await page.waitForTimeout(220);
  const hoverReview = await hoverCard.evaluate((card) => {
    const answer = card.querySelector(".review-answer > span");
    const answerBox = answer?.getBoundingClientRect();
    const meta = card.querySelector(".review-meta");
    const transform = answer
      ? getComputedStyle(answer).transform
      : "none";
    return {
      center: answerBox ? answerBox.top + answerBox.height / 2 : 0,
      answerBottom: answerBox?.bottom ?? 0,
      metaTop: meta?.getBoundingClientRect().top ?? 0,
      scale:
        transform === "none"
          ? 1
          : new DOMMatrixReadOnly(transform).a,
      pseudoBorder: getComputedStyle(card, "::after").content,
      shadow: getComputedStyle(card).boxShadow,
    };
  });
  assert.ok(hoverReview.scale > 1.17);
  assert.ok(Math.abs(hoverReview.center - answerBefore.center) <= 1);
  assert.ok(hoverReview.metaTop > answerBefore.metaTop);
  assert.ok(hoverReview.metaTop >= hoverReview.answerBottom - 1);
  assert.equal(hoverReview.pseudoBorder, "none");
  assert.match(hoverReview.shadow, /rgba\(255, 250, 245/);

  await hoverCard.click();
  await page.locator(".char-detail-dialog[open]").waitFor();
  assert.equal(await page.locator("[data-detail-char]").innerText(), detailChar);
  await page.waitForFunction(
    () =>
      !document
        .querySelector("[data-detail-content]")
        ?.textContent?.includes("正在载入释义"),
    { timeout: 30_000 },
  );
  assert.doesNotMatch(
    await page.locator("[data-detail-content]").innerText(),
    /暂未收录|读取失败/,
  );
  assert.match(
    await page.locator("[data-detail-content]").innerText(),
    /\S/,
  );
  assert.equal(await page.locator(".char-detail-content details").count(), 0);
  assert.equal(
    await page.locator(".char-detail-footer").innerText(),
    "内容来自网络，仅供参考",
  );
  assert.equal(detailRequests.length, 1);
  assert.match(detailRequests[0], /\/data\/char-detail\/[0-9a-f]{2}\.json$/);
  assert.equal(
    await page.locator("[data-detail-unicode]").innerText(),
    `U+${detailChar.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`,
  );
  assert.doesNotMatch(
    await page.locator("[data-detail-readings]").innerText(),
    /载入中|^—$/,
  );
  const splitText = await page.locator("[data-detail-split]").innerText();
  assert.notEqual(splitText, "—");
  assert.doesNotMatch(splitText, /\+/);
  const expectedSchool = schoolData[detailChar];
  if (expectedSchool) {
    const schoolText = await page.locator("[data-detail-school]").innerText();
    if (expectedSchool.read?.length) {
      assert.match(
        schoolText,
        new RegExp(`识字表 ${expectedSchool.read.join("、")}`),
      );
    }
    if (expectedSchool.write?.length) {
      assert.match(
        schoolText,
        new RegExp(`写字表 ${expectedSchool.write.join("、")}`),
      );
    }
    if (expectedSchool.read?.length && expectedSchool.write?.length) {
      assert.match(schoolText, /\s\/\s/);
    }
  } else {
    assert.equal(
      await page.locator("[data-detail-school-row]").isHidden(),
      true,
    );
  }
  assert.equal(await page.locator(".detail-sources h4").count(), 0);
  if (await page.locator(".detail-sources").count()) {
    assert.equal(
      await page.locator(".detail-sources").first().evaluate(
        (element) => getComputedStyle(element).borderTopWidth,
      ),
      "0px",
    );
  }
  const detailHeaderLayout = await page.locator(".char-detail-header").evaluate(
    (header) => {
      const identity = header.querySelector(".char-detail-identity");
      const facts = header.querySelector(".char-detail-facts");
      const char = header.querySelector("[data-detail-char]");
      const identityBox = identity?.getBoundingClientRect();
      const charBox = char?.getBoundingClientRect();
      return {
        identityRight: identityBox?.right ?? -1,
        factsLeft: facts?.getBoundingClientRect().left ?? -1,
        identityCenter: identityBox
          ? identityBox.left + identityBox.width / 2
          : 0,
        charCenter: charBox ? charBox.left + charBox.width / 2 : 0,
      };
    },
  );
  assert.ok(
    detailHeaderLayout.identityRight <= detailHeaderLayout.factsLeft + 1,
  );
  assert.ok(
    Math.abs(
      detailHeaderLayout.identityCenter -
        detailHeaderLayout.charCenter,
    ) <= 1,
  );
  if (await page.locator(".detail-char-mark").count()) {
    assert.equal(
      await page.locator(".detail-char-mark").first().evaluate(
        (element) => {
          const style = getComputedStyle(element);
          return `${style.textDecorationLine}|${style.borderBottomWidth}`;
        },
      ),
      "none|0px",
    );
  }
  assert.equal(
    await page
      .locator(".char-detail-dialog")
      .getByRole("button", { name: "关闭", exact: true })
      .evaluate(
        (button) => ({
          svg: Boolean(button.querySelector("svg")),
          text: button.textContent?.trim(),
          border: getComputedStyle(button).borderTopWidth,
          outline: getComputedStyle(button).outlineStyle,
        }),
      )
      .then(({ svg, text, border, outline }) => `${svg}|${text}|${border}|${outline}`),
    "true||0px|none",
  );
  await page
    .locator(".char-detail-dialog")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  assert.equal(await page.locator(".char-detail-dialog[open]").count(), 0);
  await page.locator(".review-card").first().focus();
  await page.keyboard.press("Enter");
  await page.locator(".char-detail-dialog[open]").waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".char-detail-dialog[open]").count(), 0);

  await page.getByRole("button", { name: "返回", exact: true }).click();
  await page.getByRole("button", { name: "挑战", exact: true }).click();
  assert.equal(
    await page.getByText("题/阶段", { exact: true }).isVisible(),
    false,
  );
  await page.getByRole("button", { name: /高级设置/ }).click();
  await page.getByText("题/阶段", { exact: true }).waitFor();
  await page.locator("#stage-questions").fill("2");
  await page.locator("#game-seconds").fill("5");
  await page.getByRole("button", { name: "开始", exact: true }).click();
  await page.locator(".play-screen").waitFor();
  assert.match(await page.locator(".question-progress").innerText(), /阶段1 · 第1题/);
  assert.match(await page.locator(".stage-rank").innerText(), /#1-1500/);
  assert.ok((await page.locator(".part").count()) >= 2);
  const firstCardBox = await page.locator(".part-card").first().boundingBox();
  assert.ok(firstCardBox);
  assert.ok(Math.abs(firstCardBox.width - firstCardBox.height) <= 1);

  const answerChallengeQuestion = async () => {
    const displayed = await readDisplayedParts();
    const answers = questionsByParts.get([...displayed].sort().join("\u0001"));
    assert.ok(answers?.length);
    await page.getByRole("textbox", { name: "答案" }).fill(answers[0]);
    await page.getByRole("button", { name: "提交" }).click();
  };

  await answerChallengeQuestion();
  await page.waitForFunction(() =>
    document.querySelector(".play-hud")?.textContent?.includes("阶段1 · 第2题"),
  );
  await answerChallengeQuestion();
  await page.locator(".reveal strong").waitFor();
  assert.equal(
    await page.locator(".progress-stack.is-stage-enter").count(),
    1,
  );
  await page.locator(".stage-up").waitFor();
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector(".stage-up")).opacity === "1",
  );
  const stageUpSize = await page.locator(".stage-up").evaluate((element) => {
    const stack = element.parentElement;
    return {
      font: Number.parseFloat(getComputedStyle(element).fontSize),
      height: stack?.getBoundingClientRect().height ?? 0,
    };
  });
  assert.ok(
    stageUpSize.font / stageUpSize.height >= 0.4,
    JSON.stringify(stageUpSize),
  );
  assert.equal(
    await page.locator(".question-progress").evaluate(
      (element) => getComputedStyle(element).opacity,
    ),
    "0",
  );
  await page.waitForTimeout(250);
  assert.equal(
    await page.locator(".progress-stack.is-stage-enter").count(),
    1,
  );
  await page.waitForFunction(() =>
    document.querySelector(".play-hud")?.textContent?.includes("阶段2 · 第3题"),
  );
  assert.equal(
    await page.locator(".progress-stack.is-stage-clear").count(),
    1,
  );
  assert.equal(
    await page.locator(".stage-up").evaluate(
      (element) => getComputedStyle(element).opacity,
    ),
    "0",
  );
  assert.match(await page.locator(".stage-rank").innerText(), /#301-1800/);
  await answerChallengeQuestion();
  await page.waitForFunction(() =>
    document.querySelector(".play-hud")?.textContent?.includes("阶段2 · 第4题"),
  );
  assert.equal(
    await page
      .locator(".progress-stack.is-stage-enter, .progress-stack.is-stage-clear")
      .count(),
    0,
  );
  const stableActionsBefore = await page.evaluate(() =>
    [...document.querySelectorAll(".play-actions button")]
      .filter((button) => ["重开", "返回"].includes(button.textContent?.trim() ?? ""))
      .map((button) => ({
        text: button.textContent?.trim(),
        left: button.getBoundingClientRect().left,
      })),
  );
  await page.getByRole("button", { name: "暂停" }).click();
  await page.locator(".parts.is-paused").waitFor();
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector(".part")).opacity === "0",
  );
  await page.getByRole("button", { name: "弃权" }).click();
  await page.locator(".parts.is-resuming").waitFor();
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector(".part")).opacity === "1",
  );
  assert.equal(await page.getByRole("button", { name: "暂停" }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "弃权" }).count(), 0);
  const stableActionsAfter = await page.evaluate(() =>
    [...document.querySelectorAll(".play-actions button")]
      .filter((button) => ["重开", "返回"].includes(button.textContent?.trim() ?? ""))
      .map((button) => ({
        text: button.textContent?.trim(),
        left: button.getBoundingClientRect().left,
      })),
  );
  assert.deepEqual(stableActionsAfter, stableActionsBefore);
  await page.getByRole("button", { name: "结算" }).click();
  await page.locator(".result-screen").waitFor();
  assert.equal(
    await page.locator(".result-header h1").innerText(),
    "挑战结束",
  );
  assert.match(await page.locator(".record-row").innerText(), /纪录：3/);
  assert.match(
    await page.locator(".result-score").innerText(),
    /挑战模式 · 3题 · 阶段2/,
  );
  assert.equal(await page.locator(".review-result.is-correct").count(), 3);
  assert.equal(await page.locator(".review-result.is-wrong").count(), 1);
  assert.equal(await page.locator(".review-list li.is-error").count(), 1);
  assert.equal(
    await page.locator(".review-list li.is-error").evaluate(
      (card) => getComputedStyle(card).borderTopWidth,
    ),
    "1px",
  );
  assert.equal(
    await page.evaluate(() =>
      localStorage.getItem("zigsaw.records.v1"),
    ),
    JSON.stringify({
      "challenge|questions=2|size=1500|shift=300|seconds=5|ex=1": 3,
    }),
  );

  await page.getByRole("button", { name: "返回", exact: true }).click();
  assert.equal(
    await page.locator("[data-start-record]").innerText(),
    "纪录：3",
  );
  await page.getByRole("button", { name: "无尽", exact: true }).click();
  assert.equal(
    await page.locator("[data-start-record]").isHidden(),
    true,
  );
  await page.getByRole("button", { name: "开始", exact: true }).click();
  await page.locator(".play-screen").waitFor();
  const endlessDisplayedParts = await readDisplayedParts();
  const endlessParts = [...endlessDisplayedParts].sort();
  const endlessAnswers = questionsByParts.get(endlessParts.join("\u0001"));
  assert.ok(endlessAnswers?.length);
  await page.getByRole("textbox", { name: "答案" }).fill(endlessAnswers[0]);
  await page.getByRole("button", { name: "提交" }).click();
  await page.waitForFunction(() =>
    document.querySelector(".play-hud")?.textContent?.includes("第 2 题"),
  );
  await page.locator(".parts.is-tense").waitFor();
  await page.getByRole("button", { name: "结算" }).waitFor({ timeout: 7000 });
  assert.equal(await page.locator("[data-timer]").innerText(), "0");
  assert.equal(await page.getByRole("button", { name: "下一题" }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "暂停" }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "弃权" }).count(), 0);
  await page.getByRole("button", { name: "结算" }).click();
  await page.locator(".result-screen").waitFor();
  assert.match(await page.locator(".result-header").innerText(), /无尽结束/);
  assert.match(await page.locator(".record-row").innerText(), /纪录：1/);
  assert.match(await page.locator(".result-score").innerText(), /无尽模式 · 1题/);

  await page.getByRole("button", { name: "返回", exact: true }).click();
  await page.getByRole("button", { name: "自由", exact: true }).click();
  await page.locator("#game-count").fill("10");
  await page.setViewportSize({ width: 1280, height: 898 });
  await page.getByRole("button", { name: "开始", exact: true }).click();
  await page.locator(".play-screen").waitFor();

  for (let question = 1; question <= 10; question += 1) {
    const parts = (await readDisplayedParts()).sort();
    const answers = questionsByParts.get(parts.join("\u0001"));
    assert.ok(answers?.length);
    await page.getByRole("textbox", { name: "答案" }).fill(answers[0]);
    await page.getByRole("button", { name: "提交" }).click();
    if (question < 10) {
      await page.waitForFunction(
        (current) =>
          document
            .querySelector(".play-hud")
            ?.textContent?.includes(`第 ${current + 1} / 10 题`),
        question,
      );
    }
  }

  await page.locator(".result-screen").waitFor();
  assert.equal(await page.locator(".review-list li").count(), 10);
  const cardRows = await page.locator(".review-card").evaluateAll((cards) =>
    cards.map((card) => card.offsetTop),
  );
  assert.equal(new Set(cardRows.slice(0, 5)).size, 1);
  assert.ok(cardRows[5] > cardRows[0]);
  assert.equal(
    await page.evaluate(
      () =>
        document.documentElement.scrollHeight <=
        document.documentElement.clientHeight,
    ),
    true,
  );
  assert.equal(
    await page.locator(".review-list").evaluate(
      (element) => element.scrollHeight <= element.clientHeight + 1,
    ),
    true,
  );

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileReview = await page.locator(".review-card").evaluateAll((cards) => {
    const sample = cards.slice(0, 5).map((card) => {
      const answer = card.querySelector(".review-answer");
      return {
        top: card.offsetTop,
        width: card.offsetWidth,
        height: card.offsetHeight,
        answerWidth: answer?.getBoundingClientRect().width ?? 0,
        answerAlign: answer ? getComputedStyle(answer).textAlign : "",
      };
    });
    return sample;
  });
  assert.equal(new Set(mobileReview.slice(0, 4).map((card) => card.top)).size, 1);
  assert.ok(mobileReview[4].top > mobileReview[0].top);
  assert.ok(
    mobileReview.every((card) => Math.abs(card.width - card.height) <= 1),
  );
  assert.ok(
    mobileReview.every(
      (card) =>
        card.answerAlign === "center" && card.answerWidth >= card.width * 0.7,
    ),
  );
  const denseMobile = await page.evaluate(() => {
    const list = document.querySelector(".review-list");
    const originals = [...list.children];
    let index = originals.length;
    while (list.children.length < 106) {
      const card = originals[index % originals.length].cloneNode(true);
      card.style.setProperty("--review-index", String(index));
      list.appendChild(card);
      index += 1;
    }
    return [...list.querySelectorAll(".review-card")]
      .slice(0, 12)
      .map((card) => {
        return {
          top: card.offsetTop,
          width: card.offsetWidth,
          height: card.offsetHeight,
        };
      });
  });
  assert.equal(new Set(denseMobile.slice(0, 4).map((card) => card.top)).size, 1);
  assert.ok(denseMobile[4].top > denseMobile[0].top);
  assert.ok(
    denseMobile.every((card) => Math.abs(card.width - card.height) <= 1),
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth,
    ),
    await page.evaluate(() => document.documentElement.clientWidth),
  );
  await tutorialTrigger.click();
  await page.locator("#tutorial-dialog[open]").waitFor();
  const mobileTutorialLayout = await page.locator("#tutorial-dialog").evaluate(
    (dialog) => {
      const box = dialog.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        viewportWidth: document.documentElement.clientWidth,
        viewportHeight: document.documentElement.clientHeight,
        scrollWidth: document.documentElement.scrollWidth,
        pageHeight: document.documentElement.scrollHeight,
      };
    },
  );
  assert.ok(mobileTutorialLayout.left >= 0);
  assert.ok(
    mobileTutorialLayout.right <= mobileTutorialLayout.viewportWidth,
  );
  assert.ok(mobileTutorialLayout.top >= 0);
  assert.ok(
    mobileTutorialLayout.bottom <= mobileTutorialLayout.viewportHeight,
  );
  assert.equal(
    mobileTutorialLayout.scrollWidth,
    mobileTutorialLayout.viewportWidth,
  );
  assert.equal(
    mobileTutorialLayout.pageHeight,
    mobileTutorialLayout.viewportHeight,
  );
  await page
    .locator("#tutorial-dialog")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await page
    .locator("#tutorial-dialog")
    .waitFor({ state: "hidden" });
  await page.locator(".review-card").first().click();
  await page.locator(".char-detail-dialog[open]").waitFor();
  const mobileDetailLayout = await page.evaluate(() => {
    const dialog = document.querySelector(".char-detail-dialog");
    const box = dialog?.getBoundingClientRect();
    return {
      left: box?.left ?? -1,
      right: box?.right ?? -1,
      top: box?.top ?? -1,
      bottom: box?.bottom ?? -1,
      viewportWidth: document.documentElement.clientWidth,
      viewportHeight: document.documentElement.clientHeight,
      pageHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  assert.ok(mobileDetailLayout.left >= 0);
  assert.ok(mobileDetailLayout.right <= mobileDetailLayout.viewportWidth);
  assert.ok(mobileDetailLayout.top >= 0);
  assert.ok(mobileDetailLayout.bottom <= mobileDetailLayout.viewportHeight);
  assert.equal(
    mobileDetailLayout.scrollWidth,
    mobileDetailLayout.viewportWidth,
  );
  assert.equal(mobileDetailLayout.pageHeight, mobileDetailLayout.viewportHeight);
  await page.keyboard.press("Escape");
  assert.deepEqual(errors, []);
  console.log(
    "smoke: settings, tutorial, three modes, reveal, details, records and responsive layout OK",
  );
} finally {
  await browser.close();
}

