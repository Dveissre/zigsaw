import { describe, expect, it } from "vitest";
import type { AtlasComponentSummary } from "../src/game/atlas";
import { GameData } from "../src/game/data";
import {
  GACHA_CHARACTER_CLASS_WEIGHTS,
  GACHA_HAND_SIZE,
  GACHA_RARITY_WEIGHTS,
  GachaDrawer,
  componentDrawWeights,
  type GachaCard,
} from "../src/game/gacha";

function component(
  symbolId: number,
  name: string,
  rarity: AtlasComponentSummary["rarity"],
): AtlasComponentSummary {
  return {
    symbolId,
    name,
    rarity,
    count: 1,
    charCount: 1,
    progressCharCount: 1,
    exCharCount: 0,
    milestones: [],
  };
}

function createDrawer(): GachaDrawer {
  const data = new GameData(
    {
      symbols: {
        "1": "一",
        "2": "丨",
        "3": "丿",
        "4": "丶",
        "5": "乙",
      },
      chars: {
        一: [[1]],
        二: [[1, 2]],
        三: [[1, 1, 2]],
        川: [[1, 3, 4]],
        丁: [[1, 5]],
      },
    },
    {
      levels: {
        一级: ["二", "三", "川", "丁"],
        二级: [],
        三级: [],
      },
    },
    null,
    "https://example.com/",
  );
  return new GachaDrawer(
    data,
    [
      component(1, "一", "N"),
      component(2, "丨", "N"),
      component(3, "丿", "R"),
      component(4, "丶", "SR"),
      component(5, "乙", "UR"),
    ],
    () => 0,
  );
}

describe("Gacha drawing", () => {
  it("uses the configured rarity and character-class weights", () => {
    expect(GACHA_RARITY_WEIGHTS).toEqual({
      N: 0.32,
      R: 0.45,
      SR: 0.17,
      SSR: 0.04,
      UR: 0.015,
      XR: 0.005,
    });
    expect(GACHA_CHARACTER_CLASS_WEIGHTS).toEqual({
      level1: 40,
      level2: 30,
      level3: 20,
      external: 4,
    });
  });

  it("caps the total EX component weight at twenty percent", () => {
    const components = [
      component(1, "一", "R"),
      component(2, "丨", "R"),
      component(3, "丿", "R"),
      ...[4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map(
        (symbolId) =>
          ({
            ...component(symbolId, "件", "R"),
            isExclusive: true,
          }) as AtlasComponentSummary,
      ),
    ];
    const weights = componentDrawWeights(components, "R");
    const exTotal = weights
      .filter((_, index) => components[index].isExclusive)
      .reduce((sum, weight) => sum + weight, 0);
    const total = weights.reduce((sum, weight) => sum + weight, 0);

    expect(exTotal / total).toBeCloseTo(0.2);
  });

  it("always fills ten cards and leaves a playable seed", () => {
    const drawer = createDrawer();
    const hand = drawer.draw();

    expect(hand).toHaveLength(GACHA_HAND_SIZE);
    expect(hand.some((card) => card.rarity === "R")).toBe(true);
    expect(
      hand.every(
        (card) => card.rarity === "N" || card.rarity === "R",
      ),
    ).toBe(true);
    expect(drawer.hasPossibleWord(hand)).toBe(true);
    expect(drawer.lastTrace?.decompositions.length).toBeGreaterThan(0);
    expect(drawer.lastTrace?.fillerCards.length).toBeGreaterThan(0);
  });

  it("consumes only the cards used by a submitted character", () => {
    const drawer = createDrawer();
    const cards: GachaCard[] = [
      { uid: 1, symbolId: 1, rarity: "N" },
      { uid: 2, symbolId: 2, rarity: "N" },
      { uid: 3, symbolId: 5, rarity: "UR" },
    ];

    const submission = drawer.findSubmission("二", cards);

    expect(submission?.way).toEqual([1, 2]);
    expect(submission?.remainingCards.map((card) => card.uid)).toEqual([
      3,
    ]);
  });

  it("allows a drawn component to form its single-part character", () => {
    const drawer = createDrawer();
    const cards: GachaCard[] = [
      { uid: 1, symbolId: 1, rarity: "N" },
    ];

    const submission = drawer.findSubmission("一", cards);

    expect(submission?.way).toEqual([1]);
    expect(submission?.remainingCards).toEqual([]);
    expect(drawer.hasPossibleWord(cards)).toBe(true);
  });
});
