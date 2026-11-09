import { describe, expect, it } from "vitest";
import {
  readTrialProgress,
  TRIAL_ADVANCEMENT_AVAILABLE_MAX,
  TRIAL_PROGRESS_STORAGE_KEY,
  TrialProgressStore,
  writeTrialProgress,
} from "../src/game/trial-progress";
import type { SaveStorage } from "../src/game/save";

class MemoryStorage implements SaveStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("trial advancement progress", () => {
  it("starts with only advancement zero unlocked", () => {
    const storage = new MemoryStorage();
    const progress = new TrialProgressStore(storage);

    expect(progress.maxUnlocked()).toBe(0);
    expect(progress.completed(0)).toBe(false);
  });

  it("unlocks the next advancement after any completed clear", () => {
    const storage = new MemoryStorage();
    const progress = new TrialProgressStore(storage);

    expect(progress.recordCleared(0)).toBe(1);
    expect(progress.completed(0)).toBe(true);
    expect(progress.maxUnlocked()).toBe(1);
    expect(progress.recordCleared(0)).toBe(1);
    expect(progress.recordCleared(2)).toBe(1);
    expect(progress.recordCleared(1)).toBe(2);
  });

  it("normalizes malformed and out-of-range persisted values", () => {
    const storage = new MemoryStorage();
    const progress = new TrialProgressStore(storage);
    storage.setItem(
      TRIAL_PROGRESS_STORAGE_KEY,
      JSON.stringify({ version: 1, highestCleared: 99 }),
    );
    expect(readTrialProgress(storage).highestCleared).toBe(7);
    expect(progress.maxUnlocked()).toBe(
      TRIAL_ADVANCEMENT_AVAILABLE_MAX,
    );

    storage.setItem(TRIAL_PROGRESS_STORAGE_KEY, "not-json");
    expect(readTrialProgress(storage).highestCleared).toBe(-1);

    expect(writeTrialProgress(storage, -1)).toBe(-1);
    expect(readTrialProgress(storage).highestCleared).toBe(-1);
  });

  it("caps currently available advancement at four", () => {
    const storage = new MemoryStorage();
    const progress = new TrialProgressStore(storage);
    for (let level = 0; level <= 4; level += 1) {
      progress.recordCleared(level);
    }

    expect(progress.maxUnlocked()).toBe(4);
    expect(progress.completed(4)).toBe(true);
    expect(progress.recordCleared(5)).toBe(4);
    expect(progress.completed(5)).toBe(false);
  });

  it("records perfect clears separately and never downgrades them", () => {
    const storage = new MemoryStorage();
    const progress = new TrialProgressStore(storage);

    progress.recordCleared(0, true);
    progress.recordCleared(0, false);
    progress.recordCleared(1, false);

    expect(progress.perfect(0)).toBe(true);
    expect(progress.perfect(1)).toBe(false);

    progress.recordCleared(1, true);
    expect(progress.perfect(1)).toBe(true);
  });
});
