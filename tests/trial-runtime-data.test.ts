import { describe, expect, it } from "vitest";
import archivedFugueRule from "../docs/archive/trial-rules/fugue.rule.json";
import trialRulesJson from "../public/data/trial-rules.json";
import { trialRuleDataRequirements } from "../src/game/trial-runtime-data";
import type {
  TrialRuleDefinition,
  TrialRulesData,
} from "../src/game/trial-rules";

const rules =
  trialRulesJson as unknown as TrialRulesData;

const rule = (id: string): TrialRuleDefinition =>
  rules.rules[id];

describe("trial runtime data requirements", () => {
  it("maps pinyin rules to the pinyin dataset", () => {
    expect(
      trialRuleDataRequirements(rule("nuncupation")),
    ).toEqual({
      pinyin: true,
      traditional: false,
      gestalt: false,
      composition: false,
      assonance: false,
      wordAnswers: false,
      any: true,
    });
  });

  it("maps word rules to generation and answer datasets", () => {
    expect(
      trialRuleDataRequirements(rule("composition")),
    ).toMatchObject({
      composition: true,
      assonance: false,
      wordAnswers: true,
      any: true,
    });
    expect(
      trialRuleDataRequirements(rule("dissonance")),
    ).toMatchObject({
      composition: false,
      assonance: true,
      wordAnswers: true,
      any: true,
    });
  });

  it("loads no optional dataset for component-only rules", () => {
    expect(
      trialRuleDataRequirements(rule("tetrarchy")),
    ).toMatchObject({
      pinyin: false,
      traditional: false,
      gestalt: false,
      composition: false,
      assonance: false,
      wordAnswers: false,
      any: false,
    });
    expect(
      trialRuleDataRequirements(
        archivedFugueRule as unknown as TrialRuleDefinition,
      ).any,
    ).toBe(false);
  });
});
