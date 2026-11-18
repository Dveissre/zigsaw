import { describe, expect, it } from "vitest";
import {
  bestStandardChallengeScore,
  type RecordStore,
} from "../src/game/records";
import {
  TRIAL_TICKET_COSTS,
  trialAdvancementAccess,
  trialModeEntryUnlocked,
} from "../src/game/trial-advancement";
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

class MemoryRecords implements RecordStore {
  constructor(private readonly map: Record<string, number>) {}

  load(key: string): number {
    return this.map[key] ?? 0;
  }

  save(key: string, value: number): void {
    this.map[key] = value;
  }
}

describe("trial entry thresholds and ticket access", () => {
  it("resolves standard and expert challenge best records without debug-custom keys", () => {
    const records = new MemoryRecords({
      "challenge|questions=5|size=1500|shift=300|seconds=40": 64,
      "challenge|difficulty=standard|questions=5|size=1500|shift=300|seconds=40|ex=0": 82,
      "challenge|difficulty=standard|questions=5|size=1500|shift=300|seconds=40|ex=1": 55,
      "challenge|difficulty=standard|questions=1|size=1500|shift=300|seconds=180|ex=1": 999,
      "challenge|difficulty=expert|questions=5|size=1500|shift=300|seconds=20|ex=1": 52,
    });

    expect(bestStandardChallengeScore(records, "standard")).toBe(82);
    expect(bestStandardChallengeScore(records, "expert")).toBe(52);
  });

  it("locks the entire trial mode below 50 standard questions unless debug is unlocked", () => {
    expect(trialModeEntryUnlocked({ standard: 49, expert: 100 }, false)).toBe(false);
    expect(trialModeEntryUnlocked({ standard: 50, expert: 0 }, false)).toBe(true);
    expect(trialModeEntryUnlocked({ standard: 0, expert: 0 }, true)).toBe(true);

    const lockedAccess = trialAdvancementAccess({
      level: 0,
      persistedMaxUnlocked: 0,
      completed: false,
      scores: { standard: 49, expert: 0 },
      debugUnlocked: false,
    });
    expect(lockedAccess.kind).toBe("mode-locked");
    expect(lockedAccess.canPlayNormally).toBe(false);
    expect(lockedAccess.canBuyTicket).toBe(false);
    expect(lockedAccess.requirement?.label).toBe("挑战模式 · 普通难度通过 50 题");
  });

  it("enforces both previous-clear unlock and challenge/ticket thresholds for advancements 1-4", () => {
    // Cleared level 0, standard = 50 -> level 1 is ticket-only; level 2 stays locked even if threshold met.
    const level1Ticket = trialAdvancementAccess({
      level: 1,
      persistedMaxUnlocked: 1,
      completed: false,
      scores: { standard: 50, expert: 0 },
      debugUnlocked: false,
    });
    expect(level1Ticket.kind).toBe("ticket-only");
    expect(level1Ticket.canPlayNormally).toBe(false);
    expect(level1Ticket.canBuyTicket).toBe(true);
    expect(level1Ticket.ticketCost).toBe(TRIAL_TICKET_COSTS[1]);

    // Clearing level 1 via trial ticket marks completed(1) === true, fulfilling its threshold permanently.
    const level1ClearedViaTicket = trialAdvancementAccess({
      level: 1,
      persistedMaxUnlocked: 2,
      completed: true,
      scores: { standard: 50, expert: 0 },
      debugUnlocked: false,
    });
    expect(level1ClearedViaTicket.kind).toBe("playable");
    expect(level1ClearedViaTicket.thresholdMet).toBe(true);
    expect(level1ClearedViaTicket.thresholdMetByClear).toBe(true);

    // Threshold already met by challenge record still cannot skip un-cleared previous advancement.
    const level2LockedDespiteRecord = trialAdvancementAccess({
      level: 2,
      persistedMaxUnlocked: 1,
      completed: false,
      scores: { standard: 130, expert: 90 },
      debugUnlocked: false,
    });
    expect(level2LockedDespiteRecord.kind).toBe("locked");
    expect(level2LockedDespiteRecord.thresholdMetByChallenge).toBe(true);
    expect(level2LockedDespiteRecord.canBuyTicket).toBe(false);

    // Advancements 3 and 4 check expert challenge scores (50 and 80).
    expect(
      trialAdvancementAccess({
        level: 3,
        persistedMaxUnlocked: 3,
        completed: false,
        scores: { standard: 150, expert: 49 },
        debugUnlocked: false,
      }).kind,
    ).toBe("ticket-only");
    expect(
      trialAdvancementAccess({
        level: 3,
        persistedMaxUnlocked: 3,
        completed: false,
        scores: { standard: 50, expert: 50 },
        debugUnlocked: false,
      }).kind,
    ).toBe("playable");
    expect(
      trialAdvancementAccess({
        level: 4,
        persistedMaxUnlocked: 4,
        completed: false,
        scores: { standard: 50, expert: 79 },
        debugUnlocked: false,
      }).kind,
    ).toBe("ticket-only");
    expect(
      trialAdvancementAccess({
        level: 4,
        persistedMaxUnlocked: 4,
        completed: false,
        scores: { standard: 50, expert: 80 },
        debugUnlocked: false,
      }).kind,
    ).toBe("playable");
  });

  it("allows debug mode to play all available advancements regardless of records", () => {
    for (let level = 0; level <= TRIAL_ADVANCEMENT_AVAILABLE_MAX; level += 1) {
      const access = trialAdvancementAccess({
        level,
        persistedMaxUnlocked: 0,
        completed: false,
        scores: { standard: 0, expert: 0 },
        debugUnlocked: true,
      });
      expect(access.kind).toBe("playable");
      expect(access.canPlayNormally).toBe(true);
      expect(access.canBuyTicket).toBe(false);
    }
    expect(
      trialAdvancementAccess({
        level: 5,
        persistedMaxUnlocked: 4,
        completed: false,
        scores: { standard: 200, expert: 200 },
        debugUnlocked: true,
      }).kind,
    ).toBe("unavailable");
  });
});
