import "./styles.css";
import {
  loadComponentCharacters,
  loadComponentAtlas,
  type AtlasCharacterReference,
  type AtlasComponentSummary,
  type ComponentAtlasData,
  type ComponentRarity,
} from "./game/atlas";
import {
  CollectionStore,
  componentCompletionPercentage,
} from "./game/collection";
import { CrisStore } from "./game/cris";
import {
  externalCharacterMeta,
  loadGameData,
  type GameData,
} from "./game/data";
import { CharDetailStore } from "./game/details";
import { CharDetailView } from "./ui/char-detail";
import { crisBalanceMarkup } from "./ui/cris";
import {
  isDebugUnlocked,
  requestDebugAccess,
  revokeDebugAccess,
} from "./ui/debug-auth";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("Missing #app root element.");
}

type RarityFilter = ComponentRarity | "all";
type AccessFilter = "unlocked" | "all";
type HistoryMode = "auto" | "close" | "none" | "replace";

const appRoot = root;
const appBaseUrl = new URL("../", document.baseURI).href;
const collection = new CollectionStore();
const cris = new CrisStore();
const charDetails = new CharDetailStore(appBaseUrl);
const rarityOrder: ComponentRarity[] = [
  "N",
  "R",
  "SR",
  "SSR",
  "UR",
  "XR",
];
const EX_MARK_MARKUP = `
  <span class="atlas-ex-mark" title="EX 关联部件" aria-label="EX 关联部件">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 1.5c.7 6.2 4.3 9.8 10.5 10.5-6.2.7-9.8 4.3-10.5 10.5C11.3 16.3 7.7 12.7 1.5 12 7.7 11.3 11.3 7.7 12 1.5Z"></path>
    </svg>
  </span>
`;

let atlas: ComponentAtlasData | null = null;
let gameData: GameData | null = null;
let activeRarity: RarityFilter = "all";
let activeAccess: AccessFilter = "unlocked";
let activeCharAccess: AccessFilter = "unlocked";
let activeComponent: AtlasComponentSummary | null = null;
let activeCharacters: AtlasCharacterReference[] = [];
let detailView: CharDetailView | null = null;
let debugUnlockAll = isDebugUnlocked();
let componentLoadToken = 0;
let gameDataPromise: Promise<GameData> | null = null;

window.addEventListener("popstate", () => {
  if (!atlas) {
    return;
  }
  const requested = Number(
    new URL(location.href).searchParams.get("component"),
  );
  const component =
    atlas.components.find(
      (entry) => entry.symbolId === requested,
    ) ?? null;
  void selectComponent(component, "none");
});

document.addEventListener("change", (event) => {
  const target = event.target;
  if (
    !(target instanceof HTMLInputElement) ||
    !target.hasAttribute("data-debug-cris")
  ) {
    return;
  }
  target.value = String(cris.set(Number(target.value)));
});

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

function isComponentUnlocked(component: AtlasComponentSummary): boolean {
  return (
    debugUnlockAll ||
    collection.hasComponent(component.symbolId)
  );
}

function isCharacterUnlocked(
  character: AtlasCharacterReference,
  component: AtlasComponentSummary,
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
  component: AtlasComponentSummary,
  className = "",
): string {
  const label = escapeHtml(component.name);
  if (component.asset) {
    return `<span class="component-symbol ${className}" role="img" aria-label="${label}" style="--component-mask:url(&quot;${escapeHtml(assetUrl(component.asset))}&quot;)"></span>`;
  }
  return `<span class="${className}" aria-label="${label}">${label}</span>`;
}

function collectedCharacters(
  component: AtlasComponentSummary,
): { normal: number; external: number } {
  if (debugUnlockAll) {
    return {
      normal: component.progressCharCount,
      external: component.exCharCount,
    };
  }
  return {
    normal: Math.min(
      component.progressCharCount,
      collection.collectedNormalCountForComponent(
        component.symbolId,
        component.selfChar,
      ),
    ),
    external: Math.min(
      component.exCharCount,
      collection.collectedExternalCountForComponent(
        component.symbolId,
      ),
    ),
  };
}

function completionPercentage(
  component: AtlasComponentSummary,
): number {
  const collected = collectedCharacters(component);
  return componentCompletionPercentage({
    rarity: component.rarity,
    isExclusive: Boolean(component.isExclusive),
    progressCharCount: component.progressCharCount,
    collectedNormal: collected.normal,
    collectedExternal: collected.external,
  });
}

function reachedMilestones(component: AtlasComponentSummary): number {
  const percentage = completionPercentage(component);
  return component.milestones.filter(
    (milestone) => percentage >= milestone,
  ).length;
}

function renderMilestoneTicks(component: AtlasComponentSummary): string {
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

function renderComponentCard(component: AtlasComponentSummary): string {
  const unlocked = isComponentUnlocked(component);
  const completed =
    component.rarity !== "XR" &&
    unlocked &&
    reachedMilestones(component) === component.milestones.length;
  const selected = activeComponent?.symbolId === component.symbolId;
  return `
    <button
      class="atlas-component-card rarity-${component.rarity.toLowerCase()} ${unlocked ? "is-unlocked" : "is-locked"} ${completed ? "is-milestone-complete" : ""} ${selected ? "is-selected" : ""} ${component.isExclusive ? "has-ex-origin" : ""}"
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
            ${component.milestones.length ? renderMilestoneTicks(component) : ""}
            ${component.isExclusive ? EX_MARK_MARKUP : ""}
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
  const hasVisibleXr =
    debugUnlockAll ||
    atlas.components.some(
      (component) =>
        component.rarity === "XR" &&
        collection.hasComponent(component.symbolId),
    );

  filters.innerHTML = `
    ${switchMarkup(
      [
        { value: "all", label: "全部" },
        ...rarityOrder
          .filter(
            (rarity) => rarity !== "XR" || hasVisibleXr,
          )
          .map((rarity) => ({
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
      (component.rarity !== "XR" ||
        debugUnlockAll ||
        collection.hasComponent(component.symbolId)) &&
      (!component.isExclusive || isComponentUnlocked(component)) &&
      (activeRarity === "all" ||
        component.rarity === activeRarity) &&
      (activeAccess === "all" ||
        isComponentUnlocked(component)),
  );
  grid.innerHTML = components.map(renderComponentCard).join("");
}

function characterCard(
  character: AtlasCharacterReference,
  component: AtlasComponentSummary,
): string {
  const unlocked = isCharacterUnlocked(character, component);
  const levelClass = character.isUnreachable
    ? "is-unreachable"
    : character.isEx
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
  const meta = character.isUnreachable || character.isEx
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

function visibleCharactersFor(
  component: AtlasComponentSummary,
): AtlasCharacterReference[] {
  return activeCharacters.filter((character) => {
    if (
      character.isUnreachable &&
      !collection.hasCharWithComponent(
        character.char,
        component.symbolId,
      )
    ) {
      return false;
    }
    return (
      activeCharAccess === "all" ||
      isCharacterUnlocked(character, component)
    );
  });
}

function detailCountLabel(component: AtlasComponentSummary): string {
  if (component.rarity === "XR") {
    return `${component.count} 字`;
  }
  const collected = collectedCharacters(component);
  if (component.isExclusive) {
    return `${collected.external} / ${component.progressCharCount}`;
  }
  if (component.exCharCount > 0) {
    return `${collected.normal}+${collected.external} / ${component.progressCharCount}+${component.exCharCount}`;
  }
  return `${collected.normal} / ${component.progressCharCount}`;
}

function detailShellMarkup(
  component: AtlasComponentSummary,
  characterContent: string,
): string {
  const percentage = completionPercentage(component);
  return `
    <header class="atlas-detail-header">
      <button class="char-detail-close atlas-detail-close" type="button" data-atlas-detail-back aria-label="关闭详情">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 4 20 20M20 4 4 20"></path>
        </svg>
      </button>
      <div class="atlas-detail-symbol rarity-${component.rarity.toLowerCase()} ${component.isExclusive ? "has-ex-origin" : ""}">
        ${renderComponentGlyph(component, "atlas-detail-glyph")}
        ${component.isExclusive ? EX_MARK_MARKUP : ""}
      </div>
      <span class="atlas-detail-rarity ${component.isExclusive ? "is-exclusive" : ""}">${component.rarity}${component.isExclusive ? "-EX" : ""}</span>
    </header>
    <div class="atlas-detail-summary">
      <span>${detailCountLabel(component)}</span>
    </div>
    ${
      component.rarity !== "XR"
        ? `<div class="atlas-milestones">
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
    </div>`
        : ""
    }
    ${switchMarkup<AccessFilter>(
      [
        { value: "unlocked", label: "已解锁" },
        { value: "all", label: "全部" },
      ],
      activeCharAccess,
      "char-access",
    )}
    <div class="atlas-char-grid">${characterContent}</div>
  `;
}

function ensureGameData(): Promise<GameData> {
  gameDataPromise ??= loadGameData(appBaseUrl)
    .then((loaded) => {
      gameData = loaded;
      collection.reconcile(
        loaded.ways,
        (symbolId) => loaded.component(symbolId).name,
        atlas?.sourceHash ?? "",
        (char) => !loaded.levels.has(char),
      );
      return loaded;
    })
    .catch((error: unknown) => {
      gameDataPromise = null;
      throw error;
    });
  return gameDataPromise;
}

async function openCharacterDetail(char: string): Promise<void> {
  const loadedGameData = await ensureGameData();
  if (!detailView) {
    setupDetailView();
  }
  if (!detailView) {
    return;
  }
  const meta =
    loadedGameData.answerMeta(char) ||
    externalCharacterMeta(char);
  detailView.open(char, meta);
}

async function selectComponent(
  component: AtlasComponentSummary | null,
  historyMode: HistoryMode = "auto",
): Promise<void> {
  const wasOpen = activeComponent !== null;
  if (component?.rarity === "XR" && !debugUnlockAll) {
    component = null;
  }
  if (component?.symbolId !== activeComponent?.symbolId) {
    activeCharAccess = "unlocked";
  }
  activeComponent = component;
  activeCharacters = [];
  componentLoadToken += 1;
  const loadToken = componentLoadToken;
  const layout = document.querySelector<HTMLElement>(".atlas-layout");
  const detail = document.querySelector<HTMLElement>("[data-atlas-detail]");
  if (!layout || !detail) {
    return;
  }

  layout.classList.toggle("is-detail-open", Boolean(component));
  detail.scrollTop = 0;
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
    if (historyMode !== "none") {
      if (
        historyMode === "close" &&
        history.state?.atlasDetailEntry === "push"
      ) {
        history.back();
      } else {
        history.replaceState(
          { ...history.state, atlasDetail: false },
          "",
          url,
        );
      }
    }
    return;
  }

  url.searchParams.set("component", String(component.symbolId));
  if (historyMode !== "none") {
    const nextState = {
      ...history.state,
      atlasDetail: true,
      atlasDetailEntry:
        wasOpen && history.state?.atlasDetailEntry === "push"
          ? "push"
          : historyMode === "replace"
            ? history.state?.atlasDetailEntry === "push"
              ? "push"
              : "root"
            : "push",
    };
    if (historyMode === "replace" || wasOpen) {
      history.replaceState(nextState, "", url);
    } else {
      history.pushState(nextState, "", url);
    }
  }

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

  detail.innerHTML = detailShellMarkup(
    component,
    '<div class="atlas-char-loading">载入中…</div>',
  );
  bindDetailControls(detail);

  const needsDebugCharacterRefresh =
    debugUnlockAll && !gameData;
  void ensureGameData().then((loaded) => {
    if (
      needsDebugCharacterRefresh &&
      activeComponent?.symbolId === component.symbolId
    ) {
      void selectComponent(component, "replace");
      return;
    }
    if (
      collection.needsReconcile(atlas?.sourceHash ?? "") &&
      activeComponent?.symbolId === component.symbolId
    ) {
      collection.reconcile(
        loaded.ways,
        (symbolId) => loaded.component(symbolId).name,
        atlas?.sourceHash ?? "",
        (char) => !loaded.levels.has(char),
      );
      void selectComponent(component, "replace");
    }
  });

  let loadedCharacters: AtlasCharacterReference[];
  try {
    loadedCharacters = await loadComponentCharacters(
      document.baseURI,
      component.symbolId,
    );
  } catch {
    if (
      loadToken === componentLoadToken &&
      activeComponent?.symbolId === component.symbolId
    ) {
      const grid = detail.querySelector<HTMLElement>(
        ".atlas-char-grid",
      );
      if (grid) {
        grid.innerHTML =
          '<div class="atlas-char-loading">部件载入失败</div>';
      }
    }
    return;
  }
  if (
    loadToken !== componentLoadToken ||
    activeComponent?.symbolId !== component.symbolId
  ) {
    return;
  }
  activeCharacters = loadedCharacters;
  refreshCharacterGrid(detail);
}

function bindDetailControls(detail: HTMLElement): void {
  detail
    .querySelector<HTMLButtonElement>("[data-atlas-detail-back]")
    ?.addEventListener("click", () => {
      void selectComponent(null, "close");
    });
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
  detail
    .querySelector<HTMLElement>(".atlas-char-grid")
    ?.addEventListener("click", (event) => {
      const target = event.target;
      const card =
        target instanceof Element
          ? target.closest<HTMLElement>("[data-atlas-char]")
          : null;
      const char = card?.dataset.atlasChar;
      if (char) {
        void openCharacterDetail(char);
      }
    });
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
  grid.innerHTML = visibleCharactersFor(component)
    .map((character) => characterCard(character, component))
    .join("");
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
  if (!dialog) {
    detailView = null;
    return;
  }
  detailView = new CharDetailView(
    dialog,
    charDetails,
    decompositionMarkup,
  );
}

function collectionCountLabel(): string {
  if (!atlas) {
    return "0 / 0";
  }
  const baseUnlocked = atlas.components.filter(
    (component) =>
      !component.isExclusive &&
      component.rarity !== "XR" &&
      collection.hasComponent(component.symbolId),
  ).length;
  const exclusiveUnlocked = atlas.components.filter(
    (component) =>
      component.isExclusive &&
      collection.hasComponent(component.symbolId),
  ).length;
  const xrUnlocked = atlas.components.filter(
    (component) =>
      component.rarity === "XR" &&
      collection.hasComponent(component.symbolId),
  ).length;
  if (exclusiveUnlocked === 0 && xrUnlocked === 0) {
    return `${baseUnlocked} / ${atlas.componentCount}`;
  }
  const extraNumerator = [
    exclusiveUnlocked > 0 ? `+${exclusiveUnlocked}` : "",
    xrUnlocked > 0 ? `+${xrUnlocked}` : "",
  ].join("");
  const extraDenominator = [
    exclusiveUnlocked > 0 ? `+${exclusiveUnlocked}` : "",
    xrUnlocked > 0 ? `+${xrUnlocked}` : "",
  ].join("");
  return `${baseUnlocked}${extraNumerator}/${atlas.componentCount}${extraDenominator}`;
}

function renderAtlas(): void {
  if (!atlas) {
    return;
  }
  const selectedId = activeComponent?.symbolId;
  appRoot.innerHTML = `
    <div class="app-shell page-atlas">
      <button class="advanced-corner" type="button" data-atlas-advanced aria-label="高级设置" aria-pressed="${debugUnlockAll}"></button>
      ${crisBalanceMarkup(cris.load(), debugUnlockAll)}
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
              <div class="tutorial-kicker">ATLAS</div>
              <h1 id="atlas-title">图鉴</h1>
            </div>
            <div class="atlas-heading-actions">
              <span>${collectionCountLabel()}</span>
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
        void selectComponent(component);
      }
    });
  appRoot
    .querySelector<HTMLButtonElement>("[data-atlas-advanced]")
    ?.addEventListener("click", async () => {
      if (debugUnlockAll) {
        debugUnlockAll = false;
        revokeDebugAccess();
      } else {
        if (!(await requestDebugAccess())) {
          return;
        }
        debugUnlockAll = true;
      }
      if (!debugUnlockAll && activeRarity === "XR") {
        activeRarity = "all";
      }
      renderAtlas();
      if (!debugUnlockAll && activeComponent?.rarity === "XR") {
        void selectComponent(null, "replace");
        return;
      }
      if (selectedId !== undefined) {
        const selected = atlas?.components.find(
          (component) => component.symbolId === selectedId,
        );
        if (selected) {
          void selectComponent(selected, "replace");
        }
      }
    });
  if (selectedId !== undefined) {
    const selected = atlas.components.find(
      (component) => component.symbolId === selectedId,
    );
    if (selected) {
      void selectComponent(selected, "replace");
    }
  }
}

void loadComponentAtlas(document.baseURI)
  .then((loadedAtlas) => {
    atlas = loadedAtlas;
    const needsReconcile = collection.needsReconcile(
      loadedAtlas.sourceHash,
    );
    if (!needsReconcile) {
      collection.setSourceHash(loadedAtlas.sourceHash);
    }
    renderAtlas();
    const requested = Number(
      new URL(location.href).searchParams.get("component"),
    );
    const component = atlas.components.find(
      (entry) => entry.symbolId === requested,
    );
    if (
      component &&
      (debugUnlockAll || component.rarity !== "XR")
    ) {
      void selectComponent(component, "replace");
    } else {
      history.replaceState(
        { ...history.state, atlasDetail: false },
        "",
        location.href,
      );
    }
    if (needsReconcile) {
      void ensureGameData()
        .then(() => {
          renderAtlas();
        })
        .catch(() => {
          // Retain the migrated cache if the source table cannot load.
        });
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
