import type {
  CharDetail,
  CharDetailExplanation,
  CharDetailQuote,
  CharDetailStore,
  CharDetailWord,
  SchoolMetadata,
} from "../game/details";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function text(value: string | undefined): string {
  return escapeHtml(value?.trim() ?? "");
}

function renderNote(label: string, value: string | undefined): string {
  const clean = value?.trim();
  return clean
    ? `<span class="detail-note"><b>${escapeHtml(label)}</b>${text(clean)}</span>`
    : "";
}

function highlightedChar(value: string, char: string): string {
  const clean = value.trim();
  if (!clean || !char) {
    return text(clean);
  }
  return clean
    .split(char)
    .map((part) => text(part))
    .join(`<mark class="detail-char-mark">${text(char)}</mark>`);
}

function renderQuotes(
  quotes: CharDetailQuote[] | undefined,
  char: string,
): string {
  if (!quotes?.length) {
    return "";
  }
  return `
    <section class="detail-sources" aria-label="古籍征引">
      <div class="detail-source-list">
        ${quotes
          .map(
            (quote) => `
              <blockquote>
                <span>${highlightedChar(quote.text, char)}</span>
                ${quote.book ? `<cite>${text(quote.book)}</cite>` : ""}
              </blockquote>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderWords(words: CharDetailWord[] | undefined): string {
  if (!words?.length) {
    return "";
  }
  return `
    <section class="detail-words" aria-label="例词">
      <dl>
        ${words
          .map(
            (word) => `
              <div>
                <dt>${text(word.word)}</dt>
                ${
                  word.text
                    ? `<dd>${text(word.text)}</dd>`
                    : ""
                }
              </div>
            `,
          )
          .join("")}
      </dl>
    </section>
  `;
}

function renderExplanation(
  explanation: CharDetailExplanation,
  char: string,
  index: number,
): string {
  const notes = [
    renderNote("同", explanation.same),
    renderNote("古同", explanation.modern),
    renderNote("简体", explanation.simplified),
    renderNote("异体", explanation.variant),
    renderNote("又读", explanation.pinyin),
    renderNote("相关", explanation.refer),
    renderNote("误作", explanation.typo),
    renderNote("例", explanation.example),
  ]
    .filter(Boolean)
    .join("");
  const speech = explanation.speech?.trim()
    ? `<span class="detail-speech">${text(explanation.speech)}</span>`
    : "";
  const unknown = explanation.unknown
    ? `<span class="detail-note"><b>标注</b>存疑</span>`
    : "";

  return `
    <li class="detail-explanation">
      <span class="detail-number" aria-hidden="true">${index + 1}</span>
      <div class="detail-body">
        <div class="detail-explanation-main">
          ${speech}
          ${explanation.content ? `<p>${text(explanation.content)}</p>` : ""}
        </div>
        ${
          notes || unknown
            ? `<div class="detail-notes">${notes}${unknown}</div>`
            : ""
        }
        ${renderQuotes(explanation.detail, char)}
        ${renderWords(explanation.words)}
      </div>
    </li>
  `;
}

export function renderCharDetail(detail: CharDetail): string {
  if (!detail.pronunciations.length) {
    return `<div class="char-detail-state">释义暂未收录</div>`;
  }

  return `
    <div class="detail-pronunciations">
      ${detail.pronunciations
        .map(
          (pronunciation) => `
            <section class="detail-pronunciation">
              <h3>${text(pronunciation.pinyin)}</h3>
              <ol>
                ${pronunciation.explanations
                  .map((explanation, index) =>
                    renderExplanation(explanation, detail.char, index),
                  )
                  .join("")}
              </ol>
            </section>
          `,
        )
        .join("")}
    </div>
  `;
}

function schoolLabel(school: SchoolMetadata | null): string {
  if (!school) {
    return "";
  }
  const labels: string[] = [];
  if (school.read?.length) {
    labels.push(`识字表 ${school.read.join("、")}`);
  }
  if (school.write?.length) {
    labels.push(`写字表 ${school.write.join("、")}`);
  }
  return labels.join("\u00a0\u00a0/\u00a0\u00a0");
}

export class CharDetailView {
  private readonly dialog: HTMLDialogElement;
  private readonly charElement: HTMLElement;
  private readonly metaElement: HTMLElement;
  private readonly readingsElement: HTMLElement;
  private readonly unicodeElement: HTMLElement;
  private readonly schoolRow: HTMLElement;
  private readonly schoolElement: HTMLElement;
  private readonly splitElement: HTMLElement;
  private readonly contentElement: HTMLElement;
  private requestId = 0;

  constructor(
    dialog: HTMLDialogElement,
    private readonly store: CharDetailStore,
    private readonly decompositionFor: (char: string) => string,
  ) {
    this.dialog = dialog;
    this.charElement = dialog.querySelector<HTMLElement>("[data-detail-char]")!;
    this.metaElement = dialog.querySelector<HTMLElement>("[data-detail-meta]")!;
    this.readingsElement =
      dialog.querySelector<HTMLElement>("[data-detail-readings]")!;
    this.unicodeElement =
      dialog.querySelector<HTMLElement>("[data-detail-unicode]")!;
    this.schoolRow =
      dialog.querySelector<HTMLElement>("[data-detail-school-row]")!;
    this.schoolElement =
      dialog.querySelector<HTMLElement>("[data-detail-school]")!;
    this.splitElement =
      dialog.querySelector<HTMLElement>("[data-detail-split]")!;
    this.contentElement =
      dialog.querySelector<HTMLElement>("[data-detail-content]")!;

    dialog
      .querySelector<HTMLButtonElement>("[data-detail-close]")
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
    dialog.addEventListener("close", () => {
      this.requestId += 1;
      dialog.removeAttribute("data-detail-error");
    });
  }

  open(char: string, meta: string): void {
    const requestId = ++this.requestId;
    const codePoint = char.codePointAt(0);
    this.charElement.textContent = char;
    this.metaElement.textContent = meta;
    this.readingsElement.textContent = "载入中";
    this.unicodeElement.textContent =
      codePoint === undefined
        ? "—"
        : `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
    this.schoolRow.hidden = true;
    this.schoolElement.textContent = "";
    this.splitElement.textContent = this.decompositionFor(char) || "—";
    this.contentElement.innerHTML =
      '<div class="char-detail-state" role="status">正在载入释义</div>';
    this.dialog.removeAttribute("data-detail-error");
    this.contentElement.scrollTop = 0;
    if (!this.dialog.open) {
      this.dialog.showModal();
    }

    void Promise.all([
      this.store.get(char),
      this.store.school(char).catch(() => null),
    ])
      .then(([detail, school]) => {
        if (requestId !== this.requestId || !this.dialog.open) {
          return;
        }
        const readings = [
          ...new Set(
            detail?.pronunciations
              .map((pronunciation) => pronunciation.pinyin.trim())
              .filter(Boolean) ?? [],
          ),
        ];
        this.readingsElement.textContent = readings.length
          ? readings.join(" / ")
          : "—";
        const schoolText = schoolLabel(school);
        this.schoolRow.hidden = !schoolText;
        this.schoolElement.textContent = schoolText;
        this.contentElement.innerHTML = detail
          ? renderCharDetail(detail)
          : '<div class="char-detail-state">释义暂未收录</div>';
        this.contentElement.scrollTop = 0;
      })
      .catch(() => {
        if (requestId !== this.requestId || !this.dialog.open) {
          return;
        }
        this.dialog.dataset.detailError = "true";
        this.readingsElement.textContent = "—";
        this.schoolRow.hidden = true;
        this.contentElement.innerHTML =
          '<div class="char-detail-state">释义读取失败</div>';
      });
  }
}
