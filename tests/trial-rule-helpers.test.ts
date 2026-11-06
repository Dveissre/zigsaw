import { describe, expect, it } from "vitest";
import trialRulesJson from "../public/data/trial-rules.json";
import {
  chooseTrialStageRuleIds,
  trialRuleAnswerInput,
  trialRulePromptMode,
  sortTrialRulesByStars,
  trialRuleUsesPrompt,
  trialRuleUsesWordAnswer,
  type TrialRulesData,
} from "../src/game/trial-rules";

const rules =
  trialRulesJson as unknown as TrialRulesData;

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(
      result ^ (result >>> 15),
      result | 1,
    );
    result ^=
      result +
      Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

describe("trial rule helpers", () => {
  it("derives answer and prompt behavior from policy data", () => {
    expect(
      trialRuleAnswerInput(
        rules.rules.composition,
        "normal",
      ),
    ).toBe("word");
    expect(
      trialRuleUsesWordAnswer(rules.rules.composition),
    ).toBe(true);
    expect(
      trialRuleUsesWordAnswer(rules.rules.tetrarchy),
    ).toBe(false);
    expect(
      trialRulePromptMode(
        rules.rules.repetend,
        "normal",
      ),
    ).toBe("repetend-components");
    expect(
      trialRuleUsesPrompt(
        rules.rules.dissonance,
        "dissonance-components",
      ),
    ).toBe(true);
    expect(
      trialRuleUsesPrompt(
        rules.rules.abscission,
        "traditional-components",
      ),
    ).toBe(true);
  });

  it("returns nullable behavior for absent rules", () => {
    expect(trialRuleAnswerInput(null, "normal")).toBeNull();
    expect(trialRulePromptMode(undefined, "boss")).toBeNull();
    expect(trialRuleUsesWordAnswer(null)).toBe(false);
    expect(
      trialRuleUsesPrompt(null, "word-components"),
    ).toBe(false);
  });

  it("sorts debug rule choices from low to high stars", () => {
    const sorted = sortTrialRulesByStars(
      Object.values(rules.rules),
    );
    expect(sorted).toHaveLength(32);
    expect(
      sorted.every(
        (item, index) =>
          index === 0 ||
          item.stars >= sorted[index - 1].stars,
      ),
    ).toBe(true);
  });

  it("draws a unique rule sequence matching each stage's star pool", () => {
    const ids = chooseTrialStageRuleIds(
      rules,
      seededRandom(20261107),
    );
    expect(ids).toHaveLength(7);
    expect(new Set(ids).size).toBe(7);
    expect(
      ids.map((id) => rules.rules[id].stars),
    ).toEqual(
      expect.arrayContaining([0, 1, 1, 2, 2, 3]),
    );
    expect(
      ids.map((id, index) => ({
        actual: rules.rules[id].stars,
        allowed: rules.stageStars[index],
      })).every(({ actual, allowed }) =>
        allowed.includes(actual),
      ),
    ).toBe(true);
    expect(
      ["2", "3"].includes(
        String(rules.rules[ids[5]].stars),
      ),
    ).toBe(true);
  });
});
