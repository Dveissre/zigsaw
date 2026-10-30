import type { ChallengeDifficulty } from "./data";

const STORAGE_KEY = "zigsaw.cris.v1";

export interface CrisStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface CrisLedger {
  add(amount: number): number;
}

export interface CrisRewardInput {
  difficulty: ChallengeDifficulty;
  normalCorrect: number;
  exCorrect: number;
  stagesCleared: number;
  stageQuestions: number;
  enteredEx: boolean;
}

export function calculateCrisReward(
  {
    difficulty,
    normalCorrect,
    exCorrect,
    stagesCleared,
    stageQuestions,
    enteredEx,
  }: CrisRewardInput,
): number {
  if (normalCorrect + exCorrect <= 0) {
    return 0;
  }
  const rates = {
    beginner: {
      normal: 0.325,
      ex: 0.625,
      stage: 0.5,
      exEntry: 5,
    },
    standard: {
      normal: 0.65,
      ex: 1.25,
      stage: 1,
      exEntry: 10,
    },
    expert: {
      normal: 0.85,
      ex: 1.8,
      stage: 1.25,
      exEntry: 14,
    },
  }[difficulty];
  const normalizedStages =
    stagesCleared * (5 / Math.max(1, stageQuestions));
  return Math.max(
    1,
    Math.round(
      normalCorrect * rates.normal +
        exCorrect * rates.ex +
        normalizedStages * rates.stage +
        (enteredEx ? rates.exEntry : 0),
    ),
  );
}

export class CrisStore implements CrisLedger {
  constructor(
    private readonly storage: CrisStorage = localStorage,
  ) {}

  load(): number {
    try {
      const value = Number(this.storage.getItem(STORAGE_KEY) ?? 0);
      return Number.isFinite(value)
        ? Math.max(0, Math.floor(value))
        : 0;
    } catch {
      return 0;
    }
  }

  add(amount: number): number {
    const reward = Math.max(0, Math.floor(amount));
    const total = this.load() + reward;
    try {
      this.storage.setItem(STORAGE_KEY, String(total));
    } catch {
      return total;
    }
    return total;
  }

  set(amount: number): number {
    const next = Number.isFinite(amount)
      ? Math.max(0, Math.floor(amount))
      : 0;
    try {
      this.storage.setItem(STORAGE_KEY, String(next));
    } catch {
      return next;
    }
    return next;
  }
}
