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
import { GameSession, type GameState } from "./game/session";
import { buildChallengeShareText } from "./game/share";
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
import { splitPartsIntoRows } from "./ui/parts";
import {
  createTutorialDialog,
  TUTORIAL_TRIGGER_MARKUP,
} from "./ui/tutorial";

const rootElement = document.querySelector<HTMLDivElement>("#app");

if (!rootElement) {
  throw new Error("Missing #app root element.");
}

const root: HTMLDivElement = rootElement;

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
  difficulty: "standard",
};

let data: GameData | null = null;
let startupError = "";
let session: GameSession | null = null;
let lastSettings: GameSettings = structuredClone(DEFAULT_SETTINGS);
let composing = false;
let lastQuestionKey = "";
let lastRenderedPaused = false;
let advancedSettingsOpen = isDebugUnlocked();
let startingGame = false;
let startLayoutObserver: ResizeObserver | null = null;
let pageTransitionActive = false;
let shareToastTimer: number | null = null;

const MODE_ORDER: Mode[] = ["challenge", "normal", "endless"];
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
const charDetails = new CharDetailStore(document.baseURI);
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

function renderComponent(component: ComponentDefinition): {
  html: string;
  long: boolean;
  hasAsset: boolean;
} {
  const label = escapeHtml(component.name);
  if (component.assetUrl) {
    return {
      html: `<span class="component-symbol" role="img" aria-label="${label}" style="--component-mask:url(&quot;${escapeHtml(component.assetUrl)}&quot;)"></span>`,
      long: false,
      hasAsset: true,
    };
  }
  return {
    html: label,
    long: [...component.name].length > 1,
    hasAsset: false,
  };
}

function shell(
  content: string,
  page: "start" | "play" | "result",
): string {
  const settingsLocked =
    Boolean(session && session.state.phase === "playing");
  const crisTotal = cris.load();
  return `
    <div class="app-shell page-${page}">
      ${
        page === "start"
          ? `<button class="advanced-corner" type="button" aria-label="调试入口" aria-pressed="${advancedSettingsOpen}"></button>`
          : ""
      }
      ${crisBalanceMarkup(crisTotal, advancedSettingsOpen)}
      <div class="corner-actions">
        ${TUTORIAL_TRIGGER_MARKUP}
        ${ATLAS_TRIGGER_MARKUP}
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
          ? `<a class="home-decoration" href="./gacha/" data-gacha-entry aria-label="进入写字台"><span class="gacha-decoration-label" aria-hidden="true">进入写字台</span>${CHALLENGE_CARD_DECOR_MARKUP}</a>`
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
            <a class="git-setting-link" href="https://github.com/Dveissre/zigsaw" target="_blank" rel="noreferrer">
              <span>Git页</span>
              <span>github.com/Dveissre/zigsaw ↗</span>
            </a>
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
    session &&
      session.state.phase === "playing" &&
      !session.state.paused &&
      !session.state.revealing,
  );
  if (resumeAfterTutorial) {
    session?.togglePause();
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
  }
}

tutorialDialog.addEventListener("close", finishInfoDialog);

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
}

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

function updateStartRecord(): void {
  const record = document.querySelector<HTMLElement>("[data-start-record]");
  if (!record) {
    return;
  }
  if (selectedMode() !== "challenge") {
    record.hidden = true;
    return;
  }
  record.hidden = false;
  const settings = readSettings();
  record.textContent = `纪录：${records.load(recordKey(settings))}`;
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
      element.hidden = mode === "challenge";
    });

  const countField = document.querySelector<HTMLElement>(
    "[data-mode-field='count']",
  );
  if (countField) {
    countField.hidden = mode !== "normal";
  }

  document
    .querySelectorAll<HTMLElement>("[data-mode-field='challenge']")
    .forEach((element) => {
      element.hidden = mode !== "challenge";
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
          mode === "challenge");
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
  const difficulty = selectedDifficulty();

  return {
    levels,
    partsLow: lowStop,
    partsHigh: highStop === 5 ? 18 : highStop,
    mode,
    count: numberValue("#game-count", 10, 3, 50),
    seconds:
      mode === "challenge"
        ? CHALLENGE_DIFFICULTY_SECONDS[difficulty]
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
    difficulty,
  };
}

function renderStart(initial: GameSettings = lastSettings): void {
  startLayoutObserver?.disconnect();
  startLayoutObserver = null;
  startingGame = false;
  session?.destroy();
  session = null;
  lastQuestionKey = "";
  lastRenderedPaused = false;

  const lowStop = initial.partsLow >= 5 ? 5 : clamp(initial.partsLow, 2, 4);
  const highStop = initial.partsHigh >= 5 ? 5 : clamp(initial.partsHigh, 2, 4);
  const checked = (level: Level) => initial.levels.includes(level) ? "checked" : "";
  const pressed = (mode: Mode) => initial.mode === mode ? "true" : "false";
  const advancedHidden = advancedSettingsOpen ? "" : "hidden";
  const difficultyNotes =
    DIFFICULTY_NOTES[initial.difficulty];
  const challengeRecord =
    initial.mode === "challenge"
      ? records.load(recordKey(initial))
      : 0;

  root.innerHTML = shell(`
    <main class="start-screen">
      <form class="settings-form" data-settings-form data-active-mode="${initial.mode}" data-advanced-open="${advancedSettingsOpen}" novalidate>
        <div class="settings-stack">
          <section class="setting-block">
            <div class="setting-label">模式</div>
            <div class="segmented mode-switch" role="group" aria-label="模式" data-active-mode="${initial.mode}" style="--mode-position:${MODE_ORDER.indexOf(initial.mode)}">
              <span class="mode-slider" aria-hidden="true"></span>
              <button type="button" data-mode="challenge" aria-pressed="${pressed("challenge")}">挑战</button>
              <button type="button" data-mode="normal" aria-pressed="${pressed("normal")}">练习</button>
              <button type="button" data-mode="endless" aria-pressed="${pressed("endless")}">无尽</button>
            </div>
          </section>

          <div class="mode-fields">
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

          <section class="setting-block" data-mode-field="count">
            <div class="setting-label">题数</div>
            <div class="stepper" data-stepper>
              <button type="button" data-delta="-1" aria-label="减少题数">−</button>
              <input id="game-count" type="number" min="3" max="50" step="1" value="${initial.count}" inputmode="numeric">
              <button type="button" data-delta="1" aria-label="增加题数">+</button>
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
          <span class="start-record" data-start-record ${initial.mode === "challenge" ? "" : "hidden"}>纪录：${challengeRecord}</span>
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

  const advancedCorner = document.querySelector<HTMLButtonElement>(".advanced-corner");
  advancedCorner?.addEventListener("click", async () => {
    if (advancedSettingsOpen) {
      advancedSettingsOpen = false;
      revokeDebugAccess();
    } else {
      if (!(await requestDebugAccess())) {
        return;
      }
      advancedSettingsOpen = true;
    }
    advancedCorner.setAttribute("aria-pressed", String(advancedSettingsOpen));
    syncAdvancedSettings();
    if (form) {
      form.dataset.advancedOpen = String(advancedSettingsOpen);
    }
    refreshCrisBalance();
    setupStartLayout();
  });

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

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formError = document.querySelector<HTMLElement>("[data-form-error]");
    const settings = readSettings();

    if (settings.mode !== "challenge" && settings.levels.length === 0) {
      if (formError) {
        formError.textContent = "级别";
      }
      return;
    }
    if (
      settings.mode !== "challenge" &&
      settings.levels.every(
        (level) =>
          data?.candidates(level, settings.partsLow, settings.partsHigh)
            .length === 0,
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
  if (!timerRing || !timerValue || !timerProgress) {
    return;
  }

  const fraction = Math.max(
    0,
    Math.min(1, state.remaining / state.settings.seconds),
  );
  const circumference = 2 * Math.PI * 32;
  timerValue.textContent = String(state.remaining);
  timerProgress.style.strokeDasharray = `${circumference} ${circumference}`;
  timerProgress.style.strokeDashoffset = String(
    circumference * (1 - fraction),
  );
  timerRing.classList.toggle("is-urgent", state.remaining <= 5 && !state.paused);
  timerRing.classList.toggle("is-paused", state.paused);
  timerRing.classList.toggle("is-correct", state.feedback === "correct");
  timerRing.setAttribute(
    "aria-label",
    state.paused ? `暂停，剩余 ${state.remaining} 秒` : `剩余 ${state.remaining} 秒`,
  );

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
  input.focus();
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
    renderComponent(data!.component(symbolId)),
  );
  const partCount = partNames.length;
  const densityClass =
    partCount >= 12 ? "is-dense" : partCount >= 8 ? "is-compact" : "";
  const cardAngles = [-0.8, 0.9, -0.35, 1.15, -1.05, 0.45];
  const cardOffsets = [1, 4, 0, 5, 2, 3];
  let cardIndex = 0;
  const partsMarkup = splitPartsIntoRows(partNames)
    .map(
      (row) =>
        `<div class="part-row">${row
          .map(
            (part) =>
              `<span class="part-card" style="--card-index:${cardIndex};--card-angle:${cardAngles[cardIndex % cardAngles.length]}deg;--card-offset:${cardOffsets[cardIndex++ % cardOffsets.length]}px"><span class="part ${part.long ? "is-long" : ""}">${part.html}</span></span>`,
          )
          .join("")}</div>`,
    )
    .join("");
  const revealed = state.revealing;
  const correct = state.feedback === "correct";
  const wrong = state.feedback === "wrong";
  const partsFeedback = correct ? "has-correct" : wrong ? "has-wrong" : "";
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
    : wrong && revealed
      ? "is-miss"
      : wrong
        ? "is-wrong"
        : "";
  const feedbackAnnouncement = correct
    ? "正确"
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
    state.paused ||
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
          <div class="timer-ring" data-timer-ring role="timer">
            <svg viewBox="0 0 80 80" aria-hidden="true">
              <circle class="timer-track" cx="40" cy="40" r="32"></circle>
              <circle class="timer-progress" data-timer-progress cx="40" cy="40" r="32"></circle>
            </svg>
            <span class="timer-readout"><strong data-timer>${state.remaining}</strong></span>
          </div>
        </header>

        <div class="parts ${densityClass} ${partsFeedback} ${pausedClass} ${exClass}" aria-label="部件">
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

        <div class="play-actions">
          ${revealed && state.advanceLabel ? `<button class="primary-action" type="button" data-advance>${escapeHtml(state.advanceLabel)}</button>` : ""}
          ${
            revealed && state.advanceLabel
              ? `
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
  document.querySelector<HTMLButtonElement>("[data-share]")?.addEventListener("click", async (event) => {
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
  startLayoutObserver?.disconnect();
  startLayoutObserver = null;
  lastQuestionKey = "";
  lastRenderedPaused = false;
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
  );
  renderGame(session);
}

renderStart(DEFAULT_SETTINGS);

void loadGameData(document.baseURI)
  .then((loadedData) => {
    data = loadedData;
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
});

window.addEventListener("keydown", (event) => {
  if (
    event.key !== "Escape" ||
    event.isComposing ||
    document.querySelector("dialog[open]") ||
    !session ||
    session.state.phase !== "playing" ||
    session.state.revealing
  ) {
    return;
  }
  event.preventDefault();
  session.togglePause();
});

window.addEventListener("resize", setupStartLayout);

