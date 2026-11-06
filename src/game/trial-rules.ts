import type { Level } from "./data";

export type TrialRulePromptMode =
  | "answer-components"
  | "assonance-components"
  | "dissonance-components"
  | "displayed-cards"
  | "gestalt-components"
  | "overlay-components"
  | "prefabricated-components"
  | "repetend-components"
  | "reduction-components"
  | "traditional-components"
  | "wildcard-components"
  | "word-components";

export interface TrialRuleDescription {
  public: string;
  debug: string;
  internal: string;
}

export interface TrialRuleFamily {
  id: string;
  weight: number;
  variantWeight: number;
}

export interface TrialNormalSelection {
  partLengths: number[];
  partWeights?: Record<string, number>;
  partWeighting?: "challenge" | "pool";
  partLengthProgression?: {
    start: number;
    end: number[];
  };
}

export interface TrialBossSelection {
  answerCount: number;
  partLengths: number[];
  totalParts: [number, number];
}

export interface TrialRuleSelection {
  excludedComponents?: string[];
  levels?: Level[];
  normal: TrialNormalSelection;
  boss: TrialBossSelection;
}

export interface TrialRuleTiming {
  normalSeconds: number;
  bossSeconds: number;
  normalMultiplier: number;
  bossMultiplier: number;
  sharedBudgetSeconds?: number;
  correctBonusSeconds?: number;
  pausePenaltySeconds?: number;
}

export interface TrialPromptPolicy {
  mode: TrialRulePromptMode;
  minCards?: number;
  maxCards?: number;
  hiddenCards?: number;
  inheritedCards?: number;
}

export interface TrialAnswerPolicy {
  input: "character" | "word" | "pinyin";
  acceptance: "canonical" | "answer-compatibility";
  unique: boolean;
  distinct?: boolean;
}

export type TrialCardPolicySource =
  | "answer"
  | "decoy"
  | "inherited"
  | "wildcard";

export interface TrialCardsPolicy {
  sources: TrialCardPolicySource[];
  display:
    | "component"
    | "compound"
    | "quantity"
    | "obscured"
    | "wildcard";
  compound?: boolean;
  quantity?: boolean;
  obscureAfterMs?: number;
  obscureCount?: number | "all";
  decoyMode?: "separate" | "attached";
  decoyCount?: number;
  decoyComponents?: string[];
  decoyRarity?: "N";
  decoyWeighting?: "usage";
  decoyUnique?: boolean;
}

export interface TrialRulePolicy {
  prompt: {
    normal: TrialPromptPolicy;
    boss: TrialPromptPolicy;
  };
  answer: {
    normal: TrialAnswerPolicy;
    boss: TrialAnswerPolicy;
  };
  cards: {
    normal: TrialCardsPolicy;
    boss: TrialCardsPolicy;
  };
}

export interface TrialRuleDefinition {
  id: string;
  name: string;
  english: string;
  description: TrialRuleDescription;
  stars: number;
  icon: string;
  allowSkip?: boolean;
  family?: TrialRuleFamily;
  timing: TrialRuleTiming;
  selection: TrialRuleSelection;
  policy: TrialRulePolicy;
}

export interface TrialRulesData {
  version: 3;
  stageStars: number[][];
  rules: Record<string, TrialRuleDefinition>;
}

export type TrialRulePhase = "normal" | "boss";

export function trialRulePromptMode(
  rule: TrialRuleDefinition | null | undefined,
  phase: TrialRulePhase,
): TrialRulePromptMode | null {
  return rule?.policy.prompt[phase].mode ?? null;
}

export function trialRuleAnswerInput(
  rule: TrialRuleDefinition | null | undefined,
  phase: TrialRulePhase,
): TrialAnswerPolicy["input"] | null {
  return rule?.policy.answer[phase].input ?? null;
}

export function trialRuleUsesWordAnswer(
  rule: TrialRuleDefinition | null | undefined,
): boolean {
  return (
    trialRuleAnswerInput(rule, "normal") === "word" ||
    trialRuleAnswerInput(rule, "boss") === "word"
  );
}

export function trialRuleUsesPrompt(
  rule: TrialRuleDefinition | null | undefined,
  mode: TrialRulePromptMode,
): boolean {
  return (
    trialRulePromptMode(rule, "normal") === mode ||
    trialRulePromptMode(rule, "boss") === mode
  );
}

export function sortTrialRulesByStars(
  rules: Iterable<TrialRuleDefinition>,
): TrialRuleDefinition[] {
  return [...rules].sort(
    (left, right) =>
      left.stars - right.stars ||
      left.name.localeCompare(right.name, "zh-CN"),
  );
}

export function chooseTrialStageRuleIds(
  rulesData: TrialRulesData,
  random: () => number,
): string[] {
  const used = new Set<string>();
  const rules = sortTrialRulesByStars(
    Object.values(rulesData.rules),
  );
  return rulesData.stageStars.map((stars) => {
    const star =
      stars[Math.floor(random() * stars.length)] ??
      stars[0];
    const candidates = rules.filter(
      (rule) => rule.stars === star,
    );
    const unused = candidates.filter(
      (rule) => !used.has(rule.id),
    );
    const pool = unused.length > 0 ? unused : candidates;
    if (pool.length === 0) {
      throw new Error(
        `No trial rule available for star rating ${star}`,
      );
    }
    const selected =
      pool[Math.floor(random() * pool.length)];
    used.add(selected.id);
    return selected.id;
  });
}

const READY_TIMING: TrialRuleTiming = {
  normalSeconds: 30,
  bossSeconds: 90,
  normalMultiplier: 1,
  bossMultiplier: 1,
};

const READY_POLICY: TrialRulePolicy = {
  prompt: {
    normal: { mode: "answer-components" },
    boss: { mode: "answer-components" },
  },
  answer: {
    normal: {
      input: "character",
      acceptance: "answer-compatibility",
      unique: false,
    },
    boss: {
      input: "character",
      acceptance: "answer-compatibility",
      unique: false,
      distinct: true,
    },
  },
  cards: {
    normal: { sources: ["answer"], display: "component" },
    boss: { sources: ["answer"], display: "component" },
  },
};

export const FALLBACK_TRIAL_RULE: TrialRuleDefinition = {
  id: "unrestricted",
  name: "无制限",
  english: "Unbound",
  description: {
    public: "不附加额外规则。",
    debug:
      "标准试炼结构：道中 30 秒，守幕 90 秒；守幕为两个不同汉字、合计 6–8 张卡。",
    internal: "使用试炼模式默认题库、时限与 BOSS 结构。",
  },
  stars: 0,
  icon: "unrestricted.svg",
  timing: { ...READY_TIMING },
  selection: {
    normal: {
      partLengths: [2, 3, 4, 5, 6, 7, 8, 9, 10],
    },
    boss: {
      answerCount: 2,
      partLengths: [2, 3, 4, 5, 6],
      totalParts: [6, 8],
    },
  },
  policy: structuredClone(READY_POLICY),
};

const isRecord = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isPartLengths = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every(
    (length) =>
      Number.isInteger(length) && length >= 2 && length <= 10,
  );

function validatePolicy(
  ruleId: string,
  value: unknown,
): asserts value is TrialRulePolicy {
  if (!isRecord(value)) {
    throw new Error(`data/trial-rules.json: ${ruleId}.policy is invalid`);
  }
  for (const kind of ["normal", "boss"] as const) {
    const prompt = value.prompt;
    const answer = value.answer;
    const cards = value.cards;
    if (
      !isRecord(prompt) ||
      !isRecord(prompt[kind]) ||
      ![
        "answer-components",
        "assonance-components",
        "dissonance-components",
        "displayed-cards",
        "gestalt-components",
        "overlay-components",
        "prefabricated-components",
        "repetend-components",
        "reduction-components",
        "traditional-components",
        "wildcard-components",
        "word-components",
      ].includes(String(prompt[kind].mode))
    ) {
      throw new Error(
        `data/trial-rules.json: ${ruleId}.policy.prompt.${kind} is invalid`,
      );
    }
    if (
      prompt[kind].inheritedCards !== undefined &&
      (!Number.isInteger(prompt[kind].inheritedCards) ||
        Number(prompt[kind].inheritedCards) < 0)
    ) {
      throw new Error(
        `data/trial-rules.json: ${ruleId}.policy.prompt.${kind}.inheritedCards is invalid`,
      );
    }
    if (
      !isRecord(answer) ||
      !isRecord(answer[kind]) ||
      !["character", "word", "pinyin"].includes(
        String(answer[kind].input),
      ) ||
      !["canonical", "answer-compatibility"].includes(
        String(answer[kind].acceptance),
      ) ||
      typeof answer[kind].unique !== "boolean"
    ) {
      throw new Error(
        `data/trial-rules.json: ${ruleId}.policy.answer.${kind} is invalid`,
      );
    }
    if (
      !isRecord(cards) ||
      !isRecord(cards[kind]) ||
      !Array.isArray(cards[kind].sources) ||
      !cards[kind].sources.every((source) =>
        ["answer", "decoy", "inherited", "wildcard"].includes(
          String(source),
        ),
      ) ||
      ![
        "component",
        "compound",
        "quantity",
        "overlay",
        "obscured",
        "wildcard",
      ].includes(String(cards[kind].display))
    ) {
      throw new Error(
        `data/trial-rules.json: ${ruleId}.policy.cards.${kind} is invalid`,
      );
    }
    if (
      cards[kind].obscureAfterMs !== undefined &&
      (!isFiniteNumber(cards[kind].obscureAfterMs) ||
        cards[kind].obscureAfterMs < 0)
    ) {
      throw new Error(
        `data/trial-rules.json: ${ruleId}.policy.cards.${kind}.obscureAfterMs is invalid`,
      );
    }
    if (
      cards[kind].obscureCount !== undefined &&
      cards[kind].obscureCount !== "all" &&
      (!Number.isInteger(cards[kind].obscureCount) ||
        Number(cards[kind].obscureCount) < 1)
    ) {
      throw new Error(
        `data/trial-rules.json: ${ruleId}.policy.cards.${kind}.obscureCount is invalid`,
      );
    }
    if (
      cards[kind].decoyMode !== undefined &&
      !["separate", "attached"].includes(
        String(cards[kind].decoyMode),
      )
    ) {
      throw new Error(
        `data/trial-rules.json: ${ruleId}.policy.cards.${kind}.decoyMode is invalid`,
      );
    }
    if (
      cards[kind].decoyCount !== undefined &&
      (!Number.isInteger(cards[kind].decoyCount) ||
        Number(cards[kind].decoyCount) < 1)
    ) {
      throw new Error(
        `data/trial-rules.json: ${ruleId}.policy.cards.${kind}.decoyCount is invalid`,
      );
    }
    if (
      cards[kind].decoyComponents !== undefined &&
      (!Array.isArray(cards[kind].decoyComponents) ||
        cards[kind].decoyComponents.length === 0 ||
        !cards[kind].decoyComponents.every(
          (name) => typeof name === "string",
        ))
    ) {
      throw new Error(
        `data/trial-rules.json: ${ruleId}.policy.cards.${kind}.decoyComponents is invalid`,
      );
    }
    if (
      cards[kind].decoyRarity !== undefined &&
      cards[kind].decoyRarity !== "N"
    ) {
      throw new Error(
        `data/trial-rules.json: ${ruleId}.policy.cards.${kind}.decoyRarity is invalid`,
      );
    }
    if (
      cards[kind].decoyWeighting !== undefined &&
      cards[kind].decoyWeighting !== "usage"
    ) {
      throw new Error(
        `data/trial-rules.json: ${ruleId}.policy.cards.${kind}.decoyWeighting is invalid`,
      );
    }
    if (
      cards[kind].decoyUnique !== undefined &&
      typeof cards[kind].decoyUnique !== "boolean"
    ) {
      throw new Error(
        `data/trial-rules.json: ${ruleId}.policy.cards.${kind}.decoyUnique is invalid`,
      );
    }
  }
}

function validateRule(
  id: string,
  value: unknown,
): asserts value is TrialRuleDefinition {
  if (!isRecord(value)) {
    throw new Error(`data/trial-rules.json: rule ${id} is invalid`);
  }
  if (
    value.id !== id ||
    typeof value.name !== "string" ||
    typeof value.english !== "string" ||
    typeof value.stars !== "number" ||
    typeof value.icon !== "string" ||
    (value.allowSkip !== undefined &&
      typeof value.allowSkip !== "boolean")
  ) {
    throw new Error(
      `data/trial-rules.json: rule ${id} has invalid display data`,
    );
  }
  if (
    !isRecord(value.description) ||
    typeof value.description.public !== "string" ||
    typeof value.description.debug !== "string" ||
    value.description.debug.trim().length === 0 ||
    typeof value.description.internal !== "string"
  ) {
    throw new Error(
      `data/trial-rules.json: ${id}.description is invalid`,
    );
  }
  if (
    !isRecord(value.timing) ||
    !isFiniteNumber(value.timing.normalSeconds) ||
    !isFiniteNumber(value.timing.bossSeconds) ||
    !isFiniteNumber(value.timing.normalMultiplier) ||
    !isFiniteNumber(value.timing.bossMultiplier) ||
    (value.timing.sharedBudgetSeconds !== undefined &&
      (!isFiniteNumber(value.timing.sharedBudgetSeconds) ||
        value.timing.sharedBudgetSeconds <= 0)) ||
    (value.timing.correctBonusSeconds !== undefined &&
      (!isFiniteNumber(value.timing.correctBonusSeconds) ||
        value.timing.correctBonusSeconds < 0)) ||
    (value.timing.pausePenaltySeconds !== undefined &&
      (!isFiniteNumber(value.timing.pausePenaltySeconds) ||
        value.timing.pausePenaltySeconds < 0))
  ) {
    throw new Error(
      `data/trial-rules.json: ${id}.timing is invalid`,
    );
  }
  if (!isRecord(value.selection)) {
    throw new Error(
      `data/trial-rules.json: ${id}.selection is invalid`,
    );
  }
  const selection = value.selection;
  if (
    selection.excludedComponents !== undefined &&
    (!Array.isArray(selection.excludedComponents) ||
      !selection.excludedComponents.every(
        (name) => typeof name === "string",
      ))
  ) {
    throw new Error(
      `data/trial-rules.json: ${id}.selection.excludedComponents is invalid`,
    );
  }
  if (
    selection.levels !== undefined &&
    (!Array.isArray(selection.levels) ||
      selection.levels.length === 0 ||
      !selection.levels.every(
        (level) =>
          Number.isInteger(level) &&
          level >= 1 &&
          level <= 3,
      ))
  ) {
    throw new Error(
      `data/trial-rules.json: ${id}.selection.levels is invalid`,
    );
  }
  if (
    !isRecord(selection.normal) ||
    !isPartLengths(selection.normal.partLengths) ||
    !isRecord(selection.boss)
  ) {
    throw new Error(
      `data/trial-rules.json: ${id}.selection is invalid`,
    );
  }
  const progression =
    selection.normal.partLengthProgression;
  if (progression !== undefined) {
    if (!isRecord(progression)) {
      throw new Error(
        `data/trial-rules.json: ${id}.selection.normal.partLengthProgression is invalid`,
      );
    }
    const start = progression.start;
    if (
      !isFiniteNumber(start) ||
      !Number.isInteger(start) ||
      start < 2 ||
      start > 10 ||
      !isPartLengths(progression.end) ||
      progression.end.some(
        (length) => length < start,
      )
    ) {
      throw new Error(
        `data/trial-rules.json: ${id}.selection.normal.partLengthProgression is invalid`,
      );
    }
  }
  const boss = selection.boss;
  if (
    !isPartLengths(boss.partLengths) ||
    !isFiniteNumber(boss.answerCount) ||
    !Number.isInteger(boss.answerCount) ||
    boss.answerCount < 1 ||
    !Array.isArray(boss.totalParts) ||
    boss.totalParts.length !== 2 ||
    !boss.totalParts.every(isFiniteNumber)
  ) {
    throw new Error(
      `data/trial-rules.json: ${id}.selection.boss is invalid`,
    );
  }
  validatePolicy(id, value.policy);
  if (value.family !== undefined) {
    if (
      !isRecord(value.family) ||
      typeof value.family.id !== "string" ||
      !isFiniteNumber(value.family.weight) ||
      !isFiniteNumber(value.family.variantWeight)
    ) {
      throw new Error(
        `data/trial-rules.json: ${id}.family is invalid`,
      );
    }
  }
}

export function parseTrialRulesData(value: unknown): TrialRulesData {
  if (
    !isRecord(value) ||
    value.version !== 3 ||
    !Array.isArray(value.stageStars) ||
    value.stageStars.length !== 7 ||
    !value.stageStars.every(
      (stars) =>
        Array.isArray(stars) &&
        stars.length > 0 &&
        stars.every(
          (star) =>
            Number.isInteger(star) &&
            star >= 0 &&
            star <= 3,
        ),
    ) ||
    !isRecord(value.rules)
  ) {
    throw new Error("data/trial-rules.json: invalid v3 document");
  }
  for (const [id, rule] of Object.entries(value.rules)) {
    validateRule(id, rule);
  }
  for (const stars of value.stageStars) {
    for (const star of stars) {
      const hasRule = Object.values(value.rules).some(
        (rule) =>
          isRecord(rule) && rule.stars === star,
      );
      if (!hasRule) {
        throw new Error(
          `data/trial-rules.json: no rule for stage star ${star}`,
        );
      }
    }
  }
  return value as unknown as TrialRulesData;
}

export async function loadTrialRules(
  baseUrl: string,
): Promise<TrialRulesData> {
  const response = await fetch(
    new URL("data/trial-rules.json", baseUrl),
  );
  if (!response.ok) {
    throw new Error(
      `data/trial-rules.json: HTTP ${response.status}`,
    );
  }
  return parseTrialRulesData(await response.json());
}
