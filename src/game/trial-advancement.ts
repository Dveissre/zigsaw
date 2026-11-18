import {
  TRIAL_ADVANCEMENT_AVAILABLE_MAX,
  TRIAL_ADVANCEMENT_MAX,
} from "./trial-progress";

export interface TrialAdvancementConfig {
  level: number;
  normalQuestionsPerStage: number;
  initialSkips: number;
  skipGrantEveryStages: number;
  threeStarTimeMultiplier: number;
  lowStarTimeMultiplier: number;
}

const LEVEL_FOUR_CONFIG: TrialAdvancementConfig = {
  level: 4,
  normalQuestionsPerStage: 8,
  initialSkips: 1,
  skipGrantEveryStages: 3,
  threeStarTimeMultiplier: 1,
  lowStarTimeMultiplier: 0.85,
};

const ADVANCEMENT_CONFIGS = [
  {
    level: 0,
    normalQuestionsPerStage: 7,
    initialSkips: 3,
    skipGrantEveryStages: 2,
    threeStarTimeMultiplier: 1.3,
    lowStarTimeMultiplier: 1,
  },
  {
    level: 1,
    normalQuestionsPerStage: 8,
    initialSkips: 3,
    skipGrantEveryStages: 3,
    threeStarTimeMultiplier: 1.3,
    lowStarTimeMultiplier: 1,
  },
  {
    level: 2,
    normalQuestionsPerStage: 8,
    initialSkips: 3,
    skipGrantEveryStages: 3,
    threeStarTimeMultiplier: 1,
    lowStarTimeMultiplier: 1,
  },
  {
    level: 3,
    normalQuestionsPerStage: 8,
    initialSkips: 1,
    skipGrantEveryStages: 3,
    threeStarTimeMultiplier: 1,
    lowStarTimeMultiplier: 1,
  },
  LEVEL_FOUR_CONFIG,
  // Levels 5-7 are reserved for future mechanics. Until those mechanics
  // exist, they retain the fully resolved level-four baseline.
  ...[5, 6, 7].map(
    (level): TrialAdvancementConfig => ({
      ...LEVEL_FOUR_CONFIG,
      level,
    }),
  ),
] satisfies readonly TrialAdvancementConfig[];

export function trialAdvancementConfig(
  level: number,
): TrialAdvancementConfig {
  const normalized = Number.isFinite(level)
    ? Math.min(
        TRIAL_ADVANCEMENT_MAX,
        Math.max(0, Math.round(level)),
      )
    : 0;
  return ADVANCEMENT_CONFIGS[normalized];
}

export function trialAdvancementTimeMultiplier(
  ruleStars: number,
  config: TrialAdvancementConfig,
): number {
  if (ruleStars === 3) {
    return config.threeStarTimeMultiplier;
  }
  if (ruleStars === 1 || ruleStars === 2) {
    return config.lowStarTimeMultiplier;
  }
  return 1;
}

export function trialAdvancementUnlockedByFirstClear(
  level: number,
  wasCompleted: boolean,
): number | null {
  if (
    wasCompleted ||
    !Number.isInteger(level) ||
    level < 0 ||
    level >= TRIAL_ADVANCEMENT_AVAILABLE_MAX
  ) {
    return null;
  }
  return level + 1;
}

export function trialEffectiveMaxUnlocked(
  persistedMaxUnlocked: number,
  debugUnlocked: boolean,
): number {
  return debugUnlocked
    ? TRIAL_ADVANCEMENT_AVAILABLE_MAX
    : persistedMaxUnlocked;
}

export interface TrialGateRequirement {
  difficulty: "standard" | "expert";
  difficultyLabel: string;
  target: number;
  label: string;
  shortLabel: string;
}

export const TRIAL_ENTRY_GATE: TrialGateRequirement = {
  difficulty: "standard",
  difficultyLabel: "普通",
  target: 50,
  label: "挑战模式 · 普通难度通过 50 题",
  shortLabel: "普通难度 50 题",
};

export const TRIAL_ADVANCEMENT_THRESHOLDS: Readonly<
  Record<number, TrialGateRequirement>
> = {
  0: TRIAL_ENTRY_GATE,
  1: {
    difficulty: "standard",
    difficultyLabel: "普通",
    target: 80,
    label: "挑战模式 · 普通难度通过 80 题",
    shortLabel: "普通难度 80 题",
  },
  2: {
    difficulty: "standard",
    difficultyLabel: "普通",
    target: 120,
    label: "挑战模式 · 普通难度通过 120 题",
    shortLabel: "普通难度 120 题",
  },
  3: {
    difficulty: "expert",
    difficultyLabel: "专家",
    target: 50,
    label: "挑战模式 · 专家难度通过 50 题",
    shortLabel: "专家难度 50 题",
  },
  4: {
    difficulty: "expert",
    difficultyLabel: "专家",
    target: 80,
    label: "挑战模式 · 专家难度通过 80 题",
    shortLabel: "专家难度 80 题",
  },
};

export const TRIAL_TICKET_COSTS: Readonly<
  Record<number, number>
> = {
  1: 60,
  2: 80,
  3: 100,
  4: 120,
};

export interface TrialChallengeBestScores {
  standard: number;
  expert: number;
}

export type TrialAdvancementAccessKind =
  | "unavailable"
  | "mode-locked"
  | "locked"
  | "ticket-only"
  | "playable";

export interface TrialAdvancementAccess {
  level: number;
  modeEntryUnlocked: boolean;
  progressionUnlocked: boolean;
  thresholdMet: boolean;
  thresholdMetByChallenge: boolean;
  thresholdMetByClear: boolean;
  requirement: TrialGateRequirement | null;
  currentBest: number;
  ticketCost: number | null;
  kind: TrialAdvancementAccessKind;
  canPlayNormally: boolean;
  canBuyTicket: boolean;
}

export function trialModeEntryUnlocked(
  scores: TrialChallengeBestScores,
  debugUnlocked: boolean,
): boolean {
  return debugUnlocked || scores.standard >= TRIAL_ENTRY_GATE.target;
}

export function trialAdvancementAccess({
  level,
  persistedMaxUnlocked,
  completed,
  scores,
  debugUnlocked,
}: {
  level: number;
  persistedMaxUnlocked: number;
  completed: boolean;
  scores: TrialChallengeBestScores;
  debugUnlocked: boolean;
}): TrialAdvancementAccess {
  const normalizedLevel = Number.isFinite(level)
    ? Math.min(TRIAL_ADVANCEMENT_MAX, Math.max(0, Math.round(level)))
    : 0;
  if (normalizedLevel > TRIAL_ADVANCEMENT_AVAILABLE_MAX) {
    return {
      level: normalizedLevel,
      modeEntryUnlocked: trialModeEntryUnlocked(scores, debugUnlocked),
      progressionUnlocked: false,
      thresholdMet: false,
      thresholdMetByChallenge: false,
      thresholdMetByClear: false,
      requirement: null,
      currentBest: 0,
      ticketCost: null,
      kind: "unavailable",
      canPlayNormally: false,
      canBuyTicket: false,
    };
  }

  const modeEntryUnlocked = trialModeEntryUnlocked(
    scores,
    debugUnlocked,
  );
  if (!modeEntryUnlocked) {
    return {
      level: normalizedLevel,
      modeEntryUnlocked: false,
      progressionUnlocked: false,
      thresholdMet: false,
      thresholdMetByChallenge: false,
      thresholdMetByClear: false,
      requirement: TRIAL_ENTRY_GATE,
      currentBest: scores.standard,
      ticketCost: null,
      kind: "mode-locked",
      canPlayNormally: false,
      canBuyTicket: false,
    };
  }

  const requirement =
    TRIAL_ADVANCEMENT_THRESHOLDS[normalizedLevel] ?? null;
  const currentBest = requirement
    ? scores[requirement.difficulty]
    : 0;
  const thresholdMetByChallenge = requirement
    ? currentBest >= requirement.target
    : true;
  const thresholdMetByClear = normalizedLevel >= 1 && completed;
  const thresholdMet =
    thresholdMetByChallenge || thresholdMetByClear;
  const progressionUnlocked =
    debugUnlocked || normalizedLevel <= persistedMaxUnlocked;
  const ticketCost =
    normalizedLevel >= 1
      ? (TRIAL_TICKET_COSTS[normalizedLevel] ?? null)
      : null;

  let kind: TrialAdvancementAccessKind;
  if (!progressionUnlocked) {
    kind = "locked";
  } else if (debugUnlocked || thresholdMet) {
    kind = "playable";
  } else {
    kind = "ticket-only";
  }

  return {
    level: normalizedLevel,
    modeEntryUnlocked: true,
    progressionUnlocked,
    thresholdMet,
    thresholdMetByChallenge,
    thresholdMetByClear,
    requirement,
    currentBest,
    ticketCost,
    kind,
    canPlayNormally: kind === "playable",
    canBuyTicket: kind === "ticket-only" && ticketCost !== null,
  };
}
