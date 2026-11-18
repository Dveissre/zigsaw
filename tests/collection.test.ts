import { describe, expect, it } from "vitest";
import {
  CollectionStore,
  componentCompletionPercentage,
} from "../src/game/collection";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("component collection", () => {
  it("records each encountered character once", () => {
    const storage = new MemoryStorage();
    const collection = new CollectionStore(storage);

    collection.recordEncounter("氢", [168, 429, 75]);
    collection.recordEncounter("氢", [75, 168, 429]);
    collection.recordEncounter("氢", [168, 300, 75]);

    expect(collection.componentsForChar("氢")).toEqual([
      75, 168, 429,
    ]);
    expect(collection.hasComponent(168)).toBe(true);
    expect(collection.hasComponent(999)).toBe(false);
    expect(collection.hasCharWithComponent("氢", 429)).toBe(true);

    const reloaded = new CollectionStore(storage);
    expect(reloaded.seenChars()).toEqual(["氢"]);
    expect(reloaded.hasComponent(429)).toBe(true);
  });

  it("migrates v1 data and rebuilds it from current decompositions", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "zigsaw.collection.v1",
      JSON.stringify({
        version: 1,
        chars: {
          氢: [[168, 429, 75]],
          旧: [[999]],
        },
      }),
    );
    const collection = new CollectionStore(storage);

    expect(collection.seenChars()).toEqual(["氢", "旧"]);
    expect(collection.hasComponent(999)).toBe(true);
    expect(
      collection.needsReconcile("new-source"),
    ).toBe(true);

    collection.reconcile(
      new Map([
        ["氢", [[168, 429, 75]]],
        ["旧", []],
      ]),
      (symbolId) => String(symbolId),
      "new-source",
    );

    expect(collection.hasComponent(999)).toBe(false);
    expect(collection.hasComponent(429)).toBe(true);
    expect(collection.componentsForChar("旧")).toEqual([]);
    expect(
      collection.needsReconcile("new-source"),
    ).toBe(false);
  });

  it("tracks normal and external encounters separately", () => {
    const storage = new MemoryStorage();
    const collection = new CollectionStore(storage);

    collection.recordEncounter("氢", [168, 429]);
    collection.recordEncounter("𠀀", [168, 300], true);

    expect(
      collection.collectedNormalCountForComponent(168),
    ).toBe(1);
    expect(
      collection.collectedExternalCountForComponent(168),
    ).toBe(1);
    expect(
      collection.collectedNormalCountForComponent(168, "氢"),
    ).toBe(0);
  });

  it("persists directly acquired component cards", () => {
    const storage = new MemoryStorage();
    const collection = new CollectionStore(storage);

    collection.recordComponent(999);

    expect(collection.hasComponent(999)).toBe(true);
    expect(
      new CollectionStore(storage).hasComponent(999),
    ).toBe(true);
  });

  it("weights EX characters against the normal denominator", () => {
    expect(
      componentCompletionPercentage({
        rarity: "N",
        isExclusive: false,
        progressCharCount: 1499,
        collectedNormal: 43,
        collectedExternal: 9,
      }),
    ).toBeCloseTo(((43 + 9 * 0.1) / 1499) * 100);
  });

  it("uses the EX pool as the denominator for exclusive components", () => {
    expect(
      componentCompletionPercentage({
        rarity: "UR",
        isExclusive: true,
        progressCharCount: 20,
        collectedNormal: 0,
        collectedExternal: 8,
      }),
    ).toBe(40);
  });

  it("ignores multi-character encounters and splits legacy multi-character keys during reconcile", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "zigsaw.collection.v2",
      JSON.stringify({
        version: 2,
        sourceHash: "same",
        chars: {
          上台: [1, 2, 90],
        },
        externalChars: ["上台"],
        directComponents: [],
      }),
    );
    const collection = new CollectionStore(storage);
    collection.recordEncounter("木林", [140]);
    expect(collection.hasSeenChar("木林")).toBe(false);
    expect(collection.needsReconcile("same")).toBe(true);

    collection.reconcile(
      new Map([
        ["上", [[1, 2]]],
        ["台", [[28, 90]]],
      ]),
      (symbolId) => String(symbolId),
      "same",
      () => false,
    );

    expect(collection.hasSeenChar("上台")).toBe(false);
    expect(collection.seenChars()).toEqual(["上", "台"]);
    expect(collection.componentsForChar("上")).toEqual([1, 2]);
    expect(collection.componentsForChar("台")).toEqual([28, 90]);
    expect(collection.isExternalChar("上台")).toBe(false);
    expect(collection.needsReconcile("same")).toBe(false);
  });

});
