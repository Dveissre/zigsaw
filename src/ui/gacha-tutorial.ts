import { crisIconMarkup } from "./cris";

export const GACHA_TUTORIAL_TRIGGER_MARKUP = `
  <button
    class="corner-icon-button"
    type="button"
    data-gacha-tutorial-trigger
    aria-haspopup="dialog"
    aria-controls="gacha-tutorial-dialog"
    aria-label="写字台玩法"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9"></circle>
      <path d="M9.4 9.1a2.8 2.8 0 1 1 4.5 2.2c-.9.7-1.9 1.2-1.9 2.7"></path>
      <path d="M12 17.3h.01"></path>
    </svg>
  </button>
`;

export function createGachaTutorialDialog(): HTMLDialogElement {
  const existing =
    document.querySelector<HTMLDialogElement>("#gacha-tutorial-dialog");
  if (existing) {
    return existing;
  }

  document.body.insertAdjacentHTML(
    "beforeend",
    `
      <dialog
        id="gacha-tutorial-dialog"
        class="tutorial-dialog"
        aria-labelledby="gacha-tutorial-title"
      >
        <article class="tutorial-panel">
          <header class="tutorial-header">
            <div>
              <div class="tutorial-kicker">HOW TO PLAY</div>
              <h2 id="gacha-tutorial-title">写字台</h2>
            </div>
            <button
              class="char-detail-close tutorial-close"
              type="button"
              data-gacha-tutorial-close
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
                <h3>抽卡</h3>
              </header>
              <div class="gacha-tutorial-draw" aria-hidden="true">
                <div class="gacha-tutorial-price">
                  <span class="tutorial-cris-mark">${crisIconMarkup()}</span>
                  <strong>100</strong>
                </div>
                <span class="gacha-tutorial-equals"><i></i><i></i></span>
                <div class="gacha-tutorial-deck">
                  <span class="gacha-tutorial-back">${crisIconMarkup()}</span>
                  <span class="gacha-tutorial-back">${crisIconMarkup()}</span>
                  <span class="gacha-tutorial-back">${crisIconMarkup()}</span>
                </div>
              </div>
              <p class="tutorial-copy">
                欢迎来到写字台！消耗 <span class="tutorial-inline-cris">${crisIconMarkup()}<b>100</b></span> 以抽取部件卡片。
              </p>
              <p class="tutorial-copy">
                补充您的图鉴，或者获得普通游玩时无法获得的部件！
              </p>
            </section>

            <section class="tutorial-section">
              <header class="tutorial-section-heading">
                <span>02</span>
                <h3>组字</h3>
              </header>
              <div class="tutorial-basic-demo gacha-tutorial-compose" aria-hidden="true">
                <div class="tutorial-parts">
                  <span class="tutorial-part gacha-tutorial-part rarity-sr">亥</span>
                  <span class="tutorial-part gacha-tutorial-part rarity-n">木</span>
                  <span class="tutorial-part gacha-tutorial-part rarity-r">马</span>
                </div>
                <svg class="tutorial-demo-arrow" viewBox="0 0 28 20" aria-hidden="true">
                  <path d="M2 10h22M17 4l7 6-7 6"></path>
                </svg>
                <span class="tutorial-answer-box">骇</span>
              </div>
              <p class="tutorial-copy">
                挑选抽取到的部件卡片组成汉字，才能获得该卡片。
              </p>
              <p class="tutorial-copy">
                部件被拿取后，无法再参与组字。
              </p>
              <p class="tutorial-disclaimer">
                可提交独体字
              </p>
            </section>

            <section class="tutorial-section">
              <header class="tutorial-section-heading">
                <span>03</span>
                <h3>结算</h3>
              </header>
              <div class="gacha-tutorial-settle" aria-hidden="true">
                <div class="gacha-tutorial-full-cards">
                  <span class="gacha-card rarity-sr">
                    <span class="gacha-card-face gacha-card-front rarity-sr">
                      <span class="gacha-card-rarity">SR</span>
                      <span class="gacha-card-content"><span class="gacha-card-glyph">亥</span></span>
                    </span>
                    <span class="gacha-new">NEW!</span>
                  </span>
                  <span class="gacha-card rarity-r">
                    <span class="gacha-card-face gacha-card-front rarity-r">
                      <span class="gacha-card-rarity">R</span>
                      <span class="gacha-card-content"><span class="gacha-card-glyph">马</span></span>
                    </span>
                    <span class="gacha-new">NEW!</span>
                  </span>
                  <span class="gacha-card rarity-n">
                    <span class="gacha-card-face gacha-card-front">
                      <span class="gacha-card-rarity">N</span>
                      <span class="gacha-card-content"><span class="gacha-card-glyph">木</span></span>
                    </span>
                  </span>
                  <span class="gacha-card rarity-n">
                    <span class="gacha-card-face gacha-card-front">
                      <span class="gacha-card-rarity">N</span>
                      <span class="gacha-card-content"><span class="gacha-card-glyph">日</span></span>
                    </span>
                  </span>
                </div>
                <div class="gacha-word-list">
                  <div class="gacha-word-card is-level-1">
                    <strong>骇</strong>
                    <small>一级 1764</small>
                  </div>
                  <div class="gacha-word-card is-level-2">
                    <strong>杳</strong>
                    <small>二级 3877</small>
                  </div>
                </div>
              </div>
              <p class="tutorial-copy">
                无法继续组字或手动结算时结束。
              </p>
              <p class="tutorial-copy">
                获得的部件卡片与组成的汉字将收录入图鉴。
              </p>
            </section>

            <div class="tutorial-return-row">
              <button type="button" data-gacha-tutorial-return>返回</button>
            </div>
            <p class="tutorial-credits">Created by <em>fukurei</em></p>
          </div>
        </article>
      </dialog>
    `,
  );

  const dialog =
    document.querySelector<HTMLDialogElement>("#gacha-tutorial-dialog")!;
  let closing = false;
  let closeTimer: number | null = null;

  const requestClose = (): void => {
    if (!dialog.open || closing) {
      return;
    }
    closing = true;
    dialog.classList.add("is-closing");
    closeTimer = window.setTimeout(() => {
      dialog.close();
    }, 180);
  };

  dialog
    .querySelector<HTMLButtonElement>("[data-gacha-tutorial-close]")
    ?.addEventListener("click", requestClose);
  dialog
    .querySelector<HTMLButtonElement>("[data-gacha-tutorial-return]")
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
  });
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) {
      return;
    }
    requestClose();
  });

  return dialog;
}
