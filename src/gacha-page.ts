import "./styles.css";
import {
  loadComponentAtlas,
  type AtlasComponentSummary,
} from "./game/atlas";
import { CollectionStore } from "./game/collection";
import { CrisStore } from "./game/cris";
import {
  externalCharacterMeta,
  loadGameData,
  type GameData,
} from "./game/data";
import {
  GACHA_COST,
  GACHA_RARITIES,
  GachaDrawer,
  type GachaCard,
} from "./game/gacha";
import { crisBalanceMarkup, crisIconMarkup } from "./ui/cris";
import { isDebugUnlocked } from "./ui/debug-auth";
import {
  createGachaTutorialDialog,
  GACHA_TUTORIAL_TRIGGER_MARKUP,
} from "./ui/gacha-tutorial";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("Missing #app root element.");
}

const appRoot = root;
const appBaseUrl = new URL("../", document.baseURI).href;
const cris = new CrisStore();
const collection = new CollectionStore();
const debugUnlocked = isDebugUnlocked();
const tutorialDialog = createGachaTutorialDialog();

type Phase =
  | "loading"
  | "idle"
  | "gathering"
  | "dealing"
  | "playing"
  | "summary";

interface CollectedWord {
  char: string;
  way: number[];
  isNew: boolean;
}

let data: GameData | null = null;
let drawer: GachaDrawer | null = null;
let componentsById = new Map<number, AtlasComponentSummary>();
let cards: GachaCard[] = [];
let cardSlots: Array<GachaCard | null> = [];
let obtainedCards: GachaCard[] = [];
let newComponentIds = new Set<number>();
let collectedWords: CollectedWord[] = [];
let phase: Phase = "loading";
let feedback = "";
let submitting = false;
let drawing = false;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function componentMarkup(
  name: string,
  assetUrl?: string,
): string {
  const label = escapeHtml(name);
  if (assetUrl) {
    return `<span class="component-symbol" role="img" aria-label="${label}" style="--component-mask:url(&quot;${escapeHtml(assetUrl)}&quot;)"></span>`;
  }
  return `<span class="gacha-card-glyph">${label}</span>`;
}

function costMarkup(): string {
  return `
    <span class="gacha-cost">
      ${crisIconMarkup()}
      <strong>${GACHA_COST}</strong>
    </span>
  `;
}

function shell(content: string): string {
  return `
    <div class="app-shell page-gacha">
      ${crisBalanceMarkup(cris.load(), debugUnlocked)}
      <div class="gacha-corner-actions">
        ${GACHA_TUTORIAL_TRIGGER_MARKUP}
        <a class="atlas-home" href="../" aria-label="返回主页">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3.5 11 12 3.8l8.5 7.2"></path>
            <path d="M6.4 9.4v10.7h11.2V9.4"></path>
            <path d="M9.8 20.1v-6.2h4.4v6.2"></path>
          </svg>
        </a>
      </div>
      <header class="masthead">
        <h1 class="wordmark">ZI<span>GSAW</span></h1>
      </header>
      <main class="gacha-page-screen">
        <section class="gacha-page-surface">
          <header class="gacha-page-heading">
            <div class="tutorial-kicker">WRITING DESK</div>
            <h1>写字台</h1>
          </header>
          ${content}
        </section>
      </main>
    </div>
  `;
}

function cardBackMarkup(index: number): string {
  return `
    <span class="gacha-card-face gacha-card-back" style="--card-index:${index}">
      ${crisIconMarkup()}
    </span>
  `;
}

function frontClass(card: GachaCard): string {
  return `rarity-${card.rarity.toLowerCase()}`;
}

function frontCardMarkup(
  card: GachaCard,
  index: number,
  flip = false,
  isNew = false,
): string {
  const component = data?.component(card.symbolId);
  if (!component) {
    return "";
  }
  const front = `
    <span class="gacha-card-face gacha-card-front ${frontClass(card)}">
      <span class="gacha-card-rarity">${card.rarity}</span>
      <span class="gacha-card-content">
        ${componentMarkup(component.name, component.assetUrl)}
      </span>
    </span>
  `;
  if (flip) {
    return `
      <div class="gacha-card gacha-flip-card ${frontClass(card)}" data-gacha-card="${card.uid}" data-gacha-symbol="${card.symbolId}" style="--card-index:${index}" aria-label="${card.rarity} ${escapeHtml(component.name)}">
        <span class="gacha-card-inner">
          ${cardBackMarkup(index)}
          ${front}
        </span>
      </div>
    `;
  }
  return `
    <div class="gacha-card ${frontClass(card)}" data-gacha-card="${card.uid}" data-gacha-symbol="${card.symbolId}" style="--card-index:${index}" aria-label="${card.rarity} ${escapeHtml(component.name)}">
      <span class="gacha-card-rarity">${card.rarity}</span>
      <span class="gacha-card-content">
        ${componentMarkup(component.name, component.assetUrl)}
      </span>
      ${isNew ? '<span class="gacha-new">NEW!</span>' : ""}
    </div>
  `;
}

function partCardMarkup(symbolId: number): string {
  const component = data?.component(symbolId);
  const rarity = componentsById.get(symbolId)?.rarity ?? "N";
  return `
    <span class="gacha-part-card rarity-${rarity.toLowerCase()}" aria-label="${rarity} ${escapeHtml(component?.name ?? "?")}">
      ${componentMarkup(component?.name ?? "?", component?.assetUrl)}
    </span>
  `;
}

function wordMeta(char: string): string {
  if (!data) {
    return "";
  }
  return (
    data.answerMeta(char) ||
    externalCharacterMeta(char).replace(/[（）]/g, "")
  );
}

function wordClass(char: string): string {
  if (!data) {
    return "";
  }
  const level = data.levels.get(char);
  if (level === 2) {
    return "is-level-2";
  }
  if (level === 3) {
    return "is-level-3";
  }
  if (level === 1) {
    return "is-level-1";
  }
  return data.exOrder.includes(char) ? "is-ex" : "is-external";
}

function obtainedRowsMarkup(): string {
  if (collectedWords.length === 0) {
    return "";
  }
  return `
    <div class="gacha-obtained-list" aria-label="本次抽选已组成的汉字">
      ${collectedWords
        .map(
          (entry) => `
            <div class="gacha-obtained-row">
              <div class="gacha-result-word ${wordClass(entry.char)}">
                <strong>${escapeHtml(entry.char)}</strong>
                <small>${escapeHtml(wordMeta(entry.char))}</small>
              </div>
              <div class="gacha-result-parts">
                ${entry.way.map(partCardMarkup).join("")}
              </div>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderLoading(): void {
  phase = "loading";
  appRoot.innerHTML = shell(
    `<div class="gacha-state">载入中</div>`,
  );
}

function renderIdle(): void {
  phase = "idle";
  const balance = cris.load();
  const scattered = Array.from(
    { length: 5 },
    (_, index) =>
      `<span class="gacha-back-card" style="--deck-index:${index}">${crisIconMarkup()}</span>`,
  ).join("");
  appRoot.innerHTML = shell(`
    <div class="gacha-idle">
      <div class="gacha-deck" aria-hidden="true">${scattered}</div>
      <button class="primary-action gacha-draw-button" type="button" data-gacha-start ${balance < GACHA_COST || !drawer ? "disabled" : ""}>
        ${balance < GACHA_COST ? "<span>Cris 不足</span>" : `<span>抽取十张 · </span>${costMarkup()}`}
      </button>
      ${feedback ? `<p class="gacha-feedback">${escapeHtml(feedback)}</p>` : ""}
    </div>
  `);
  appRoot
    .querySelector<HTMLButtonElement>("[data-gacha-start]")
    ?.addEventListener("click", () => {
      void startDraw();
    });
}

function renderDealing(): void {
  phase = "dealing";
  appRoot.innerHTML = shell(`
    <div class="gacha-hand gacha-dealing-hand">
      ${cards.map((card, index) => frontCardMarkup(card, index, true)).join("")}
    </div>
  `);
}

function renderHand(): void {
  if (!data) {
    return;
  }
  phase = "playing";
  appRoot.innerHTML = shell(`
    <div class="gacha-playing">
      <div class="gacha-hand">
        ${cardSlots
          .map((card, index) =>
            card
              ? frontCardMarkup(card, index)
              : `<span class="gacha-card is-empty-slot" style="--card-index:${index}" aria-hidden="true"></span>`,
          )
          .join("")}
      </div>
      <div class="gacha-submit-row">
        <input data-gacha-answer type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="组字答案">
        <button class="primary-action" type="button" data-gacha-submit>提交</button>
        <button class="gacha-finish-button" type="button" data-gacha-finish>结算</button>
      </div>
      <p class="gacha-feedback" data-gacha-feedback>${escapeHtml(feedback)}</p>
      ${obtainedRowsMarkup()}
    </div>
  `);

  const input =
    appRoot.querySelector<HTMLInputElement>("[data-gacha-answer]");
  input?.focus();
  appRoot
    .querySelector<HTMLButtonElement>("[data-gacha-submit]")
    ?.addEventListener("click", () => {
      void submitWord(input?.value ?? "");
    });
  appRoot
    .querySelector<HTMLButtonElement>("[data-gacha-finish]")
    ?.addEventListener("click", () => {
      void finishDraw();
    });
  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      void submitWord(input.value);
    }
  });
}

function renderSummary(): void {
  phase = "summary";
  const sortedCards = [...obtainedCards].sort(
    (left, right) =>
      GACHA_RARITIES.indexOf(right.rarity) -
        GACHA_RARITIES.indexOf(left.rarity) ||
      left.symbolId - right.symbolId,
  );
  const markedNewSymbols = new Set<number>();
  appRoot.innerHTML = shell(`
    <div class="gacha-summary">
      <h2>抽选结果</h2>
      <div class="gacha-summary-cards" aria-label="本次抽到的部件卡">
        ${sortedCards
          .map((card, index) =>
            (() => {
              const isNew =
                newComponentIds.has(card.symbolId) &&
                !markedNewSymbols.has(card.symbolId);
              if (isNew) {
                markedNewSymbols.add(card.symbolId);
              }
              return frontCardMarkup(
                card,
                index,
                false,
                isNew,
              );
            })(),
          )
          .join("")}
      </div>
      ${
        collectedWords.length
          ? `<div class="gacha-summary-words">
              <div class="gacha-word-list">
                ${collectedWords
                  .map(
                    (entry) => `
                      <div class="gacha-word-card ${wordClass(entry.char)}">
                        <strong>${escapeHtml(entry.char)}</strong>
                        <small>${escapeHtml(wordMeta(entry.char))}</small>
                      </div>
                    `,
                  )
                  .join("")}
              </div>
            </div>`
          : ""
      }
      <div class="gacha-summary-actions">
        <button class="primary-action" type="button" data-gacha-again ${cris.load() < GACHA_COST ? "disabled" : ""}>
          <span>再抽一次 · </span>${costMarkup()}
        </button>
        <button type="button" data-gacha-exit>退出</button>
      </div>
      ${feedback ? `<p class="gacha-feedback">${escapeHtml(feedback)}</p>` : ""}
    </div>
  `);
  appRoot
    .querySelector<HTMLButtonElement>("[data-gacha-again]")
    ?.addEventListener("click", () => {
      void startDraw();
    });
  appRoot
    .querySelector<HTMLButtonElement>("[data-gacha-exit]")
    ?.addEventListener("click", () => {
      window.location.href = "../";
    });
}

async function startDraw(): Promise<void> {
  if (drawing || !drawer || phase === "dealing") {
    return;
  }
  let nextCards: GachaCard[];
  try {
    nextCards = drawer.draw();
  } catch {
    feedback = "抽选生成失败";
    renderIdle();
    return;
  }
  if (!cris.spend(GACHA_COST)) {
    feedback = "Cris 不足";
    renderIdle();
    return;
  }

  drawing = true;
  const balance = appRoot.querySelector<HTMLElement>(".corner-cris");
  if (balance) {
    balance.outerHTML = crisBalanceMarkup(
      cris.load(),
      debugUnlocked,
    );
  }

  cards = [...nextCards];
  cardSlots = [...nextCards];
  obtainedCards = [];
  newComponentIds = new Set();
  collectedWords = [];
  feedback = "";
  if (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    drawing = false;
    renderHand();
    return;
  }

  phase = "gathering";
  appRoot.querySelector(".gacha-deck")?.classList.add("is-gathering");
  await wait(320);
  renderDealing();
  await nextFrame();
  const hand =
    appRoot.querySelector<HTMLElement>(".gacha-dealing-hand");
  hand?.classList.add("is-dealing");
  await wait(480);
  hand?.classList.add("is-flipping");
  await wait(1080);
  drawing = false;
  renderHand();
}

async function submitWord(rawValue: string): Promise<void> {
  if (
    phase !== "playing" ||
    submitting ||
    !drawer ||
    !data
  ) {
    return;
  }
  const answer = rawValue.trim();
  if (!answer) {
    feedback = "请输入汉字";
    renderHand();
    return;
  }
  const submission = drawer.findSubmission(answer, cards);
  if (!submission) {
    feedback = "无法用当前卡片组成这个字";
    renderHand();
    return;
  }
  submitting = true;

  for (const uid of submission.usedUids) {
    appRoot
      .querySelector<HTMLElement>(
        `[data-gacha-card="${uid}"]`,
      )
      ?.classList.add("is-used");
  }
  await wait(
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : 220,
  );

  const wasNew = !collection.hasSeenChar(answer);
  const usedCards = cards.filter((card) =>
    submission.usedUids.includes(card.uid),
  );
  for (const card of usedCards) {
    if (
      !collection.hasComponent(card.symbolId) &&
      !newComponentIds.has(card.symbolId)
    ) {
      newComponentIds.add(card.symbolId);
    }
  }
  cards = submission.remainingCards;
  const usedUids = new Set(submission.usedUids);
  cardSlots = cardSlots.map((card) =>
    card && usedUids.has(card.uid) ? null : card,
  );
  collection.recordEncounter(
    answer,
    submission.way,
    !data.levels.has(answer),
    false,
  );
  collectedWords.push({
    char: answer,
    way: submission.way,
    isNew: wasNew,
  });
  obtainedCards.push(...usedCards);
  feedback = "";
  const finished =
    cards.length === 0 || !drawer.hasPossibleWord(cards);
  if (finished) {
    if (cards.length > 0) {
      appRoot
        .querySelector<HTMLElement>(".gacha-hand")
        ?.classList.add("is-collecting");
      await wait(
        window.matchMedia("(prefers-reduced-motion: reduce)")
          .matches
          ? 0
          : 320,
      );
    }
    renderSummary();
    submitting = false;
  } else {
    submitting = false;
    renderHand();
  }
}

async function finishDraw(): Promise<void> {
  if (phase !== "playing" || submitting) {
    return;
  }
  submitting = true;
  if (cards.length > 0) {
    appRoot
      .querySelector<HTMLElement>(".gacha-hand")
      ?.classList.add("is-collecting");
    await wait(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 320,
    );
  }
  submitting = false;
  renderSummary();
}

function wait(duration: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, duration);
  });
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

document.addEventListener("change", (event) => {
  const target = event.target;
  if (
    !(target instanceof HTMLInputElement) ||
    !target.hasAttribute("data-debug-cris")
  ) {
    return;
  }
  target.value = String(cris.set(Number(target.value)));
  if (phase === "idle") {
    renderIdle();
  }
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (
    !(target instanceof Element) ||
    !target.closest("[data-gacha-tutorial-trigger]") ||
    tutorialDialog.open ||
    document.querySelector("dialog[open]")
  ) {
    return;
  }
  tutorialDialog.showModal();
});

renderLoading();
void Promise.all([
  loadGameData(appBaseUrl),
  loadComponentAtlas(document.baseURI),
]).then(([loadedData, atlas]) => {
  data = loadedData;
  componentsById = new Map(
    atlas.components.map((component) => [
      component.symbolId,
      component,
    ]),
  );
  collection.reconcile(
    loadedData.ways,
    (symbolId) => loadedData.component(symbolId).name,
    atlas.sourceHash,
    (char) => !loadedData.levels.has(char),
  );
  drawer = new GachaDrawer(loadedData, atlas.components);
  renderIdle();
}).catch(() => {
  appRoot.innerHTML = shell(
    `<div class="gacha-state is-error">写字台读取失败</div>`,
  );
});
