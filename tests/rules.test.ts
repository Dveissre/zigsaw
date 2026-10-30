import { afterEach, describe, expect, it, vi } from "vitest";
import { GameData, type GameSettings } from "../src/game/data";
import { recordKey } from "../src/game/records";
import {
  balanceChallengeClassProbabilities,
  challengeClassProbabilities,
  GameSession,
  initialChallengeSkips,
  shuffleQuestionParts,
} from "../src/game/session";
import { splitPartsIntoRows } from "../src/ui/parts";

const challenge: GameSettings = {
  levels: [],
  partsLow: 2,
  partsHigh: 4,
  mode: "challenge",
  count: 10,
  seconds: 20,
  stageQuestions: 3,
  stageSize: 500,
  stageShift: 250,
  exEnabled: true,
  difficulty: "standard",
};

describe("record keys", () => {
  it("keeps endless parameter groups separate", () => {
    expect(
      recordKey({
        ...challenge,
        mode: "endless",
        levels: [1, 2],
        partsLow: 2,
        partsHigh: 4,
      }),
    ).toBe("endless|levels=1,2|parts=2-4|seconds=20");
  });

  it("keeps challenge parameter groups separate", () => {
    expect(recordKey(challenge)).toBe(
      "challenge|difficulty=standard|questions=3|size=500|shift=250|seconds=20|ex=1",
    );
  });
});

describe("challenge component count probabilities", () => {
  it("keeps 3 and 4 component classes dominant", () => {
    for (let stage = 1; stage <= 20; stage += 1) {
      for (let position = 1; position <= 5; position += 1) {
        const probabilities = challengeClassProbabilities(
          challenge,
          stage,
          position,
        );
        expect(probabilities.three + probabilities.four).toBeGreaterThanOrEqual(
          0.65,
        );
        expect(
          probabilities.two +
            probabilities.three +
            probabilities.four +
            probabilities.longer,
        ).toBeCloseTo(1, 10);
      }
    }
  });

  it("decays 2 component probability to its 5% floor by stage 8", () => {
    expect(challengeClassProbabilities(challenge, 1, 1).two).toBe(0.25);
    expect(challengeClassProbabilities(challenge, 8, 1).two).toBe(0.05);
    expect(challengeClassProbabilities(challenge, 20, 5).two).toBe(0.05);
  });

  it("lets 4 component words overtake 3 component words at stage 12", () => {
    const stage11 = challengeClassProbabilities(challenge, 11, 1);
    const stage12 = challengeClassProbabilities(challenge, 12, 1);

    expect(stage11.three).toBeGreaterThan(stage11.four);
    expect(stage12.four).toBeGreaterThan(stage12.three);
    expect(stage12.longer).toBeLessThanOrEqual(0.25);
  });

  it("caps sparse long-character groups without changing the 3:4 ratio", () => {
    const base = challengeClassProbabilities(challenge, 1, 1);
    const balanced = balanceChallengeClassProbabilities(
      base,
      100,
      8,
    );

    expect(balanced.longer).toBeCloseTo(0.0369032, 5);
    expect(balanced.two).toBeCloseTo(base.two, 10);
    expect(balanced.three / balanced.four).toBeCloseTo(
      base.three / base.four,
      10,
    );
    expect(balanced.three + balanced.four).toBeGreaterThan(
      base.three + base.four,
    );
    expect(
      balanced.two +
        balanced.three +
        balanced.four +
        balanced.longer,
    ).toBeCloseTo(1, 10);
  });

  it("leaves long-character probability unchanged when inventory is ample", () => {
    const base = challengeClassProbabilities(challenge, 8, 1);
    const balanced = balanceChallengeClassProbabilities(
      base,
      518,
      401,
    );

    expect(balanced).toEqual(base);
  });
});

describe("question part ordering", () => {
  it("never keeps the original order when a different order exists", () => {
    const original = ["气", "ス", "工"];
    const shuffled = shuffleQuestionParts(original, () => 0);

    expect(shuffled).not.toEqual(original);
    expect([...shuffled].sort()).toEqual([...original].sort());
  });

  it("keeps indistinguishable duplicate parts stable", () => {
    expect(shuffleQuestionParts(["一", "一"], () => 0)).toEqual(["一", "一"]);
  });
});

describe("question replacement", () => {
  const createGame = () =>
    new GameData(
      {
        symbols: {
          "1": "一",
          "2": "丨",
          "3": "丿",
          "4": "丶",
        },
        chars: {
          二: [[1, 2]],
          十: [[1, 2]],
          川: [[2, 3, 4]],
        },
      },
      {
        levels: {
          一级: ["二", "十", "川"],
          二级: [],
          三级: [],
        },
      },
      null,
      "https://example.com/",
    );
  const createSession = (
    mode: "challenge" | "normal",
  ): GameSession =>
    new GameSession(
      createGame(),
      {
        ...challenge,
        mode,
        levels: [1],
        partsLow: 2,
        partsHigh: 3,
        stageSize: 10,
        stageShift: 1,
        seconds: 20,
        stageQuestions: 1,
        count: 2,
        exEnabled: false,
      },
      { load: () => 0, save: () => undefined },
      () => undefined,
      () => 0,
    );

  it("uses one challenge skip without advancing the question", () => {
    const session = createSession("challenge");
    const before = session.state.current;

    session.skipQuestion();

    expect(session.state.index).toBe(1);
    expect(session.state.skipsRemaining).toBe(0);
    expect(session.state.current?.char).not.toBe(before?.char);
    expect(session.state.current?.symbolIds).toHaveLength(
      before?.symbolIds.length ?? 0,
    );
    session.destroy();
  });

  it("keeps practice skips unlimited and non-advancing", () => {
    const session = createSession("normal");
    const before = session.state.current;

    session.skipQuestion();

    expect(session.state.index).toBe(1);
    expect(session.state.skipsRemaining).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(session.state.current?.char).not.toBe(before?.char);
    session.destroy();
  });

  it("continues after surrender in practice mode", () => {
    const session = createSession("normal");

    session.surrender();

    expect(session.state.advanceLabel).toBe("继续");
    expect(session.state.pendingSettlement).toBe(false);
    session.advance();
    expect(session.state.index).toBe(2);
    expect(session.state.phase).toBe("playing");
    session.destroy();
  });
});

describe("challenge skip rewards", () => {
  it("uses the requested initial skip counts", () => {
    expect(initialChallengeSkips("beginner")).toBe(1);
    expect(initialChallengeSkips("standard")).toBe(1);
    expect(initialChallengeSkips("expert")).toBe(0);
  });

  it("awards a beginner skip when a stage is cleared", () => {
    const game = new GameData(
      {
        symbols: { "1": "一", "2": "丨", "3": "丿" },
        chars: { 二: [[1, 2]], 十: [[1, 2]], 川: [[1, 2, 3]] },
      },
      {
        levels: {
          一级: ["二", "十", "川"],
          二级: [],
          三级: [],
        },
      },
      null,
      "https://example.com/",
    );
    const session = new GameSession(
      game,
      {
        ...challenge,
        levels: [1],
        difficulty: "beginner",
        stageQuestions: 1,
        stageSize: 10,
        stageShift: 1,
        count: 2,
        exEnabled: false,
      },
      { load: () => 0, save: () => undefined },
      () => undefined,
      () => 0,
    );

    const answer = session.state.current?.char;
    expect(answer).toBeTruthy();
    session.setDraft(answer ?? "");
    session.submit();

    expect(session.state.skipsRemaining).toBe(2);
    session.destroy();
  });
});

describe("question timing", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("averages active play time and excludes pauses", () => {
    vi.useFakeTimers();
    const game = new GameData(
      {
        symbols: { "1": "一", "2": "丨" },
        chars: { "二": [[1, 2]] },
      },
      {
        levels: {
          一级: ["二"],
          二级: [],
          三级: [],
        },
      },
      null,
      "https://example.com/",
    );
    const session = new GameSession(
      game,
      {
        ...challenge,
        mode: "normal",
        levels: [1],
        partsLow: 2,
        partsHigh: 2,
        count: 2,
        seconds: 20,
      },
      { load: () => 0, save: () => undefined },
      () => undefined,
    );

    vi.advanceTimersByTime(2000);
    session.setDraft("二");
    session.submit();
    vi.advanceTimersByTime(900);

    vi.advanceTimersByTime(1000);
    session.togglePause();
    vi.advanceTimersByTime(5000);
    session.togglePause();
    vi.advanceTimersByTime(1000);
    session.setDraft("二");
    session.submit();
    vi.advanceTimersByTime(900);

    expect(session.state.phase).toBe("results");
    expect(session.state.result?.averageQuestionSeconds).toBeCloseTo(
      2,
      1,
    );
    session.destroy();
  });
});

describe("multi-row part layout", () => {
  it("uses the requested 6, 7 and 8 part rows", () => {
    expect(splitPartsIntoRows(Array.from({ length: 6 }, (_, index) => index)).map(
      (row) => row.length,
    )).toEqual([3, 3]);
    expect(splitPartsIntoRows(Array.from({ length: 7 }, (_, index) => index)).map(
      (row) => row.length,
    )).toEqual([4, 3]);
    expect(splitPartsIntoRows(Array.from({ length: 8 }, (_, index) => index)).map(
      (row) => row.length,
    )).toEqual([4, 4]);
  });
});

