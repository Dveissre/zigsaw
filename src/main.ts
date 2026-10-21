import "./styles.css";
import {
  loadGameData,
  type GameData,
  type GameSettings,
  type Level,
  type Mode,
} from "./game/data";
import { LocalRecordStore } from "./game/records";
import { GameSession, type GameState } from "./game/session";
import { splitPartsIntoRows } from "./ui/parts";

const rootElement = document.querySelector<HTMLDivElement>("#app");

if (!rootElement) {
  throw new Error("Missing #app root element.");
}

const root: HTMLDivElement = rootElement;

const DEFAULT_SETTINGS: GameSettings = {
  levels: [1],
  partsLow: 2,
  partsHigh: 4,
  mode: "normal",
  count: 10,
  seconds: 20,
  stageQuestions: 5,
  stageSize: 1500,
  stageShift: 300,
};

let data: GameData | null = null;
let startupError = "";
let session: GameSession | null = null;
let lastSettings: GameSettings = structuredClone(DEFAULT_SETTINGS);
let composing = false;
let lastQuestionKey = "";

const records = new LocalRecordStore();

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shell(
  content: string,
  page: "start" | "play" | "result",
  stageClear = false,
): string {
  return `
    <div class="app-shell page-${page}">
      <header class="masthead ${stageClear ? "is-stage-clear" : ""}">
        <h1 class="wordmark">ZI<span>GSAW</span></h1>
        <span class="stage-clear-label" aria-hidden="true">STAGE CLEAR</span>
      </header>
      ${content}
    </div>
  `;
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
  lowMarker.style.left = `${start}%`;
  highMarker.style.left = `${end}%`;

  lowLabel.textContent = formatPartsStop(lowStop);
  highLabel.textContent = formatPartsStop(highStop);
}

function selectedMode(): Mode {
  return (
    (document.querySelector<HTMLButtonElement>(
      "[data-mode][aria-pressed='true']",
    )?.dataset.mode as Mode | undefined) ?? "normal"
  );
}

function updateModeFields(): void {
  const mode = selectedMode();
  document.querySelectorAll<HTMLElement>("[data-mode-field='selection']").forEach((element) => {
    element.hidden = mode === "challenge";
  });

  const countField = document.querySelector<HTMLElement>("[data-mode-field='count']");
  if (countField) {
    countField.hidden = mode !== "normal";
  }

  const challengeFields = document.querySelector<HTMLElement>("[data-mode-field='challenge']");
  if (challengeFields) {
    challengeFields.hidden = mode !== "challenge";
  }
  if (mode !== "challenge") {
    const advancedSettings = document.querySelector<HTMLElement>("#challenge-advanced");
    const advancedToggle = document.querySelector<HTMLButtonElement>(".advanced-toggle");
    if (advancedSettings) {
      advancedSettings.hidden = true;
    }
    advancedToggle?.setAttribute("aria-expanded", "false");
  }
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

  return {
    levels,
    partsLow: lowStop,
    partsHigh: highStop === 5 ? 18 : highStop,
    mode: selectedMode(),
    count: numberValue("#game-count", 10, 3, 50),
    seconds: Math.round(numberValue("#game-seconds", 20, 5, 180) / 5) * 5,
    stageQuestions: numberValue("#stage-questions", 5, 1, 50),
    stageSize: numberValue("#stage-size", 1500, 10, 8105),
    stageShift: numberValue("#stage-shift", 300, 1, 8105),
  };
}

function renderStart(initial: GameSettings = lastSettings): void {
  session?.destroy();
  session = null;
  lastQuestionKey = "";

  const lowStop = initial.partsLow >= 5 ? 5 : clamp(initial.partsLow, 2, 4);
  const highStop = initial.partsHigh >= 5 ? 5 : clamp(initial.partsHigh, 2, 4);
  const checked = (level: Level) => initial.levels.includes(level) ? "checked" : "";
  const pressed = (mode: Mode) => initial.mode === mode ? "true" : "false";

  root.innerHTML = shell(`
    <main class="start-screen">
      <form class="settings-form" data-settings-form novalidate>
        <div class="settings-stack">
          <section class="setting-block">
            <div class="setting-label">模式</div>
            <div class="segmented" role="group" aria-label="模式">
              <button type="button" data-mode="normal" aria-pressed="${pressed("normal")}">普通</button>
              <button type="button" data-mode="endless" aria-pressed="${pressed("endless")}">无尽</button>
              <button type="button" data-mode="challenge" aria-pressed="${pressed("challenge")}">挑战</button>
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

          <section class="setting-block">
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
            <div class="setting-block">
              <div class="setting-label">参数</div>
              <button class="advanced-toggle" type="button" aria-expanded="false" aria-controls="challenge-advanced">
                <span>高级设置</span>
                <span class="advanced-indicator" aria-hidden="true">＋</span>
              </button>
            </div>
            <div id="challenge-advanced" class="advanced-settings" hidden>
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

        <div class="start-row">
          <button class="start-button" type="submit" ${data ? "" : "disabled"}>开始</button>
          <span class="form-error" data-form-error role="alert">${escapeHtml(startupError)}</span>
        </div>
      </form>
    </main>
  `, "start");

  const form = document.querySelector<HTMLFormElement>("[data-settings-form]");
  document.querySelector<HTMLInputElement>("#parts-low")?.addEventListener("input", updatePartsSlider);
  document.querySelector<HTMLInputElement>("#parts-high")?.addEventListener("input", updatePartsSlider);
  updatePartsSlider();
  wireNumberSteppers();
  updateModeFields();

  const advancedToggle = document.querySelector<HTMLButtonElement>(".advanced-toggle");
  const advancedSettings = document.querySelector<HTMLElement>("#challenge-advanced");
  advancedToggle?.addEventListener("click", () => {
    if (!advancedSettings) {
      return;
    }
    const expanded = advancedToggle.getAttribute("aria-expanded") === "true";
    advancedToggle.setAttribute("aria-expanded", String(!expanded));
    advancedSettings.hidden = expanded;
  });

  document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((peer) => {
        peer.setAttribute("aria-pressed", String(peer === button));
      });
      updateModeFields();
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
    startGame(settings);
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
): { main: string; sub: string } {
  if (state.settings.mode === "challenge") {
    const { stage, start, end } = source.challengeBounds(state.settings, state.index);
    return {
      main: `阶段${stage} · 第${state.index}题`,
      sub: `Rank ${start + 1}-${end}`,
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

  const questionKey = `${state.settings.mode}|${state.index}`;
  const questionEnter = questionKey !== lastQuestionKey;
  lastQuestionKey = questionKey;
  const progress = gameProgress(state, data!);
  const stageClear =
    state.settings.mode === "challenge" &&
    state.feedback === "correct" &&
    state.revealing &&
    state.index % state.settings.stageQuestions === 0;
  const partNames = state.current.displayParts.map((name) => ({
    text: escapeHtml(name),
    long: [...name].length > 1,
  }));
  const partCount = partNames.length;
  const densityClass =
    partCount >= 12 ? "is-dense" : partCount >= 8 ? "is-compact" : "";
  let cardIndex = 0;
  const partsMarkup = splitPartsIntoRows(partNames)
    .map(
      (row) =>
        `<div class="part-row">${row
          .map(
            (part) =>
              `<span class="part-card" style="--card-index:${cardIndex++}"><span class="part ${part.long ? "is-long" : ""}">${part.text}</span></span>`,
          )
          .join("")}</div>`,
    )
    .join("");
  const revealed = state.revealing;
  const correct = state.feedback === "correct";
  const wrong = state.feedback === "wrong";
  const partsFeedback = correct ? "has-correct" : wrong ? "has-wrong" : "";
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
  const keepActionSlots = !revealed || correct;

  root.innerHTML = shell(`
    <main class="play-screen">
      <section class="play-surface ${questionEnter ? "question-enter" : ""}">
        <header class="play-hud">
          <div class="progress-stack">
            <span class="question-progress">${escapeHtml(progress.main)}</span>
            ${progress.sub ? `<span class="stage-rank">${escapeHtml(progress.sub)}</span>` : ""}
          </div>
          <div class="timer-ring" data-timer-ring role="timer">
            <svg viewBox="0 0 80 80" aria-hidden="true">
              <circle class="timer-track" cx="40" cy="40" r="32"></circle>
              <circle class="timer-progress" data-timer-progress cx="40" cy="40" r="32"></circle>
            </svg>
            <span class="timer-readout"><strong data-timer>${state.remaining}</strong></span>
          </div>
        </header>

        <div class="parts ${densityClass} ${partsFeedback}" aria-label="部件">
          ${partsMarkup}
        </div>

        <div class="answer-stage ${answerFeedback}">
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
            keepActionSlots
              ? `
                <button type="button" data-pause ${revealed ? "disabled" : ""}>${state.paused ? "继续" : "暂停"}</button>
                <button type="button" data-surrender ${revealed ? "disabled" : ""}>弃权</button>
              `
              : ""
          }
          <button type="button" data-restart>重开</button>
          <button type="button" data-settings>返回</button>
        </div>
      </section>
    </main>
  `, "play", stageClear);

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
  document.querySelector<HTMLButtonElement>("[data-restart]")?.addEventListener("click", () => {
    startGame(state.settings);
  });
  document.querySelector<HTMLButtonElement>("[data-settings]")?.addEventListener("click", () => {
    renderStart(state.settings);
  });
}

function renderResults(game: GameSession): void {
  const state = game.state;
  const result = state.result;
  if (!result) {
    return;
  }

  const modeLabel = {
    normal: "普通模式",
    endless: "无尽模式",
    challenge: "挑战模式",
  }[state.settings.mode];
  const stageSuffix =
    state.settings.mode === "challenge"
      ? ` · 阶段${data!.challengeBounds(state.settings, state.index).stage}`
      : "";
  const score = `${modeLabel} · ${state.correctCount}题${stageSuffix}`;
  const victory =
    state.settings.mode === "normal" && result.title === "胜利";
  const victoryStart = (state.history.length - 1) * 65 + 440;

  const review = state.history
    .map(
      (item, index) => `
        <li class="review-card ${item.ok ? "" : "is-error"}" style="--review-index:${index}">
          <span class="review-index" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
          <span class="review-result ${item.ok ? "is-correct" : "is-wrong"}" aria-label="${item.ok ? "正确" : "错误"}"></span>
          <div class="review-answer">${escapeHtml(item.answer)}</div>
          <div class="review-meta">${escapeHtml(item.meta.replace(/[（）]/g, ""))}</div>
          <div class="review-parts ${item.displayParts.length >= 5 ? "is-many" : ""} ${item.displayParts.some((part) => [...part].length > 1) ? "is-wide" : ""}" aria-label="部件顺序">
            ${item.displayParts.map((part) => `<span class="review-part">${escapeHtml(part)}</span>`).join("")}
          </div>
        </li>
      `,
    )
    .join("");

  root.innerHTML = shell(`
    <main class="result-screen">
      <section class="result-surface">
        <header class="result-header">
          <h1>${escapeHtml(result.title)}</h1>
          <div class="result-score">${escapeHtml(score)}</div>
          ${
            state.settings.mode === "normal"
              ? ""
              : `<div class="record-row">记录：${result.record}${result.newRecord ? '<span class="new-record">新纪录</span>' : ""}</div>`
          }
        </header>

        <ol class="review-list ${victory ? "is-victory" : ""}" style="--victory-start:${victoryStart}ms">${review}</ol>

        <div class="result-actions">
          <button class="primary-action" type="button" data-again>再来一局</button>
          <button type="button" data-settings>返回</button>
        </div>
      </section>
    </main>
  `, "result");

  document.querySelector<HTMLButtonElement>("[data-again]")?.addEventListener("click", () => {
    startGame(state.settings);
  });
  document.querySelector<HTMLButtonElement>("[data-settings]")?.addEventListener("click", () => {
    renderStart(state.settings);
  });
}

function startGame(settings: GameSettings): void {
  if (!data) {
    return;
  }

  session?.destroy();
  lastQuestionKey = "";
  lastSettings = structuredClone(settings);
  session = new GameSession(data, settings, records, (state, event) => {
    if (!session) {
      return;
    }
    if (event === "tick") {
      updateTimer(state);
      return;
    }
    if (state.phase === "results") {
      renderResults(session);
      return;
    }
    renderGame(session);
  });
  renderGame(session);
}

renderStart(DEFAULT_SETTINGS);

void loadGameData(document.baseURI)
  .then((loadedData) => {
    data = loadedData;
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

