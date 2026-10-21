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

  await page.goto(targetUrl, { waitUntil: "networkidle" });
  await page.locator(".start-button:not([disabled])").waitFor();
  assert.equal(await page.title(), "ZIGSAW");
  assert.equal(await page.getByText("把部件拼回一个字").count(), 0);
  assert.equal(await page.getByText("打乱顺序后，在倒计时内输入对应的汉字。").count(), 0);

  await page.locator("#parts-high").fill("5");
  assert.equal(await page.locator("#parts-high").inputValue(), "5");
  await page.locator("#parts-low").fill("5");
  assert.equal(await page.locator("#parts-low").inputValue(), "5");
  await page.locator("#parts-low").fill("2");
  await page.locator("#parts-high").fill("4");

  await page.getByRole("button", { name: "增加五秒" }).click();
  assert.equal(await page.locator("#game-seconds").inputValue(), "25");
  await page.getByRole("button", { name: "减少五秒" }).click();
  assert.equal(await page.locator("#game-seconds").inputValue(), "20");

  await page.getByRole("button", { name: "挑战", exact: true }).click();
  assert.equal(
    await page.getByText("题/阶段", { exact: true }).isVisible(),
    false,
  );
  assert.equal(
    await page.getByRole("button", { name: /高级设置/ }).isVisible(),
    true,
  );
  assert.equal(await page.getByText("级别", { exact: true }).isVisible(), false);
  await page.getByRole("button", { name: "普通", exact: true }).click();

  await page.locator("#game-count").fill("3");
  await page.getByRole("button", { name: "开始", exact: true }).click();
  await page.locator(".play-screen").waitFor();
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

  for (let question = 1; question <= 3; question += 1) {
    const displayedParts = await page.locator(".part").allTextContents();
    shownPartOrders.push(displayedParts);
    const parts = [...displayedParts].sort();
    const answers = questionsByParts.get(parts.join("\u0001"));
    assert.ok(answers?.length, `No answer for ${parts.join(" ")}`);
    const answer = answers[0];

    if (question === 1) {
      await page.getByRole("textbox", { name: "答案" }).fill("x");
      await page.getByRole("button", { name: "提交" }).click();
      await page.locator(".answer-stage.is-wrong").waitFor();
      assert.equal(await page.locator(".play-screen").count(), 1);
      assert.equal(await page.locator(".play-surface.question-enter").count(), 0);

      await page.getByRole("button", { name: "暂停" }).click();
      await page.getByRole("button", { name: "继续" }).click();
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
    assert.ok(answers.includes(await page.locator(".reveal strong").innerText()));
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
  assert.match(await page.locator(".result-score").innerText(), /普通模式 · 3题/);
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
  assert.deepEqual(
    await page.locator(".review-card").evaluateAll((cards) =>
      cards.map((card) =>
        [...card.querySelectorAll(".review-part")].map(
          (part) => part.textContent ?? "",
        ),
      ),
    ),
    shownPartOrders,
  );

  await page.getByRole("button", { name: "返回", exact: true }).click();
  await page.getByRole("button", { name: "挑战", exact: true }).click();
  assert.equal(
    await page.getByText("题/阶段", { exact: true }).isVisible(),
    false,
  );
  await page.getByRole("button", { name: /高级设置/ }).click();
  await page.getByText("题/阶段", { exact: true }).waitFor();
  await page.locator("#stage-questions").fill("1");
  await page.locator("#game-seconds").fill("5");
  await page.getByRole("button", { name: "开始", exact: true }).click();
  await page.locator(".play-screen").waitFor();
  assert.match(await page.locator(".question-progress").innerText(), /阶段1 · 第1题/);
  assert.match(await page.locator(".stage-rank").innerText(), /Rank 1-1500/);
  assert.ok((await page.locator(".part").count()) >= 2);
  const firstCardBox = await page.locator(".part-card").first().boundingBox();
  assert.ok(firstCardBox);
  assert.ok(Math.abs(firstCardBox.width - firstCardBox.height) <= 1);

  const challengeDisplayedParts = await page.locator(".part").allTextContents();
  const challengeParts = [...challengeDisplayedParts].sort();
  const challengeAnswers = questionsByParts.get(challengeParts.join("\u0001"));
  assert.ok(challengeAnswers?.length);
  await page.getByRole("textbox", { name: "答案" }).fill(challengeAnswers[0]);
  await page.getByRole("button", { name: "提交" }).click();
  await page.locator(".reveal strong").waitFor();
  assert.equal(await page.locator(".masthead.is-stage-clear").count(), 1);
  await page.waitForFunction(() =>
    document.querySelector(".play-hud")?.textContent?.includes("阶段2 · 第2题"),
  );
  assert.match(await page.locator(".stage-rank").innerText(), /Rank 301-1800/);
  assert.equal(await page.locator(".masthead.is-stage-clear").count(), 0);
  const stableActionsBefore = await page.evaluate(() =>
    [...document.querySelectorAll(".play-actions button")]
      .filter((button) => ["重开", "返回"].includes(button.textContent?.trim() ?? ""))
      .map((button) => ({
        text: button.textContent?.trim(),
        left: button.getBoundingClientRect().left,
      })),
  );
  await page.getByRole("button", { name: "弃权" }).click();
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
  assert.match(await page.locator(".record-row").innerText(), /记录：1/);
  assert.match(
    await page.locator(".result-score").innerText(),
    /挑战模式 · 1题 · 阶段2/,
  );
  assert.equal(await page.locator(".review-result.is-correct").count(), 1);
  assert.equal(await page.locator(".review-result.is-wrong").count(), 1);
  assert.equal(await page.locator(".review-list li.is-error").count(), 1);
  assert.equal(
    await page.evaluate(() =>
      localStorage.getItem("zigsaw.records.v1"),
    ),
    JSON.stringify({
      "challenge|questions=1|size=1500|shift=300|seconds=5": 1,
    }),
  );

  await page.getByRole("button", { name: "返回", exact: true }).click();
  await page.getByRole("button", { name: "无尽", exact: true }).click();
  await page.getByRole("button", { name: "开始", exact: true }).click();
  await page.locator(".play-screen").waitFor();
  const endlessDisplayedParts = await page.locator(".part").allTextContents();
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
  assert.match(await page.locator(".record-row").innerText(), /记录：1/);
  assert.match(await page.locator(".result-score").innerText(), /无尽模式 · 1题/);

  await page.getByRole("button", { name: "返回", exact: true }).click();
  await page.getByRole("button", { name: "普通", exact: true }).click();
  await page.locator("#game-count").fill("10");
  await page.setViewportSize({ width: 1280, height: 898 });
  await page.getByRole("button", { name: "开始", exact: true }).click();
  await page.locator(".play-screen").waitFor();

  for (let question = 1; question <= 10; question += 1) {
    const parts = (await page.locator(".part").allTextContents()).sort();
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
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth,
    ),
    await page.evaluate(() => document.documentElement.clientWidth),
  );
  assert.deepEqual(errors, []);
  console.log("smoke: settings, three modes, reveal, records and responsive layout OK");
} finally {
  await browser.close();
}

