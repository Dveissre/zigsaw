import type { SaveStorage } from "./save";

export const TRIAL_ADVANCEMENT_MAX = 7;
export const TRIAL_ADVANCEMENT_AVAILABLE_MAX = 4;
export const TRIAL_PROGRESS_STORAGE_KEY =
  "zigsaw.trial.progress.v1";

interface TrialProgressState {
  version: 1;
  highestCleared: number;
  perfectMask: number;
}

function normalizeClearedLevel(value: unknown): number {
  const parsed = Number(value);
  return Number.isInteger(parsed)
    ? Math.min(
        TRIAL_ADVANCEMENT_MAX,
        Math.max(-1, parsed),
      )
    : -1;
}

function normalizePerfectMask(
  value: unknown,
  highestCleared: number,
): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return 0;
  }
  return parsed & ((1 << (highestCleared + 1)) - 1);
}

export function readTrialProgress(
  storage: SaveStorage,
): TrialProgressState {
  try {
    const raw = storage.getItem(
      TRIAL_PROGRESS_STORAGE_KEY,
    );
    if (!raw) {
      return {
        version: 1,
        highestCleared: -1,
        perfectMask: 0,
      };
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      const value = parsed as Record<string, unknown>;
      const highestCleared = normalizeClearedLevel(
        value.highestCleared,
      );
      return {
        version: 1,
        highestCleared,
        perfectMask: normalizePerfectMask(
          value.perfectMask,
          highestCleared,
        ),
      };
    }
  } catch {
    // Invalid progress falls back to the initial unlocked level.
  }
  return {
    version: 1,
    highestCleared: -1,
    perfectMask: 0,
  };
}

export function writeTrialProgress(
  storage: SaveStorage,
  highestCleared: number,
  perfectMask = 0,
): number {
  const normalized = normalizeClearedLevel(
    highestCleared,
  );
  const normalizedPerfectMask = normalizePerfectMask(
    perfectMask,
    normalized,
  );
  storage.setItem(
    TRIAL_PROGRESS_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      highestCleared: normalized,
      perfectMask: normalizedPerfectMask,
    } satisfies TrialProgressState),
  );
  return normalized;
}

export class TrialProgressStore {
  constructor(
    private readonly storage: SaveStorage = localStorage,
  ) {}

  maxUnlocked(): number {
    return Math.min(
      TRIAL_ADVANCEMENT_AVAILABLE_MAX,
      readTrialProgress(this.storage)
        .highestCleared + 1,
    );
  }

  completed(level: number): boolean {
    return (
      Number.isInteger(level) &&
      level >= 0 &&
      level <= TRIAL_ADVANCEMENT_AVAILABLE_MAX &&
      level <=
        readTrialProgress(this.storage)
          .highestCleared
    );
  }

  perfect(level: number): boolean {
    if (!this.completed(level)) {
      return false;
    }
    return (
      (readTrialProgress(this.storage).perfectMask &
        (1 << level)) !==
      0
    );
  }

  recordCleared(level: number, perfect = false): number {
    if (
      !Number.isInteger(level) ||
      level < 0 ||
      level > TRIAL_ADVANCEMENT_AVAILABLE_MAX ||
      level > this.maxUnlocked()
    ) {
      return this.maxUnlocked();
    }
    const previous = readTrialProgress(this.storage);
    const highest = Math.max(
      previous.highestCleared,
      level,
    );
    const perfectMask =
      previous.perfectMask | (perfect ? 1 << level : 0);
    writeTrialProgress(
      this.storage,
      highest,
      perfectMask,
    );
    return this.maxUnlocked();
  }
}
