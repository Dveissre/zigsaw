import { describe, expect, it } from "vitest";
import type { GameSettings } from "../src/game/data";
import { recordKey } from "../src/game/records";
import {
  balanceChallengeClassProbabilities,
  challengeClassProbabilities,
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
      "challenge|questions=3|size=500|shift=250|seconds=20|ex=1",
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

