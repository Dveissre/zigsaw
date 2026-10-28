export const ATLAS_TRIGGER_MARKUP = `
  <button
    class="corner-icon-button"
    type="button"
    data-atlas-trigger
    aria-haspopup="dialog"
    aria-controls="atlas-dialog"
    aria-label="图鉴"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.5 3.5h11v17h-11z"></path>
      <path d="M9 3.5v17"></path>
      <path d="M11.5 3.5v6l1.5-1 1.5 1v-6"></path>
    </svg>
  </button>
`;

export function createAtlasDialog(): HTMLDialogElement {
  const existing =
    document.querySelector<HTMLDialogElement>("#atlas-dialog");
  if (existing) {
    return existing;
  }

  document.body.insertAdjacentHTML(
    "beforeend",
    `
      <dialog
        id="atlas-dialog"
        class="atlas-dialog"
        aria-labelledby="atlas-title"
      >
        <article class="atlas-panel">
          <header class="atlas-header">
            <div>
              <div class="tutorial-kicker">COMPONENT INDEX</div>
              <h2 id="atlas-title">图鉴</h2>
            </div>
            <button
              class="char-detail-close atlas-close"
              type="button"
              data-atlas-close
              aria-label="关闭"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 4 20 20M20 4 4 20"></path>
              </svg>
            </button>
          </header>
          <div class="atlas-placeholder">施工中</div>
        </article>
      </dialog>
    `,
  );

  const dialog =
    document.querySelector<HTMLDialogElement>("#atlas-dialog")!;
  dialog
    .querySelector<HTMLButtonElement>("[data-atlas-close]")
    ?.addEventListener("click", () => dialog.close());
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
      dialog.close();
    }
  });

  return dialog;
}
