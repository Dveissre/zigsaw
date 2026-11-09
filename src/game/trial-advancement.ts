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
  lowStarTimeMultiplier: 0.7,
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
