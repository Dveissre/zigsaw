import { chromium } from "playwright-core";

const browserPath =
  process.env.CHROME_PATH ??
  "C:/Program Files/Google/Chrome/Application/chrome.exe";
const targetUrl = process.env.APP_URL ?? "http://127.0.0.1:5173/";
const viewports = [
  ["mobile-short", 360, 640],
  ["mobile-small", 360, 800],
  ["mobile", 390, 844],
  ["tablet", 768, 1024],
  ["desktop-short", 1280, 620],
  ["desktop", 1280, 800],
];

const browser = await chromium.launch({
  executablePath: browserPath,
  headless: true,
});

async function measureLayout(page) {
  return page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const overflowingElements = [...document.querySelectorAll("*")]
      .map((element) => ({
        element,
        rect: element.getBoundingClientRect(),
      }))
      .filter(
        ({ rect }) =>
          rect.right > viewportWidth + 0.5 || rect.left < -0.5,
      )
      .map(({ element, rect }) => ({
        tag: element.tagName.toLowerCase(),
        className:
          typeof element.className === "string" ? element.className : "",
        left: Math.round(rect.left),
        right: Math.round(rect.right),
      }));

    return {
      viewportWidth,
      viewportHeight: document.documentElement.clientHeight,
      pageHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
      overflowingElements,
    };
  });
}

let failed = false;

try {
  for (const [name, width, height] of viewports) {
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 1,
    });

    await page.goto(targetUrl, { waitUntil: "networkidle" });
    await page.locator(".start-button:not([disabled])").waitFor();
    const startLayout = await measureLayout(page);
    await page.getByRole("button", { name: "游玩方法" }).click();
    await page.locator("#tutorial-dialog[open]").waitFor();
    const tutorialLayout = await measureLayout(page);
    await page
      .locator("#tutorial-dialog")
      .getByRole("button", { name: "关闭", exact: true })
      .click();
    await page
      .locator("#tutorial-dialog")
      .waitFor({ state: "hidden" });
    await page.getByRole("link", { name: "图鉴" }).click();
    await page.waitForURL(/\/atlas\/$/);
    await page.waitForLoadState("networkidle");
    const atlasLayout = await measureLayout(page);
    await page.locator("[data-component-access='all']").click();
    await page.locator(".atlas-component-card").first().click();
    await page.waitForTimeout(240);
    const atlasDetailLayout = await measureLayout(page);
    await page.locator(".atlas-detail-close").click();
    await page.getByRole("link", { name: "返回主页", exact: true }).click();
    await page.waitForURL((url) => !url.pathname.endsWith("/atlas/"));
    await page.locator(".start-button:not([disabled])").waitFor();
    await page.getByRole("button", { name: "自由", exact: true }).click();
    await page.waitForTimeout(220);
    await page.locator(".parts-slider").waitFor();
    const controlAlignment = await page.evaluate(() => {
      const read = (selector) =>
        document.querySelector(selector)?.getBoundingClientRect().left ?? -1;
      return {
        mode: read(".mode-switch"),
        parts: read(".parts-slider"),
      };
    });
    if (
      Math.abs(controlAlignment.mode - controlAlignment.parts) >
      1
    ) {
      throw new Error(
        `Settings controls are misaligned: ${JSON.stringify(controlAlignment)}`,
      );
    }
    await page.getByRole("button", { name: "挑战", exact: true }).click();
    await page.getByRole("button", { name: "开始", exact: true }).click();
    await page.locator(".play-screen").waitFor();
    const gameLayout = await measureLayout(page);
    await page.getByRole("button", { name: "弃权" }).click();
    await page.getByRole("button", { name: "结算" }).click();
    await page.locator(".result-screen").waitFor();
    const resultLayout = await measureLayout(page);
    await page.getByRole("button", { name: "返回" }).click();
    await page.getByRole("button", { name: "挑战", exact: true }).click();
    if (await page.getByText("题/阶段", { exact: true }).isVisible()) {
      throw new Error("Challenge advanced settings should start collapsed.");
    }
    const challengeLayout = await measureLayout(page);
    await page.getByRole("button", { name: "开始", exact: true }).click();
    await page.locator(".play-screen").waitFor();
    const challengeGameLayout = await measureLayout(page);

    const hasOverflow = [
      startLayout,
      tutorialLayout,
      atlasLayout,
      atlasDetailLayout,
      gameLayout,
      resultLayout,
      challengeLayout,
      challengeGameLayout,
    ].some(
      (layout) =>
        layout.scrollWidth > layout.viewportWidth ||
        layout.pageHeight > layout.viewportHeight + 1 ||
        layout.overflowingElements.length > 0,
    );
    failed ||= hasOverflow;

    console.log(
      [
        `${name} ${width}x${height}`,
        `start=${startLayout.scrollWidth}/${startLayout.viewportWidth}`,
        `tutorial=${tutorialLayout.scrollWidth}/${tutorialLayout.viewportWidth}`,
        `atlas=${atlasLayout.scrollWidth}/${atlasLayout.viewportWidth}`,
        `atlas-detail=${atlasDetailLayout.scrollWidth}/${atlasDetailLayout.viewportWidth}`,
        `game=${gameLayout.scrollWidth}/${gameLayout.viewportWidth}`,
        `result=${resultLayout.scrollWidth}/${resultLayout.viewportWidth}`,
        `challenge=${challengeLayout.scrollWidth}/${challengeLayout.viewportWidth}`,
        `challenge-game=${challengeGameLayout.scrollWidth}/${challengeGameLayout.viewportWidth}`,
        hasOverflow ? "status=FAIL" : "status=OK",
      ].join(" "),
    );

    for (const layout of [
      startLayout,
      tutorialLayout,
      atlasLayout,
      atlasDetailLayout,
      gameLayout,
      resultLayout,
      challengeLayout,
      challengeGameLayout,
    ]) {
      if (layout.overflowingElements.length > 0) {
        console.log(JSON.stringify(layout.overflowingElements, null, 2));
      }
    }

    await page.close();
  }
} finally {
  await browser.close();
}

if (failed) {
  process.exitCode = 1;
}

