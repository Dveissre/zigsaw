import { describe, expect, it } from "vitest";
import {
  buildChallengeShareText,
  buildTrialShareText,
  challengeResultEmoji,
  challengeStageEmoji,
  challengeTimeEmoji,
  trialCompletionEmoji,
  trialQuestionEmoji,
  trialResultEmoji,
  trialShareHistory,
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

  it("includes the selected difficulty in the share heading", () => {
    const text = buildChallengeShareText({
      correctCount: 96,
      stage: "20",
      isEx: false,
      difficulty: "expert",
      averageQuestionSeconds: 10.5,
      history: [{ ok: true, isEx: false, level: 2 }],
    });
    const lines = text.split("\n");

    expect(lines[0]).toBe("◈ ZIGSAW - 挑战 - 专家");
    expect(lines[1]).toBe("🏔️ 96 题﹫阶段 20");
    expect(lines[2]).toBe("💫 平均用时 10.5s");
  });

  it("shows every result for runs up to twenty questions", () => {
    const text = buildChallengeShareText({
      correctCount: 3,
      stage: "2",
      isEx: false,
      difficulty: "beginner",
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
        "◈ ZIGSAW - 挑战 - 入门",
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
      difficulty: "expert",
      averageQuestionSeconds: 12,
      history,
    });

    expect(text.split("\n")[3]).toBe(
      `▫️◽${"⬜".repeat(15)}${"🟥".repeat(5)}`,
    );
    expect(text).toContain("◈ ZIGSAW - 挑战 - 专家");
    expect(text).toContain("🌌 20 题﹫阶段 EX");
    expect(text).toContain("💫 平均用时 12.0s");
  });
});

describe("trial sharing", () => {
  it("maps trial result titles and completion bands", () => {
    expect(trialResultEmoji("覆鹿遗蕉")).toBe("🌫️");
    expect(trialResultEmoji("临歧何反")).toBe("🏕️");
    expect(trialResultEmoji("雾径得津")).toBe("🌄");
    expect(trialResultEmoji("知我梦中")).toBe("🌌");
    expect(trialCompletionEmoji(1)).toBe("🔸");
    expect(trialCompletionEmoji(4)).toBe("🔹");
    expect(trialCompletionEmoji(7)).toBe("🔷");
  });

  it("maps trial result colors and BOSS overrides normal levels", () => {
    expect(
      trialQuestionEmoji({
        ok: true,
        kind: "normal",
        stage: 1,
        level: 1,
      }),
    ).toBe("⬜");
    expect(
      trialQuestionEmoji({
        ok: true,
        kind: "normal",
        stage: 1,
        level: 2,
      }),
    ).toBe("🟩");
    expect(
      trialQuestionEmoji({
        ok: true,
        kind: "boss",
        stage: 1,
        level: 1,
      }),
    ).toBe("🟪");
    expect(
      trialQuestionEmoji({
        ok: false,
        kind: "boss",
        stage: 1,
        level: 1,
      }),
    ).toBe("🟥");
  });

  it("shows all of stage one but only the final two stages later", () => {
    const history = [
      { ok: true, kind: "normal" as const, stage: 1, level: 1 as const },
      { ok: true, kind: "normal" as const, stage: 2, level: 2 as const },
      { ok: true, kind: "boss" as const, stage: 2 },
    ];
    expect(trialShareHistory(history, 1)).toEqual([history[0]]);
    expect(trialShareHistory(history, 2)).toEqual(history);
  });

  it("builds the requested trial share layout", () => {
    const text = buildTrialShareText({
      difficulty: 1,
      title: "临歧何反",
      correctCount: 10,
      reachedStage: 2,
      stageName: "第二幕",
      ruleName: "短视",
      history: [
        { ok: true, kind: "normal", stage: 1, level: 1 },
        { ok: true, kind: "normal", stage: 2, level: 2 },
        { ok: true, kind: "boss", stage: 2 },
        { ok: false, kind: "normal", stage: 2, level: 1 },
      ],
    });
    expect(text).toBe(
      [
        "◈ ZIGSAW - 试炼 - 难度 1",
        "🏕️ 临歧何反",
        "🔸 10 题﹫第二幕「短视」",
        "⬜🟩🟪🟥",
        "",
        "https://dveissre.github.io/zigsaw/",
      ].join("\n"),
    );
  });
});
