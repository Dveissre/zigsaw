import { describe, expect, it } from "vitest";
import {
  buildChallengeShareText,
  challengeResultEmoji,
  challengeStageEmoji,
  challengeTimeEmoji,
} from "../src/game/share";

describe("challenge sharing", () => {
  it("maps levels and failures to the established result palette", () => {
    expect(challengeResultEmoji({ ok: true, isEx: false, level: 1 })).toBe(
      "⬜",
    );
    expect(challengeResultEmoji({ ok: true, isEx: false, level: 2 })).toBe(
      "🟩",
    );
    expect(challengeResultEmoji({ ok: true, isEx: false, level: 3 })).toBe(
      "🟦",
    );
    expect(challengeResultEmoji({ ok: true, isEx: true })).toBe("🟪");
    expect(challengeResultEmoji({ ok: false, isEx: false, level: 1 })).toBe(
      "🟥",
    );
  });

  it("uses a small stage emoji set and a dedicated EX symbol", () => {
    expect(challengeStageEmoji(1, false)).toBe("🌱");
    expect(challengeStageEmoji(6, false)).toBe("🔥");
    expect(challengeStageEmoji(12, false)).toBe("🏔️");
    expect(challengeStageEmoji(25, true)).toBe("🌌");
  });

  it("uses four average-time grades with the slowest clock last", () => {
    expect(challengeTimeEmoji(5.9)).toBe("⚡");
    expect(challengeTimeEmoji(6)).toBe("💫");
    expect(challengeTimeEmoji(15)).toBe("🕒");
    expect(challengeTimeEmoji(25)).toBe("⏳");
  });

  it("shows every result for runs up to twenty questions", () => {
    const text = buildChallengeShareText({
      correctCount: 3,
      stage: "2",
      isEx: false,
      averageQuestionSeconds: 4.26,
      history: [
        { ok: true, isEx: false, level: 1 },
        { ok: true, isEx: false, level: 2 },
        { ok: true, isEx: false, level: 3 },
        { ok: false, isEx: false, level: 1 },
      ],
    });

    expect(text).toBe(
      [
        "ZIGSAW - 挑战模式",
        "🌱 3 题﹫阶段 2",
        "⚡ 平均用时 4.3s",
        "⬜🟩🟦🟥",
        "",
        "https://dveissre.github.io/zigsaw/",
      ].join("\n"),
    );
  });

  it("keeps only the last twenty results for longer runs", () => {
    const history = [
      ...Array.from({ length: 5 }, () => ({
        ok: true,
        isEx: false,
        level: 2 as const,
      })),
      ...Array.from({ length: 15 }, () => ({
        ok: true,
        isEx: false,
        level: 1 as const,
      })),
      ...Array.from({ length: 5 }, () => ({
        ok: false,
        isEx: false,
        level: 1 as const,
      })),
    ];
    const text = buildChallengeShareText({
      correctCount: 20,
      stage: "EX",
      isEx: true,
      averageQuestionSeconds: 12,
      history,
    });

    expect(text.split("\n")[3]).toBe(
      `▫️◽${"⬜".repeat(15)}${"🟥".repeat(5)}`,
    );
    expect(text).toContain("🌌 20 题﹫阶段 EX");
    expect(text).toContain("💫 平均用时 12.0s");
  });
});
