import "./styles.css";
import {
  loadComponentAtlas,
  type AtlasCharacterReference,
  type AtlasComponent,
  type ComponentAtlasData,
  type ComponentRarity,
} from "./game/atlas";
import { CollectionStore } from "./game/collection";
import {
  externalCharacterMeta,
  loadGameData,
  type GameData,
} from "./game/data";
import { CharDetailStore } from "./game/details";
import { CharDetailView } from "./ui/char-detail";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("Missing #app root element.");
}

type RarityFilter = ComponentRarity | "all";
type AccessFilter = "unlocked" | "all";

const appRoot = root;
const appBaseUrl = new URL("../", document.baseURI).href;
const collection = new CollectionStore();
const charDetails = new CharDetailStore(appBaseUrl);
const rarityOrder: ComponentRarity[] = ["N", "R", "SR", "SSR", "UR"];

let atlas: ComponentAtlasData | null = null;
let gameData: GameData | null = null;
let activeRarity: RarityFilter = "all";
let activeAccess: AccessFilter = "all";
let activeCharAccess: AccessFilter = "all";
let activeComponent: AtlasComponent | null = null;
let detailView: CharDetailView | null = null;
let debugUnlockAll = false;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function assetUrl(source: string): string {
  return new URL(`../${source}`, document.baseURI).href;
}

function isComponentUnlocked(component: AtlasComponent): boolean {
  return (
    debugUnlockAll ||
    collection.hasComponent(component.symbolId)
  );
}

function isCharacterUnlocked(
  character: AtlasCharacterReference,
  component: AtlasComponent,
): boolean {
  return (
    (character.isSelf && isComponentUnlocked(component)) ||
    debugUnlockAll ||
    collection.hasCharWithComponent(
      character.char,
      component.symbolId,
    )
  );
}

function renderComponentGlyph(
  component: AtlasComponent,
  className = "",
): string {
  const label = escapeHtml(component.name);
  if (component.asset) {
    return `<span class="component-symbol ${className}" role="img" aria-label="${label}" style="--component-mask:url(&quot;${escapeHtml(assetUrl(component.asset))}&quot;)"></span>`;
  }
  return `<span class="${className}" aria-label="${label}">${label}</span>`;
}

function collectedCharacterCount(component: AtlasComponent): number {
  return component.chars.reduce(
    (total, character) =>
      total +
      (isCharacterUnlocked(character, component)
        ? 1
        : 0),
    0,
  );
}

function reachedMilestones(component: AtlasComponent): number {
  const collected = collectedCharacterCount(component);
  const percentage =
    component.charCount > 0
      ? (collected / component.charCount) * 100
      : 0;
  return component.milestones.filter(
    (milestone) => percentage >= milestone,
  ).length;
}

function renderMilestoneTicks(component: AtlasComponent): string {
  const reached = reachedMilestones(component);
  return `
    <span class="atlas-card-milestones" aria-hidden="true">
      ${component.milestones
        .map(
          (milestone, index) =>
            `<i class="${index < reached ? "is-reached" : ""}" title="${milestone}%"></i>`,
        )
        .join("")}
    </span>
  `;
}

function renderComponentCard(component: AtlasComponent): string {
  const unlocked = isComponentUnlocked(component);
  const completed =
    unlocked &&
    reachedMilestones(component) === component.milestones.length;
  const selected = activeComponent?.symbolId === component.symbolId;
  return `
    <button
      class="atlas-component-card rarity-${component.rarity.toLowerCase()} ${unlocked ? "is-unlocked" : "is-locked"} ${completed ? "is-milestone-complete" : ""} ${selected ? "is-selected" : ""}"
      type="button"
      data-component-id="${component.symbolId}"
      aria-label="${unlocked ? `${escapeHtml(component.name)}，${component.rarity}级部件` : "未解锁部件"}"
    >
      ${
        unlocked
          ? `
            <span class="atlas-rarity">${component.rarity}</span>
            <span class="atlas-card-glyph">${renderComponentGlyph(component, "atlas-glyph-content")}</span>
            <span class="atlas-card-count">${component.count}</span>
            ${renderMilestoneTicks(component)}
          `
          : ""
      }
    </button>
  `;
}

function switchMarkup<T extends string>(
  options: Array<{ value: T; label: string }>,
  active: T,
  attribute: string,
): string {
  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.value === active),
  );
  return `
    <div
      class="atlas-switch"
      style="--switch-count:${options.length};--switch-index:${activeIndex}"
      role="group"
    >
      <span class="atlas-switch-indicator" aria-hidden="true"></span>
      ${options
        .map(
          (option) => `
            <button
              type="button"
              data-${attribute}="${option.value}"
              aria-pressed="${option.value === active}"
            >${option.label}</button>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderCatalog(): void {
  if (!atlas) {
    return;
  }
  const filters = document.querySelector<HTMLElement>(
    "[data-atlas-filters]",
  );
  if (!filters) {
    return;
  }

  filters.innerHTML = `
    ${switchMarkup(
      [
        { value: "all", label: "全部" },
        ...rarityOrder.map((rarity) => ({
          value: rarity,
          label: rarity,
        })),
      ],
      activeRarity,
      "rarity-filter",
    )}
    ${switchMarkup<AccessFilter>(
      [
        { value: "unlocked", label: "已解锁" },
        { value: "all", label: "全部" },
      ],
      activeAccess,
      "component-access",
    )}
  `;

  renderComponentGrid();

  filters
    .querySelectorAll<HTMLButtonElement>("[data-rarity-filter]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        activeRarity =
          (button.dataset.rarityFilter as RarityFilter) ?? "all";
        updateSwitch(button, "rarity-filter", activeRarity);
        renderComponentGrid();
      });
    });
  filters
    .querySelectorAll<HTMLButtonElement>("[data-component-access]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        activeAccess =
          (button.dataset.componentAccess as AccessFilter) ?? "all";
        updateSwitch(button, "component-access", activeAccess);
        renderComponentGrid();
      });
    });
}

function updateSwitch(
  button: HTMLButtonElement,
  attribute: string,
  value: string,
): void {
  const group = button.closest<HTMLElement>(".atlas-switch");
  if (!group) {
    return;
  }
  const buttons = [
    ...group.querySelectorAll<HTMLButtonElement>(
      `[data-${attribute}]`,
    ),
  ];
  const index = buttons.findIndex(
    (candidate) =>
      candidate.getAttribute(`data-${attribute}`) === value,
  );
  if (index < 0) {
    return;
  }
  group.style.setProperty("--switch-index", String(index));
  buttons.forEach((candidate, candidateIndex) => {
    candidate.setAttribute(
      "aria-pressed",
      String(candidateIndex === index),
    );
  });
}

function renderComponentGrid(): void {
  if (!atlas) {
    return;
  }
  const grid = document.querySelector<HTMLElement>(
    "[data-component-grid]",
  );
  if (!grid) {
    return;
  }
  const components = atlas.components.filter(
    (component) =>
      (activeRarity === "all" ||
        component.rarity === activeRarity) &&
      (activeAccess === "all" ||
        isComponentUnlocked(component)),
  );
  grid.innerHTML = components.map(renderComponentCard).join("");
}

function characterCard(
  character: AtlasCharacterReference,
  component: AtlasComponent,
  isEx: boolean,
): string {
  const unlocked = isCharacterUnlocked(character, component);
  const levelClass = isEx
    ? "is-ex"
    : `is-level-${character.level}`;
  const selfClass = character.isSelf ? "is-self" : "";
  const codePoint = character.char.codePointAt(0) ?? 0;
  const levelLabel =
    character.level === 1
      ? "一级"
      : character.level === 2
        ? "二级"
        : "三级";
  const meta = isEx
    ? `表外 U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`
    : `${levelLabel} ${String(character.rank).padStart(4, "0")}`;
  return `
    <button
      class="atlas-char-card ${levelClass} ${selfClass} ${unlocked ? "is-unlocked" : "is-locked"}"
      type="button"
      data-atlas-char="${escapeHtml(character.char)}"
      ${unlocked ? 'aria-label="' + escapeHtml(character.char) + '，已收集"' : 'aria-label="未解锁汉字" tabindex="-1" disabled'}
    >
      ${
        unlocked
          ? `<span class="atlas-char-glyph">${escapeHtml(character.char)}</span><span class="atlas-char-meta">${meta}</span>`
          : ""
      }
    </button>
  `;
}

function exCharactersFor(component: AtlasComponent): string[] {
  const baseChars = new Set(
    component.chars.map((character) => character.char),
  );
  if (debugUnlockAll && gameData) {
    return [...gameData.ways.keys()]
      .filter((char) => {
        const codePoint = char.codePointAt(0) ?? 0;
        const ways = gameData?.ways.get(char) ?? [];
        return (
          !baseChars.has(char) &&
          !gameData?.levels.has(char) &&
          codePoint >= 0x4e00 &&
          codePoint <= 0x9fff &&
          gameData?.isCharSelectable(char) &&
          ways.some((way) => way.length >= 3) &&
          ways.some((way) => way.includes(component.symbolId))
        );
      })
      .sort(
        (left, right) =>
          (left.codePointAt(0) ?? 0) -
          (right.codePointAt(0) ?? 0),
      );
  }
  return collection.seenChars().filter(
    (char) =>
      !baseChars.has(char) &&
      collection
        .waysForChar(char)
        .some((way) => way.includes(component.symbolId)),
  );
}

function openCharacterDetail(char: string): void {
  if (!detailView || !gameData) {
    return;
  }
  const meta =
    gameData.answerMeta(char) || externalCharacterMeta(char);
  detailView.open(char, meta);
}

function selectComponent(
  component: AtlasComponent | null,
): void {
  activeComponent = component;
  const layout = document.querySelector<HTMLElement>(".atlas-layout");
  const detail = document.querySelector<HTMLElement>("[data-atlas-detail]");
  if (!layout || !detail) {
    return;
  }

  layout.classList.toggle("is-detail-open", Boolean(component));
  document
    .querySelectorAll<HTMLElement>("[data-component-id]")
    .forEach((card) => {
      card.classList.toggle(
        "is-selected",
        Number(card.dataset.componentId) === component?.symbolId,
      );
    });
  const url = new URL(location.href);
  if (!component) {
    detail.innerHTML = `<div class="atlas-detail-empty">选择一个部件</div>`;
    url.searchParams.delete("component");
    history.replaceState(null, "", url);
    return;
  }

  url.searchParams.set("component", String(component.symbolId));
  history.replaceState(null, "", url);

  if (!isComponentUnlocked(component)) {
    detail.innerHTML = `
      <header class="atlas-detail-header">
        <button class="char-detail-close atlas-detail-close" type="button" data-atlas-detail-back aria-label="关闭详情">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 4 20 20M20 4 4 20"></path>
          </svg>
        </button>
      </header>
      <div class="atlas-detail-locked">
        <strong>尚未收集</strong>
      </div>
    `;
    bindDetailControls(detail);
    return;
  }

  const collected = collectedCharacterCount(component);
  const percentage =
    component.charCount > 0
      ? (collected / component.charCount) * 100
      : 0;
  const exCharacters = exCharactersFor(component);
  const visibleBaseCharacters =
    activeCharAccess === "unlocked"
      ? component.chars.filter((character) =>
          isCharacterUnlocked(character, component),
        )
      : component.chars;
  const selfCharacters = visibleBaseCharacters.filter(
    (character) => character.isSelf,
  );
  const regularCharacters = visibleBaseCharacters.filter(
    (character) => !character.isSelf,
  );
  const characters = [
    ...selfCharacters.map((character) =>
      characterCard(character, component, false),
    ),
    ...exCharacters.map((char) =>
      characterCard(
        { char, level: 3, rank: 0 },
        component,
        true,
      ),
    ),
    ...regularCharacters.map((character) =>
      characterCard(character, component, false),
    ),
  ].join("");

  detail.innerHTML = `
    <header class="atlas-detail-header">
      <button class="char-detail-close atlas-detail-close" type="button" data-atlas-detail-back aria-label="关闭详情">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 4 20 20M20 4 4 20"></path>
        </svg>
      </button>
      <div class="atlas-detail-symbol rarity-${component.rarity.toLowerCase()}">${renderComponentGlyph(component, "atlas-detail-glyph")}</div>
      <span class="atlas-detail-rarity">${component.rarity}</span>
    </header>
    <div class="atlas-detail-summary">
      <span>${component.count} 次</span>
      <span>${collected} / ${component.charCount}</span>
    </div>
    <div class="atlas-milestones">
      <div class="atlas-milestone-track">
        <span class="atlas-milestone-fill" style="width:${percentage}%"></span>
        ${component.milestones
          .map(
            (milestone) =>
              `<i class="${percentage >= milestone ? "is-reached" : ""}" style="left:${milestone}%"></i>`,
          )
          .join("")}
      </div>
      <div class="atlas-milestone-labels">
        ${component.milestones
          .map(
            (milestone) =>
              `<span class="${milestone === 100 ? "is-end" : ""}" style="left:${milestone}%">${milestone}%</span>`,
          )
          .join("")}
      </div>
    </div>
    ${switchMarkup<AccessFilter>(
      [
        { value: "unlocked", label: "已解锁" },
        { value: "all", label: "全部" },
      ],
      activeCharAccess,
      "char-access",
    )}
    <div class="atlas-char-grid">${characters || '<div class="atlas-char-empty">暂无已解锁汉字</div>'}</div>
  `;
  bindDetailControls(detail);
}

function bindDetailControls(detail: HTMLElement): void {
  detail
    .querySelector<HTMLButtonElement>("[data-atlas-detail-back]")
    ?.addEventListener("click", () => selectComponent(null));
  detail
    .querySelectorAll<HTMLButtonElement>("[data-char-access]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        activeCharAccess =
          (button.dataset.charAccess as AccessFilter) ?? "all";
        updateSwitch(button, "char-access", activeCharAccess);
        refreshCharacterGrid(detail);
      });
    });
  bindCharacterCards(detail);
}

function refreshCharacterGrid(detail: HTMLElement): void {
  if (!activeComponent) {
    return;
  }
  const component = activeComponent;
  const grid = detail.querySelector<HTMLElement>(".atlas-char-grid");
  if (!grid) {
    return;
  }
  const visibleBaseCharacters =
    activeCharAccess === "unlocked"
      ? component.chars.filter((character) =>
          isCharacterUnlocked(character, component),
        )
      : component.chars;
  const selfCharacters = visibleBaseCharacters.filter(
    (character) => character.isSelf,
  );
  const regularCharacters = visibleBaseCharacters.filter(
    (character) => !character.isSelf,
  );
  grid.innerHTML = [
    ...selfCharacters.map((character) =>
      characterCard(character, component, false),
    ),
    ...exCharactersFor(component).map((char) =>
      characterCard(
        { char, level: 3, rank: 0 },
        component,
        true,
      ),
    ),
    ...regularCharacters.map((character) =>
      characterCard(character, component, false),
    ),
  ].join("");
  bindCharacterCards(grid);
}

function bindCharacterCards(scope: ParentNode): void {
  scope
    .querySelectorAll<HTMLButtonElement>(
      ".atlas-char-card.is-unlocked",
    )
    .forEach((card) => {
      const open = () => {
        const char = card.dataset.atlasChar;
        if (char) {
          openCharacterDetail(char);
        }
      };
      card.addEventListener("click", open);
    });
}

function detailDialogMarkup(): string {
  return `
    <dialog class="char-detail-dialog" aria-labelledby="char-detail-title">
      <article class="char-detail-panel">
        <header class="char-detail-header">
          <button class="char-detail-close" type="button" data-detail-close aria-label="关闭">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 4 20 20M20 4 4 20"></path>
            </svg>
          </button>
          <div class="char-detail-identity">
            <h2 id="char-detail-title" data-detail-char></h2>
            <div class="char-detail-meta" data-detail-meta></div>
          </div>
          <dl class="char-detail-facts">
            <div><dt>读音</dt><dd data-detail-readings>载入中</dd></div>
            <div><dt>Unicode</dt><dd data-detail-unicode></dd></div>
            <div data-detail-school-row hidden><dt>教材</dt><dd data-detail-school></dd></div>
            <div><dt>拆分</dt><dd data-detail-split></dd></div>
          </dl>
        </header>
        <div class="char-detail-content" data-detail-content></div>
        <footer class="char-detail-footer">内容来自网络，仅供参考</footer>
      </article>
    </dialog>
  `;
}

function decompositionMarkup(char: string): string {
  if (!gameData) {
    return "";
  }
  const selectedComponent = activeComponent;
  const ways = gameData.ways.get(char) ?? [];
  const containing = selectedComponent
    ? ways
        .filter((way) => way.includes(selectedComponent.symbolId))
        .sort((left, right) => left.length - right.length)
    : [];
  const way =
    containing[0] ?? gameData.shortestDecomposition(char) ?? null;
  return way
    ? way
        .map((symbolId) => {
          const component = gameData!.component(symbolId);
          const label = escapeHtml(component.name);
          const content = component.assetUrl
            ? `<span class="component-symbol" role="img" aria-label="${label}" style="--component-mask:url(&quot;${escapeHtml(component.assetUrl)}&quot;)"></span>`
            : label;
          return `<span class="char-detail-split-part">${content}</span>`;
        })
        .join("")
    : "";
}

function setupDetailView(): void {
  const dialog = appRoot.querySelector<HTMLDialogElement>(
    ".char-detail-dialog",
  );
  if (!dialog || !gameData) {
    detailView = null;
    return;
  }
  detailView = new CharDetailView(
    dialog,
    charDetails,
    decompositionMarkup,
  );
}

function renderAtlas(): void {
  if (!atlas) {
    return;
  }
  const selectedId = activeComponent?.symbolId;
  const unlockedComponents = atlas.components.filter((component) =>
    isComponentUnlocked(component),
  ).length;

  appRoot.innerHTML = `
    <div class="app-shell page-atlas">
      <button class="advanced-corner" type="button" data-atlas-advanced aria-label="高级设置" aria-pressed="${debugUnlockAll}"></button>
      <a class="atlas-home" href="../" aria-label="返回主页">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3.5 11 12 3.8l8.5 7.2"></path>
          <path d="M6.4 9.4v10.7h11.2V9.4"></path>
          <path d="M9.8 20.1v-6.2h4.4v6.2"></path>
        </svg>
      </a>
      <header class="masthead"><h1 class="wordmark">ZI<span>GSAW</span></h1></header>
      <main class="atlas-page-screen">
        <section class="atlas-page-surface">
          <header class="atlas-page-heading">
            <div>
              <div class="tutorial-kicker">COMPONENT INDEX</div>
              <h1 id="atlas-title">图鉴</h1>
            </div>
            <div class="atlas-heading-actions">
              <span>${unlockedComponents} / ${atlas.componentCount}</span>
            </div>
          </header>
          <div class="atlas-layout">
            <section class="atlas-catalog">
              <div class="atlas-filters" data-atlas-filters></div>
              <div class="atlas-component-grid" data-component-grid></div>
            </section>
            <aside class="atlas-detail" data-atlas-detail>
              <div class="atlas-detail-empty">选择一个部件</div>
            </aside>
          </div>
        </section>
      </main>
      ${detailDialogMarkup()}
    </div>
  `;

  setupDetailView();
  renderCatalog();
  document
    .querySelector<HTMLElement>("[data-component-grid]")
    ?.addEventListener("click", (event) => {
      const target = event.target;
      const card =
        target instanceof Element
          ? target.closest<HTMLElement>("[data-component-id]")
          : null;
      const id = Number(card?.dataset.componentId);
      const component =
        atlas?.components.find((entry) => entry.symbolId === id) ??
        null;
      if (component) {
        selectComponent(component);
      }
    });
  appRoot
    .querySelector<HTMLButtonElement>("[data-atlas-advanced]")
    ?.addEventListener("click", () => {
      debugUnlockAll = !debugUnlockAll;
      renderAtlas();
      if (selectedId !== undefined) {
        const selected = atlas?.components.find(
          (component) => component.symbolId === selectedId,
        );
        if (selected) {
          selectComponent(selected);
        }
      }
    });
  if (selectedId !== undefined) {
    const selected = atlas.components.find(
      (component) => component.symbolId === selectedId,
    );
    if (selected) {
      selectComponent(selected);
    }
  }
}

void Promise.all([
  loadComponentAtlas(document.baseURI),
  loadGameData(appBaseUrl),
])
  .then(([loadedAtlas, loadedGameData]) => {
    atlas = loadedAtlas;
    gameData = loadedGameData;
    renderAtlas();
    const requested = Number(
      new URL(location.href).searchParams.get("component"),
    );
    const component = atlas.components.find(
      (entry) => entry.symbolId === requested,
    );
    if (component) {
      selectComponent(component);
    }
  })
  .catch((error: unknown) => {
    appRoot.innerHTML = `
      <div class="app-shell page-atlas">
        <main class="atlas-page-screen">
          <div class="atlas-load-error">${escapeHtml(
            error instanceof Error ? error.message : "图鉴读取失败",
          )}</div>
        </main>
      </div>
    `;
  });
