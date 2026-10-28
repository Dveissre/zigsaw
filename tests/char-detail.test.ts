import { describe, expect, it } from "vitest";
import { renderCharDetail } from "../src/ui/char-detail";

describe("character detail markup", () => {
  it("renders visible hierarchy, highlighted quotations and stable numbers", () => {
    const html = renderCharDetail({
      char: "一",
      pronunciations: [
        {
          pinyin: "yī",
          explanations: [
            {
              content: "数目。",
              detail: [{ text: "一，惟初太始。", book: "《说文》" }],
              words: [{ word: "一定", text: "必然" }],
            },
            { content: "相同。" },
          ],
        },
      ],
    });

    expect(html).toContain('<span class="detail-number" aria-hidden="true">1</span>');
    expect(html).toContain('<span class="detail-number" aria-hidden="true">2</span>');
    expect(html).toContain('<mark class="detail-char-mark">一</mark>');
    expect(html).toContain('aria-label="古籍征引"');
    expect(html).toContain('aria-label="例词"');
    expect(html).not.toContain("<h4");
    expect(html).not.toContain("<details");
    expect(html).not.toContain("<summary");
  });
});
