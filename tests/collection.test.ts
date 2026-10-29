import { describe, expect, it } from "vitest";
import { CollectionStore } from "../src/game/collection";

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
  it("records each encountered decomposition once", () => {
    const storage = new MemoryStorage();
    const collection = new CollectionStore(storage);

    collection.recordEncounter("氢", [168, 429, 75]);
    collection.recordEncounter("氢", [75, 168, 429]);
    collection.recordEncounter("氢", [168, 300, 75]);

    expect(collection.waysForChar("氢")).toEqual([
      [75, 168, 429],
      [75, 168, 300],
    ]);
    expect(collection.hasComponent(168)).toBe(true);
    expect(collection.hasComponent(999)).toBe(false);
    expect(collection.hasCharWithComponent("氢", 429)).toBe(true);
    expect(collection.hasCharWithComponent("氢", 300)).toBe(true);

    const reloaded = new CollectionStore(storage);
    expect(reloaded.seenChars()).toEqual(["氢"]);
    expect(reloaded.hasComponent(429)).toBe(true);
  });
});
