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
});
