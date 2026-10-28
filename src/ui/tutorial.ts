export const TUTORIAL_TRIGGER_MARKUP = `
  <button
    class="corner-icon-button"
    type="button"
    data-tutorial-trigger
    aria-haspopup="dialog"
    aria-controls="tutorial-dialog"
    aria-label="游玩方法"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9"></circle>
      <path d="M9.4 9.1a2.8 2.8 0 1 1 4.5 2.2c-.9.7-1.9 1.2-1.9 2.7"></path>
      <path d="M12 17.3h.01"></path>
    </svg>
  </button>
`;

export function createTutorialDialog(): HTMLDialogElement {
  const existing =
    document.querySelector<HTMLDialogElement>("#tutorial-dialog");
  if (existing) {
    return existing;
  }

  document.body.insertAdjacentHTML(
    "beforeend",
    `
      <dialog
        id="tutorial-dialog"
        class="tutorial-dialog"
        aria-labelledby="tutorial-title"
      >
        <article class="tutorial-panel">
          <header class="tutorial-header">
            <div>
              <div class="tutorial-kicker">HOW TO PLAY</div>
              <h2 id="tutorial-title">
                <button
                  class="tutorial-title-button"
                  type="button"
                  data-tutorial-title
                  aria-label="游玩方法"
                >
                  <span class="tutorial-title-sweep" aria-hidden="true"></span>
                  <span class="tutorial-title-base">
                    <span class="tutorial-title-label">游玩方法</span>
                    <span class="tutorial-title-dye" aria-hidden="true">游玩方法</span>
                  </span>
                  <span class="tutorial-title-reveal" aria-hidden="true">
                    <small>BY</small>
                    <span>背面８回宙返り</span>
                  </span>
                </button>
              </h2>
            </div>
            <button
              class="char-detail-close tutorial-close"
              type="button"
              data-tutorial-close
              aria-label="关闭"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 4 20 20M20 4 4 20"></path>
              </svg>
            </button>
          </header>

          <div class="tutorial-content">
            <section class="tutorial-section">
              <header class="tutorial-section-heading">
                <span>01</span>
                <h3>基本玩法</h3>
              </header>
              <div class="tutorial-basic-demo">
                <div class="tutorial-demo-block">
                  <div class="tutorial-parts" aria-label="打乱后的部件">
                    <span class="tutorial-part">寸</span>
                    <span class="tutorial-part">木</span>
                    <span class="tutorial-part">又</span>
                  </div>
                </div>
                <svg class="tutorial-demo-arrow" viewBox="0 0 28 20" aria-hidden="true">
                  <path d="M2 10h22M17 3l7 7-7 7"></path>
                </svg>
                <div class="tutorial-demo-block">
                  <div class="tutorial-answer-row">
                    <span class="tutorial-answer-box">树</span>
                    <span class="tutorial-submit-demo">提交</span>
                  </div>
                </div>
              </div>
              <p class="tutorial-copy">
                在倒计时耗尽前，将部件重组成正确的汉字！
              </p>
              <p class="tutorial-copy">
                有些部件的不同形态会归于一类，如
                <span class="tutorial-inline-token">西</span>
                <span class="tutorial-inline-token">覀</span>
                <span class="tutorial-inline-token">襾</span>
                都显示为
                <span class="tutorial-inline-token">西</span>。
              </p>
              <p class="tutorial-disclaimer">
                部件的归类与拆分方式包含大量主观意见，如有错讹请联系作者
              </p>
            </section>

            <section class="tutorial-section">
              <header class="tutorial-section-heading">
                <span>02</span>
                <h3>挑战模式</h3>
              </header>
              <div class="tutorial-stage-track" aria-label="挑战模式阶段推进">
                <div class="tutorial-stage-card">
                  <span>阶段 1</span>
                  <small>#0001-1500</small>
                </div>
                <span class="tutorial-stage-line" aria-hidden="true"></span>
                <div class="tutorial-stage-card">
                  <span>阶段 2</span>
                  <small>#0301-1800</small>
                </div>
                <span class="tutorial-stage-gap" aria-hidden="true">
                  <i></i><i></i><i></i>
                </span>
                <span class="tutorial-stage-line" aria-hidden="true"></span>
                <div class="tutorial-stage-card is-ex">
                  <span>EX</span>
                  <small>#????</small>
                </div>
              </div>
              <p class="tutorial-copy">
                在渐进的难度曲线下一路向前突进！
              </p>
              <p class="tutorial-copy">
                每个阶段共5题，各阶段所取的通规字表区间会逐步后移。
              </p>
              <p class="tutorial-copy">
                到达字表末端后，将进入<strong class="tutorial-ex-name">阶段EX</strong>……会有什么呢？
              </p>
              <p class="tutorial-disclaimer">阶段EX可在设置页关闭</p>
            </section>

            <section class="tutorial-section">
              <header class="tutorial-section-heading">
                <span>03</span>
                <h3>自由 / 无尽模式</h3>
              </header>
              <div class="tutorial-mode-pair">
                <div class="tutorial-mode-card">
                  <div class="tutorial-mode-name">自由</div>
                  <div class="tutorial-progress-track">
                    <span style="width: 70%"></span>
                  </div>
                  <div class="tutorial-mode-value">7 / 10</div>
                </div>
                <div class="tutorial-mode-card">
                  <div class="tutorial-mode-name">无尽</div>
                  <div class="tutorial-progress-track is-endless">
                    <span></span>
                  </div>
                  <div class="tutorial-mode-value">∞</div>
                </div>
              </div>
              <p class="tutorial-copy">
                有更多可调整设置，适合对全字表进行练习。
              </p>
              <p class="tutorial-copy">
                但是超时仍然会结束游戏，尽可能多地答对吧！
              </p>
            </section>
            <div class="tutorial-return-row">
              <button type="button" data-tutorial-return>返回</button>
            </div>
            <p class="tutorial-credits">Created by <em>fukurei</em></p>
          </div>
        </article>
      </dialog>
    `,
  );

  const dialog =
    document.querySelector<HTMLDialogElement>("#tutorial-dialog")!;
  const titleButton =
    dialog.querySelector<HTMLButtonElement>("[data-tutorial-title]");
  const titleLabel =
    dialog.querySelector<HTMLElement>(".tutorial-title-label");
  let titleStage = 0;
  let reenterShouldSweep = false;
  let closing = false;
  let closeTimer: number | null = null;

  const resetTitle = () => {
    titleStage = 0;
    reenterShouldSweep = false;
    titleButton?.classList.remove(
      "is-easter-egg-active",
      "is-sweep-active",
    );
  };

  const requestClose = () => {
    if (!dialog.open || closing) {
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      dialog.close();
      return;
    }

    closing = true;
    dialog.classList.add("is-closing");
    closeTimer = window.setTimeout(() => {
      closeTimer = null;
      dialog.close();
    }, 180);
  };

  titleButton?.addEventListener("click", () => {
    if (titleStage === 0) {
      titleStage = 1;
      reenterShouldSweep = false;
      titleButton.classList.add("is-easter-egg-active");
      if (
        titleLabel &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        const animation = titleLabel.animate(
          [
            { clipPath: "inset(0 0 0 0)" },
            { clipPath: "inset(0 0 0 100%)" },
          ],
          {
            duration: 680,
            easing: "cubic-bezier(0.2, 0.7, 0.25, 1)",
            fill: "both",
          },
        );
        void animation.finished.then(
          () => animation.cancel(),
          () => undefined,
        );
      }
      return;
    }
    if (titleStage === 1) {
      titleStage = 2;
      reenterShouldSweep = false;
      titleButton.classList.add("is-sweep-active");
      return;
    }
    resetTitle();
    window.open(
      "https://www.bilibili.com/video/BV1WqQVY2Euv/",
      "_blank",
      "noopener,noreferrer",
    );
  });
  titleButton?.addEventListener("pointerleave", (event) => {
    if (titleStage === 0 || event.pointerType !== "mouse") {
      return;
    }
    reenterShouldSweep = true;
    if (titleStage === 2) {
      titleStage = 1;
      titleButton.classList.remove("is-sweep-active");
    }
  });
  titleButton?.addEventListener("pointerenter", (event) => {
    if (
      event.pointerType !== "mouse" ||
      titleStage !== 1 ||
      !reenterShouldSweep
    ) {
      return;
    }
    titleStage = 2;
    reenterShouldSweep = false;
    titleButton.classList.add("is-sweep-active");
  });
  dialog
    .querySelector<HTMLButtonElement>("[data-tutorial-close]")
    ?.addEventListener("click", requestClose);
  dialog
    .querySelector<HTMLButtonElement>("[data-tutorial-return]")
    ?.addEventListener("click", requestClose);
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    requestClose();
  });
  dialog.addEventListener("close", () => {
    if (closeTimer !== null) {
      window.clearTimeout(closeTimer);
      closeTimer = null;
    }
    closing = false;
    dialog.classList.remove("is-closing");
    resetTitle();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) {
      return;
    }
    const box = dialog.getBoundingClientRect();
    const outsideOfPanel =
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom;
    if (outsideOfPanel) {
      requestClose();
    }
  });

  return dialog;
}
