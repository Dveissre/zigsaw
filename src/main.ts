import "./styles.css";
import {
  CHALLENGE_DIFFICULTY_SECONDS,
  loadGameData,
  type ChallengeDifficulty,
  type ChallengeBounds,
  type ComponentDefinition,
  type GameData,
  type GameSettings,
  type Level,
  type Mode,
} from "./game/data";
import { CollectionStore } from "./game/collection";
import { CrisStore } from "./game/cris";
import { CharDetailStore } from "./game/details";
import { LocalRecordStore, recordKey } from "./game/records";
import {
  applySaveArchive,
  createSaveArchive,
  readSaveArchive,
  type SavePayloadV1,
} from "./game/save";
import {
  applyCompactSaveState,
  decodeSaveCode,
  encodeSaveCode,
  readCompactSaveState,
  type CompactSaveState,
} from "./game/save-code";
import { GameSession, type GameState } from "./game/session";
import {
  buildChallengeShareText,
  buildTrialShareText,
} from "./game/share";
import {
  TRIAL_BOSS_SECONDS,
  TRIAL_NORMAL_SECONDS,
  TRIAL_STAGE_COUNT,
  TrialSession,
  orderedBossAnswerChars,
  type TrialCard,
  type TrialCardSource,
  type FugueSlotState,
  type TrialHistoryItem,
  type TrialResultState,
  type TrialState,
} from "./game/trial";
import {
  trialAdvancementConfig,
  trialAdvancementUnlockedByFirstClear,
  type TrialAdvancementConfig,
} from "./game/trial-advancement";
import {
  TRIAL_ADVANCEMENT_AVAILABLE_MAX,
  TRIAL_ADVANCEMENT_MAX,
  TrialProgressStore,
} from "./game/trial-progress";
import {
  FALLBACK_TRIAL_RULE,
  loadTrialRules,
  sortTrialRulesByStars,
  trialRuleAnswerInput,
  trialRulePromptMode,
  trialRuleUsesPrompt,
  trialRuleUsesWordAnswer,
  type TrialRuleDefinition,
  type TrialRulesData,
} from "./game/trial-rules";
import {
  TrialRuntimeData,
  trialRuleDataRequirements,
} from "./game/trial-runtime-data";
import { ATLAS_TRIGGER_MARKUP } from "./ui/atlas";
import { CharDetailView } from "./ui/char-detail";
import {
  crisBalanceMarkup,
  crisIconMarkup,
} from "./ui/cris";
import {
  isDebugUnlocked,
  requestDebugAccess,
  revokeDebugAccess,
} from "./ui/debug-auth";
import { CHALLENGE_CARD_DECOR_MARKUP } from "./ui/decorations";
import {
  splitPartsIntoRows,
  uniqueCardUses,
} from "./ui/parts";
import {
  createTutorialDialog,
  TUTORIAL_TRIGGER_MARKUP,
} from "./ui/tutorial";

const rootElement = document.querySelector<HTMLDivElement>("#app");

if (!rootElement) {
  throw new Error("Missing #app root element.");
}

const root: HTMLDivElement = rootElement;
const experimentalPlay = root.hasAttribute("data-experimental-play");
const trialTestPage = root.hasAttribute("data-trial-test");
const appBaseUrl = root.dataset.appBase
  ? new URL(root.dataset.appBase, document.baseURI).href
  : document.baseURI;
const atlasHref = experimentalPlay
  ? new URL("atlas/", appBaseUrl).href
  : "./atlas/";
const gachaHref = experimentalPlay
  ? new URL("gacha/", appBaseUrl).href
  : "./gacha/";

const DEFAULT_SETTINGS: GameSettings = {
  levels: [1],
  partsLow: 2,
  partsHigh: 4,
  mode: "challenge",
  count: 10,
  seconds: 40,
  stageQuestions: 5,
  stageSize: 1500,
  stageShift: 300,
  exEnabled: true,
  includeSupplementaryChars: true,
  difficulty: "standard",
  trialAdvancement: 0,
};

let data: GameData | null = null;
let trialRules: TrialRulesData | null = null;
const trialRuntimeData = new TrialRuntimeData();
let startupError = "";
let session: GameSession | null = null;
let trialSession: TrialSession | null = null;
let lastSettings: GameSettings = structuredClone(DEFAULT_SETTINGS);
let composing = false;
let lastQuestionKey = "";
let lastTrialQuestionKey = "";
let lastTrialBossKey = "";
let animatedTrialConsumedCardIds = new Set<number>();
let animatedTrialObscuredCardIds = new Set<number>();
let lastRenderedPaused = false;
let lastTrialPaused = false;
let lastTimerFraction = 1;
let lastFugueTimerFractions: [number, number] = [1, 1];
let advancedSettingsOpen = isDebugUnlocked();
let trialDebugOpen = false;
let startingGame = false;
let startLayoutObserver: ResizeObserver | null = null;
let pageTransitionActive = false;
let shareToastTimer: number | null = null;

const MODE_ORDER: Mode[] = trialTestPage
  ? ["challenge", "trial", "normal"]
  : ["challenge", "normal"];
const visibleModeCount = trialTestPage
  ? MODE_ORDER.length
  : MODE_ORDER.length + 1;
const DIFFICULTY_ORDER: ChallengeDifficulty[] = [
  "beginner",
  "standard",
  "expert",
];
const DIFFICULTY_LABELS: Record<ChallengeDifficulty, string> = {
  beginner: "入门",
  standard: "普通",
  expert: "专家",
};
const DIFFICULTY_NOTES: Record<
  ChallengeDifficulty,
  readonly [string, string]
> = {
  beginner: [
    "作答时间 60 秒",
    "每完成 1 阶段，获得 1 次换题",
  ],
  standard: [
    "作答时间 40 秒",
    "每完成 4 阶段，获得 1 次换题",
  ],
  expert: [
    "作答时间 20 秒",
    "进入 EX 获得 1 次换题；之后每 10 题获得 1 次",
  ],
};

const records = new LocalRecordStore();
const cris = new CrisStore();
const collection = new CollectionStore();
const trialProgress = new TrialProgressStore();
const charDetails = new CharDetailStore(appBaseUrl);
const tutorialDialog = createTutorialDialog();
let resumeAfterTutorial = false;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.setAttribute("readonly", "");
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }
}

function showShareToast(message: string): void {
  let toast = document.querySelector<HTMLElement>("[data-share-toast]");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "share-toast";
    toast.dataset.shareToast = "";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.addEventListener("transitionend", () => {
      if (!toast?.classList.contains("is-visible")) {
        if (toast) {
          toast.hidden = true;
        }
      }
    });
    document.body.append(toast);
  }

  const actions = document
    .querySelector<HTMLElement>(".result-actions")
    ?.getBoundingClientRect();
  if (actions) {
    toast.style.bottom = `${Math.max(
      24,
      window.innerHeight - actions.top + 12,
    )}px`;
  }

  if (shareToastTimer !== null) {
    window.clearTimeout(shareToastTimer);
  }
  toast.textContent = message;
  toast.hidden = false;
  toast.classList.remove("is-visible");
  void toast.offsetWidth;
  toast.classList.add("is-visible");
  shareToastTimer = window.setTimeout(() => {
    shareToastTimer = null;
    toast?.classList.remove("is-visible");
  }, 1800);
}

function wireResultShareButton(shareText: string): void {
  document
    .querySelector<HTMLButtonElement>("[data-share]")
    ?.addEventListener("click", async (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      button.disabled = true;
      try {
        showShareToast(
          (await copyText(shareText))
            ? "已复制至剪贴板"
            : "复制失败",
        );
      } finally {
        button.disabled = false;
      }
    });
}

function renderComponent(
  component: ComponentDefinition,
  inPlay = false,
): {
  html: string;
  long: boolean;
  hasAsset: boolean;
  isEnclosedFrame: boolean;
} {
  const label = escapeHtml(component.name);
  const isEnclosedFrame = inPlay && component.name === "囗";
  if (component.assetUrl) {
    const content = `<span class="component-symbol" role="img" aria-label="${label}" style="--component-mask:url(&quot;${escapeHtml(component.assetUrl)}&quot;)"></span>`;
    return {
      html: isEnclosedFrame
        ? `<span class="part-glyph">${content}</span><span class="part-note">（国字框）</span>`
        : content,
      long: false,
      hasAsset: true,
      isEnclosedFrame,
    };
  }
  return {
    html: isEnclosedFrame
      ? `<span class="part-glyph">${label}</span><span class="part-note">（国字框）</span>`
      : label,
    long: [...component.name].length > 1,
    hasAsset: false,
    isEnclosedFrame,
  };
}

function hasTrialDebugContext(): boolean {
  return Boolean(
    trialSession &&
      trialSession.state.phase !== "results",
  );
}

function hasTrialDebugAccess(): boolean {
  return (
    advancedSettingsOpen ||
    (trialDebugOpen && hasTrialDebugContext())
  );
}

function shell(
  content: string,
  page: "start" | "play" | "result",
): string {
  const settingsLocked =
    Boolean(session && session.state.phase === "playing");
  const crisTotal = cris.load();
  return `
    <div class="app-shell page-${page} ${experimentalPlay ? "is-test-version" : ""}">
      <button class="advanced-corner" type="button" aria-label="调试入口" aria-pressed="${hasTrialDebugAccess()}"></button>
      ${crisBalanceMarkup(crisTotal, advancedSettingsOpen)}
      <div class="corner-actions">
        ${TUTORIAL_TRIGGER_MARKUP}
        ${ATLAS_TRIGGER_MARKUP.replace(
          'href="./atlas/"',
          `href="${escapeHtml(atlasHref)}"`,
        )}
        <button class="corner-icon-button" type="button" data-game-settings-trigger aria-controls="game-settings-dialog" aria-label="设置">
          <svg class="settings-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.7l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.7v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2Z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        </button>
      </div>
      <header class="masthead">
        <h1 class="wordmark">ZI<span>GSAW</span></h1>
      </header>
      ${
        page === "start"
          ? `<a class="home-decoration" href="${escapeHtml(gachaHref)}" data-gacha-entry aria-label="进入写字台"><span class="gacha-decoration-label" aria-hidden="true">进入写字台</span>${CHALLENGE_CARD_DECOR_MARKUP}</a>`
          : ""
      }
      ${content}
      <dialog class="game-settings-dialog" id="game-settings-dialog" data-game-settings-dialog aria-labelledby="game-settings-title">
        <article class="game-settings-panel">
          <header class="game-settings-header">
            <div>
              <div class="game-settings-kicker">SETTINGS</div>
              <h2 id="game-settings-title">设置</h2>
            </div>
            <button class="char-detail-close game-settings-close" type="button" data-game-settings-close aria-label="关闭设置">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 4 20 20M20 4 4 20"></path>
              </svg>
            </button>
          </header>
          <div class="game-settings-content">
            <div class="game-setting-row supplementary-setting">
              <div class="game-setting-copy">
                <strong>难输入汉字</strong>
              </div>
              <div class="segmented rare-char-toggle" role="group" aria-label="难输入汉字" aria-describedby="supplementary-character-note" data-active-supplementary="${lastSettings.includeSupplementaryChars}" style="--ex-position:${lastSettings.includeSupplementaryChars ? 0 : 1}">
                <span class="choice-slider" aria-hidden="true"></span>
                <button type="button" data-include-supplementary="true" aria-pressed="${lastSettings.includeSupplementaryChars ? "true" : "false"}" ${settingsLocked ? "disabled" : ""}>启用</button>
                <button type="button" data-include-supplementary="false" aria-pressed="${lastSettings.includeSupplementaryChars ? "false" : "true"}" ${settingsLocked ? "disabled" : ""}>排除</button>
              </div>
              <p class="game-setting-note" id="supplementary-character-note">排除后，将不会出现基本多文种平面外汉字</p>
            </div>
            <div class="game-setting-row">
              <div class="game-setting-copy">
                <strong>阶段EX</strong>
              </div>
              <div class="segmented ex-toggle" role="group" aria-label="阶段EX" data-active-ex="${lastSettings.exEnabled}" style="--ex-position:${lastSettings.exEnabled ? 0 : 1}">
                <span class="choice-slider" aria-hidden="true"></span>
                <button type="button" data-ex-enabled="true" aria-pressed="${lastSettings.exEnabled ? "true" : "false"}" ${settingsLocked ? "disabled" : ""}>启用</button>
                <button type="button" data-ex-enabled="false" aria-pressed="${lastSettings.exEnabled ? "false" : "true"}" ${settingsLocked ? "disabled" : ""}>关闭</button>
              </div>
            </div>
            <div class="game-setting-row save-setting-row">
              <div class="game-setting-copy">
                <strong>存档</strong>
              </div>
              <div class="save-setting-actions" role="group" aria-label="存档操作">
                <button type="button" data-save-download>下载</button>
                <button type="button" data-save-upload>上传</button>
                <input data-save-file type="file" accept=".zsave,.json,application/json,application/octet-stream" hidden>
              </div>
              <p class="game-setting-note save-setting-note" data-save-status aria-live="polite"></p>
            </div>
            <div class="game-setting-row save-code-setting-row">
              <div class="game-setting-copy">
                <strong>存档码 <span class="save-code-beta">(beta)</span></strong>
              </div>
              <button class="save-code-open-button" type="button" data-save-code-open aria-haspopup="dialog">打开</button>
            </div>
            <a class="git-setting-link" href="https://github.com/Dveissre/zigsaw" target="_blank" rel="noreferrer">
              <span>Git页</span>
              <span>github.com/Dveissre/zigsaw ↗</span>
            </a>
          </div>
        </article>
      </dialog>
      <dialog class="save-confirm-dialog" data-save-confirm-dialog aria-labelledby="save-confirm-title">
        <article class="save-confirm-panel">
          <div class="game-settings-kicker">REPLACE SAVE</div>
          <h2 id="save-confirm-title">覆盖当前存档？</h2>
          <p>上传 <strong data-save-filename></strong> 后，当前图鉴、纪录、分光水晶等进度将被文件内容覆盖，且无法撤销。</p>
          <div class="save-confirm-actions">
            <button type="button" data-save-cancel>取消</button>
            <button class="primary-action" type="button" data-save-confirm>覆盖存档</button>
          </div>
        </article>
      </dialog>
      <dialog class="save-code-dialog" data-save-code-dialog aria-labelledby="save-code-title">
        <article class="save-code-panel">
          <header class="save-code-header">
            <div>
              <div class="game-settings-kicker">SAVE CODE · BETA</div>
              <h2 id="save-code-title">存档码 <span>(beta)</span></h2>
            </div>
            <button class="char-detail-close game-settings-close" type="button" data-save-code-close aria-label="关闭存档码">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 4 20 20M20 4 4 20"></path>
              </svg>
            </button>
          </header>
          <div class="save-code-content">
            <textarea data-save-code-value rows="10" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="存档码" placeholder="点击“获取”生成存档码，或粘贴存档码后导入。"></textarea>
            <div class="save-code-status-row">
              <span data-save-code-length></span>
              <p data-save-code-status aria-live="polite"></p>
            </div>
            <div class="save-code-actions">
              <button class="primary-action" type="button" data-save-code-action data-action="acquire">获取</button>
              <button type="button" data-save-code-import>导入</button>
            </div>
          </div>
        </article>
      </dialog>
      <dialog class="save-confirm-dialog save-code-confirm-dialog" data-save-code-confirm-dialog aria-labelledby="save-code-confirm-title">
        <article class="save-confirm-panel">
          <div class="game-settings-kicker">IMPORT SAVE CODE</div>
          <h2 id="save-code-confirm-title">导入存档码？</h2>
          <p>导入后，当前图鉴、纪录、分光水晶等进度将被存档码中的内容覆盖，且无法撤销。</p>
          <div class="save-confirm-actions">
            <button type="button" data-save-code-cancel>取消</button>
            <button class="primary-action" type="button" data-save-code-confirm>覆盖存档</button>
          </div>
        </article>
      </dialog>
    </div>
  `;
}

function refreshCrisBalance(): void {
  const balance = document.querySelector<HTMLElement>(".corner-cris");
  if (!balance) {
    return;
  }
  balance.outerHTML = crisBalanceMarkup(
    cris.load(),
    advancedSettingsOpen,
  );
}

function withPageTransition(update: () => void): void {
  const transitionDocument = document as Document & {
    startViewTransition?: (
      callback: () => void,
    ) => { finished: Promise<void> };
  };
  if (
    pageTransitionActive ||
    !transitionDocument.startViewTransition ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    update();
    return;
  }

  pageTransitionActive = true;
  try {
    const transition = transitionDocument.startViewTransition(update);
    void transition.finished.then(
      () => {
        pageTransitionActive = false;
      },
      () => {
        pageTransitionActive = false;
      },
    );
  } catch {
    pageTransitionActive = false;
    update();
  }
}

function positionStartPage(): void {
  const shellElement = document.querySelector<HTMLElement>(".page-start");
  const masthead =
    shellElement?.querySelector<HTMLElement>(".masthead");
  const form =
    shellElement?.querySelector<HTMLElement>(".settings-form");
  if (!shellElement || !masthead || !form) {
    return;
  }

  shellElement.style.setProperty("--start-drop", "0px");
  const shellBox = shellElement.getBoundingClientRect();
  const mastheadBox = masthead.getBoundingClientRect();
  const formBox = form.getBoundingClientRect();
  const groupCenter =
    (mastheadBox.top + formBox.bottom) / 2;
  const targetCenter = shellBox.top + shellBox.height * 0.44;
  const availableDrop =
    shellBox.bottom - formBox.bottom - 16;
  const drop = Math.max(
    0,
    Math.min(
      targetCenter - groupCenter,
      Math.max(0, availableDrop),
    ),
  );
  shellElement.style.setProperty("--start-drop", `${drop}px`);
}

function setupStartLayout(): void {
  startLayoutObserver?.disconnect();
  startLayoutObserver = null;
  const form = document.querySelector<HTMLElement>(".settings-form");
  const stack = form?.querySelector<HTMLElement>(".settings-stack");
  if (!form || !stack) {
    return;
  }

  const modeButtons = [
    ...document.querySelectorAll<HTMLButtonElement>("[data-mode]"),
  ];
  const currentMode = selectedMode();
  const pressedStates = modeButtons.map((button) => [
    button,
    button.getAttribute("aria-pressed"),
  ] as const);

  form.style.minHeight = "0px";
  stack.style.minHeight = "0px";
  let maximumStackHeight = 0;
  let maximumStartRowHeight = 0;
  const startRow = form.querySelector<HTMLElement>(".start-row");
  if (!startRow) {
    return;
  }
  for (const mode of MODE_ORDER) {
    modeButtons.forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.mode === mode),
      );
    });
    updateModeFields();
    updateStartRecord();
    maximumStackHeight = Math.max(
      maximumStackHeight,
      stack.getBoundingClientRect().height,
    );
    maximumStartRowHeight = Math.max(
      maximumStartRowHeight,
      startRow.getBoundingClientRect().height,
    );
  }
  for (const [button, pressed] of pressedStates) {
    if (pressed === null) {
      button.removeAttribute("aria-pressed");
    } else {
      button.setAttribute("aria-pressed", pressed);
    }
  }
  stack.style.minHeight = `${Math.ceil(maximumStackHeight)}px`;
  form.style.minHeight = `${Math.ceil(
    maximumStackHeight + maximumStartRowHeight,
  )}px`;

  modeButtons.forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.mode === currentMode),
    );
  });
  updateModeFields();
  updateStartRecord();
  positionStartPage();
  requestAnimationFrame(positionStartPage);
  startLayoutObserver = new ResizeObserver(positionStartPage);
  startLayoutObserver.observe(form);
}

function openInfoDialog(dialog: HTMLDialogElement): void {
  if (dialog.open || document.querySelector("dialog[open]")) {
    return;
  }

  resumeAfterTutorial = Boolean(
    (session &&
      session.state.phase === "playing" &&
      !session.state.paused &&
      !session.state.revealing) ||
      (trialSession &&
        (trialSession.state.phase === "playing" ||
          trialSession.state.phase === "boss") &&
        !trialSession.state.paused &&
        !trialSession.state.revealing),
  );
  if (resumeAfterTutorial) {
    if (session) {
      session.togglePause();
    } else {
      trialSession?.togglePause();
    }
  }
  const currentDialog = dialog.isConnected
    ? dialog
    : document.querySelector<HTMLDialogElement>(
        `#${CSS.escape(dialog.id)}`,
      );
  currentDialog?.showModal();
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  if (target.closest("[data-tutorial-trigger]")) {
    openInfoDialog(tutorialDialog);
    return;
  }
  if (target.closest("[data-game-settings-trigger]")) {
    const settingsDialog =
      document.querySelector<HTMLDialogElement>(
        "[data-game-settings-dialog]",
      );
    if (settingsDialog) {
      openInfoDialog(settingsDialog);
    }
    return;
  }

  const gachaEntry = target.closest<HTMLAnchorElement>(
    "[data-gacha-entry]",
  );
  if (gachaEntry) {
    if (
      window.matchMedia("(hover: none), (pointer: coarse)").matches &&
      !gachaEntry.classList.contains("is-open")
    ) {
      event.preventDefault();
      gachaEntry.classList.add("is-open");
    }
    return;
  }

  document
    .querySelectorAll<HTMLElement>("[data-gacha-entry].is-open")
    .forEach((entry) => entry.classList.remove("is-open"));
});

document.addEventListener("change", (event) => {
  const target = event.target;
  if (
    !(target instanceof HTMLInputElement) ||
    !target.hasAttribute("data-debug-cris")
  ) {
    return;
  }
  target.value = String(
    cris.set(Number(target.value)),
  );
});

function finishInfoDialog(): void {
  const shouldResume = resumeAfterTutorial;
  resumeAfterTutorial = false;
  if (
    shouldResume &&
    session?.state.phase === "playing" &&
    session.state.paused &&
    !session.state.revealing
  ) {
    session.togglePause();
    return;
  }
  if (
    shouldResume &&
    trialSession &&
    (trialSession.state.phase === "playing" ||
      trialSession.state.phase === "boss") &&
    trialSession.state.paused &&
    !trialSession.state.revealing
  ) {
    trialSession.togglePause();
  }
}

tutorialDialog.addEventListener("close", finishInfoDialog);

function setSaveStatus(
  dialog: HTMLDialogElement,
  message: string,
  state: "idle" | "success" | "error" = "idle",
): void {
  const status =
    dialog.querySelector<HTMLElement>("[data-save-status]");
  if (!status) {
    return;
  }
  status.textContent = message;
  status.dataset.state = state;
}

function saveFilename(now = new Date()): string {
  const date = [
    String(now.getFullYear()).slice(-2),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const random = globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  const suffix = (random % 36 ** 4)
    .toString(36)
    .padStart(4, "0")
    .toUpperCase();
  return `zigsaw-${date}-${suffix}.zsave`;
}

function wireSaveControls(dialog: HTMLDialogElement): void {
  const downloadButton =
    dialog.querySelector<HTMLButtonElement>("[data-save-download]");
  const uploadButton =
    dialog.querySelector<HTMLButtonElement>("[data-save-upload]");
  const fileInput =
    dialog.querySelector<HTMLInputElement>("[data-save-file]");
  const confirmDialog =
    document.querySelector<HTMLDialogElement>(
      "[data-save-confirm-dialog]",
    );
  if (!downloadButton || !uploadButton || !fileInput || !confirmDialog) {
    return;
  }

  let pendingSave: SavePayloadV1 | null = null;

  downloadButton.addEventListener("click", () => {
    void (async () => {
      downloadButton.disabled = true;
      setSaveStatus(dialog, "正在生成加密存档…");
      try {
        const serialized = await createSaveArchive(localStorage);
        const blob = new Blob([serialized], {
          type: "application/octet-stream",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = saveFilename();
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
        setSaveStatus(dialog, "存档已下载", "success");
      } catch (error) {
        setSaveStatus(
          dialog,
          error instanceof Error ? error.message : "存档下载失败",
          "error",
        );
      } finally {
        downloadButton.disabled = false;
      }
    })();
  });

  uploadButton.addEventListener("click", () => {
    fileInput.value = "";
    fileInput.click();
  });

  fileInput.addEventListener("change", () => {
    void (async () => {
      const file = fileInput.files?.[0];
      if (!file) {
        return;
      }
      setSaveStatus(dialog, "正在校验存档…");
      try {
        const serialized = await file.text();
        pendingSave = await readSaveArchive(serialized);
        const filename =
          confirmDialog.querySelector<HTMLElement>(
            "[data-save-filename]",
          );
        if (filename) {
          filename.textContent = file.name;
        }
        setSaveStatus(dialog, "");
        confirmDialog.showModal();
      } catch (error) {
        pendingSave = null;
        setSaveStatus(
          dialog,
          error instanceof Error ? error.message : "存档读取失败",
          "error",
        );
      }
    })();
  });

  confirmDialog
    .querySelector<HTMLButtonElement>("[data-save-cancel]")
    ?.addEventListener("click", () => confirmDialog.close());
  confirmDialog.addEventListener("close", () => {
    pendingSave = null;
  });
  confirmDialog
    .querySelector<HTMLButtonElement>("[data-save-confirm]")
    ?.addEventListener("click", (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      if (!pendingSave) {
        confirmDialog.close();
        return;
      }
      button.disabled = true;
      try {
        applySaveArchive(pendingSave, localStorage);
        setSaveStatus(dialog, "存档已覆盖，正在刷新…", "success");
        window.location.reload();
      } catch (error) {
        confirmDialog.close();
        setSaveStatus(
          dialog,
          error instanceof Error ? error.message : "存档覆盖失败",
          "error",
        );
      } finally {
        button.disabled = false;
      }
    });
}

function setSaveCodeStatus(
  dialog: HTMLDialogElement,
  message: string,
  state: "idle" | "success" | "error" = "idle",
): void {
  const status = dialog.querySelector<HTMLElement>(
    "[data-save-code-status]",
  );
  if (!status) {
    return;
  }
  status.textContent = message;
  status.dataset.state = state;
}

function wireSaveCodeControls(settingsDialog: HTMLDialogElement): void {
  const openButton = settingsDialog.querySelector<HTMLButtonElement>(
    "[data-save-code-open]",
  );
  const dialog = document.querySelector<HTMLDialogElement>(
    "[data-save-code-dialog]",
  );
  const confirmDialog = document.querySelector<HTMLDialogElement>(
    "[data-save-code-confirm-dialog]",
  );
  if (!openButton || !dialog || !confirmDialog) {
    return;
  }

  const textarea = dialog.querySelector<HTMLTextAreaElement>(
    "[data-save-code-value]",
  );
  const actionButton = dialog.querySelector<HTMLButtonElement>(
    "[data-save-code-action]",
  );
  const importButton = dialog.querySelector<HTMLButtonElement>(
    "[data-save-code-import]",
  );
  const lengthLabel = dialog.querySelector<HTMLElement>(
    "[data-save-code-length]",
  );
  if (!textarea || !actionButton || !importButton || !lengthLabel) {
    return;
  }

  let pendingState: CompactSaveState | null = null;

  const reset = (): void => {
    textarea.value = "";
    textarea.placeholder =
      "点击“获取”生成存档码，或粘贴存档码后导入。";
    actionButton.dataset.action = "acquire";
    actionButton.textContent = "获取";
    lengthLabel.textContent = "";
    setSaveCodeStatus(dialog, "");
  };

  openButton.addEventListener("click", () => {
    if (dialog.open) {
      return;
    }
    reset();
    dialog.showModal();
  });

  dialog
    .querySelector<HTMLButtonElement>("[data-save-code-close]")
    ?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      dialog.close();
    }
  });

  textarea.addEventListener("input", () => {
    lengthLabel.textContent = textarea.value
      ? `${textarea.value.replace(/\s+/gu, "").length} 字符`
      : "";
    setSaveCodeStatus(dialog, "");
  });

  actionButton.addEventListener("click", () => {
    void (async () => {
      if (actionButton.dataset.action === "copy") {
        if (!textarea.value) {
          setSaveCodeStatus(dialog, "请先生成存档码", "error");
          return;
        }
        actionButton.disabled = true;
        try {
          const copied = await copyText(textarea.value);
          setSaveCodeStatus(
            dialog,
            copied ? "已复制存档码" : "复制失败，请长按文本框复制",
            copied ? "success" : "error",
          );
        } finally {
          actionButton.disabled = false;
        }
        return;
      }

      actionButton.disabled = true;
      actionButton.textContent = "生成中…";
      setSaveCodeStatus(dialog, "正在生成紧凑存档码…");
      try {
        const state = readCompactSaveState(localStorage);
        const code = await encodeSaveCode(state);
        textarea.value = code;
        textarea.focus();
        textarea.select();
        actionButton.dataset.action = "copy";
        actionButton.textContent = "复制";
        lengthLabel.textContent = `${code.length} 字符`;
        setSaveCodeStatus(
          dialog,
          "存档码已生成，可复制到剪贴板",
          "success",
        );
      } catch (error) {
        actionButton.dataset.action = "acquire";
        actionButton.textContent = "获取";
        setSaveCodeStatus(
          dialog,
          error instanceof Error ? error.message : "存档码生成失败",
          "error",
        );
      } finally {
        actionButton.disabled = false;
      }
    })();
  });

  importButton.addEventListener("click", () => {
    void (async () => {
      const code = textarea.value.trim();
      if (!code) {
        setSaveCodeStatus(
          dialog,
          "请先粘贴要导入的存档码",
          "error",
        );
        textarea.focus();
        return;
      }
      importButton.disabled = true;
      setSaveCodeStatus(dialog, "正在校验存档码…");
      try {
        pendingState = await decodeSaveCode(code);
        setSaveCodeStatus(dialog, "");
        confirmDialog.showModal();
      } catch (error) {
        pendingState = null;
        setSaveCodeStatus(
          dialog,
          error instanceof Error ? error.message : "存档码读取失败",
          "error",
        );
      } finally {
        importButton.disabled = false;
      }
    })();
  });

  confirmDialog
    .querySelector<HTMLButtonElement>("[data-save-code-cancel]")
    ?.addEventListener("click", () => confirmDialog.close());
  confirmDialog.addEventListener("close", () => {
    pendingState = null;
  });
  confirmDialog
    .querySelector<HTMLButtonElement>("[data-save-code-confirm]")
    ?.addEventListener("click", (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      if (!pendingState) {
        confirmDialog.close();
        return;
      }
      if (!data) {
        confirmDialog.close();
        setSaveCodeStatus(
          dialog,
          "游戏数据尚未载入，请稍后重试",
          "error",
        );
        return;
      }
      button.disabled = true;
      try {
        applyCompactSaveState(
          pendingState,
          data,
          localStorage,
        );
        setSaveCodeStatus(
          dialog,
          "存档码已导入，正在刷新…",
          "success",
        );
        window.location.reload();
      } catch (error) {
        confirmDialog.close();
        setSaveCodeStatus(
          dialog,
          error instanceof Error ? error.message : "存档码导入失败",
          "error",
        );
      } finally {
        button.disabled = false;
      }
    });
}

function wireGameSettingsDialog(): void {
  const dialog =
    document.querySelector<HTMLDialogElement>(
      "[data-game-settings-dialog]",
    );
  if (!dialog || dialog.dataset.wired === "true") {
    return;
  }
  dialog.dataset.wired = "true";
  dialog.addEventListener("close", finishInfoDialog);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      dialog.close();
    }
  });
  dialog
    .querySelector<HTMLButtonElement>("[data-game-settings-close]")
    ?.addEventListener("click", () => dialog.close());
  dialog
    .querySelectorAll<HTMLButtonElement>("[data-ex-enabled]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const enabled = button.dataset.exEnabled === "true";
        dialog
          .querySelectorAll<HTMLButtonElement>("[data-ex-enabled]")
          .forEach((peer) => {
            peer.setAttribute(
              "aria-pressed",
              String(peer === button),
            );
          });
        const toggle =
          dialog.querySelector<HTMLElement>(".ex-toggle");
        if (toggle) {
          toggle.dataset.activeEx = String(enabled);
          toggle.style.setProperty(
            "--ex-position",
            enabled ? "0" : "1",
          );
        }
        lastSettings.exEnabled = enabled;
        session?.setExEnabled(enabled);
        if (!session) {
          updateStartRecord();
        }
      });
    });
  dialog
    .querySelectorAll<HTMLButtonElement>("[data-include-supplementary]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const enabled = button.dataset.includeSupplementary === "true";
        dialog
          .querySelectorAll<HTMLButtonElement>(
            "[data-include-supplementary]",
          )
          .forEach((peer) => {
            peer.setAttribute(
              "aria-pressed",
              String(peer === button),
            );
          });
        const toggle =
          dialog.querySelector<HTMLElement>(".rare-char-toggle");
        if (toggle) {
          toggle.dataset.activeSupplementary = String(enabled);
          toggle.style.setProperty(
            "--ex-position",
            enabled ? "0" : "1",
          );
        }
        lastSettings.includeSupplementaryChars = enabled;
        if (!session) {
          updateStartRecord();
        }
      });
    });
  wireSaveControls(dialog);
  wireSaveCodeControls(dialog);
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (
    !(target instanceof Element) ||
    !target.closest(".advanced-corner")
  ) {
    return;
  }
  void (async () => {
    let resumeAfterDebugAccess: (() => void) | null = null;
    if (!hasTrialDebugAccess()) {
      if (
        session?.state.phase === "playing" &&
        !session.state.paused &&
        !session.state.revealing
      ) {
        session.togglePause();
        resumeAfterDebugAccess = () => session?.togglePause();
      } else if (
        trialSession &&
        (trialSession.state.phase === "playing" ||
          trialSession.state.phase === "boss") &&
        !trialSession.state.paused &&
        !trialSession.state.revealing
      ) {
        trialSession.togglePause();
        resumeAfterDebugAccess = () =>
          trialSession?.togglePause();
      }
      const access = await requestDebugAccess({
        allowTrialScoped: hasTrialDebugContext(),
      });
      if (!access) {
        resumeAfterDebugAccess?.();
        return;
      }
      if (access === "full") {
        advancedSettingsOpen = true;
      } else {
        trialDebugOpen = true;
      }
    } else {
      const hadFullAccess = advancedSettingsOpen;
      advancedSettingsOpen = false;
      trialDebugOpen = false;
      if (hadFullAccess) {
        revokeDebugAccess();
      }
    }

    document
      .querySelector<HTMLButtonElement>(".advanced-corner")
      ?.setAttribute(
        "aria-pressed",
        String(hasTrialDebugAccess()),
      );
    refreshCrisBalance();

    resumeAfterDebugAccess?.();
    if (
      trialSession &&
      (trialSession.state.phase === "playing" ||
        trialSession.state.phase === "boss")
    ) {
      renderTrial(trialSession);
      return;
    }
    if (resumeAfterDebugAccess) {
      return;
    }

    const form =
      document.querySelector<HTMLFormElement>(
        "[data-settings-form]",
      );
    if (form) {
      syncAdvancedSettings();
      form.dataset.advancedOpen = String(
        advancedSettingsOpen,
      );
      setupStartLayout();
    }

    if (trialSession?.state.phase === "stage-intro") {
      if (
        !advancedSettingsOpen &&
        trialSession.state.forcedRuleId
      ) {
        trialSession.setRuleOverride(null);
      } else {
        renderTrialStageIntro(trialSession);
      }
    }
  })();
});

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function formatPartsStop(value: number): string {
  return value >= 5 ? "5+" : String(value);
}

function updatePartsSlider(): void {
  const lowInput = document.querySelector<HTMLInputElement>("#parts-low");
  const highInput = document.querySelector<HTMLInputElement>("#parts-high");
  const lowLabel = document.querySelector<HTMLElement>("[data-parts-low]");
  const highLabel = document.querySelector<HTMLElement>("[data-parts-high]");
  const lowMarker = document.querySelector<HTMLElement>("[data-range-marker-low]");
  const highMarker = document.querySelector<HTMLElement>("[data-range-marker-high]");
  const track = document.querySelector<HTMLElement>("[data-range-track]");

  if (
    !lowInput ||
    !highInput ||
    !lowLabel ||
    !highLabel ||
    !lowMarker ||
    !highMarker ||
    !track
  ) {
    return;
  }

  let lowStop = Number(lowInput.value);
  let highStop = Number(highInput.value);

  if (lowStop > highStop) {
    if (document.activeElement === lowInput) {
      highStop = lowStop;
      highInput.value = String(highStop);
    } else {
      lowStop = highStop;
      lowInput.value = String(lowStop);
    }
  }

  const start = ((lowStop - 2) / 3) * 100;
  const end = ((highStop - 2) / 3) * 100;
  track.style.setProperty("--range-start", `${start}%`);
  track.style.setProperty("--range-end", `${end}%`);
  lowMarker.style.left = `calc(${start}% - ${(start / 100) * 10}px)`;
  highMarker.style.left = `calc(${end}% - ${(end / 100) * 10}px)`;

  lowLabel.textContent = formatPartsStop(lowStop);
  highLabel.textContent = formatPartsStop(highStop);
}

function selectedMode(): Mode {
  return (
    (document.querySelector<HTMLButtonElement>(
      "[data-mode][aria-pressed='true']",
    )?.dataset.mode as Mode | undefined) ?? "challenge"
  );
}

function practiceEndlessEnabled(): boolean {
  return Boolean(
    document.querySelector(
      "[data-practice-endless][aria-pressed='true']",
    ),
  );
}

function updatePracticeCountControl(): void {
  const endless = practiceEndlessEnabled();
  const stepper =
    document.querySelector<HTMLElement>("[data-count-stepper]");
  stepper?.setAttribute("aria-disabled", String(endless));
  stepper
    ?.querySelectorAll<HTMLButtonElement | HTMLInputElement>(
      "button, input",
    )
    .forEach((control) => {
      control.disabled = endless;
    });
}

function selectedDifficulty(): ChallengeDifficulty {
  return (
    (document.querySelector<HTMLButtonElement>(
      "[data-difficulty][aria-pressed='true']",
    )?.dataset.difficulty as ChallengeDifficulty | undefined) ??
    "standard"
  );
}

function updateDifficultyNotes(): void {
  const difficulty = selectedDifficulty();
  const slider =
    document.querySelector<HTMLElement>(".difficulty-toggle");
  if (slider) {
    slider.style.setProperty(
      "--difficulty-position",
      String(DIFFICULTY_ORDER.indexOf(difficulty)),
    );
  }
  const notes =
    DIFFICULTY_NOTES[difficulty];
  document
    .querySelector<HTMLElement>("[data-difficulty-note='time']")
    ?.replaceChildren(notes[0]);
  document
    .querySelector<HTMLElement>("[data-difficulty-note='reward']")
    ?.replaceChildren(notes[1]);
}

function trialAdvancementButtons(
  carousel: HTMLElement,
): HTMLButtonElement[] {
  return [
    ...carousel.querySelectorAll<HTMLButtonElement>(
      "[data-trial-difficulty-value]",
    ),
  ];
}

function focusTrialDifficultyCarousel(
  carousel: HTMLElement,
): void {
  const buttons = trialAdvancementButtons(carousel);
  if (buttons.length === 0) {
    return;
  }
  const viewportCenter =
    carousel.getBoundingClientRect().left +
    carousel.clientWidth / 2;
  let closest: HTMLButtonElement | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const button of buttons) {
    const rect = button.getBoundingClientRect();
    const distance = Math.abs(
      rect.left + rect.width / 2 - viewportCenter,
    );
    const normalized = Math.min(
      1,
      distance / Math.max(64, rect.width * 1.8),
    );
    button.style.setProperty(
      "--trial-distance",
      normalized.toFixed(3),
    );
    button.classList.toggle("is-center", distance < rect.width / 2);
    if (distance < closestDistance) {
      closest = button;
      closestDistance = distance;
    }
  }
  if (!closest) {
    return;
  }
  const value = String(
    clamp(
      Number(closest.dataset.trialDifficultyValue),
      0,
      TRIAL_ADVANCEMENT_MAX,
    ),
  );
  carousel.dataset.activeTrialDifficulty = value;
  buttons.forEach((button) => {
    const selected =
      button.dataset.trialDifficultyValue === value;
    button.setAttribute("aria-pressed", String(selected));
    button.setAttribute("aria-selected", String(selected));
  });
  updateTrialAdvancementUi(carousel, Number(value));
}

function centerTrialDifficultyValue(
  carousel: HTMLElement,
  value: number,
  behavior: ScrollBehavior = "smooth",
): void {
  const button = carousel.querySelector<HTMLButtonElement>(
    `[data-trial-difficulty-value="${value}"]`,
  );
  if (!button) {
    return;
  }
  carousel.scrollTo({
    left:
      button.offsetLeft -
      (carousel.clientWidth - button.offsetWidth) / 2,
    behavior,
  });
  focusTrialDifficultyCarousel(carousel);
}

function setupTrialDifficultyCarousel(): void {
  const carousel =
    document.querySelector<HTMLElement>(
      "[data-trial-difficulty]",
    );
  if (!carousel) {
    return;
  }
  if (carousel.closest("[hidden]")) {
    return;
  }
  const activeValue = clamp(
    Number(carousel.dataset.activeTrialDifficulty ?? "0"),
    0,
    TRIAL_ADVANCEMENT_MAX,
  );
  window.requestAnimationFrame(() => {
    centerTrialDifficultyValue(
      carousel,
      activeValue,
      "auto",
    );
  });
  if (carousel.dataset.carouselWired === "true") {
    return;
  }
  carousel.dataset.carouselWired = "true";

  let frame = 0;
  carousel.addEventListener("scroll", () => {
    window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(() =>
      focusTrialDifficultyCarousel(carousel),
    );
  });
  let pointerId: number | null = null;
  let pointerStart = 0;
  let scrollStart = 0;
  let dragged = false;
  carousel.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    pointerId = event.pointerId;
    pointerStart = event.clientX;
    scrollStart = carousel.scrollLeft;
    dragged = false;
  });
  carousel.addEventListener("pointermove", (event) => {
    if (pointerId !== event.pointerId) {
      return;
    }
    const delta = event.clientX - pointerStart;
    if (Math.abs(delta) > 5) {
      dragged = true;
      if (!carousel.hasPointerCapture(event.pointerId)) {
        carousel.setPointerCapture(event.pointerId);
      }
    }
    carousel.scrollLeft = scrollStart - delta;
  });
  const finishPointer = (event: PointerEvent): void => {
    if (pointerId !== event.pointerId) {
      return;
    }
    pointerId = null;
    if (carousel.hasPointerCapture(event.pointerId)) {
      carousel.releasePointerCapture(event.pointerId);
    }
  };
  carousel.addEventListener("pointerup", finishPointer);
  carousel.addEventListener("pointercancel", finishPointer);
  carousel.addEventListener("click", (event) => {
    if (dragged) {
      event.preventDefault();
      event.stopPropagation();
      dragged = false;
      return;
    }
    const button =
      event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>(
            "[data-trial-difficulty-value]",
          )
        : null;
    if (!button) {
      return;
    }
    centerTrialDifficultyValue(
      carousel,
      clamp(
        Number(button.dataset.trialDifficultyValue),
        0,
        TRIAL_ADVANCEMENT_MAX,
      ),
    );
  });
  carousel.addEventListener("keydown", (event) => {
    if (
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowRight" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }
    event.preventDefault();
    const current = Number(
      carousel.dataset.activeTrialDifficulty ?? "0",
    );
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? TRIAL_ADVANCEMENT_MAX
          : current + (event.key === "ArrowRight" ? 1 : -1);
    centerTrialDifficultyValue(
      carousel,
      clamp(next, 0, TRIAL_ADVANCEMENT_MAX),
    );
    carousel
      .querySelector<HTMLButtonElement>(
        `[data-trial-difficulty-value="${clamp(next, 0, TRIAL_ADVANCEMENT_MAX)}"]`,
      )
      ?.focus({ preventScroll: true });
  });
}

function selectedTrialAdvancement(): number {
  return clamp(
    Number(
      document.querySelector<HTMLElement>(
        "[data-trial-difficulty]",
      )?.dataset.activeTrialDifficulty ?? "0",
    ),
    0,
    TRIAL_ADVANCEMENT_MAX,
  );
}

type TrialAdvancementNoteKey =
  | "unavailable"
  | "flow"
  | "questions"
  | "timing"
  | "timingModifier"
  | "initialSkips"
  | "skipGrowth";

const TRIAL_ADVANCEMENT_NOTE_KEYS: readonly TrialAdvancementNoteKey[] =
  [
    "unavailable",
    "flow",
    "questions",
    "timing",
    "timingModifier",
    "initialSkips",
    "skipGrowth",
  ];

function trialAdvancementNoteTexts(
  level: number,
): Partial<Record<TrialAdvancementNoteKey, string>> {
  if (level > TRIAL_ADVANCEMENT_AVAILABLE_MAX) {
    return { unavailable: "尚未开放" };
  }
  const config: TrialAdvancementConfig =
    trialAdvancementConfig(level);
  if (level === 0) {
    return {
      flow: "试炼流程共 7 幕",
      questions: `每幕 ${config.normalQuestionsPerStage} 个道中关卡 + 1 个守幕关卡`,
      timing: "道中 / 守幕作答时间 30 / 90 秒",
      timingModifier:
        "三星制限作答时间额外延长 30%",
      initialSkips: `初始获得 ${config.initialSkips} 次换题`,
      skipGrowth: `每经历 ${config.skipGrantEveryStages} 幕，获得 1 次换题`,
    };
  }
  if (level === 1) {
    return {
      questions: "每幕增加 1 个道中关卡",
      skipGrowth: "每经历 3 幕，获得 1 次换题",
    };
  }
  if (level === 2) {
    return {
      timingModifier:
        "三星制限作答时间不再额外延长",
    };
  }
  if (level === 3) {
    return {
      initialSkips: "初始获得 1 次换题",
    };
  }
  return {
    timingModifier:
      "一星、二星制限作答时间减少30%",
  };
}

function updateTrialAdvancementNotes(level: number): void {
  const notes = trialAdvancementNoteTexts(level);
  document
    .querySelectorAll<HTMLElement>(
      "[data-trial-advancement-note]",
    )
    .forEach((element) => {
      const key = element.dataset.trialAdvancementNote;
      const text =
        key &&
        TRIAL_ADVANCEMENT_NOTE_KEYS.includes(
          key as TrialAdvancementNoteKey,
        )
          ? notes[key as TrialAdvancementNoteKey]
          : undefined;
      element.hidden = !text;
      element.textContent = text ?? "";
    });
}

function updateTrialAdvancementUi(
  carousel: HTMLElement,
  value: number,
): void {
  const maxUnlocked = clamp(
    Number(carousel.dataset.maxUnlocked ?? "0"),
    0,
    TRIAL_ADVANCEMENT_MAX,
  );
  const status = document.querySelector<HTMLElement>(
    "[data-trial-advancement-status]",
  );
  const unavailable =
    value > TRIAL_ADVANCEMENT_AVAILABLE_MAX;
  if (status) {
    const state =
      unavailable
        ? "尚未开放"
        : value > maxUnlocked
        ? "未解锁"
        : trialProgress.perfect(value)
          ? "完美通关"
          : trialProgress.completed(value)
            ? "已通关"
          : "已解锁";
    status.textContent = `进阶 ${value} · ${state}`;
    status.hidden = unavailable;
    status.dataset.locked = String(
      unavailable || value > maxUnlocked,
    );
  }
  updateTrialAdvancementNotes(value);
  updateStartAvailability();
}

function updateStartAvailability(): void {
  const button =
    document.querySelector<HTMLButtonElement>(".start-button");
  if (!button) {
    return;
  }
  const locked =
    selectedMode() === "trial" &&
    selectedTrialAdvancement() > trialProgress.maxUnlocked();
  const unavailable =
    selectedMode() === "trial" &&
    selectedTrialAdvancement() >
      TRIAL_ADVANCEMENT_AVAILABLE_MAX;
  button.disabled =
    !data || startingGame || locked || unavailable;
  button.textContent = unavailable
    ? "尚未开放"
    : locked
      ? "未解锁"
      : "开始";
  button.dataset.trialLocked = String(locked);
}

function updateStartRecord(): void {
  const record = document.querySelector<HTMLElement>("[data-start-record]");
  if (!record) {
    return;
  }
  if (selectedMode() !== "challenge") {
    record.hidden = true;
    updateStartAvailability();
    return;
  }
  record.hidden = false;
  const settings = readSettings();
  record.textContent = `纪录：${records.load(recordKey(settings))}`;
  updateStartAvailability();
}

function updateModeFields(direction = 0): void {
  const mode = selectedMode();
  const form = document.querySelector<HTMLFormElement>(
    "[data-settings-form]",
  );
  if (form) {
    form.dataset.activeMode = mode;
  }
  document
    .querySelectorAll<HTMLElement>("[data-mode-field='selection']")
    .forEach((element) => {
      element.hidden = mode === "challenge" || mode === "trial";
    });

  const countField = document.querySelector<HTMLElement>(
    "[data-mode-field='count']",
  );
  if (countField) {
    countField.hidden = mode !== "normal";
  }
  updatePracticeCountControl();

  document
    .querySelectorAll<HTMLElement>("[data-mode-field='challenge']")
    .forEach((element) => {
      element.hidden = mode !== "challenge";
    });
  document
    .querySelectorAll<HTMLElement>("[data-mode-field='practice']")
    .forEach((element) => {
      element.hidden = mode !== "normal";
    });
  document
    .querySelectorAll<HTMLElement>("[data-mode-field='trial']")
    .forEach((element) => {
      element.hidden = mode !== "trial";
    });

  const segmented = document.querySelector<HTMLElement>(".mode-switch");
  if (segmented) {
    segmented.dataset.activeMode = mode;
    segmented.style.setProperty(
      "--mode-position",
      String(MODE_ORDER.indexOf(mode)),
    );
  }
  syncAdvancedSettings();
  if (mode === "trial") {
    window.requestAnimationFrame(
      setupTrialDifficultyCarousel,
    );
  }

  if (
    direction !== 0 &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    const fields = document.querySelector<HTMLElement>(".mode-fields");
    if (fields) {
      fields.classList.remove("slide-in-left", "slide-in-right");
      void fields.offsetWidth;
      fields.classList.add(
        direction > 0 ? "slide-in-right" : "slide-in-left",
      );
    }
  }
}

function syncAdvancedSettings(): void {
  const mode = selectedMode();
  document
    .querySelectorAll<HTMLElement>("[data-advanced-setting]")
    .forEach((element) => {
      element.hidden =
        !advancedSettingsOpen ||
        (element.hasAttribute("data-time-setting") &&
          (mode === "challenge" || mode === "trial"));
    });
}

function wireNumberSteppers(): void {
  document.querySelectorAll<HTMLElement>("[data-stepper]").forEach((stepper) => {
    const input = stepper.querySelector<HTMLInputElement>("input");
    if (!input) {
      return;
    }

    const minimum = Number(input.min);
    const maximum = Number(input.max);

    stepper.querySelectorAll<HTMLButtonElement>("[data-delta]").forEach((button) => {
      button.addEventListener("click", () => {
        const next = clamp(
          (Number(input.value) || minimum) + Number(button.dataset.delta),
          minimum,
          maximum,
        );
        input.value = String(next);
      });
    });

    input.addEventListener("change", () => {
      const raw = Number(input.value) || minimum;
      const snapped =
        input.id === "game-seconds"
          ? Math.round(raw / 5) * 5
          : Math.round(raw);
      input.value = String(clamp(snapped, minimum, maximum));
    });
  });
}

function readSettings(): GameSettings {
  const levels = [...document.querySelectorAll<HTMLInputElement>("[data-level]:checked")]
    .map((input) => Number(input.value) as Level)
    .sort();
  const lowStop = Number(document.querySelector<HTMLInputElement>("#parts-low")?.value ?? "2");
  const highStop = Number(document.querySelector<HTMLInputElement>("#parts-high")?.value ?? "4");
  const numberValue = (selector: string, fallback: number, minimum: number, maximum: number) => {
    const input = document.querySelector<HTMLInputElement>(selector);
    return clamp(Number(input?.value) || fallback, minimum, maximum);
  };
  const mode = selectedMode();
  const runtimeMode: Mode =
    mode === "normal" && practiceEndlessEnabled()
      ? "endless"
      : mode;
  const difficulty = selectedDifficulty();
  const trialAdvancement = selectedTrialAdvancement();

  return {
    levels: runtimeMode === "trial" ? [1, 2] : levels,
    partsLow: lowStop,
    partsHigh: highStop === 5 ? 18 : highStop,
    mode: runtimeMode,
    count: numberValue("#game-count", 10, 3, 50),
    seconds:
      mode === "challenge"
        ? CHALLENGE_DIFFICULTY_SECONDS[difficulty]
        : runtimeMode === "trial"
          ? TRIAL_NORMAL_SECONDS
        : Math.round(
            numberValue("#game-seconds", 40, 5, 180) / 5,
          ) * 5,
    stageQuestions: numberValue("#stage-questions", 5, 1, 50),
    stageSize: numberValue("#stage-size", 1500, 10, 8105),
    stageShift: numberValue("#stage-shift", 300, 1, 8105),
    exEnabled:
      document
        .querySelector<HTMLButtonElement>("[data-ex-enabled][aria-pressed='true']")
        ?.dataset.exEnabled === "true",
    includeSupplementaryChars:
      document
        .querySelector<HTMLButtonElement>(
          "[data-include-supplementary][aria-pressed='true']",
        )
        ?.dataset.includeSupplementary !== "false",
    difficulty,
    trialAdvancement,
  };
}

function renderStart(initial: GameSettings = lastSettings): void {
  trialDebugOpen = false;
  startLayoutObserver?.disconnect();
  startLayoutObserver = null;
  startingGame = false;
  session?.destroy();
  trialSession?.destroy();
  session = null;
  trialSession = null;
  lastQuestionKey = "";
  lastTrialQuestionKey = "";
  lastTrialBossKey = "";
  animatedTrialConsumedCardIds = new Set();
  animatedTrialObscuredCardIds = new Set();
  lastRenderedPaused = false;
  lastTrialPaused = false;

  const lowStop = initial.partsLow >= 5 ? 5 : clamp(initial.partsLow, 2, 4);
  const highStop = initial.partsHigh >= 5 ? 5 : clamp(initial.partsHigh, 2, 4);
  const maxUnlocked = trialProgress.maxUnlocked();
  const trialAdvancement = maxUnlocked;
  const trialAdvancementNotes =
    trialAdvancementNoteTexts(trialAdvancement);
  const trialAdvancementState =
    trialProgress.perfect(trialAdvancement)
      ? "完美通关"
      : trialProgress.completed(trialAdvancement)
        ? "已通关"
      : "已解锁";
  const initialMode: Mode =
    initial.mode === "endless"
      ? "normal"
      : initial.mode === "trial" && !trialTestPage
        ? "challenge"
        : initial.mode;
  const practiceEndless = initial.mode === "endless";
  const checked = (level: Level) => initial.levels.includes(level) ? "checked" : "";
  const pressed = (mode: Mode) => initialMode === mode ? "true" : "false";
  const advancedHidden = advancedSettingsOpen ? "" : "hidden";
  const difficultyNotes =
    DIFFICULTY_NOTES[initial.difficulty];
  const challengeRecord =
    initial.mode === "challenge"
      ? records.load(recordKey(initial))
      : 0;

  root.innerHTML = shell(`
    <main class="start-screen">
      <form class="settings-form" data-settings-form data-active-mode="${initialMode}" data-advanced-open="${advancedSettingsOpen}" novalidate>
        <div class="settings-stack">
          <section class="setting-block">
            <div class="setting-label">模式</div>
            <div class="segmented mode-switch" role="group" aria-label="模式" data-active-mode="${initialMode}" style="--mode-count:${visibleModeCount};--mode-position:${MODE_ORDER.indexOf(initialMode)}">
              <span class="mode-slider" aria-hidden="true"></span>
              <button type="button" data-mode="challenge" aria-pressed="${pressed("challenge")}">挑战</button>
              ${trialTestPage ? `<button type="button" data-mode="trial" aria-pressed="${pressed("trial")}">试炼</button>` : ""}
              <button type="button" data-mode="normal" aria-pressed="${pressed("normal")}">练习</button>
              ${trialTestPage ? "" : `<button type="button" disabled aria-label="敬请期待，尚未开放">敬请期待</button>`}
            </div>
          </section>

          <div class="mode-fields">
          <section class="setting-block trial-entry-setting" data-mode-field="trial" hidden>
            <div class="setting-label">进阶</div>
            <div class="trial-difficulty-settings">
              <div class="trial-difficulty-stage">
                <span class="trial-difficulty-focus-mark is-left" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="m15 3-9 9 9 9"></path></svg>
                </span>
                <div class="trial-difficulty-carousel" data-trial-difficulty data-active-trial-difficulty="${trialAdvancement}" data-max-unlocked="${maxUnlocked}" role="listbox" aria-label="试炼进阶">
                  <div class="trial-difficulty-track">
                    ${Array.from(
                      { length: TRIAL_ADVANCEMENT_MAX + 1 },
                      (_, value) => {
                        const completed =
                          trialProgress.completed(value);
                        const perfect =
                          trialProgress.perfect(value);
                        const unavailable =
                          value >
                          TRIAL_ADVANCEMENT_AVAILABLE_MAX;
                        const locked = value > maxUnlocked;
                        const state = completed
                          ? perfect
                            ? "完美通关"
                            : "已通关"
                          : unavailable
                            ? "尚未开放"
                          : locked
                            ? "未解锁"
                            : "已解锁";
                        return `<button class="trial-difficulty-item ${completed ? "is-cleared" : ""} ${perfect ? "is-perfect" : ""} ${locked ? "is-locked" : ""} ${unavailable ? "is-unavailable" : ""}" type="button" role="option" data-trial-difficulty-value="${value}" data-locked="${locked}" aria-label="进阶 ${value}，${state}" aria-selected="${value === trialAdvancement}" aria-pressed="${value === trialAdvancement}">
                          <span class="trial-difficulty-number">${value}</span>
                          ${
                            completed
                              ? `<span class="trial-difficulty-cleared-star ${perfect ? "is-perfect" : ""}" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 1.5c.7 6.2 4.3 9.8 10.5 10.5-6.2.7-9.8 4.3-10.5 10.5C11.3 16.3 7.7 12.7 1.5 12 7.7 11.3 11.3 7.7 12 1.5Z"></path></svg></span>`
                              : ""
                          }
                        </button>`;
                      },
                    ).join("")}
                  </div>
                </div>
                <span class="trial-difficulty-focus-mark is-right" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="m9 3 9 9-9 9"></path></svg>
                </span>
              </div>
              <div class="trial-difficulty-notes">
                <p class="trial-advancement-status" data-trial-advancement-status>进阶 ${trialAdvancement} · ${trialAdvancementState}</p>
                ${TRIAL_ADVANCEMENT_NOTE_KEYS.map((key) => {
                  const text = trialAdvancementNotes[key];
                  return `<p data-trial-advancement-note="${key}" ${text ? "" : "hidden"}>${escapeHtml(text ?? "")}</p>`;
                }).join("")}
              </div>
            </div>
          </section>

          <section class="setting-block" data-mode-field="selection">
            <div class="setting-label">级别</div>
            <div class="inline-options">
              <label class="check-option"><input data-level type="checkbox" value="1" ${checked(1)}><span>一</span></label>
              <label class="check-option"><input data-level type="checkbox" value="2" ${checked(2)}><span>二</span></label>
              <label class="check-option"><input data-level type="checkbox" value="3" ${checked(3)}><span>三</span></label>
            </div>
          </section>

          <section class="setting-block" data-mode-field="selection">
            <div class="setting-label">部件</div>
            <div class="parts-slider">
              <div class="dual-range" data-range-track>
                <div class="range-rail"></div>
                <div class="range-fill"></div>
                <span class="range-marker range-marker-low" data-range-marker-low aria-hidden="true"></span>
                <span class="range-marker range-marker-high" data-range-marker-high aria-hidden="true"></span>
                <input id="parts-low" class="range-input range-input-low" type="range" min="2" max="5" step="1" value="${lowStop}" aria-label="最少部件数">
                <input id="parts-high" class="range-input range-input-high" type="range" min="2" max="5" step="1" value="${highStop}" aria-label="最多部件数">
              </div>
              <div class="range-ticks" aria-hidden="true">
                <span>2</span><span>3</span><span>4</span><span>5+</span>
              </div>
              <div class="sr-only" aria-live="polite">
                <span data-parts-low></span> 至 <span data-parts-high></span>
              </div>
            </div>
          </section>

          <section class="setting-block difficulty-setting" data-mode-field="challenge" hidden>
            <div class="setting-label">难度</div>
            <div class="difficulty-settings">
              <div class="segmented difficulty-toggle" role="group" aria-label="挑战难度" data-active-difficulty="${initial.difficulty}" style="--difficulty-position:${DIFFICULTY_ORDER.indexOf(initial.difficulty)}">
                <span class="choice-slider" aria-hidden="true"></span>
                ${DIFFICULTY_ORDER.map(
                  (difficulty) =>
                    `<button type="button" data-difficulty="${difficulty}" aria-pressed="${initial.difficulty === difficulty ? "true" : "false"}">${DIFFICULTY_LABELS[difficulty]}</button>`,
                ).join("")}
              </div>
              <div class="difficulty-notes">
                <p data-difficulty-note="time">${escapeHtml(difficultyNotes[0])}</p>
                <p data-difficulty-note="reward">${escapeHtml(difficultyNotes[1])}</p>
              </div>
            </div>
          </section>

          <section class="setting-block" data-advanced-setting data-time-setting ${advancedHidden}>
            <div class="setting-label">每题秒数</div>
            <div class="stepper" data-stepper>
              <button type="button" data-delta="-5" aria-label="减少五秒">−</button>
              <input id="game-seconds" type="number" min="5" max="180" step="5" value="${initial.seconds}" inputmode="numeric">
              <button type="button" data-delta="5" aria-label="增加五秒">+</button>
            </div>
          </section>

          <section class="setting-block count-setting" data-mode-field="count">
            <div class="setting-label">题数</div>
            <div class="count-setting-controls">
              <div class="stepper" data-count-stepper data-stepper aria-disabled="${practiceEndless}">
                <button type="button" data-delta="-1" aria-label="减少题数" ${practiceEndless ? "disabled" : ""}>−</button>
                <input id="game-count" type="number" min="3" max="50" step="1" value="${initial.count}" inputmode="numeric" ${practiceEndless ? "disabled" : ""}>
                <button type="button" data-delta="1" aria-label="增加题数" ${practiceEndless ? "disabled" : ""}>+</button>
              </div>
              <button class="endless-switch" type="button" data-practice-endless aria-label="无尽模式" aria-pressed="${practiceEndless ? "true" : "false"}">
                <span>无尽</span>
                <span class="endless-switch-track" aria-hidden="true"><span></span></span>
              </button>
            </div>
          </section>

          <section class="challenge-settings" data-mode-field="challenge" hidden>
            <div class="advanced-settings" data-advanced-setting ${advancedHidden}>
              <div class="setting-block">
                <div class="setting-label">题/阶段</div>
                <div class="stepper" data-stepper>
                  <button type="button" data-delta="-1" aria-label="减少阶段题数">−</button>
                  <input id="stage-questions" type="number" min="1" max="50" step="1" value="${initial.stageQuestions}" inputmode="numeric">
                  <button type="button" data-delta="1" aria-label="增加阶段题数">+</button>
                </div>
              </div>
              <div class="setting-block">
                <div class="setting-label">窗口</div>
                <div class="stepper wide" data-stepper>
                  <button type="button" data-delta="-100" aria-label="缩小窗口">−</button>
                  <input id="stage-size" type="number" min="10" max="8105" step="100" value="${initial.stageSize}" inputmode="numeric">
                  <button type="button" data-delta="100" aria-label="扩大窗口">+</button>
                </div>
              </div>
              <div class="setting-block">
                <div class="setting-label">滑移量</div>
                <div class="stepper wide" data-stepper>
                  <button type="button" data-delta="-100" aria-label="减少滑移量">−</button>
                  <input id="stage-shift" type="number" min="1" max="8105" step="100" value="${initial.stageShift}" inputmode="numeric">
                  <button type="button" data-delta="100" aria-label="增加滑移量">+</button>
                </div>
              </div>
            </div>
          </section>
          </div>
        </div>

        <div class="start-row">
          <button class="start-button" type="submit" ${data ? "" : "disabled"}>开始</button>
          <span class="start-record" data-start-record ${initialMode === "challenge" ? "" : "hidden"}>纪录：${challengeRecord}</span>
          <span class="form-error" data-form-error role="alert">${escapeHtml(startupError)}</span>
        </div>
      </form>
    </main>
  `, "start");

  const form = document.querySelector<HTMLFormElement>("[data-settings-form]");
  form?.addEventListener("input", updateStartRecord);
  form?.addEventListener("change", updateStartRecord);
  form?.addEventListener("click", (event) => {
    if (event.target instanceof HTMLButtonElement) {
      updateStartRecord();
    }
  });
  document.querySelector<HTMLInputElement>("#parts-low")?.addEventListener("input", updatePartsSlider);
  document.querySelector<HTMLInputElement>("#parts-high")?.addEventListener("input", updatePartsSlider);
  updatePartsSlider();
  wireNumberSteppers();
  updateModeFields();
  updateDifficultyNotes();
  updateStartRecord();
  wireGameSettingsDialog();
  setupStartLayout();

  document
    .querySelectorAll<HTMLButtonElement>("[data-difficulty]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        document
          .querySelectorAll<HTMLButtonElement>("[data-difficulty]")
          .forEach((peer) => {
            peer.setAttribute(
              "aria-pressed",
              String(peer === button),
            );
          });
        const toggle =
          document.querySelector<HTMLElement>(".difficulty-toggle");
        if (toggle) {
          toggle.dataset.activeDifficulty =
            button.dataset.difficulty ?? "standard";
        }
        updateDifficultyNotes();
        updateStartRecord();
      });
    });

  document
    .querySelector<HTMLButtonElement>("[data-practice-endless]")
    ?.addEventListener("click", (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      const endless = button.getAttribute("aria-pressed") !== "true";
      button.setAttribute("aria-pressed", String(endless));
      updateModeFields();
    });

  document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const previousMode = selectedMode();
      document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((peer) => {
        peer.setAttribute("aria-pressed", String(peer === button));
      });
      const nextMode =
        (button.dataset.mode as Mode | undefined) ?? "challenge";
      const direction =
        MODE_ORDER.indexOf(nextMode) - MODE_ORDER.indexOf(previousMode);
      updateModeFields(direction);
    });
  });

  setupTrialDifficultyCarousel();

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formError = document.querySelector<HTMLElement>("[data-form-error]");
    const settings = readSettings();

    if (
      settings.mode !== "challenge" &&
      settings.mode !== "trial" &&
      settings.levels.length === 0
    ) {
      if (formError) {
        formError.textContent = "级别";
      }
      return;
    }
    if (
      settings.mode !== "challenge" &&
      settings.mode !== "trial" &&
      settings.levels.every(
        (level) =>
          data?.candidates(
            level,
            settings.partsLow,
            settings.partsHigh,
            settings.includeSupplementaryChars,
          ).length === 0,
      )
    ) {
      if (formError) {
        formError.textContent = "部件";
      }
      return;
    }
    if (!data) {
      if (formError) {
        formError.textContent = "数据读取失败";
      }
      return;
    }
    if (
      settings.mode === "trial" &&
      settings.trialAdvancement >
        trialProgress.maxUnlocked()
    ) {
      if (formError) {
        formError.textContent =
          settings.trialAdvancement >
          TRIAL_ADVANCEMENT_AVAILABLE_MAX
            ? "未开放"
            : "未解锁";
      }
      updateStartAvailability();
      return;
    }
    if (startingGame) {
      return;
    }
    startingGame = true;
    const startButton =
      document.querySelector<HTMLButtonElement>(".start-button");
    if (startButton) {
      startButton.disabled = true;
    }
    withPageTransition(() => {
      startingGame = false;
      startGame(settings);
    });
  });
}

function updateTimer(state: GameState): void {
  const timerRing = document.querySelector<HTMLElement>("[data-timer-ring]");
  const timerValue = document.querySelector<HTMLElement>("[data-timer]");
  const timerProgress = document.querySelector<SVGCircleElement>(
    "[data-timer-progress]",
  );
  const partsPanel = document.querySelector<HTMLElement>(".parts");
  if (!timerRing || !timerProgress || (!experimentalPlay && !timerValue)) {
    return;
  }

  const fraction = Math.max(
    0,
    Math.min(1, state.remaining / state.settings.seconds),
  );
  const circumference = 2 * Math.PI * 32;
  if (timerValue) {
    timerValue.textContent = String(state.remaining);
  }
  timerProgress.style.strokeDasharray = `${circumference} ${circumference}`;
  const previousFraction = lastTimerFraction;
  timerProgress.style.strokeDashoffset = String(
    circumference * (1 - fraction),
  );
  if (experimentalPlay) {
    timerRing.classList.toggle(
      "is-penalty-cut",
      state.paused && previousFraction > fraction + 0.001,
    );
    timerProgress.style.setProperty(
      "--timer-penalty-from-offset",
      String(circumference * (1 - previousFraction)),
    );
    timerProgress.style.setProperty(
      "--timer-penalty-to-offset",
      String(circumference * (1 - fraction)),
    );
  }
  lastTimerFraction = fraction;
  timerRing.classList.toggle("is-urgent", state.remaining <= 5 && !state.paused);
  timerRing.classList.toggle("is-paused", state.paused);
  timerRing.classList.toggle("is-correct", state.feedback === "correct");
  timerRing.setAttribute(
    "aria-label",
    experimentalPlay
      ? `${state.paused ? "继续" : "暂停"}，剩余 ${state.remaining} 秒`
      : state.paused
        ? `暂停，剩余 ${state.remaining} 秒`
        : `剩余 ${state.remaining} 秒`,
  );
  if (experimentalPlay) {
    timerRing.setAttribute("aria-pressed", String(state.paused));
  }

  if (partsPanel) {
    const tense = !state.paused && !state.revealing && state.remaining <= 5;
    partsPanel.classList.toggle("is-tense", tense);
    if (tense) {
      const intensity = Math.max(0, Math.min(1, (6 - state.remaining) / 5));
      const red = Math.round(251 + (244 - 251) * intensity);
      const green = Math.round(250 + (226 - 250) * intensity);
      const blue = Math.round(246 + (219 - 246) * intensity);
      partsPanel.style.setProperty(
        "--card-tense-fill",
        `rgb(${red} ${green} ${blue})`,
      );
    } else {
      partsPanel.style.removeProperty("--card-tense-fill");
    }
  }
}

function gameProgress(
  state: GameState,
  source: GameData,
  bounds?: ChallengeBounds,
): { main: string; sub: string } {
  if (state.settings.mode === "challenge") {
    const current = bounds ?? source.challengeBounds(state.settings, state.index);
    if (current.isEx) {
      return { main: `阶段EX · 第${state.index}题`, sub: "????" };
    }
    const { stage, start, end } = current;
    return {
      main: `阶段${stage} · 第${state.index}题`,
      sub: `#${start + 1}-${end}`,
    };
  }
  if (state.settings.mode === "endless") {
    return { main: `第 ${state.index} 题`, sub: "" };
  }
  return {
    main: `第 ${state.index} / ${state.settings.count} 题`,
    sub: "",
  };
}

function wireAnswerInput(game: GameSession): void {
  const input = document.querySelector<HTMLInputElement>("[data-answer]");
  if (!input) {
    return;
  }

  input.addEventListener("compositionstart", () => {
    composing = true;
  });
  input.addEventListener("compositionend", () => {
    composing = false;
    game.setDraft(input.value);
  });
  input.addEventListener("input", () => {
    game.setDraft(input.value);
    document.querySelector(".answer-stage")?.classList.remove("is-wrong");
    document.querySelector(".parts")?.classList.remove("has-wrong");
  });
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || composing) {
      return;
    }
    event.preventDefault();
    game.submit();
  });
  if (experimentalPlay) {
    input.focus({ preventScroll: true });
  } else {
    input.focus();
  }
  if (game.state.feedback === "wrong") {
    input.select();
  } else {
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

function renderGame(game: GameSession): void {
  const state = game.state;
  if (!state.current) {
    return;
  }

  const questionKey = `${state.settings.mode}|${state.index}|${state.current.char}|${state.current.symbolIds.join(",")}`;
  const questionEnter = questionKey !== lastQuestionKey;
  lastQuestionKey = questionKey;
  if (questionEnter && state.settings.mode === "challenge") {
    collection.recordEncounter(
      state.current.char,
      state.current.symbolIds,
      !data!.levels.has(state.current.char),
    );
  }
  const challengeBounds =
    state.settings.mode === "challenge"
      ? data!.challengeBounds(state.settings, state.index)
      : null;
  const progress = gameProgress(state, data!, challengeBounds ?? undefined);
  let stageProgressEffect = "";
  if (challengeBounds) {
    const position =
      ((state.index - 1) % state.settings.stageQuestions) + 1;
    const completedStage =
      !challengeBounds.isEx &&
      state.revealing &&
      state.feedback === "correct" &&
      state.index % state.settings.stageQuestions === 0;
    const stageFirstIndex =
      (challengeBounds.stage - 1) * state.settings.stageQuestions + 1;
    const enteringFirstStageQuestion =
      questionEnter && position === 1 && state.index === stageFirstIndex;
    if (completedStage) {
      stageProgressEffect = "is-stage-enter";
    } else if (
      enteringFirstStageQuestion &&
      (challengeBounds.isEx || challengeBounds.stage > 1)
    ) {
      stageProgressEffect = "is-stage-clear";
    }
  }
  const resuming = !state.paused && lastRenderedPaused;
  lastRenderedPaused = state.paused;
  const partNames = state.current.displaySymbolIds.map((symbolId) =>
    renderComponent(data!.component(symbolId), true),
  );
  const partCount = partNames.length;
  const densityClass =
    partCount >= 12 ? "is-dense" : partCount >= 8 ? "is-compact" : "";
  const crowdedClass = partCount >= 5 ? "is-five-plus" : "";
  const cardAngles = [-0.8, 0.9, -0.35, 1.15, -1.05, 0.45];
  const cardOffsets = [1, 4, 0, 5, 2, 3];
  let cardIndex = 0;
  const partsMarkup = splitPartsIntoRows(partNames)
    .map(
      (row) =>
        `<div class="part-row">${row
          .map(
            (part) =>
              `<span class="part-card" style="--card-index:${cardIndex};--card-angle:${cardAngles[cardIndex % cardAngles.length]}deg;--card-offset:${cardOffsets[cardIndex++ % cardOffsets.length]}px"><span class="part ${part.long ? "is-long" : ""} ${part.isEnclosedFrame ? "is-enclosed-frame" : ""}">${part.html}</span></span>`,
          )
          .join("")}</div>`,
    )
    .join("");
  const revealed = state.revealing;
  const correct = state.feedback === "correct";
  const wrong = state.feedback === "wrong";
  const skipped = state.feedback === "skipped";
  const partsFeedback = correct
    ? "has-correct"
    : skipped
      ? "has-skipped"
      : wrong
        ? "has-wrong"
        : "";
  const pausedClass = state.paused
    ? "is-paused"
    : resuming
      ? "is-resuming"
      : "";
  const exClass = challengeBounds?.isEx ? "is-ex" : "";
  const nextStageIsEx =
    challengeBounds !== null &&
    !challengeBounds.isEx &&
    state.settings.exEnabled &&
    challengeBounds.stage + 1 === challengeBounds.exStartStage;
  const stagePrompt =
    challengeBounds?.isEx || nextStageIsEx ? "STAGE EX!" : "STAGE UP!";
  const progressExClass =
    challengeBounds?.isEx
      ? "is-ex-progress"
      : nextStageIsEx && stageProgressEffect === "is-stage-enter"
        ? "is-ex-announcement"
        : "";
  const answerFeedback = correct
    ? "is-correct"
    : skipped
      ? "is-skipped"
      : wrong && revealed
        ? "is-miss"
        : wrong
          ? "is-wrong"
          : "";
  const feedbackAnnouncement = correct
    ? "正确"
    : skipped
      ? "换题答案"
      : wrong && revealed
        ? "答案"
        : wrong
          ? "重试"
          : state.paused
            ? "暂停"
            : "";
  const skipCount =
    state.settings.mode === "challenge"
      ? String(state.skipsRemaining)
      : "∞";
  const skipDisabled =
    revealed ||
    (!experimentalPlay && state.paused) ||
    (state.settings.mode === "challenge" &&
      state.skipsRemaining <= 0);

  root.innerHTML = shell(`
    <main class="play-screen">
      <section class="play-surface ${questionEnter ? "question-enter" : ""}">
        <header class="play-hud">
          <div class="progress-stack ${stageProgressEffect} ${progressExClass}">
            <span class="question-progress">${escapeHtml(progress.main)}</span>
            ${progress.sub ? `<span class="stage-rank">${escapeHtml(progress.sub)}</span>` : ""}
            <span class="stage-up"><span>${stagePrompt}</span></span>
          </div>
          ${
            experimentalPlay
              ? `<button class="timer-ring" type="button" data-timer-ring aria-label="${state.paused ? "继续" : "暂停"}，剩余 ${state.remaining} 秒" aria-pressed="${state.paused}" ${revealed ? "disabled" : ""}>
                  <svg viewBox="0 0 80 80" aria-hidden="true">
                    <circle class="timer-track" cx="40" cy="40" r="32"></circle>
                    <circle class="timer-progress" data-timer-progress cx="40" cy="40" r="32"></circle>
                  </svg>
                  <span class="timer-toggle-icon ${state.paused ? "is-play" : "is-pause"}" aria-hidden="true"></span>
                </button>`
              : `<div class="timer-ring" data-timer-ring role="timer">
                  <svg viewBox="0 0 80 80" aria-hidden="true">
                    <circle class="timer-track" cx="40" cy="40" r="32"></circle>
                    <circle class="timer-progress" data-timer-progress cx="40" cy="40" r="32"></circle>
                  </svg>
                  <span class="timer-readout"><strong data-timer>${state.remaining}</strong></span>
                </div>`
          }
        </header>

        <div class="parts ${densityClass} ${crowdedClass} ${partsFeedback} ${pausedClass} ${exClass}" aria-label="部件">
          ${partsMarkup}
        </div>

        <div class="answer-stage ${answerFeedback} ${exClass}">
          ${
            revealed
              ? `
                <div class="reveal" aria-live="polite">
                  <strong>${escapeHtml(state.revealAnswer)}</strong>
                  <small>${escapeHtml(state.revealMeta)}</small>
                </div>
              `
              : `
                <div class="answer-row">
                  <input
                    data-answer
                    class="answer-input"
                    type="text"
                    value="${escapeHtml(state.draft)}"
                    autocomplete="off"
                    autocapitalize="off"
                    spellcheck="false"
                    aria-label="答案"
                    ${state.paused ? "disabled" : ""}
                  >
                  <button class="submit-button" type="button" data-submit ${state.paused ? "disabled" : ""}>提交</button>
                </div>
              `
          }
        </div>

        <div class="feedback" data-feedback aria-live="polite">
          <span class="sr-only">${escapeHtml(feedbackAnnouncement)}</span>
        </div>

        <div class="play-actions ${experimentalPlay ? revealed ? "is-single-action" : "is-three-actions" : ""}">
          ${experimentalPlay
            ? revealed
              ? state.advanceLabel
                ? `<button class="primary-action" type="button" data-advance>${escapeHtml(state.advanceLabel)}</button>`
                : ""
              : `
                  <button type="button" data-pause>${state.paused ? "继续" : "暂停"}</button>
                  <button type="button" data-surrender>弃权</button>
                  <button class="skip-action" type="button" data-skip ${skipDisabled ? "disabled" : ""}><span>换题</span><span class="skip-count">${skipCount}</span></button>
                `
            : revealed && state.advanceLabel
              ? `
                  <button class="primary-action" type="button" data-advance>${escapeHtml(state.advanceLabel)}</button>
                  <button type="button" data-restart>重开</button>
                  <button class="skip-action" type="button" data-skip disabled><span>换题</span><span class="skip-count">${skipCount}</span></button>
                `
              : `
                  <button type="button" data-pause ${revealed ? "disabled" : ""}>${state.paused ? "继续" : "暂停"}</button>
                  <button type="button" data-surrender ${revealed ? "disabled" : ""}>弃权</button>
                  <button type="button" data-restart>重开</button>
                  <button class="skip-action" type="button" data-skip ${skipDisabled ? "disabled" : ""}><span>换题</span><span class="skip-count">${skipCount}</span></button>
                `
          }
        </div>
      </section>
    </main>
  `, "play");

  updateTimer(state);
  wireAnswerInput(game);

  document.querySelector<HTMLButtonElement>("[data-submit]")?.addEventListener("click", () => {
    game.submit();
  });
  document.querySelector<HTMLButtonElement>("[data-pause]")?.addEventListener("click", () => {
    game.togglePause();
  });
  if (experimentalPlay) {
    document.querySelector<HTMLButtonElement>("[data-timer-ring]")?.addEventListener("click", () => {
      game.togglePause();
    });
  }
  document.querySelector<HTMLButtonElement>("[data-surrender]")?.addEventListener("click", () => {
    game.surrender();
  });
  document.querySelector<HTMLButtonElement>("[data-advance]")?.addEventListener("click", () => {
    game.advance();
  });
  document.querySelector<HTMLButtonElement>("[data-skip]")?.addEventListener("click", () => {
    game.skipQuestion();
  });
  document.querySelector<HTMLButtonElement>("[data-restart]")?.addEventListener("click", () => {
    startGame(state.settings);
  });
  wireGameSettingsDialog();
}

function trialStageName(stage: number): string {
  const names = [
    "第一幕",
    "第二幕",
    "第三幕",
    "第四幕",
    "第五幕",
    "第六幕",
    "第七幕",
  ];
  return names[stage - 1] ?? `第${stage}幕`;
}

function trialResultTitleMarkup(
  title: TrialResultState["title"],
): string {
  const accent = {
    覆鹿遗蕉: "鹿",
    临歧何反: "歧",
    雾径得津: "津",
    知我梦中: "梦",
  }[title];
  return [...title]
    .map((char) =>
      char === accent
        ? `<span class="trial-result-accent">${escapeHtml(char)}</span>`
        : escapeHtml(char),
    )
    .join("");
}

function trialCharacterMeta(char: string): string {
  const codePoint = char.codePointAt(0) ?? 0;
  return (
    data?.answerMeta(char) ||
    `表外 U+${codePoint
      .toString(16)
      .toUpperCase()
      .padStart(4, "0")}`
  );
}

function trialRuleEmblemMarkup(
  rule: TrialRuleDefinition,
  className = "",
): string {
  const iconUrl = new URL(
    `assets/trial-rules/${rule.icon}`,
    appBaseUrl,
  ).href;
  const stars = Array.from(
    { length: rule.stars },
    () =>
      `<span class="trial-rule-star" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M12 1.5c.7 6.2 4.3 9.8 10.5 10.5-6.2.7-9.8 4.3-10.5 10.5C11.3 16.3 7.7 12.7 1.5 12 7.7 11.3 11.3 7.7 12 1.5Z"></path>
        </svg>
      </span>`,
  ).join("");
  return `
    <div class="trial-rule-emblem ${className}">
      <span class="trial-rule-icon" aria-hidden="true">
        <img src="${escapeHtml(iconUrl)}" alt="">
      </span>
      ${stars ? `<div class="trial-rule-stars" aria-label="${rule.stars}星制限">${stars}</div>` : ""}
    </div>
  `;
}

function trialRuleMarkup(
  rule: TrialRuleDefinition,
  showDebug = false,
): string {
  return `
    <section class="trial-rule-card">
      ${trialRuleEmblemMarkup(rule)}
      <div class="trial-rule-copy">
        <div class="trial-rule-title">
          <strong>${escapeHtml(rule.name)}</strong>
          <span>${escapeHtml(rule.english)}</span>
        </div>
        <p>${escapeHtml(rule.description.public)}</p>
        ${
          showDebug
            ? `<p class="trial-rule-debug">${escapeHtml(rule.description.debug)}</p>`
            : ""
        }
      </div>
    </section>
  `;
}

interface TrialPartCardModel {
  uid: number;
  symbolId: number;
  source?: TrialCardSource;
  components?: number[];
  quantity?: number;
  remainingQuantity?: number;
  groupColor?: number;
  displayGlyph?: string;
  attachedComponents?: number[];
  displayMode?: TrialCard["displayMode"];
  reductionPart?: boolean;
  consumed?: boolean;
  partiallyConsumed?: boolean;
  animateConsumed?: boolean;
  obscured?: boolean;
  animateObscured?: boolean;
}

function trialBossAttemptsMarkup(
  state: TrialState,
  className = "",
): string {
  if (state.phase !== "boss") {
    return "";
  }
  return `<span class="trial-boss-attempts ${className}" aria-label="已组成 ${state.boss?.submissionCount ?? 0} 个字，共 ${state.boss?.expectedAnswers.length ?? 2} 个">
    <b>${state.boss?.submissionCount ?? 0}</b>
    <i aria-hidden="true"></i>
    <b>${state.boss?.expectedAnswers.length ?? 2}</b>
  </span>`;
}

function trialPartCardsMarkup(
  cards: TrialPartCardModel[],
  twoByTwo = false,
  hideQuantityLabels = false,
  concealQuantityCards = false,
): string {
  const parts = cards.map((card) => {
    const prefabricated =
      card.displayMode === "compound" &&
      Boolean(card.displayGlyph);
    const attached =
      card.displayMode === "attached" &&
      Boolean(card.displayGlyph);
    const wildcard = card.displayMode === "wildcard";
    const quantity = card.displayMode === "quantity";
    const coloredGroup =
      card.groupColor === undefined
        ? ""
        : `is-dissonance-group is-group-${card.groupColor + 1}`;
    const quantityVisible = quantity && !concealQuantityCards;
    const quantityLabel =
      quantityVisible && !hideQuantityLabels
      ? `×${
          card.remainingQuantity ??
          card.quantity ??
          card.components?.length ??
          1
        }`
      : "";
    const overlay =
      card.displayMode === "overlay" &&
      card.components?.length === 2;
    const overlayParts = overlay
      ? card.components!.map((symbolId) =>
          renderComponent(data!.component(symbolId), true),
        )
      : [];
    return {
      ...(overlay
        ? {
            html: `<span class="trial-overlay-parts">${overlayParts
              .map(
                (part, index) =>
                  `<span class="trial-overlay-part is-${index === 0 ? "first" : "second"} ${part.long ? "is-long" : ""} ${part.isEnclosedFrame ? "is-enclosed-frame" : ""}">${part.html}</span>`,
              )
              .join("")}</span>`,
            long: false,
            hasAsset: false,
            isEnclosedFrame: false,
          }
        : wildcard
        ? {
            html: `<span class="trial-wildcard-icon">${crisIconMarkup()}</span>`,
            long: false,
            hasAsset: false,
            isEnclosedFrame: false,
          }
        : prefabricated || attached
        ? {
            html: escapeHtml(card.displayGlyph!),
            long: false,
            hasAsset: false,
            isEnclosedFrame: false,
          }
        : renderComponent(
            data!.component(card.symbolId),
            true,
          )),
      ...card,
      prefabricated,
      attached,
      wildcard,
      overlay,
      quantity: quantityVisible,
      quantityLabel,
              coloredGroup,
    };
  });
  const cardAngles = [-0.8, 0.9, -0.35, 1.15, -1.05, 0.45];
  const cardOffsets = [1, 4, 0, 5, 2, 3];
  let cardIndex = 0;
  return splitPartsIntoRows(parts, twoByTwo)
    .map(
      (row) =>
        `<div class="part-row">${row
          .map(
            (part) =>
              `<span class="part-card ${part.prefabricated ? "is-prefabricated" : ""} ${part.reductionPart ? "is-reduction-part" : ""} ${part.wildcard ? "is-wildcard" : ""} ${part.overlay ? "is-overlay" : ""} ${part.quantity ? "is-quantity" : ""} ${part.coloredGroup} ${part.partiallyConsumed ? "is-partially-consumed" : ""} ${part.consumed ? "is-consumed" : ""} ${part.animateConsumed ? "is-consumed-new" : ""} ${part.obscured ? "is-obscured" : ""} ${part.animateObscured ? "is-obscuring" : ""}" data-card-uid="${part.uid}" data-card-source="${part.source ?? "answer"}" ${part.groupColor === undefined ? "" : `data-card-group="${part.groupColor}"`} ${part.obscured ? 'aria-label="已遮挡部件" aria-disabled="true"' : part.wildcard ? 'data-card-display="wildcard" aria-label="通配部件"' : part.overlay ? 'data-card-display="overlay" aria-label="叠印部件"' : part.quantity ? `data-card-display="quantity" aria-label="复沓部件 ${escapeHtml(data!.component(part.symbolId).name)}${part.quantityLabel ? ` ${part.quantityLabel}` : ""}"` : part.prefabricated ? `data-card-display="prefabricated" aria-label="预组汉字 ${escapeHtml(part.displayGlyph!)}"` : part.attached ? `data-card-display="attached" aria-label="复合部件 ${escapeHtml(part.displayGlyph!)}"` : `data-symbol-id="${part.symbolId}"`} ${part.consumed ? 'aria-hidden="true"' : ""} style="--card-index:${cardIndex};--card-angle:${cardAngles[cardIndex % cardAngles.length]}deg;--card-offset:${cardOffsets[cardIndex++ % cardOffsets.length]}px">${
                part.obscured && !part.animateObscured
                  ? ""
                  : `<span class="part ${part.long ? "is-long" : ""} ${part.isEnclosedFrame ? "is-enclosed-frame" : ""} ${part.prefabricated ? "is-prefabricated" : ""} ${part.overlay ? "is-overlay" : ""}">${part.html}</span>${part.quantity && part.quantityLabel ? `<span class="trial-quantity-badge" aria-hidden="true">${part.quantityLabel}</span>` : ""}`
              }</span>`,
          )
          .join("")}</div>`,
    )
    .join("");
}

function updateTrialTimer(state: TrialState): void {
  const timerRing =
    document.querySelector<HTMLElement>("[data-trial-timer]");
  const timerProgress = document.querySelector<SVGCircleElement>(
    "[data-trial-timer-progress]",
  );
  const partsPanel =
    document.querySelector<HTMLElement>(".parts");
  if (!timerRing || !timerProgress) {
    return;
  }
  const limit =
    state.timeLimit ||
    (state.phase === "boss"
      ? TRIAL_BOSS_SECONDS
      : TRIAL_NORMAL_SECONDS);
  const fraction = Math.max(
    0,
    Math.min(1, state.remaining / limit),
  );
  const circumference = 2 * Math.PI * 32;
  const previousFraction = lastTimerFraction;
  const timeBonus =
    trialRules?.rules[state.ruleId]?.timing
      .correctBonusSeconds ?? 0;
  const timeRestored =
    state.feedback === "correct" &&
    timeBonus > 0 &&
    fraction > previousFraction + 0.001;
  timerProgress.style.strokeDasharray =
    `${circumference} ${circumference}`;
  timerProgress.style.strokeDashoffset = String(
    circumference * (1 - fraction),
  );
  timerRing.classList.toggle(
    "is-penalty-cut",
    state.paused && previousFraction > fraction + 0.001,
  );
  timerRing.classList.toggle(
    "is-time-restored",
    timeRestored,
  );
  timerProgress.style.setProperty(
    "--timer-penalty-from-offset",
    String(circumference * (1 - previousFraction)),
  );
  timerProgress.style.setProperty(
    "--timer-penalty-to-offset",
    String(circumference * (1 - fraction)),
  );
  timerProgress.style.setProperty(
    "--timer-restore-from-offset",
    String(circumference * (1 - previousFraction)),
  );
  timerProgress.style.setProperty(
    "--timer-restore-to-offset",
    String(circumference * (1 - fraction)),
  );
  lastTimerFraction = fraction;
  timerRing.classList.toggle(
    "is-urgent",
    state.remaining <= 5 && !state.paused,
  );
  timerRing.classList.toggle("is-paused", state.paused);
  timerRing.classList.toggle(
    "is-correct",
    state.feedback === "correct",
  );
  timerRing.setAttribute(
    "aria-label",
    `${state.paused ? "继续" : "暂停"}，剩余 ${state.remaining} 秒`,
  );
  timerRing.setAttribute(
    "aria-pressed",
    String(state.paused),
  );
  if (partsPanel) {
    const tense =
      !state.paused &&
      !state.revealing &&
      state.remaining <= 5;
    partsPanel.classList.toggle("is-tense", tense);
    if (tense) {
      const intensity = Math.max(
        0,
        Math.min(1, (6 - state.remaining) / 5),
      );
      const red = Math.round(251 + (244 - 251) * intensity);
      const green = Math.round(250 + (226 - 250) * intensity);
      const blue = Math.round(246 + (219 - 246) * intensity);
      partsPanel.style.setProperty(
        "--card-tense-fill",
        `rgb(${red} ${green} ${blue})`,
      );
    } else {
      partsPanel.style.removeProperty("--card-tense-fill");
    }
  }
}

function updateTrialObscuration(state: TrialState): void {
  const cards =
    state.phase === "boss"
      ? (state.boss?.initialCards ?? [])
      : (state.current?.displayCards ?? []);
  for (const card of cards) {
    if (!card.obscured) {
      continue;
    }
    const element =
      document.querySelector<HTMLElement>(
        `[data-card-uid="${card.uid}"]`,
      );
    if (
      !element ||
      element.classList.contains("is-obscured")
    ) {
      continue;
    }
    element.classList.add(
      "is-obscured",
      "is-obscuring",
    );
    element.setAttribute(
      "aria-label",
      "已遮挡部件",
    );
    element.setAttribute("aria-disabled", "true");
    element.removeAttribute("data-symbol-id");
    animatedTrialObscuredCardIds.add(card.uid);
    window.setTimeout(() => {
      if (!element.isConnected) {
        return;
      }
      element.classList.remove("is-obscuring");
      element.querySelector(".part")?.remove();
    }, 200);
  }
}

function wireTrialAnswerInput(
  trial: TrialSession,
  selector = "[data-trial-answer]",
): void {
  const input =
    document.querySelector<HTMLInputElement>(selector);
  if (!input) {
    return;
  }
  input.addEventListener("compositionstart", () => {
    composing = true;
  });
  input.addEventListener("compositionend", () => {
    composing = false;
    trial.setDraft(input.value);
  });
  input.addEventListener("input", () => {
    trial.setDraft(input.value);
    document
      .querySelectorAll(".answer-stage")
      .forEach((stage) => stage.classList.remove("is-wrong"));
    document
      .querySelectorAll(".parts")
      .forEach((parts) => parts.classList.remove("has-wrong"));
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      trial.submit();
    }
  });
  if (input.disabled) {
    return;
  }
  input.focus({ preventScroll: true });
  input.setSelectionRange(
    input.value.length,
    input.value.length,
  );
}

function trialDebugRuleSelectorMarkup(
  trial: TrialSession,
): string {
  if (!hasTrialDebugAccess() || !trialRules) {
    return "";
  }
  const options = sortTrialRulesByStars(
    Object.values(trialRules.rules),
  )
    .map(
      (rule) => `
        <option value="${escapeHtml(rule.id)}" ${
          trial.state.forcedRuleId === rule.id
            ? "selected"
            : ""
        }>
          ${escapeHtml(rule.name)} · ${rule.stars}★
        </option>
      `,
    )
    .join("");
  return `
    <section class="trial-debug-rule" aria-labelledby="trial-debug-rule-title">
      <div class="trial-debug-rule-heading">
        <span>DEBUG</span>
        <strong id="trial-debug-rule-title">覆写</strong>
      </div>
      <select data-trial-rule-override>
        <option value="" ${
          trial.state.forcedRuleId === null
            ? "selected"
            : ""
        }>默认</option>
        ${options}
      </select>
    </section>
  `;
}

function renderTrialStageIntro(trial: TrialSession): void {
  const state = trial.state;
  const rule =
    trialRules?.rules[state.ruleId] ??
    FALLBACK_TRIAL_RULE;
  const previousStagePosition =
    (((state.stage - 1) / TRIAL_STAGE_COUNT) * 100).toFixed(3);
  const stagePosition = (
    (state.stage / TRIAL_STAGE_COUNT) *
    100
  ).toFixed(3);
  const debugRuleSelector =
    trialDebugRuleSelectorMarkup(trial);
  root.innerHTML = shell(
    `
      <main class="trial-intro-screen">
        <section class="trial-intro-surface ${debugRuleSelector ? "has-debug-rule" : ""}">
          <div class="trial-stage-progress" role="progressbar" aria-label="试炼进度" aria-valuemin="1" aria-valuemax="${TRIAL_STAGE_COUNT}" aria-valuenow="${state.stage}" style="--stage-from:${previousStagePosition}%;--stage-to:${stagePosition}%">
            <span class="trial-stage-progress-fill" aria-hidden="true"></span>
            <span class="trial-stage-progress-marker" aria-hidden="true"></span>
          </div>
          <div class="trial-stage-heading">
            <svg class="trial-stage-chevron" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m15 3-9 9 9 9"></path>
            </svg>
            <h1>${trialStageName(state.stage)}</h1>
            <svg class="trial-stage-chevron" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m9 3 9 9-9 9"></path>
            </svg>
          </div>
          ${trialRuleMarkup(rule, hasTrialDebugAccess())}
          ${debugRuleSelector}
          <div class="trial-intro-actions">
            <button class="primary-action trial-start-stage" type="button" data-trial-begin>
              进入
            </button>
            ${
              state.stage > 1
                ? `<button type="button" data-trial-settle-early>结算</button>`
                : ""
            }
          </div>
        </section>
      </main>
    `,
    "play",
  );
  document
    .querySelector<HTMLButtonElement>("[data-trial-begin]")
    ?.addEventListener("click", (event) => {
      const button =
        event.currentTarget as HTMLButtonElement;
      void (async () => {
        button.disabled = true;
        try {
          await trialRuntimeData.ensure(
            rule,
            appBaseUrl,
            trial,
          );
          withPageTransition(() => trial.beginStage());
        } catch {
          button.disabled = false;
        }
      })();
    });
  document
    .querySelector<HTMLButtonElement>(
      "[data-trial-settle-early]",
    )
    ?.addEventListener("click", () => {
      withPageTransition(() => trial.settleAtStageIntro());
    });
  document
    .querySelector<HTMLSelectElement>(
      "[data-trial-rule-override]",
    )
    ?.addEventListener("change", (event) => {
      const select = event.currentTarget as HTMLSelectElement;
      const rule = select.value
        ? trialRules?.rules[select.value]
        : null;
      void (async () => {
        if (trialRuleDataRequirements(rule).any) {
          select.disabled = true;
          const beginButton =
            document.querySelector<HTMLButtonElement>(
              "[data-trial-begin]",
            );
          if (beginButton) {
            beginButton.disabled = true;
          }
          try {
            await trialRuntimeData.ensure(
              rule,
              appBaseUrl,
              trial,
            );
          } catch {
            select.value = trial.state.forcedRuleId ?? "";
            if (beginButton) {
              beginButton.disabled = false;
            }
            return;
          } finally {
            select.disabled = false;
          }
        }
        trial.setRuleOverride(select.value || null);
      })();
    });
  wireGameSettingsDialog();
}

function fugueSlotCardModels(
  slot: FugueSlotState,
): TrialPartCardModel[] {
  if (slot.mode === "normal") {
    return (slot.current?.displayCards ?? []).map(
      (card) => ({
        uid: card.uid,
        symbolId: card.symbolId,
        source: card.source,
        displayMode: card.displayMode,
        displayGlyph: card.displayGlyph,
      }),
    );
  }
  if (!slot.boss) {
    return [];
  }
  const remaining = new Map(
    slot.boss.cards.map((card) => [card.uid, card]),
  );
  return slot.boss.initialCards.map((card) => {
    const current = remaining.get(card.uid);
    return {
      uid: card.uid,
      symbolId: card.symbolId,
      source: card.source,
      components: card.components,
      quantity: card.quantity,
      remainingQuantity:
        current?.remainingQuantity ??
        card.remainingQuantity,
      groupColor: card.groupColor,
      displayGlyph: card.displayGlyph,
      displayMode: card.displayMode,
      consumed: !current,
    };
  });
}

function fugueBossRecordsMarkup(
  slot: FugueSlotState,
  slotIndex: number,
): string {
  const submissions =
    slot.boss?.pendingSubmissions ?? [];
  if (submissions.length === 0) {
    return "";
  }
  return `<div class="trial-boss-records fugue-boss-records">${submissions
    .map(
      (submission, index) => `
        <div class="trial-boss-record">
          <div class="trial-boss-record-parts" aria-label="已使用部件">
            ${submission.componentUses
              .map(
                (use) =>
                  `<span class="trial-boss-used-part ${use.wildcard ? "is-wildcard" : ""} ${use.inherited ? "is-inherited" : ""}">${
                    use.inherited
                      ? ""
                      : use.wildcard
                        ? crisIconMarkup()
                        : renderComponent(
                            data!.component(use.symbolId),
                            true,
                          ).html
                  }</span>`,
              )
              .join("")}
          </div>
          <span class="trial-boss-record-divider" aria-hidden="true"></span>
          <strong class="trial-boss-record-char">${escapeHtml(submission.answer)}</strong>
          <button class="trial-boss-undo" type="button" data-fugue-undo="${slotIndex}:${index}" aria-label="撤回${escapeHtml(submission.answer)}">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 7H4v-4"></path>
              <path d="M4.6 7.2A8 8 0 1 1 4 15"></path>
            </svg>
          </button>
        </div>`,
    )
    .join("")}</div>`;
}

function renderFugueSlotMarkup(
  slot: FugueSlotState,
  slotIndex: number,
  paused: boolean,
  resuming: boolean,
): string {
  const isBoss = slot.mode !== "normal";
  const isDone = slot.mode === "done";
  const cards = fugueSlotCardModels(slot);
  const feedbackClass =
    slot.feedback === "correct"
      ? "has-correct"
      : slot.feedback === "wrong"
        ? "has-wrong"
        : "";
  const title =
    slot.mode === "normal"
      ? `道中#${slot.questionNumber ?? ""}`
      : "ACTKEEPER";
  const progress = slot.timeLimit
    ? Math.max(0, Math.min(1, slot.remaining / slot.timeLimit))
    : 0;
  const circumference = 2 * Math.PI * 32;
  const completedAnswers =
    isDone && slot.boss
      ? slot.boss.pendingSubmissions.map(
          (submission) => submission.answer,
        )
      : [];
  const revealedAnswers =
    slot.revealing && slot.feedback === "wrong"
      ? slot.mode === "normal"
        ? slot.current?.char
          ? [slot.current.char]
          : []
        : slot.boss?.revealAnswers ?? []
      : [];
  const answers = isDone
    ? completedAnswers
    : revealedAnswers;
  const answerMarkup =
    answers.length > 0
      ? `<div class="fugue-slot-answer answer-stage ${isDone ? "is-correct" : "is-miss"}">
          <div class="reveal trial-reveal is-boss" aria-live="polite">
            <div class="trial-boss-reveal-chars">
              ${answers
                .map(
                  (answer) =>
                    `<span><strong>${escapeHtml(answer)}</strong><small>${escapeHtml(trialCharacterMeta(answer))}</small></span>`,
                )
                .join("")}
            </div>
          </div>
        </div>`
      : "";
  const cardDensity =
    cards.length >= 8
      ? "is-dense"
      : cards.length >= 6
        ? "is-compact"
        : "";
  const pausedClass =
    !isDone && !slot.revealing
      ? paused
        ? "is-paused"
        : resuming
          ? "is-resuming"
          : ""
      : "";
  return `
    <section class="fugue-slot ${isBoss ? "is-boss" : ""} ${isDone ? "is-done" : ""}" data-fugue-pane="${slotIndex}">
      <header class="play-hud fugue-slot-heading">
        <div class="progress-stack ${isBoss ? "is-trial-boss" : ""}">
          <span class="question-progress">${escapeHtml(title)}</span>
          <small class="trial-mode-caption">${isBoss ? "守幕关卡" : "道中关卡"}</small>
        </div>
        <button class="timer-ring" type="button" data-fugue-pause data-fugue-timer="${slotIndex}" aria-label="${trialSession?.state.paused ? "继续" : "暂停"}，剩余 ${slot.remaining} 秒" aria-pressed="${trialSession?.state.paused}" ${isDone || slot.revealing ? "disabled" : ""}>
          <svg viewBox="0 0 80 80" aria-hidden="true">
            <circle class="timer-track" cx="40" cy="40" r="32"></circle>
            <circle class="timer-progress" data-fugue-timer-progress="${slotIndex}" cx="40" cy="40" r="32" style="stroke-dasharray:${circumference} ${circumference};stroke-dashoffset:${circumference * (1 - progress)}"></circle>
          </svg>
          <span class="timer-toggle-icon ${trialSession?.state.paused ? "is-play" : "is-pause"}" aria-hidden="true"></span>
        </button>
      </header>
      <div class="parts fugue-parts ${cardDensity} ${feedbackClass} ${pausedClass} ${isBoss ? "trial-boss-parts" : ""}" aria-label="${slot.id === "left" ? "左题" : "右题"}部件">
        ${trialPartCardsMarkup(cards, isBoss)}
      </div>
      ${isBoss && !isDone ? fugueBossRecordsMarkup(slot, slotIndex) : ""}
      ${answerMarkup}
    </section>
  `;
}

function renderFugueGame(trial: TrialSession): void {
  const fugue = trial.state.fugue;
  if (!fugue) {
    return;
  }
  const resuming =
    !trial.state.paused && lastTrialPaused;
  lastTrialPaused = trial.state.paused;
  root.innerHTML = shell(
    `
      <main class="play-screen trial-play-screen fugue-play-screen">
        <section class="play-surface fugue-surface">
          <div class="fugue-stage-line ${trial.state.paused ? "is-paused" : ""}">
            <div class="progress-stack">
              <span class="question-progress">${trialStageName(trial.state.stage)}</span>
              <small class="trial-mode-caption">试炼模式</small>
            </div>
            <small>${trial.state.paused ? "暂停" : `剩余普通题 ${fugue.queueRemaining}`}</small>
          </div>
          <div class="fugue-layout">
            ${fugue.slots
              .map((slot, index) =>
                renderFugueSlotMarkup(
                  slot,
                  index,
                  trial.state.paused,
                  resuming,
                ),
              )
              .join("")}
          </div>
          <div class="answer-stage">
            <div class="answer-row">
              <input class="answer-input" data-fugue-answer type="text" value="${escapeHtml(trial.state.draft)}" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="答案" ${trial.state.paused || trial.state.revealing ? "disabled" : ""}>
              <button class="submit-button" type="button" data-fugue-submit ${trial.state.paused || trial.state.revealing ? "disabled" : ""}>提交</button>
            </div>
          </div>
          ${
            trial.state.revealing
              ? `<div class="trial-actions is-single"><button class="primary-action" type="button" data-fugue-settle>结算</button></div>`
              : `<div class="trial-actions">
                  <button type="button" data-fugue-pause>${trial.state.paused ? "继续" : "暂停"}</button>
                  <button class="trial-abort-button" type="button" data-fugue-surrender>中止</button>
                </div>`
          }
        </section>
      </main>
    `,
    "play",
  );
  updateFugueTimers(trial.state);
  wireTrialAnswerInput(trial, "[data-fugue-answer]");
  document
    .querySelector<HTMLButtonElement>("[data-fugue-submit]")
    ?.addEventListener("click", () => trial.submit());
  document
    .querySelectorAll<HTMLButtonElement>("[data-fugue-pause]")
    .forEach((button) => {
      button.addEventListener("click", () =>
        trial.togglePause(),
      );
    });
  document
    .querySelector<HTMLButtonElement>(
      "[data-fugue-surrender]",
    )
    ?.addEventListener("click", () => trial.surrender());
  document
    .querySelector<HTMLButtonElement>("[data-fugue-settle]")
    ?.addEventListener("click", () =>
      withPageTransition(() => trial.settleAfterMiss()),
    );
  document
    .querySelectorAll<HTMLButtonElement>(
      "[data-fugue-undo]",
    )
    .forEach((button) => {
      button.addEventListener("click", () => {
        const [slot, index] = (
          button.dataset.fugueUndo ?? "0:0"
        )
          .split(":")
          .map(Number);
        trial.undoFugueBossAnswer(slot, index);
      });
    });
  wireGameSettingsDialog();
}

function updateFugueTimers(state: TrialState): void {
  if (!state.fugue) {
    return;
  }
  document
    .querySelectorAll<HTMLElement>("[data-fugue-pane]")
    .forEach((pane) => {
      const index = Number(
        pane.dataset.fuguePane,
      ) as 0 | 1;
      const slot = state.fugue?.slots[index];
      const timer =
        pane.querySelector<HTMLElement>(
          "[data-fugue-timer]",
        );
      const progressCircle =
        pane.querySelector<SVGCircleElement>(
          `[data-fugue-timer-progress="${index}"]`,
        );
      if (!slot || !timer || !progressCircle) {
        return;
      }
      const progress = slot.timeLimit
        ? Math.max(
            0,
            Math.min(1, slot.remaining / slot.timeLimit),
          )
        : 0;
      const circumference = 2 * Math.PI * 32;
      const previousProgress =
        lastFugueTimerFractions[index];
      progressCircle.style.strokeDasharray =
        `${circumference} ${circumference}`;
      progressCircle.style.strokeDashoffset = String(
        circumference * (1 - progress),
      );
      progressCircle.style.setProperty(
        "--timer-penalty-from-offset",
        String(circumference * (1 - previousProgress)),
      );
      progressCircle.style.setProperty(
        "--timer-penalty-to-offset",
        String(circumference * (1 - progress)),
      );
      lastFugueTimerFractions[index] = progress;
      timer.setAttribute(
        "aria-label",
        `${state.paused ? "继续" : "暂停"}，剩余 ${slot.remaining} 秒`,
      );
      timer.setAttribute(
        "aria-pressed",
        String(state.paused),
      );
      timer.classList.toggle(
        "is-penalty-cut",
        state.paused &&
          slot.mode !== "done" &&
          !slot.revealing &&
          previousProgress > progress + 0.001,
      );
      timer.classList.toggle(
        "is-urgent",
        slot.remaining <= 5 &&
          slot.mode !== "done" &&
          !state.paused,
      );
      timer.classList.toggle("is-paused", state.paused);
      timer.classList.toggle(
        "is-correct",
        slot.feedback === "correct",
      );
    });
}

function renderTrialGame(trial: TrialSession): void {
  if (trial.state.fugue) {
    renderFugueGame(trial);
    return;
  }
  const state = trial.state;
  const isBoss = state.phase === "boss";
  const activeRule =
    trialRules?.rules[state.ruleId] ?? null;
  const skipDisabled =
    state.paused ||
    state.revealing ||
    state.skipsRemaining <= 0 ||
    activeRule?.allowSkip === false;
  const reviveDisabled =
    state.skipsRemaining <= 0 ||
    activeRule?.allowSkip === false;
  const isWordNormal =
    !isBoss &&
    trialRuleAnswerInput(activeRule, "normal") === "word";
  const orderedBossAnswers = (() => {
    if (!isBoss || !state.boss) {
      return [];
    }
    return orderedBossAnswerChars(
      state.boss,
      trialRulePromptMode(activeRule, "boss") ===
        "gestalt-components" &&
        state.feedback === "correct",
    );
  })();
  const showBossPinyin =
    trialRuleAnswerInput(activeRule, "boss") ===
    "pinyin";
  const displayedRevealAnswers = isBoss
    ? orderedBossAnswers.map((char, index) => {
        const answerIndex =
          state.boss?.expectedAnswers.indexOf(char) ?? -1;
        return {
          char,
          displayChar:
            answerIndex >= 0
              ? state.boss?.expectedDisplayChars[answerIndex]
              : undefined,
          pinyin:
            showBossPinyin
              ? state.revealPinyin[index] ?? ""
              : "",
          meta: trialCharacterMeta(char),
        };
      })
    : isWordNormal
      ? [...state.revealAnswer].map((char) => ({
          char,
          pinyin: "",
          meta: trialCharacterMeta(char),
        }))
      : [
        {
          char: state.revealAnswer,
          displayChar: state.current?.displayChar,
          pinyin: state.revealPinyin[0] ?? "",
          meta: state.revealMeta,
        },
      ];
  const revealText = (answer: {
    char: string;
    displayChar?: string;
  }): string =>
    trialRuleUsesPrompt(
      activeRule,
      "traditional-components",
    ) &&
    answer.displayChar &&
    answer.displayChar !== answer.char
      ? `${answer.displayChar}—${answer.char}`
      : answer.char;
  const answerInputMode =
    trialRuleAnswerInput(
      activeRule,
      isBoss ? "boss" : "normal",
    );
  const answerInputLabel = isBoss
    ? answerInputMode === "pinyin"
      ? "守幕关卡拼音答案"
      : "守幕关卡答案"
    : answerInputMode === "pinyin"
      ? "拼音答案"
      : "答案";
  const consumedCardIds = new Set(
    state.boss?.consumedCardIds ?? [],
  );
  const partiallyConsumedCardIds = new Set(
    (state.boss?.cards ?? [])
      .filter(
        (card) =>
          card.components &&
          card.remainingComponents &&
          card.remainingComponents.length <
            card.components.length,
      )
      .map((card) => card.uid),
  );
  const bossKey = isBoss
    ? `${state.stage}|${(state.boss?.initialCards ?? [])
        .map((card) => `${card.uid}:${card.symbolId}`)
        .join(",")}`
    : "";
  const questionKey = isBoss
    ? `${state.stage}|boss|${state.boss?.initialCards
        .map((card) => `${card.uid}:${card.symbolId}`)
        .join(",")}`
    : `${state.stage}|${state.questionInStage}|${state.current?.char}|${(state.current?.displayCards ?? [])
        .map((card) => `${card.uid}:${card.symbolId}`)
        .join(",")}`;
  const bossEntering = isBoss && bossKey !== lastTrialBossKey;
  const questionEnter =
    questionKey !== lastTrialQuestionKey;
  if (isBoss) {
    lastTrialBossKey = bossKey;
  } else {
    lastTrialBossKey = "";
    animatedTrialConsumedCardIds.clear();
  }
  if (questionEnter) {
    animatedTrialObscuredCardIds.clear();
  }
  if (bossEntering) {
    animatedTrialConsumedCardIds.clear();
  }
  const newlyConsumedCardIds = [...consumedCardIds].filter(
    (uid) => !animatedTrialConsumedCardIds.has(uid),
  );
  animatedTrialConsumedCardIds = new Set(consumedCardIds);
  const obscuredCardIds = new Set(
    (isBoss
      ? (state.boss?.initialCards ?? [])
      : (state.current?.displayCards ?? [])
    )
      .filter((card) => card.obscured)
      .map((card) => card.uid),
  );
  const newlyObscuredCardIds = [...obscuredCardIds].filter(
    (uid) => !animatedTrialObscuredCardIds.has(uid),
  );
  animatedTrialObscuredCardIds = new Set(obscuredCardIds);
  const correct = state.feedback === "correct";
  const wrong = state.feedback === "wrong";
  const keepInheritedObscured = isBoss
    ? !state.revealing
    : correct || !state.revealing;
  const currentBossCards = new Map(
    (state.boss?.cards ?? []).map((card) => [
      card.uid,
      card,
    ]),
  );
  const cardModels: TrialPartCardModel[] = isBoss
    ? (state.boss?.initialCards ?? []).map((card) => {
        const current = currentBossCards.get(card.uid);
        return {
          uid: card.uid,
          symbolId: card.symbolId,
          source: card.source,
          components: card.components,
          quantity: card.quantity,
          remainingQuantity:
            current?.remainingQuantity ??
            card.remainingQuantity,
          groupColor: card.groupColor,
          displayGlyph: card.displayGlyph,
          displayMode: card.displayMode,
          reductionPart: card.reductionPart,
          consumed:
            !state.revealing &&
            consumedCardIds.has(card.uid),
          partiallyConsumed:
            !state.revealing &&
            partiallyConsumedCardIds.has(card.uid),
          animateConsumed:
            !state.revealing &&
            newlyConsumedCardIds.includes(card.uid),
          obscured:
            keepInheritedObscured && card.obscured,
          animateObscured:
            !state.revealing &&
            newlyObscuredCardIds.includes(card.uid),
        };
      })
    : (state.current?.displayCards ?? []).map((card) => ({
        uid: card.uid,
        symbolId: card.symbolId,
        source: card.source,
        components: card.components,
        quantity: card.quantity,
        remainingQuantity: card.remainingQuantity,
        groupColor: card.groupColor,
        displayGlyph: card.displayGlyph,
        displayMode: card.displayMode,
        reductionPart: card.reductionPart,
        obscured:
          keepInheritedObscured && card.obscured,
        animateObscured:
          !state.revealing &&
          newlyObscuredCardIds.includes(card.uid),
      }));
  lastTrialQuestionKey = questionKey;
  const densityClass =
    !isBoss && cardModels.length >= 12
      ? "is-dense"
      : !isBoss && cardModels.length >= 8
        ? "is-compact"
        : "";
  const crowdedClass =
    !isBoss && cardModels.length >= 5
      ? "is-five-plus"
      : "";
  const partsFeedback = correct
    ? "has-correct"
    : wrong
      ? "has-wrong"
      : "";
  const pendingSubmissions = (
    state.boss?.pendingSubmissions ?? []
  ).map((submission) => ({
    ...submission,
  }));
  const resuming = !state.paused && lastTrialPaused;
  lastTrialPaused = state.paused;
  root.innerHTML = shell(
    `
      <main class="play-screen trial-play-screen ${isBoss ? "is-trial-boss" : ""}">
        <section class="play-surface ${questionEnter ? "question-enter" : ""}">
          <header class="play-hud">
            <div class="trial-hud-heading">
              ${trialRuleEmblemMarkup(
                activeRule ?? FALLBACK_TRIAL_RULE,
                "trial-hud-rule-emblem",
              )}
              <div class="progress-stack ${isBoss ? `is-trial-boss ${bossEntering ? "is-trial-boss-enter" : ""}` : ""}">
                <span class="question-progress">${
                  isBoss
                    ? `${trialStageName(state.stage)} · ACTKEEPER`
                    : `${trialStageName(state.stage)} · 道中#${state.questionInStage}`
                }</span>
                <small class="trial-mode-caption">试炼模式</small>
              </div>
            </div>
            <button class="timer-ring" type="button" data-trial-timer aria-label="${state.paused ? "继续" : "暂停"}，剩余 ${state.remaining} 秒" aria-pressed="${state.paused}" ${state.revealing ? "disabled" : ""}>
              <svg viewBox="0 0 80 80" aria-hidden="true">
                <circle class="timer-track" cx="40" cy="40" r="32"></circle>
                <circle class="timer-progress" data-trial-timer-progress cx="40" cy="40" r="32"></circle>
              </svg>
              <span class="timer-toggle-icon ${state.paused ? "is-play" : "is-pause"}" aria-hidden="true"></span>
            </button>
          </header>

          <div class="parts ${densityClass} ${crowdedClass} ${partsFeedback} ${state.paused ? "is-paused" : resuming ? "is-resuming" : ""} ${isBoss ? "trial-boss-parts" : ""}" aria-label="部件">
            ${isBoss ? trialBossAttemptsMarkup(state) : ""}
            ${trialPartCardsMarkup(
              cardModels,
              isBoss && cardModels.length === 4,
              !isBoss &&
                trialRulePromptMode(
                  activeRule,
                  "normal",
                ) === "repetend-components",
              trialRuleUsesPrompt(
                activeRule,
                "assonance-components",
              ) ||
                trialRuleUsesPrompt(
                  activeRule,
                  "dissonance-components",
                ),
            )}
          </div>

          <div class="answer-stage ${correct ? "is-correct" : wrong && state.revealing ? "is-miss" : wrong ? "is-wrong" : ""}">
            ${
              state.revealing
                ? isBoss || isWordNormal
                  ? `<div class="reveal trial-reveal ${isBoss ? "is-boss" : "is-word"}" aria-live="polite">
                      <div class="trial-boss-reveal-chars">
                        ${displayedRevealAnswers
                          .map(
                            (answer) =>
                              `<span>${
                                answer.pinyin
                                  ? `<small class="trial-reveal-pinyin">${escapeHtml(answer.pinyin)}</small>`
                                  : ""
                              }<strong>${escapeHtml(revealText(answer))}</strong><small>${escapeHtml(answer.meta)}</small></span>`,
                          )
                          .join("")}
                      </div>
                    </div>`
                  : `<div class="reveal trial-reveal ${state.revealPinyin[0] ? "has-pinyin" : ""}" aria-live="polite">
                      ${
                        displayedRevealAnswers[0]?.pinyin
                          ? `<small class="trial-reveal-pinyin">${escapeHtml(displayedRevealAnswers[0].pinyin)}</small>`
                          : ""
                      }
                      <strong>${escapeHtml(revealText(displayedRevealAnswers[0]))}</strong>
                      <small>${escapeHtml(displayedRevealAnswers[0]?.meta ?? state.revealMeta)}</small>
                    </div>`
                : `<div class="answer-row">
                    ${isBoss ? trialBossAttemptsMarkup(state, "trial-boss-attempts-mobile") : ""}
                    <input
                      data-trial-answer
                      class="answer-input"
                      type="text"
                      value="${escapeHtml(state.draft)}"
                      autocomplete="off"
                      autocapitalize="off"
                      spellcheck="false"
                      aria-label="${answerInputLabel}"
                      ${state.paused ? "disabled" : ""}
                    >
                    <button class="submit-button" type="button" data-trial-submit ${state.paused ? "disabled" : ""}>提交</button>
                  </div>`
            }
          </div>

          ${
            isBoss &&
            pendingSubmissions.length > 0 &&
            !state.revealing
              ? `<div class="trial-boss-records" aria-live="polite">
                  ${pendingSubmissions
                    .map(
                      (submission, index) =>
                        `<div class="trial-boss-record">
                          <div class="trial-boss-record-parts" aria-label="已使用部件">
                            ${uniqueCardUses(
                              submission.componentUses,
                            )
                              .map(
                                (use) =>
                                  `<span class="trial-boss-used-part ${use.wildcard ? "is-wildcard" : ""} ${use.inherited ? "is-inherited" : ""}">${use.inherited ? "" : use.wildcard ? crisIconMarkup() : renderComponent(data!.component(use.symbolId), true).html}</span>`,
                              )
                              .join("")}
                          </div>
                          <span class="trial-boss-record-divider" aria-hidden="true"></span>
                          <strong class="trial-boss-record-char">${escapeHtml(submission.answer)}</strong>
                          <button class="trial-boss-undo" type="button" data-trial-undo="${index}" aria-label="撤回${escapeHtml(submission.answer)}">
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M8 7H4v-4"></path>
                              <path d="M4.6 7.2A8 8 0 1 1 4 15"></path>
                            </svg>
                          </button>
                        </div>`,
                    )
                    .join("")}
                </div>`
              : ""
          }

          <div class="feedback" aria-live="polite">
            <span class="sr-only">${correct ? "正确" : wrong ? "重试" : state.paused ? "暂停" : ""}</span>
          </div>

          ${
            state.revealing
              ? wrong
                ? `<div class="trial-actions is-reveal ${hasTrialDebugAccess() ? "has-debug-continue" : ""}">
                    <button class="primary-action" type="button" data-trial-settle>结算</button>
                    <button class="skip-action" type="button" data-trial-revive ${reviveDisabled ? "disabled" : ""}>
                      <span>换题</span>
                      <span class="skip-count">${state.skipsRemaining}</span>
                    </button>
                    ${
                      hasTrialDebugAccess()
                        ? `<button type="button" data-trial-continue>继续</button>`
                        : ""
                    }
                  </div>`
                : ""
              : `<div class="trial-actions">
                  <button type="button" data-trial-pause>${state.paused ? "继续" : "暂停"}</button>
                  <button class="trial-abort-button" type="button" data-trial-surrender>中止</button>
                  <button class="skip-action" type="button" data-trial-skip ${skipDisabled ? "disabled" : ""}>
                    <span>换题</span>
                    <span class="skip-count">${state.skipsRemaining}</span>
                  </button>
                </div>`
          }
        </section>
      </main>
    `,
    "play",
  );

  updateTrialTimer(state);
  wireTrialAnswerInput(trial);
  document
    .querySelector<HTMLButtonElement>("[data-trial-submit]")
    ?.addEventListener("click", () => trial.submit());
  document
    .querySelector<HTMLButtonElement>("[data-trial-pause]")
    ?.addEventListener("click", () => trial.togglePause());
  document
    .querySelector<HTMLButtonElement>("[data-trial-timer]")
    ?.addEventListener("click", () => trial.togglePause());
  document
    .querySelector<HTMLButtonElement>("[data-trial-surrender]")
    ?.addEventListener("click", () => trial.surrender());
  document
    .querySelector<HTMLButtonElement>("[data-trial-settle]")
    ?.addEventListener("click", () => {
      withPageTransition(() => trial.settleAfterMiss());
    });
  document
    .querySelector<HTMLButtonElement>(
      "[data-trial-continue]",
    )
    ?.addEventListener("click", () => {
      withPageTransition(() => trial.continueAfterMiss());
    });
  document
    .querySelector<HTMLButtonElement>("[data-trial-skip]")
    ?.addEventListener("click", () => {
      withPageTransition(() => trial.skipQuestion());
    });
  document
    .querySelector<HTMLButtonElement>("[data-trial-revive]")
    ?.addEventListener("click", () => {
      withPageTransition(() => trial.reviveWithSkip());
    });
  document
    .querySelectorAll<HTMLButtonElement>("[data-trial-undo]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        trial.undoBossAnswer(
          Number(button.dataset.trialUndo),
        );
      });
    });
  wireGameSettingsDialog();
}

function trialReviewCardMarkup(
  item: TrialHistoryItem,
  index: number,
  slot: number,
  detailIndex = 0,
): string {
  const detail = item.answerDetails[detailIndex];
  const reviewRule =
    trialRules?.rules[item.ruleId] ?? null;
  const isWordItem =
    trialRuleUsesWordAnswer(reviewRule);
  const char = isWordItem
    ? item.answerDetails.map((answer) => answer.char).join("")
    : detail?.char ?? item.answer;
  const displayCards = isWordItem
    ? item.answerDetails.flatMap(
        (answer) => answer.displayCards,
      )
    : detail?.displayCards ?? item.displayCards;
  const reviewCards = displayCards.flatMap((card) =>
    card.displayMode === "overlay" && card.components
      ? card.components.map((symbolId) => ({
          ...card,
          symbolId,
          components: undefined,
          remainingComponents: undefined,
          displayMode: undefined,
        }))
      : [card],
  );
  const pinyin = detail?.pinyin ?? "";
  const displayChar = detail?.displayChar;
  const isTraditionalPair =
    trialRuleUsesPrompt(
      reviewRule,
      "traditional-components",
    ) &&
    Boolean(displayChar && displayChar !== char);
  const isCompositionWord =
    isWordItem &&
    [...char].length > 1;
  const level = data!.levels.get(char);
  const themeClass = !item.ok
    ? "is-error"
    : item.kind === "boss"
      ? "is-boss-correct"
    : level === 3
      ? "is-level-3"
      : level === 2
        ? "is-level-2"
        : "";
  const hasWidePart = reviewCards.some((card) => {
    if (card.displayMode === "compound") {
      return false;
    }
    const symbolId = card.symbolId;
    const component = data!.component(symbolId);
    return !component.assetUrl && [...component.name].length > 1;
  });
  const displayLabel = reviewCards
    .map((card) =>
      card.displayMode === "wildcard"
        ? "通配部件"
        : card.displayMode === "quantity"
        ? `${data!.component(card.symbolId).name} ×${
            card.remainingQuantity ??
            card.quantity ??
            card.components?.length ??
            1
          }`
        : card.displayMode === "compound"
        ? card.displayGlyph ?? ""
        : data!.component(card.symbolId).name,
    )
    .join(" ");
  const showIndex = item.kind !== "boss" || detailIndex === 0;
  return `
    <li class="review-card trial-review-card ${themeClass} ${isCompositionWord ? `is-composition-word is-word-${[...char].length}` : ""}" style="--review-index:${index}" ${isCompositionWord ? `aria-label="词语 ${escapeHtml(char)}"` : `data-review-char="${escapeHtml(char)}" role="button" tabindex="0" aria-label="查看「${escapeHtml(char)}」的释义"`}>
      ${showIndex ? `<span class="review-index" aria-hidden="true">${String(slot).padStart(2, "0")}</span>` : ""}
      <span class="review-result ${item.ok ? "is-correct" : "is-wrong"}" aria-label="${item.ok ? "正确" : "错误"}"></span>
      <div class="review-answer ${pinyin ? "has-pinyin" : ""} ${isTraditionalPair ? "is-traditional-pair" : ""} ${isCompositionWord ? `is-composition-word is-word-${[...char].length}` : ""}">
        ${pinyin ? `<small class="review-pinyin">${escapeHtml(pinyin)}</small>` : ""}
        ${
          isCompositionWord
            ? `<span class="trial-review-word-chars ${[...char].length === 4 ? "is-four" : [...char].length === 3 ? "is-three" : "is-two"}">${[...char]
                .map(
                  (wordChar) =>
                    `<button class="trial-review-word-char" type="button" data-review-char="${escapeHtml(wordChar)}" aria-label="查看「${escapeHtml(wordChar)}」的释义"><strong>${escapeHtml(wordChar)}</strong></button>`,
                )
                .join("")}</span>`
            : isTraditionalPair
            ? `<span class="review-answer-pair" aria-label="${escapeHtml(displayChar!)}—${escapeHtml(char)}">
                <span class="review-answer-pair-char is-traditional">${escapeHtml(displayChar!)}</span>
                <i class="review-answer-pair-divider" aria-hidden="true"></i>
                <span class="review-answer-pair-char is-simplified">${escapeHtml(char)}</span>
              </span>`
            : `<span>${escapeHtml(char)}</span>`
        }
      </div>
      ${isCompositionWord ? "" : `<div class="review-meta">${escapeHtml((detail?.meta ?? item.meta).replace(/[（）]/g, ""))}</div>`}
      <div class="review-parts ${reviewCards.length >= 5 ? "is-many" : ""} ${hasWidePart ? "is-wide" : ""}" aria-label="答案部件 ${escapeHtml(displayLabel)}">
        ${reviewCards
          .map((card) =>
            card.displayMode === "wildcard"
              ? `<span class="review-part is-wildcard">${crisIconMarkup()}</span>`
              : card.displayMode === "quantity"
              ? `<span class="review-part is-quantity">${renderComponent(data!.component(card.symbolId)).html}<small>×${
                  card.remainingQuantity ??
                  card.quantity ??
                  card.components?.length ??
                  1
                }</small></span>`
              : card.displayMode === "compound"
              ? `<span class="review-part is-prefabricated">${escapeHtml(card.displayGlyph ?? "")}</span>`
              : `<span class="review-part ${card.reductionPart ? "is-reduction-part" : ""}">${renderComponent(data!.component(card.symbolId)).html}</span>`,
          )
          .join("")}
      </div>
    </li>
  `;
}

function renderTrialResults(trial: TrialSession): void {
  trialDebugOpen = false;
  const state = trial.state;
  const result = state.result;
  if (!result) {
    return;
  }
  const byStage = new Map<number, TrialHistoryItem[]>();
  for (const item of state.history) {
    const group = byStage.get(item.stage) ?? [];
    group.push(item);
    byStage.set(item.stage, group);
  }
  const resultRule =
    trialRules?.rules[state.ruleId] ?? FALLBACK_TRIAL_RULE;
  const shareText = buildTrialShareText({
    advancement: lastSettings.trialAdvancement,
    title: result.title,
    correctCount: result.correctCount,
    reachedStage: result.reachedStage,
    stageName: trialStageName(result.reachedStage),
    ruleName: resultRule.name,
    history: state.history.map((item) => {
      const levels = item.answerDetails.map((detail) =>
        data!.levels.get(detail.char),
      );
      return {
        ok: item.ok,
        kind: item.kind,
        stage: item.stage,
        level: (levels.includes(2) ||
        levels.includes(3)
          ? 2
          : 1) as Level,
      };
    }),
  });
  let reviewIndex = 0;
  const stageSections = [...byStage.entries()]
    .map(([stage, items]) => {
      let stageCardIndex = 0;
      const rule =
        (items[0]
          ? trialRules?.rules[items[0].ruleId]
          : null) ??
        FALLBACK_TRIAL_RULE;
      return `
        <section class="trial-result-stage">
          <header>
            <h2>${trialStageName(stage)}</h2>
            <small>${items.filter((item) => item.ok).length} / ${state.questionsPerStage + 1}</small>
          </header>
          ${trialRuleMarkup(rule, hasTrialDebugAccess())}
          <ol class="review-list trial-review-list">
            ${items
              .flatMap((item) => {
                const itemRule =
                  trialRules?.rules[item.ruleId];
                const detailCount =
                  trialRuleUsesWordAnswer(itemRule)
                    ? 1
                    : Math.max(
                        1,
                        item.answerDetails.length,
                      );
                return Array.from(
                  { length: detailCount },
                  (_, detailIndex) => {
                    stageCardIndex += 1;
                    return trialReviewCardMarkup(
                      item,
                      reviewIndex++,
                      stageCardIndex,
                      detailIndex,
                    );
                  },
                );
              })
              .join("")}
          </ol>
        </section>
      `;
    })
    .join("");
  root.innerHTML = shell(
    `
      <main class="result-screen trial-result-screen">
        <section class="result-surface trial-result-surface">
          <header class="result-header">
            <div class="trial-result-heading">
              <svg class="trial-stage-chevron" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m9 3 9 9-9 9"></path>
              </svg>
              <h1>${trialResultTitleMarkup(result.title)}</h1>
              <svg class="trial-stage-chevron" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m15 3-9 9 9 9"></path>
              </svg>
            </div>
            <div class="result-score">${trialStageName(result.reachedStage)} · ${result.correctCount}题</div>
            <div class="trial-result-cris" aria-label="${
              result.crisEarned > 0
                ? `获得分光水晶 ${result.crisEarned}`
                : "本局未获得分光水晶"
            }">${crisIconMarkup()}${
              result.crisEarned > 0
                ? `<strong>+${result.crisEarned}</strong>`
                : "<span>无奖励</span>"
            }${
              result.unlockedAdvancement === undefined
                ? ""
                : `<span class="trial-result-unlock">已解锁进阶${result.unlockedAdvancement}</span>`
            }</div>
          </header>
          <div class="trial-result-scroll">${stageSections}</div>
          <div class="result-actions">
            <button class="primary-action" type="button" data-trial-again>再次试炼</button>
            <button class="result-share" type="button" data-share>分享</button>
            <button type="button" data-trial-exit>返回</button>
          </div>
        </section>
      </main>
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
    `,
    "result",
  );
  const detailDialog =
    document.querySelector<HTMLDialogElement>(".char-detail-dialog");
  const detailView =
    detailDialog &&
    new CharDetailView(detailDialog, charDetails, (char) => {
      const way = data?.shortestDecomposition(char);
      const source = data;
      if (!way || !source) {
        return "";
      }
      return way
        .map(
          (symbolId) =>
            `<span class="char-detail-split-part">${renderComponent(source.component(symbolId)).html}</span>`,
        )
        .join("");
    });
  const trialReview = document.querySelector<HTMLElement>(
    ".trial-result-scroll",
  );
  const openTrialReview = (target: EventTarget | null): void => {
    const card =
      target instanceof Element
        ? target.closest<HTMLElement>("[data-review-char]")
        : null;
    const char = card?.dataset.reviewChar;
    if (!char || !detailView) {
      return;
    }
    detailView.open(
      char,
      trialCharacterMeta(char),
    );
  };
  trialReview?.addEventListener("click", (event) => {
    openTrialReview(event.target);
  });
  trialReview?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest("[data-review-char]")
    ) {
      event.preventDefault();
      openTrialReview(target);
    }
  });
  if (trialReview) {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    for (const card of trialReview.querySelectorAll<HTMLElement>(
      ".trial-review-card",
    )) {
      card.addEventListener(
        "animationstart",
        (event) => {
          if (event.animationName !== "review-card-in") {
            return;
          }
          requestAnimationFrame(() => {
            const containerTop =
              trialReview.getBoundingClientRect().top;
            const cardBottom =
              card.getBoundingClientRect().bottom -
              containerTop +
              trialReview.scrollTop;
            const visibleBottom =
              trialReview.scrollTop + trialReview.clientHeight;
            if (cardBottom > visibleBottom) {
              trialReview.scrollTo({
                top: Math.min(
                  trialReview.scrollHeight -
                    trialReview.clientHeight,
                  cardBottom - trialReview.clientHeight + 1,
                ),
                behavior: reducedMotion ? "auto" : "smooth",
              });
            }
          });
        },
        { once: true },
      );
    }
  }
  document
    .querySelector<HTMLButtonElement>("[data-trial-again]")
    ?.addEventListener("click", () => {
      withPageTransition(() => startTrial(lastSettings));
    });
  document
    .querySelector<HTMLButtonElement>("[data-trial-exit]")
    ?.addEventListener("click", () => {
      withPageTransition(() => renderStart(lastSettings));
    });
  wireResultShareButton(shareText);
  wireGameSettingsDialog();
}

function renderTrial(trial: TrialSession): void {
  if (trial.state.phase === "stage-intro") {
    renderTrialStageIntro(trial);
  } else if (trial.state.phase === "results") {
    renderTrialResults(trial);
  } else {
    renderTrialGame(trial);
  }
}

function startTrial(settings: GameSettings): void {
  if (!data) {
    return;
  }
  if (
    settings.trialAdvancement >
    trialProgress.maxUnlocked()
  ) {
    renderStart(settings);
    return;
  }
  session?.destroy();
  trialSession?.destroy();
  session = null;
  startLayoutObserver?.disconnect();
  startLayoutObserver = null;
  lastTrialQuestionKey = "";
  lastTrialBossKey = "";
  animatedTrialConsumedCardIds = new Set();
  animatedTrialObscuredCardIds = new Set();
  lastTrialPaused = false;
  lastTimerFraction = 1;
  lastFugueTimerFractions = [1, 1];
  lastSettings = structuredClone(settings);
  trialSession = new TrialSession(
    data,
    settings,
    (state, event) => {
      if (!trialSession) {
        return;
      }
      const active = trialSession;
      if (event === "rule") {
        renderTrialStageIntro(active);
        return;
      }
      if (event === "obscure") {
        updateTrialTimer(state);
        updateTrialObscuration(state);
        return;
      }
      if (event === "tick") {
        if (state.fugue) {
          updateFugueTimers(state);
        } else {
          updateTrialTimer(state);
        }
        return;
      }
      if (state.phase === "results") {
        if (state.result?.cleared) {
          const wasCompleted =
            trialProgress.completed(
              settings.trialAdvancement,
            );
          trialProgress.recordCleared(
            settings.trialAdvancement,
            state.result.title === "知我梦中",
          );
          const unlocked =
            trialAdvancementUnlockedByFirstClear(
              settings.trialAdvancement,
              wasCompleted,
            );
          if (unlocked !== null) {
            state.result.unlockedAdvancement =
              unlocked;
          }
        }
        withPageTransition(() => renderTrialResults(active));
        return;
      }
      if (state.phase === "stage-intro") {
        withPageTransition(() => renderTrial(active));
        return;
      }
      renderTrial(active);
    },
    Math.random,
    experimentalPlay,
    (char, way) => {
      collection.recordEncounter(
        char,
        way,
        !data!.levels.has(char),
      );
    },
    cris,
    trialRules,
    trialRuntimeData.pinyin,
    trialRuntimeData.traditional,
    trialRuntimeData.gestalt,
    trialRuntimeData.composition,
    trialRuntimeData.assonance,
    trialRuntimeData.wordAnswers,
  );
  renderTrialStageIntro(trialSession);
}

function renderResults(game: GameSession): void {
  const state = game.state;
  const result = state.result;
  if (!result) {
    return;
  }

  const modeLabel = {
    normal: "练习模式",
    endless: "无尽模式",
    challenge: "挑战模式",
    trial: "试炼模式",
  }[state.settings.mode];
  const finalBounds =
    state.settings.mode === "challenge"
      ? data!.challengeBounds(state.settings, state.index)
      : null;
  const challengeStage = finalBounds
    ? finalBounds.isEx
      ? "阶段EX"
      : `阶段${finalBounds.stage}`
    : "";
  const score =
    state.settings.mode === "challenge"
      ? `${challengeStage} · ${state.correctCount}题 · 平均${result.averageQuestionSeconds.toFixed(1)}s`
      : `${modeLabel} · ${state.correctCount}题`;
  const shareStage = finalBounds
    ? finalBounds.isEx
      ? "EX"
      : String(finalBounds.stage)
    : "1";
  const shareText = buildChallengeShareText({
    correctCount: state.correctCount,
    stage: shareStage,
    isEx: finalBounds?.isEx ?? false,
    difficulty: state.settings.difficulty,
    averageQuestionSeconds:
      result.averageQuestionSeconds,
    history: state.history.map((item) => ({
      ok: item.ok,
      isEx: item.isEx,
      level: data!.levels.get(item.answer),
    })),
  });
  const victory =
    state.settings.mode === "normal" && result.title === "胜利";
  const victoryStart = (state.history.length - 1) * 65 + 440;

  const review = state.history
    .map((item, index) => {
      const level = data!.levels.get(item.answer);
      const themeClass = !item.ok
        ? "is-error"
        : item.isEx
          ? "is-ex-correct"
          : level === 2
            ? "is-level-2"
            : level === 3
              ? "is-level-3"
              : "";
      return `
        <li class="review-card ${themeClass}" style="--review-index:${index}" role="button" tabindex="0" data-review-char="${escapeHtml(item.answer)}" aria-label="查看「${escapeHtml(item.answer)}」的释义">
          <span class="review-index" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
          <span class="review-result ${item.ok ? "is-correct" : "is-wrong"}" aria-label="${item.ok ? "正确" : "错误"}"></span>
          <div class="review-answer"><span>${escapeHtml(item.answer)}</span></div>
          <div class="review-meta">${escapeHtml(item.meta.replace(/[（）]/g, ""))}</div>
          <div class="review-parts ${item.displayParts.length >= 5 ? "is-many" : ""} ${item.displaySymbolIds.some((symbolId) => {
            const component = data!.component(symbolId);
            return !component.assetUrl && [...component.name].length > 1;
          }) ? "is-wide" : ""}" aria-label="部件顺序">
            ${item.displaySymbolIds.map((symbolId) => `<span class="review-part">${renderComponent(data!.component(symbolId)).html}</span>`).join("")}
          </div>
        </li>
      `;
    })
    .join("");

  root.innerHTML = shell(`
    <main class="result-screen">
      <section class="result-surface">
        <header class="result-header">
          <h1>${escapeHtml(result.title)}</h1>
          <div class="result-score">${escapeHtml(score)}</div>
          ${
            state.settings.mode === "challenge"
              ? `<div class="result-cris" aria-label="获得分光水晶 ${result.crisEarned}">
                  ${crisIconMarkup()}
                  <strong>+${result.crisEarned}</strong>
                </div>`
              : ""
          }
          ${
            state.settings.mode === "normal"
              ? ""
              : `<div class="record-row">纪录：${result.record}${result.newRecord ? '<span class="new-record">新纪录</span>' : ""}</div>`
          }
        </header>

        <ol class="review-list ${victory ? "is-victory" : ""}" style="--victory-start:${victoryStart}ms">${review}</ol>

        <div class="result-actions">
          <button class="primary-action" type="button" data-again>再来一局</button>
          ${state.settings.mode === "challenge" ? '<button class="result-share" type="button" data-share>分享</button>' : ""}
          <button type="button" data-settings>返回</button>
        </div>
      </section>
    </main>
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
            <div>
              <dt>读音</dt>
              <dd data-detail-readings>载入中</dd>
            </div>
            <div>
              <dt>Unicode</dt>
              <dd data-detail-unicode></dd>
            </div>
            <div data-detail-school-row hidden>
              <dt>教材</dt>
              <dd data-detail-school></dd>
            </div>
            <div>
              <dt>拆分</dt>
              <dd data-detail-split></dd>
            </div>
          </dl>
        </header>
        <div class="char-detail-content" data-detail-content></div>
        <footer class="char-detail-footer">内容来自网络，仅供参考</footer>
      </article>
    </dialog>
  `, "result");

  const reviewList = document.querySelector<HTMLElement>(".review-list");
  const detailDialog =
    document.querySelector<HTMLDialogElement>(".char-detail-dialog");
  const detailView =
    detailDialog &&
    new CharDetailView(detailDialog, charDetails, (char) => {
      const way = data?.shortestDecomposition(char);
      const source = data;
      if (!way || !source) {
        return "";
      }
      return way
        .map(
          (symbolId) =>
            `<span class="char-detail-split-part">${renderComponent(source.component(symbolId)).html}</span>`,
        )
        .join("");
    });
  if (reviewList) {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    for (const card of reviewList.querySelectorAll<HTMLElement>(".review-card")) {
      card.addEventListener(
        "animationstart",
        (event) => {
          if (event.animationName !== "review-card-in") {
            return;
          }
          requestAnimationFrame(() => {
            const cardBottom = card.offsetTop + card.offsetHeight;
            const visibleBottom = reviewList.scrollTop + reviewList.clientHeight;
            if (cardBottom > visibleBottom) {
              reviewList.scrollTo({
                top: Math.min(
                  reviewList.scrollHeight - reviewList.clientHeight,
                  cardBottom - reviewList.clientHeight + 1,
                ),
                behavior: reducedMotion ? "auto" : "smooth",
              });
            }
          });
        },
        { once: true },
      );
    }

    const openCardDetail = (card: HTMLElement): void => {
      const char = card.dataset.reviewChar;
      if (!char || !detailView) {
        return;
      }
      const meta =
        card.querySelector<HTMLElement>(".review-meta")?.textContent?.trim() ??
        "";
      detailView.open(char, meta);
    };

    reviewList.addEventListener("click", (event) => {
      const target = event.target;
      const card =
        target instanceof Element
          ? target.closest<HTMLElement>(".review-card")
          : null;
      if (card) {
        openCardDetail(card);
      }
    });
    reviewList.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      const target = event.target;
      const card =
        target instanceof Element
          ? target.closest<HTMLElement>(".review-card")
          : null;
      if (!card) {
        return;
      }
      event.preventDefault();
      openCardDetail(card);
    });
  }

  document.querySelector<HTMLButtonElement>("[data-again]")?.addEventListener("click", () => {
    withPageTransition(() => startGame(state.settings));
  });
  wireResultShareButton(shareText);
  document.querySelector<HTMLButtonElement>("[data-settings]")?.addEventListener("click", () => {
    withPageTransition(() => renderStart(state.settings));
  });
  wireGameSettingsDialog();
}

function startGame(settings: GameSettings): void {
  if (!data) {
    return;
  }

  session?.destroy();
  trialSession?.destroy();
  trialSession = null;
  if (settings.mode === "trial") {
    startTrial(settings);
    return;
  }
  startLayoutObserver?.disconnect();
  startLayoutObserver = null;
  lastQuestionKey = "";
  lastTrialQuestionKey = "";
  lastRenderedPaused = false;
  lastTimerFraction = 1;
  lastSettings = structuredClone(settings);
  session = new GameSession(
    data,
    settings,
    records,
    (state, event) => {
      if (!session) {
        return;
      }
      const activeSession = session;
      if (event === "tick") {
        updateTimer(state);
        return;
      }
      if (state.phase === "results") {
        withPageTransition(() => renderResults(activeSession));
        return;
      }
      renderGame(activeSession);
    },
    Math.random,
    cris,
    experimentalPlay,
  );
  renderGame(session);
}

renderStart(DEFAULT_SETTINGS);

void Promise.all([
  loadGameData(appBaseUrl),
  loadTrialRules(appBaseUrl),
])
  .then(([loadedData, loadedRules]) => {
    data = loadedData;
    trialRules = loadedRules;
    collection.reconcile(
      loadedData.ways,
      (symbolId) => loadedData.component(symbolId).name,
      undefined,
      (char) => !loadedData.levels.has(char),
    );
    startupError = "";
    if (!session) {
      renderStart(lastSettings);
    }
  })
  .catch((error: unknown) => {
    startupError = error instanceof Error ? error.message : "数据读取失败";
    renderStart(lastSettings);
  });

window.addEventListener("beforeunload", () => {
  session?.destroy();
  trialSession?.destroy();
});

window.addEventListener("keydown", (event) => {
  if (
    event.key !== "Escape" ||
    event.isComposing ||
    document.querySelector("dialog[open]") ||
    ((!session ||
      session.state.phase !== "playing" ||
      session.state.revealing) &&
      (!trialSession ||
        (trialSession.state.phase !== "playing" &&
          trialSession.state.phase !== "boss") ||
        trialSession.state.revealing))
  ) {
    return;
  }
  event.preventDefault();
  if (session) {
    session.togglePause();
  } else {
    trialSession?.togglePause();
  }
});

window.addEventListener("resize", setupStartLayout);

