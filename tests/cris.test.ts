import { describe, expect, it } from "vitest";
import {
  calculateCrisReward,
  CrisStore,
} from "../src/game/cris";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("Cris rewards", () => {
  it("uses difficulty-scaled challenge rewards", () => {
    const reward = (
      difficulty: "beginner" | "standard" | "expert",
    ) =>
      calculateCrisReward({
        difficulty,
        normalCorrect: 120,
        exCorrect: 30,
        stagesCleared: 24,
        stageQuestions: 5,
        enteredEx: true,
      });

    expect(
      calculateCrisReward({
        difficulty: "expert",
        normalCorrect: 0,
        exCorrect: 0,
        stagesCleared: 0,
        stageQuestions: 5,
        enteredEx: false,
      }),
    ).toBe(0);
    expect(reward("beginner")).toBe(75);
    expect(reward("standard")).toBe(150);
    expect(reward("expert")).toBe(200);
  });

  it("persists accumulated Cris", () => {
    const store = new CrisStore(new MemoryStorage());

    expect(store.load()).toBe(0);
    expect(store.add(12)).toBe(12);
    expect(store.add(8)).toBe(20);
    expect(store.load()).toBe(20);
    expect(store.set(7)).toBe(7);
    expect(store.load()).toBe(7);
    expect(store.spend(10)).toBe(false);
    expect(store.spend(3)).toBe(true);
    expect(store.load()).toBe(4);
  });
});
