import type {
  GameData,
  GameSettings,
} from "./data";
import type { CrisLedger } from "./cris";
import {
  chooseTrialStageRuleIds,
  FALLBACK_TRIAL_RULE,
  trialRulePromptMode,
  type TrialRuleDefinition,
  type TrialRulesData,
} from "./trial-rules";
import {
  balanceChallengeClassProbabilities,
  shuffleQuestionParts,
} from "./session";
import {
  acceptedPinyinFor,
  displayPinyinFor,
  normalizePinyinInput,
  type PinyinData,
} from "./pinyin";
import type { TraditionalData } from "./traditional";
import type {
  GestaltData,
  GestaltPair,
} from "./gestalt";
import type {
  CompositionData,
  CompositionWordEntry,
} from "./composition";
import type { AssonanceData } from "./assonance";
import type { WordAnswerData } from "./word-answers";
import {
  trialAdvancementConfig,
  trialAdvancementTimeMultiplier,
  type TrialAdvancementConfig,
} from "./trial-advancement";

export const TRIAL_STAGE_COUNT = 7;
export const TRIAL_NORMAL_SECONDS = 30;
export const TRIAL_BOSS_SECONDS = 90;
export const TRIAL_BOSS_CHAR_MIN_PARTS = 2;
export const TRIAL_BOSS_CHAR_MAX_PARTS = 6;
export const TRIAL_BOSS_MIN_PARTS = 6;
export const TRIAL_BOSS_MAX_PARTS = 8;
const TRIAL_BOSS_LENGTH_WEIGHTS: Record<number, number> = {
  2: 0.12,
  3: 0.42,
  4: 0.23,
  5: 0.17,
  6: 0.06,
};
const TRIAL_RECENT_LONG_CHARS_KEY =
  "zigsaw.trial.inspissation.recentLongChars";
const TRIAL_RECENT_LONG_CHARS_LIMIT = 12;
let recentLongCharsFallback: string[] = [];

export const TRIAL_BASE_PART_PROBABILITIES = {
  two: 0.15,
  three: 0.42,
  four: 0.23,
  longer: 0.2,
} as const;

export const TRIAL_NORMAL_PART_WEIGHTS: Record<number, number> = {
  2: 15,
  3: 42,
  4: 23,
  5: 8,
  6: 6,
  7: 3,
  8: 2,
  9: 1,
  10: 0.5,
};

export const TRIAL_OUTLAND_PART_WEIGHTS =
  TRIAL_NORMAL_PART_WEIGHTS;

export function trialSkipBudgetWithoutSpending(
  stage: number,
  advancement = 0,
): number {
  const config = trialAdvancementConfig(advancement);
  return (
    config.initialSkips +
    Math.floor(
      (Math.max(1, stage) - 1) /
        config.skipGrantEveryStages,
    )
  );
}

export type TrialPhase =
  | "stage-intro"
  | "playing"
  | "boss"
  | "results";

export type TrialFeedback =
  | ""
  | "correct"
  | "wrong"
  | "paused"
  | "partial";

export type TrialCardSource =
  | "answer"
  | "decoy"
  | "inherited"
  | "wildcard";

export interface TrialCard {
  uid: number;
  symbolId: number;
  source: TrialCardSource;
  components?: number[];
  remainingComponents?: number[];
  quantity?: number;
  remainingQuantity?: number;
  groupColor?: number;
  obscuredAtMs?: number;
  obscured?: boolean;
  mustIgnore?: boolean;
  displayGlyph?: string;
  attachedComponents?: number[];
  displayMode?:
    | "component"
    | "compound"
    | "attached"
    | "overlay"
    | "quantity"
    | "obscured"
    | "wildcard";
  reductionPart?: boolean;
}

export interface TrialQuestionState {
  char: string;
  displayChar?: string;
  expandedComponent?: number;
  accepted: string[];
  pinyin: string;
  answerWay: number[];
  displayCards: TrialCard[];
  repetendUses?: Record<string, number[]>;
}

export interface TrialHistoryAnswer {
  char: string;
  displayChar?: string;
  expandedComponent?: number;
  answerWay: number[];
  displayCards: TrialCard[];
  meta: string;
  pinyin?: string;
}

export interface TrialHistoryItem {
  stage: number;
  ruleId: string;
  slot: number;
  kind: "normal" | "boss";
  answerWay: number[];
  displayCards: TrialCard[];
  answerDetails: TrialHistoryAnswer[];
  parts: string[];
  displayParts: string[];
  displaySymbolIds: number[];
  answer: string;
  given: string;
  ok: boolean;
  meta: string;
}

export interface TrialBossState {
  cards: TrialCard[];
  initialCards: TrialCard[];
  expectedAnswers: string[];
  expectedDisplayChars: string[];
  expectedPinyin: string[];
  expectedWays: number[][];
  displayWays: number[][];
  expandedComponents: number[];
  inheritedSources?: number[];
  revealAnswers?: string[];
  gestaltGroups?: Array<{
    cardIds: number[];
    answers: string[];
  }>;
  acceptedWords?: string[];
  pendingAnswers: string[];
  pendingSubmissions: TrialBossSubmission[];
  pendingAnswer: string;
  pendingCardIds: number[];
  consumedCardIds: number[];
  submissionCount: number;
}

export interface FugueSlotState {
  id: "left" | "right";
  mode: "normal" | "boss" | "done";
  current: TrialQuestionState | null;
  boss: TrialBossState | null;
  remaining: number;
  timeLimit: number;
  feedback: TrialFeedback;
  revealing: boolean;
  questionNumber: number | null;
}

export interface FugueState {
  slots: [FugueSlotState, FugueSlotState];
  queueRemaining: number;
}

export interface TrialCardComponentUse {
  cardUid: number;
  symbolId: number;
  wildcard?: boolean;
  inherited?: boolean;
  sourceIndex?: number;
}

interface TrialBossSubmission {
  answer: string;
  cardIds: number[];
  componentUses: TrialCardComponentUse[];
}

interface TrialBossAssignment {
  remainingCards: TrialCard[];
  submissions: TrialBossSubmission[];
}

interface OutlandCompositeOption {
  glyph: string;
  attached: number[];
}

interface OutlandAttachment {
  cardIndex: number;
  option: OutlandCompositeOption;
}

interface HallraumBagEntry {
  components: number[];
  directAnswers: string[];
  acceptedAnswers: string[];
}

interface HallraumStep {
  char: string;
  way: number[];
  inheritedSlot: number | null;
  acceptedAnswers: string[];
}

interface HallraumBossPlan {
  chars: [string, string];
  ways: [number[], number[]];
  inheritedSlots: [number, number];
}

interface FugueQuestionPlan {
  char: string;
  way: number[];
  accepted: string[];
}

interface FugueBossPlan {
  chars: [string, string];
  ways: [number[], number[]];
  acceptedPairs: Set<string>;
  submissionChars: Set<string>;
}

export function orderedBossAnswerChars(
  boss: TrialBossState,
  submittedOnly = false,
): string[] {
  const submitted = boss.pendingSubmissions.map(
    (submission) => submission.answer,
  );
  if (submittedOnly) {
    return submitted;
  }
  if (boss.revealAnswers?.length) {
    return [...boss.revealAnswers];
  }
  return [...boss.expectedAnswers];
}

export interface TrialPoolAvailabilityOptions {
  normalPartLengths?: readonly number[];
  bossPartLengths?: readonly number[];
  bossAnswerCount?: number;
  bossTotalParts?: readonly [number, number];
  acceptWay?: (
    char: string,
    way: readonly number[],
  ) => boolean;
  acceptNormalWay?: (
    char: string,
    way: readonly number[],
  ) => boolean;
  acceptBossWay?: (
    char: string,
    way: readonly number[],
  ) => boolean;
}

export interface TrialPoolLengthBucket {
  length: number;
  chars: number;
  ways: number;
}

export interface TrialPoolAvailability {
  normal: {
    required: number;
    chars: number;
    ways: number;
    byLength: TrialPoolLengthBucket[];
    sufficient: boolean;
  };
  boss: {
    answerCount: number;
    totalPartsMin: number;
    totalPartsMax: number;
    lengthCombinations: number[][];
    sufficient: boolean;
  };
  ready: boolean;
}

export interface TrialResultState {
  title:
    | "知我梦中"
    | "雾径得津"
    | "覆鹿遗蕉"
    | "临歧何反";
  cleared: boolean;
  reachedStage: number;
  correctCount: number;
  averageQuestionSeconds: number;
  crisEarned: number;
  unlockedAdvancement?: number;
}

export interface TrialState {
  phase: TrialPhase;
  stage: number;
  ruleId: string;
  forcedRuleId: string | null;
  questionsPerStage: number;
  partLengthPlan: number[];
  questionInStage: number;
  skipsRemaining: number;
  skipsUsed: number;
  timeLimit: number;
  remaining: number;
  paused: boolean;
  revealing: boolean;
  feedback: TrialFeedback;
  draft: string;
  current: TrialQuestionState | null;
  boss: TrialBossState | null;
  fugue?: FugueState;
  revealAnswer: string;
  revealPinyin: string[];
  revealMeta: string;
  history: TrialHistoryItem[];
  result: TrialResultState | null;
}

export type TrialSessionEvent =
  | "state"
  | "tick"
  | "rule"
  | "obscure";
type TrialListener = (
  state: TrialState,
  event: TrialSessionEvent,
) => void;

interface TrialChoice {
  char: string;
  ways: number[][];
  displayChar?: string;
  displayWay?: number[];
  expandedComponent?: number;
  reduction?: {
    sourceIndex: number;
    parts: [number, number];
  };
  prefabrication?: {
    indices: [number, number];
    glyph: string;
  };
  overlay?: {
    indices: [number, number];
  };
  repetend?: boolean;
  composition?: {
    word: string;
    recipes: number[][][];
    acceptedWords: string[];
  };
  assonance?: {
    word: string;
    recipes: number[][][];
    acceptedWords: string[];
  };
  dissonance?: {
    word: string;
    recipes: number[][][];
    acceptedWords?: string[];
  };
  hallraum?: {
    inheritedSlot: number | null;
  };
  gestaltPair?: GestaltPair;
  wildcardIndex?: number;
  wildcardAnswers?: string[];
}

const shuffle = <T>(items: T[], random: () => number): T[] => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [
      result[swapIndex],
      result[index],
    ];
  }
  return result;
};

const pickRandom = <T>(items: T[], random: () => number): T =>
  items[Math.floor(random() * items.length)];

const pickWeighted = <T>(
  items: T[],
  weightFor: (item: T) => number,
  random: () => number,
): T => {
  const weights = items.map((item) => Math.max(0, weightFor(item)));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let target = random() * total;
  for (let index = 0; index < items.length; index += 1) {
    target -= weights[index];
    if (target <= 0) {
      return items[index];
    }
  }
  return items[items.length - 1];
};

function loadRecentLongChars(): string[] {
  try {
    const stored = localStorage.getItem(
      TRIAL_RECENT_LONG_CHARS_KEY,
    );
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return parsed
          .filter(
            (char): char is string =>
              typeof char === "string" && char.length > 0,
          )
          .slice(-TRIAL_RECENT_LONG_CHARS_LIMIT);
      }
    }
  } catch {
    // Fall back to page-memory history.
  }
  return [...recentLongCharsFallback];
}

function saveRecentLongChars(chars: string[]): void {
  recentLongCharsFallback = [
    ...chars,
  ].slice(-TRIAL_RECENT_LONG_CHARS_LIMIT);
  try {
    localStorage.setItem(
      TRIAL_RECENT_LONG_CHARS_KEY,
      JSON.stringify(recentLongCharsFallback),
    );
  } catch {
    // Page-memory history still prevents immediate repeats.
  }
}

const cardsForMask = (
  cards: TrialCard[],
  mask: number,
): TrialCard[] =>
  cards.filter((_, index) => (mask & (1 << index)) !== 0);

export function hallraumComponentDiversityWeight(
  components: readonly number[],
  previousWay: readonly number[],
  inheritedSymbol: number | null,
): number {
  if (previousWay.length === 0) {
    return 1;
  }
  const previousCounts = new Map<number, number>();
  for (const symbolId of previousWay) {
    previousCounts.set(
      symbolId,
      (previousCounts.get(symbolId) ?? 0) + 1,
    );
  }
  if (inheritedSymbol !== null) {
    const count = previousCounts.get(inheritedSymbol) ?? 0;
    if (count <= 1) {
      previousCounts.delete(inheritedSymbol);
    } else {
      previousCounts.set(inheritedSymbol, count - 1);
    }
  }
  let inheritedRemoved = false;
  const visible = new Set<number>();
  for (const symbolId of components) {
    if (
      inheritedSymbol !== null &&
      !inheritedRemoved &&
      symbolId === inheritedSymbol
    ) {
      inheritedRemoved = true;
      continue;
    }
    visible.add(symbolId);
  }
  let overlap = 0;
  for (const symbolId of visible) {
    if (previousCounts.has(symbolId)) {
      overlap += 1;
    }
  }
  if (overlap === 0) {
    return 10;
  }
  if (overlap === 1) {
    return 1.5;
  }
  if (overlap === 2) {
    return 0.25;
  }
  return 0.05;
}

const TRIAL_CRIS_BASE_REWARDS = [100, 150, 180, 220, 280];
const TRIAL_CRIS_PROGRESS_FACTORS = [
  0,
  0,
  0.03,
  0.08,
  0.18,
  0.32,
  0.5,
  1,
];

export interface TrialCrisRewardInput {
  advancement: number;
  clearedStages: number;
  cleared: boolean;
  perfect: boolean;
}

export function calculateTrialCrisReward({
  advancement,
  clearedStages,
  cleared,
  perfect,
}: TrialCrisRewardInput): number {
  const advancementIndex = Math.min(
    TRIAL_CRIS_BASE_REWARDS.length - 1,
    Math.max(0, Math.round(advancement)),
  );
  const base = TRIAL_CRIS_BASE_REWARDS[advancementIndex];
  const progressFactor = cleared
    ? 1
    : TRIAL_CRIS_PROGRESS_FACTORS[
        Math.min(
          6,
          Math.max(0, Math.floor(clearedStages)),
        )
      ];
  const perfectMultiplier =
    cleared && perfect ? 1.2 : 1;
  return Math.max(
    0,
    Math.round(base * progressFactor * perfectMultiplier),
  );
}

export class TrialSession {
  readonly state: TrialState;
  private readonly data: GameData;
  private readonly random: () => number;
  private readonly advancement: TrialAdvancementConfig;
  private readonly includeSupplementaryChars: boolean;
  private readonly pausePenalty: boolean;
  private readonly crisLedger: CrisLedger | null;
  private readonly rules: TrialRulesData | null;
  private readonly stageRuleIds: string[];
  private pinyin: PinyinData | null;
  private traditional: TraditionalData | null;
  private gestalt: GestaltData | null;
  private composition: CompositionData | null;
  private assonance: AssonanceData | null;
  private wordAnswers: WordAnswerData | null;
  private readonly onEncounter: (
    char: string,
    way: number[],
  ) => void;
  private readonly onChange: TrialListener;
  private readonly choicesByLength = new Map<
    number,
    Map<string, TrialChoice>
  >();
  private readonly traditionalChoicesByLength = new Map<
    number,
    TrialChoice[]
  >();
  private readonly symbolIdByName = new Map<
    string,
    number
  >();
  private readonly wildcardOptionCache = new Map<
    string,
    Array<{ index: number; answers: string[] }>
  >();
  private readonly wildcardAcceptedCache = new Map<
    string,
    Set<string>
  >();
  private readonly gestaltPairMap = new Map<
    string,
    GestaltPair
  >();
  private readonly compositionWordIndex = new Map<
    string,
    string[]
  >();
  private readonly compositionAcceptedCache = new Map<
    string,
    string[]
  >();
  private readonly assonanceAcceptedCache = new Map<
    string,
    string[]
  >();
  private readonly answerWordFirstIndex = new Map<
    string,
    string[]
  >();
  private readonly answerWordCharIndex = new Map<
    string,
    string[]
  >();
  private readonly answerCharacters = new Set<string>();
  private readonly outlandCompositeIndexes = new Map<
    string,
    Map<string, OutlandCompositeOption[]>
  >();
  private hallraumBagsByLength: Map<
    number,
    HallraumBagEntry[]
  > | null = null;
  private hallraumBagsByLengthAndSymbol = new Map<
    string,
    HallraumBagEntry[]
  >();
  private hallraumAcceptedAnswerBags = new Map<
    string,
    Set<string>
  >();
  private hallraumUnknownBlackCache = new Map<
    string,
    number[]
  >();
  private hallraumSteps: HallraumStep[] = [];
  private hallraumBossPlan: HallraumBossPlan | null = null;
  private fugueQuestions: FugueQuestionPlan[] = [];
  private fugueQuestionIndex = 0;
  private fugueBossPlans: [FugueBossPlan, FugueBossPlan] | null =
    null;
  private fugueDeadlines: [number, number] = [0, 0];
  private fugueAdvanceIds: [
    ReturnType<typeof setTimeout> | null,
    ReturnType<typeof setTimeout> | null,
  ] = [null, null];
  private fugueStageAdvanceId:
    | ReturnType<typeof setTimeout>
    | null = null;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private advanceId: ReturnType<typeof setTimeout> | null = null;
  private deadline = 0;
  private questionRunStartedAt: number | null = null;
  private questionElapsedMs = 0;
  private totalQuestionTimeMs = 0;
  private timedQuestionCount = 0;
  private sharedTimeRemaining: number | null = null;
  private currentRecorded = false;
  private usedStageChars = new Set<string>();
  private usedStageBags = new Set<string>();
  private usedReductionSources = new Set<number>();
  private usedPrefabricationHints = new Set<string>();
  private cardUid = 0;

  constructor(
    data: GameData,
    settings: GameSettings,
    onChange: TrialListener,
    random: () => number = Math.random,
    pausePenalty = false,
    onEncounter: (char: string, way: number[]) => void = () => {},
    crisLedger: CrisLedger | null = null,
    rules: TrialRulesData | null = null,
    pinyin: PinyinData | null = null,
    traditional: TraditionalData | null = null,
    gestalt: GestaltData | null = null,
    composition: CompositionData | null = null,
    assonance: AssonanceData | null = null,
    wordAnswers: WordAnswerData | null = null,
  ) {
    this.data = data;
    this.random = random;
    this.advancement = trialAdvancementConfig(
      settings.trialAdvancement,
    );
    this.onChange = onChange;
    this.includeSupplementaryChars =
      settings.includeSupplementaryChars;
    this.pausePenalty = pausePenalty;
    this.onEncounter = onEncounter;
    this.crisLedger = crisLedger;
    this.rules = rules;
    this.stageRuleIds = rules
      ? chooseTrialStageRuleIds(rules, this.random)
      : Array.from(
          { length: TRIAL_STAGE_COUNT },
          () => FALLBACK_TRIAL_RULE.id,
        );
    this.pinyin = pinyin;
    this.traditional = traditional;
    this.gestalt = gestalt;
    this.composition = composition;
    this.assonance = assonance;
    this.wordAnswers = wordAnswers;
    for (const ways of data.ways.values()) {
      for (const way of ways) {
        for (const symbolId of way) {
          const component = data.component(symbolId);
          if (!this.symbolIdByName.has(component.name)) {
            this.symbolIdByName.set(
              component.name,
              symbolId,
            );
          }
        }
      }
    }
    this.state = {
      phase: "stage-intro",
      stage: 1,
      ruleId: this.stageRuleIds[0],
      forcedRuleId: null,
      questionsPerStage:
        this.advancement.normalQuestionsPerStage,
      partLengthPlan: [],
      questionInStage: 0,
      skipsRemaining: this.advancement.initialSkips,
      skipsUsed: 0,
      timeLimit: 0,
      remaining: 0,
      paused: false,
      revealing: false,
      feedback: "",
      draft: "",
      current: null,
      boss: null,
      revealAnswer: "",
      revealPinyin: [],
      revealMeta: "",
      history: [],
      result: null,
    };
    this.buildChoices();
    this.buildTraditionalChoices();
    this.buildGestaltPairMap();
    this.buildCompositionWordIndex();
    this.buildAnswerWordIndexes();
  }

  beginStage(): void {
    if (this.state.phase !== "stage-intro") {
      return;
    }
    const rule = this.activeRule();
    if (!this.inspectStagePool().ready) {
      throw new Error(
        `Stage ${this.state.stage} has no compatible trial questions.`,
      );
    }
    this.usedStageChars.clear();
    this.usedStageBags.clear();
    this.usedReductionSources.clear();
    this.usedPrefabricationHints.clear();
    this.hallraumSteps = [];
    this.hallraumBossPlan = null;
    this.clearFugueTimers();
    this.fugueQuestions = [];
    this.fugueQuestionIndex = 0;
    this.fugueBossPlans = null;
    if ((rule.policy.prompt.normal.inheritedCards ?? 0) > 0) {
      this.buildHallraumChain();
    }
    this.sharedTimeRemaining =
      rule.timing.sharedBudgetSeconds === undefined
        ? null
        : this.timedSeconds(
            rule.timing.sharedBudgetSeconds,
            1,
            rule,
          );
    this.state.partLengthPlan =
      this.buildPartLengthPlan(rule);
    this.state.ruleId = rule.id;
    this.state.phase = "playing";
    this.state.questionInStage = 1;
    if (rule.id === "fugue") {
      this.buildFugueStage();
      this.state.current = null;
      this.state.boss = null;
      this.state.revealing = false;
      this.state.feedback = "";
      this.state.draft = "";
      this.startFugueTimer();
      this.emit();
      return;
    }
    this.showNormalQuestion();
  }

  private grantSkipForCompletedStage(
    completedStage: number,
  ): void {
    if (
      completedStage %
        this.advancement.skipGrantEveryStages ===
      0
    ) {
      this.state.skipsRemaining += 1;
    }
  }

  setDraft(value: string): void {
    this.state.draft = value;
    if (this.state.feedback === "wrong") {
      this.state.feedback = "";
    }
    if (this.state.fugue) {
      for (const slot of this.state.fugue.slots) {
        if (slot.feedback === "wrong") {
          slot.feedback = "";
        }
      }
    }
  }

  setPinyinData(pinyin: PinyinData): void {
    this.pinyin = pinyin;
  }

  setTraditionalData(traditional: TraditionalData): void {
    this.traditional = traditional;
    this.buildTraditionalChoices();
  }

  setGestaltData(gestalt: GestaltData): void {
    this.gestalt = gestalt;
    this.buildGestaltPairMap();
  }

  setCompositionData(composition: CompositionData): void {
    this.composition = composition;
    this.buildCompositionWordIndex();
  }

  setAssonanceData(assonance: AssonanceData): void {
    this.assonance = assonance;
    this.assonanceAcceptedCache.clear();
  }

  setWordAnswerData(wordAnswers: WordAnswerData): void {
    this.wordAnswers = wordAnswers;
    this.compositionAcceptedCache.clear();
    this.assonanceAcceptedCache.clear();
    this.buildAnswerWordIndexes();
  }

  setRuleOverride(ruleId: string | null): void {
    if (this.state.phase !== "stage-intro") {
      return;
    }
    if (ruleId === null) {
      this.state.forcedRuleId = null;
      this.state.ruleId = this.activeRule(
        this.state.stage,
      ).id;
      this.emit("rule");
      return;
    }
    const rule = this.rules?.rules[ruleId];
    if (!rule) {
      throw new Error(`Unknown trial rule: ${ruleId}`);
    }
    this.state.forcedRuleId = ruleId;
    this.state.ruleId = ruleId;
    this.emit("rule");
  }

  togglePause(): void {
    if (
      this.state.phase === "stage-intro" ||
      this.state.phase === "results" ||
      this.state.revealing
    ) {
      return;
    }
    if (this.state.fugue) {
      if (!this.state.paused) {
        this.freezeFugueTimers();
        if (this.pausePenalty) {
          for (const slot of this.state.fugue.slots) {
            if (
              slot.mode !== "done" &&
              !slot.revealing
            ) {
              slot.remaining = Math.max(
                1,
                Math.ceil(slot.remaining / 2),
              );
            }
          }
        }
        this.state.paused = true;
        this.state.feedback = "paused";
      } else {
        this.resumeFugueTimers();
        this.state.paused = false;
        this.state.feedback = "";
      }
      this.emit();
      return;
    }
    if (!this.state.paused) {
      const remaining = this.remainingSeconds();
      if (this.questionRunStartedAt !== null) {
        this.questionElapsedMs +=
          performance.now() - this.questionRunStartedAt;
        this.questionRunStartedAt = null;
      }
      this.syncObscuredCards(performance.now());
      this.clearTimer();
      const rulePausePenalty =
        this.activeRule().timing.pausePenaltySeconds;
      this.state.remaining =
        rulePausePenalty !== undefined
          ? Math.max(0, remaining - rulePausePenalty)
          : this.pausePenalty
            ? Math.max(1, Math.ceil(remaining / 2))
            : remaining;
      if (
        this.activeRule().timing.sharedBudgetSeconds !==
        undefined
      ) {
        this.sharedTimeRemaining = this.state.remaining;
      }
      this.state.paused = true;
      this.state.feedback = "paused";
    } else {
      this.state.paused = false;
      this.state.feedback = "";
      this.startTimer();
    }
    this.emit();
  }

  submit(): void {
    if (
      this.state.paused ||
      (!this.state.fugue && this.state.revealing) ||
      !this.state.draft.trim()
    ) {
      return;
    }
    if (this.state.fugue) {
      this.submitFugue();
      return;
    }
    if (this.state.phase === "playing") {
      this.submitNormal();
    } else if (this.state.phase === "boss") {
      this.submitBoss();
    }
  }

  undoBossAnswer(index = -1): void {
    if (
      this.state.phase !== "boss" ||
      !this.state.boss ||
      this.state.boss.pendingSubmissions.length === 0 ||
      this.state.revealing
    ) {
      return;
    }
    const resolvedIndex =
      index < 0
        ? this.state.boss.pendingSubmissions.length - 1
        : index;
    this.state.boss.pendingSubmissions.splice(
      resolvedIndex,
      1,
    );
    this.state.boss.pendingAnswers =
      this.state.boss.pendingSubmissions.map(
        (submission) => submission.answer,
      );
    this.state.boss.pendingAnswer =
      this.state.boss.pendingAnswers.join("");
    this.state.boss.pendingCardIds =
      this.state.boss.pendingSubmissions.flatMap(
        (submission) => submission.cardIds,
      );
    let cards = this.state.boss.initialCards.map((card) => ({
      ...card,
      ...(card.components
        ? {
            remainingComponents: [...card.components],
            ...(card.displayMode === "quantity"
              ? {
                  remainingQuantity:
                    card.components.length,
                }
              : {}),
          }
        : {}),
    }));
    for (const submission of this.state.boss
      .pendingSubmissions) {
      cards = this.consumeBossComponentUses(
        cards,
        submission.componentUses,
      );
    }
    this.state.boss.cards = cards;
    this.state.boss.consumedCardIds =
      this.consumedBossCardIds(cards);
    this.state.boss.submissionCount =
      this.state.boss.pendingSubmissions.length;
    this.state.feedback = "";
    this.state.draft = "";
    this.emit();
  }

  settleAfterMiss(): void {
    if (
      !this.state.revealing ||
      this.state.feedback !== "wrong" ||
      (this.state.phase !== "playing" &&
        this.state.phase !== "boss")
    ) {
      return;
    }
    this.finish(false);
  }

  continueAfterMiss(): void {
    if (
      !this.state.revealing ||
      this.state.feedback !== "wrong" ||
      (this.state.phase !== "playing" &&
        this.state.phase !== "boss")
    ) {
      return;
    }
    if (this.state.phase === "playing") {
      if (
        this.state.questionInStage >=
        this.state.questionsPerStage
      ) {
        this.startBoss();
      } else {
        this.state.questionInStage += 1;
        this.showNormalQuestion();
      }
      return;
    }
    this.advanceFromBoss(false);
  }

  reviveWithSkip(): void {
    if (
      !this.state.revealing ||
      this.state.feedback !== "wrong" ||
      (this.state.phase !== "playing" &&
        this.state.phase !== "boss") ||
      this.state.skipsRemaining <= 0 ||
      this.activeRule().allowSkip === false
    ) {
      return;
    }
    const failed = this.state.history.at(-1);
    const expectedSlot =
      this.state.phase === "boss"
        ? this.state.questionsPerStage + 1
        : this.state.questionInStage;
    if (
      failed &&
      !failed.ok &&
      failed.stage === this.state.stage &&
      failed.slot === expectedSlot
    ) {
      this.state.history.pop();
    }
    this.state.skipsRemaining -= 1;
    this.state.skipsUsed += 1;
    if (this.state.phase === "playing") {
      this.showNormalQuestion();
    } else {
      this.startBoss();
    }
  }

  settleAtStageIntro(): void {
    if (
      this.state.phase !== "stage-intro" ||
      this.state.stage <= 1
    ) {
      return;
    }
    this.finish(false, "临歧何反");
  }

  skipQuestion(): void {
    if (
      (this.state.phase !== "playing" &&
        this.state.phase !== "boss") ||
      this.state.paused ||
      this.state.revealing ||
      this.state.skipsRemaining <= 0 ||
      this.activeRule().allowSkip === false
    ) {
      return;
    }
    this.state.skipsRemaining -= 1;
    this.state.skipsUsed += 1;
    if (this.state.phase === "playing") {
      this.showNormalQuestion();
    } else {
      this.startBoss();
    }
  }

  surrender(): void {
    if (
      this.state.phase === "stage-intro" ||
      this.state.phase === "results" ||
      this.state.revealing
    ) {
      return;
    }
    if (this.state.fugue) {
      this.surrenderFugue();
      return;
    }
    if (this.state.phase === "playing") {
      this.recordNormal(false);
    } else if (this.state.phase === "boss") {
      this.recordBoss(false);
    }
    this.revealMiss();
  }

  destroy(): void {
    this.clearFugueTimers();
    this.clearTimers();
  }

  private emit(event: TrialSessionEvent = "state"): void {
    this.onChange(this.state, event);
  }

  inspectPool(
    options: TrialPoolAvailabilityOptions = {},
  ): TrialPoolAvailability {
    const acceptWay =
      options.acceptWay ?? (() => true);
    const acceptNormalWay =
      options.acceptNormalWay ?? acceptWay;
    const acceptBossWay =
      options.acceptBossWay ?? acceptWay;
    const requestedNormalLengths = [
      ...new Set(
        options.normalPartLengths ??
          [...this.choicesByLength.keys()],
      ),
    ].sort((left, right) => left - right);
    const requestedBossLengths = [
      ...new Set(
        options.bossPartLengths ?? [2, 3, 4, 5, 6],
      ),
    ].sort((left, right) => left - right);
    const bucketLengths = [
      ...new Set([
        ...requestedNormalLengths,
        ...requestedBossLengths,
      ]),
    ].sort((left, right) => left - right);
    const normalFilteredByLength = new Map<
      number,
      TrialChoice[]
    >();
    const bossFilteredByLength = new Map<
      number,
      TrialChoice[]
    >();
    const buckets: TrialPoolLengthBucket[] = [];
    const normalChars = new Set<string>();
    let normalWays = 0;

    for (const length of bucketLengths) {
      const lengthChoices =
        this.choicesByLength.get(length) ??
        new Map<string, TrialChoice>();
      const choices = [...lengthChoices.values()]
        .map((choice) => ({
          char: choice.char,
          ways: choice.ways.filter((way) =>
            acceptNormalWay(choice.char, way),
          ),
        }))
        .filter((choice) => choice.ways.length > 0);
      normalFilteredByLength.set(length, choices);
      const bossChoices = [...lengthChoices.values()]
        .map((choice) => ({
          char: choice.char,
          ways: choice.ways.filter((way) =>
            acceptBossWay(choice.char, way),
          ),
        }))
        .filter((choice) => choice.ways.length > 0);
      bossFilteredByLength.set(length, bossChoices);
    }

    for (const length of requestedNormalLengths) {
      const choices =
        normalFilteredByLength.get(length) ?? [];
      const chars = new Set(
        choices.map((choice) => choice.char),
      );
      const ways = choices.reduce(
        (total, choice) => total + choice.ways.length,
        0,
      );
      chars.forEach((char) => normalChars.add(char));
      normalWays += ways;
      buckets.push({
        length,
        chars: chars.size,
        ways,
      });
    }

    const answerCount = Math.max(
      1,
      Math.floor(options.bossAnswerCount ?? 2),
    );
    const [totalPartsMin, totalPartsMax] =
      options.bossTotalParts ?? [6, 8];
    const bossLengths = requestedBossLengths
      .filter(
        (length) =>
          (bossFilteredByLength.get(length)?.length ??
            0) > 0,
      )
      .sort((left, right) => left - right);
    const canAssignDistinctChars = (
      lengths: number[],
    ): boolean => {
      const used = new Set<string>();
      const assign = (index: number): boolean => {
        if (index >= lengths.length) {
          return true;
        }
        const choices =
          bossFilteredByLength.get(lengths[index]) ?? [];
        for (const choice of choices) {
          if (used.has(choice.char)) {
            continue;
          }
          used.add(choice.char);
          if (assign(index + 1)) {
            return true;
          }
          used.delete(choice.char);
        }
        return false;
      };
      return assign(0);
    };
    const lengthCombinations: number[][] = [];
    const walkLengths = (
      startIndex: number,
      remaining: number,
      sum: number,
      current: number[],
    ): void => {
      if (remaining === 0) {
        if (
          sum >= totalPartsMin &&
          sum <= totalPartsMax &&
          canAssignDistinctChars(current)
        ) {
          lengthCombinations.push([...current]);
        }
        return;
      }
      for (
        let index = startIndex;
        index < bossLengths.length;
        index += 1
      ) {
        const length = bossLengths[index];
        const nextSum = sum + length;
        if (nextSum > totalPartsMax) {
          continue;
        }
        current.push(length);
        walkLengths(
          index,
          remaining - 1,
          nextSum,
          current,
        );
        current.pop();
      }
    };
    walkLengths(0, answerCount, 0, []);

    const normalSufficient =
      normalChars.size >= this.state.questionsPerStage &&
      normalWays >= this.state.questionsPerStage;
    const bossSufficient = lengthCombinations.length > 0;
    return {
      normal: {
        required: this.state.questionsPerStage,
        chars: normalChars.size,
        ways: normalWays,
        byLength: buckets,
        sufficient: normalSufficient,
      },
      boss: {
        answerCount,
        totalPartsMin,
        totalPartsMax,
        lengthCombinations,
        sufficient: bossSufficient,
      },
      ready: normalSufficient && bossSufficient,
    };
  }

  private makeCard(
    symbolId: number,
    source: TrialCardSource = "answer",
  ): TrialCard {
    return {
      uid: this.cardUid++,
      symbolId,
      source,
    };
  }

  private makePrefabricatedCard(
    first: number,
    second: number,
    glyph: string,
  ): TrialCard {
    return {
      uid: this.cardUid++,
      symbolId: first,
      source: "answer",
      components: [first, second],
      remainingComponents: [first, second],
      displayGlyph: glyph,
      displayMode: "compound",
    };
  }

  private makeOverlayCard(
    first: number,
    second: number,
  ): TrialCard {
    return {
      uid: this.cardUid++,
      symbolId: first,
      source: "answer",
      components: [first, second],
      remainingComponents: [first, second],
      displayMode: "overlay",
    };
  }

  private makeWildcardCard(symbolId: number): TrialCard {
    return {
      uid: this.cardUid++,
      symbolId,
      source: "wildcard",
      displayMode: "wildcard",
    };
  }

  private makeQuantityCard(
    symbolId: number,
    quantity: number,
  ): TrialCard {
    return {
      uid: this.cardUid++,
      symbolId,
      source: "answer",
      components: Array.from(
        { length: quantity },
        () => symbolId,
      ),
      remainingComponents: Array.from(
        { length: quantity },
        () => symbolId,
      ),
      quantity,
      remainingQuantity: quantity,
      displayMode: "quantity",
    };
  }

  private cardsWithWildcard(
    components: readonly number[],
    wildcardIndex: number,
  ): TrialCard[] {
    return shuffle(
      components.map((symbolId, index) =>
        index === wildcardIndex
          ? this.makeWildcardCard(symbolId)
          : this.makeCard(symbolId),
      ),
      this.random,
    );
  }

  private cardsWithOverlay(
    components: readonly number[],
    groups: ReadonlyArray<{ indices: [number, number] }>,
  ): TrialCard[] {
    const groupedIndices = new Set<number>();
    const cards: TrialCard[] = groups.map((group) => {
      groupedIndices.add(group.indices[0]);
      groupedIndices.add(group.indices[1]);
      return this.makeOverlayCard(
        components[group.indices[0]],
        components[group.indices[1]],
      );
    });
    components.forEach((symbolId, index) => {
      if (!groupedIndices.has(index)) {
        cards.push(this.makeCard(symbolId));
      }
    });
    return shuffle(cards, this.random);
  }

  private cardsWithPrefabrication(
    components: readonly number[],
    groups: ReadonlyArray<{
      indices: [number, number];
      glyph: string;
    }>,
  ): TrialCard[] {
    const groupedIndices = new Set<number>();
    const cards: TrialCard[] = groups.map((group) => {
      groupedIndices.add(group.indices[0]);
      groupedIndices.add(group.indices[1]);
      return this.makePrefabricatedCard(
        components[group.indices[0]],
        components[group.indices[1]],
        group.glyph,
      );
    });
    components.forEach((symbolId, index) => {
      if (!groupedIndices.has(index)) {
        cards.push(this.makeCard(symbolId));
      }
    });
    return shuffle(cards, this.random);
  }

  private cardsWithRepetition(
    components: readonly number[],
  ): TrialCard[] {
    const counts = this.componentCounts(components);
    return shuffle(
      [...counts.entries()].map(
        ([symbolId, count]) =>
          count > 1
            ? this.makeQuantityCard(symbolId, count)
            : this.makeCard(symbolId),
      ),
      this.random,
    );
  }

  private repetendAcceptedForCards(
    cards: TrialCard[],
  ): Record<string, number[]> {
    const normalComponents = cards
      .filter((card) => card.displayMode !== "quantity")
      .map((card) => card.symbolId);
    const quantities = cards
      .filter((card) => card.displayMode === "quantity")
      .map((card) => ({
        symbolId: card.symbolId,
        maximum: card.quantity ?? card.components?.length ?? 2,
      }));
    const accepted = new Map<string, number[]>();
    const selected: number[] = [];
    const consider = (components: number[]) => {
      const bagKey = this.symbolIdBagKey(components);
      for (const answer of this.data.accepted(components)) {
        const current = accepted.get(answer);
        if (
          !current ||
          components.length < current.length ||
          (components.length === current.length &&
            bagKey < this.symbolIdBagKey(current))
        ) {
          accepted.set(answer, [...components]);
        }
      }
    };
    const visit = (index: number) => {
      if (index >= quantities.length) {
        consider([...normalComponents, ...selected]);
        return;
      }
      const quantity = quantities[index];
      for (
        let count = 2;
        count <= quantity.maximum;
        count += 1
      ) {
        selected.push(
          ...Array.from(
            { length: count },
            () => quantity.symbolId,
          ),
        );
        visit(index + 1);
        selected.splice(selected.length - count, count);
      }
    };
    visit(0);
    return Object.fromEntries(accepted);
  }

  private repetendDisplayCardsForAnswer(
    question: TrialQuestionState,
    answer: string,
  ): TrialCard[] {
    const bag = question.repetendUses?.[answer];
    if (!bag) {
      return question.displayCards;
    }
    const counts = this.componentCounts(bag);
    return question.displayCards.map((card) => {
      if (card.displayMode !== "quantity") {
        return card;
      }
      const count = counts.get(card.symbolId) ?? 0;
      return {
        ...card,
        components: Array.from(
          { length: count },
          () => card.symbolId,
        ),
        remainingComponents: Array.from(
          { length: count },
          () => card.symbolId,
        ),
        quantity: count,
        remainingQuantity: count,
      };
    });
  }

  private compositionCards(
    recipe: number[][],
  ): TrialCard[] {
    return shuffle(
      recipe
        .flat()
        .map((symbolId) => this.makeCard(symbolId)),
      this.random,
    );
  }

  private hallraumCards(
    components: readonly number[],
    inheritedSlot: number | null,
  ): TrialCard[] {
    return shuffle(
      components.map((symbolId, index) => {
        const inherited = index === inheritedSlot;
        const card = this.makeCard(
          symbolId,
          inherited ? "inherited" : "answer",
        );
        if (inherited) {
          card.displayMode = "obscured";
          card.obscured = true;
        }
        return card;
      }),
      this.random,
    );
  }

  private assonanceCards(
    recipe: number[][],
  ): TrialCard[] {
    const counts = new Map<number, number>();
    for (const way of recipe) {
      for (const symbolId of way) {
        counts.set(
          symbolId,
          (counts.get(symbolId) ?? 0) + 1,
        );
      }
    }
    const crossSymbols = new Set(
      [...counts.keys()].filter(
        (symbolId) =>
          recipe.filter((way) =>
            way.includes(symbolId),
          ).length >= 2,
      ),
    );
    const cards: TrialCard[] = [];
    for (const [symbolId, count] of counts) {
      if (crossSymbols.has(symbolId)) {
        cards.push(
          this.makeQuantityCard(symbolId, count),
        );
      } else {
        for (let index = 0; index < count; index += 1) {
          cards.push(this.makeCard(symbolId));
        }
      }
    }
    return shuffle(cards, this.random);
  }

  private dissonanceCards(
    recipe: number[][],
  ): TrialCard[] {
    const counts = new Map<number, number>();
    for (const way of recipe) {
      for (const symbolId of way) {
        counts.set(
          symbolId,
          (counts.get(symbolId) ?? 0) + 1,
        );
      }
    }
    const crossSymbols = new Set(
      [...counts.keys()].filter(
        (symbolId) =>
          recipe.filter((way) =>
            way.includes(symbolId),
          ).length >= 2,
      ),
    );
    return recipe.flatMap((way, characterIndex) =>
      shuffle(
        way.filter(
          (symbolId) => !crossSymbols.has(symbolId),
        ),
        this.random,
      ).map((symbolId) => ({
        ...this.makeCard(symbolId),
        groupColor: characterIndex,
      })),
    );
  }

  private dissonanceAcceptedWords(
    cards: TrialCard[],
    lengths: number[],
  ): string[] {
    if (!this.assonance) {
      return [];
    }
    const assonance = this.assonance;
    const targetKey = this.dissonanceCardsKey(cards);
    const cacheKey = `${lengths.join(",")}|${targetKey}`;
    const cached = this.assonanceAcceptedCache.get(
      `dissonance:${cacheKey}`,
    );
    if (cached) {
      return cached;
    }
    const cardGroups = new Map<number, number[]>();
    for (const card of cards) {
      const group = card.groupColor ?? 0;
      const symbols = cardGroups.get(group) ?? [];
      symbols.push(card.symbolId);
      cardGroups.set(group, symbols);
    }
    const groupCounts = [...cardGroups.values()].map(
      (symbols) => this.componentCounts(symbols),
    );
    const possibleChars = new Set<string>();
    const allChars =
      this.wordAnswers
        ? this.answerCharacters
        : new Set(
            (["2", "3", "4"] as const).flatMap(
              (length) =>
                assonance.words[length].flatMap((word) => [
                  ...word,
                ]),
            ),
          );
    for (const char of allChars) {
      if (
        this.data.expandedDecompositions(char).some((way) => {
          const counts = this.componentCounts(way);
          return groupCounts.some((group) =>
            [...group.entries()].every(
              ([symbolId, count]) =>
                (counts.get(symbolId) ?? 0) >= count,
            ),
          );
        })
      ) {
        possibleChars.add(char);
      }
    }
    const accepted: string[] = [];
    for (const length of lengths) {
      const candidates = this.answerWordsContaining(
        length,
        possibleChars,
        assonance.words[
          String(length) as "2" | "3" | "4"
        ],
      );
      for (const word of candidates) {
        if (
          new Set([...word]).size !== [...word].length
        ) {
          continue;
        }
        if (
          [...word].filter((char) =>
            possibleChars.has(char),
          ).length < groupCounts.length
        ) {
          continue;
        }
        if (
          this.dissonanceWordCanUseCards(word, cards)
        ) {
          accepted.push(word);
        }
      }
    }
    accepted.sort((left, right) =>
      left.localeCompare(right, "zh-CN"),
    );
    this.assonanceAcceptedCache.set(
      `dissonance:${cacheKey}`,
      accepted,
    );
    return accepted;
  }

  private dissonanceWordCanUseCards(
    word: string,
    cards: TrialCard[],
  ): boolean {
    return (
      this.dissonanceGroupAssignment(word, cards) !== null
    );
  }

  private dissonanceNormalWordCanUseCards(
    word: string,
    cards: TrialCard[],
  ): boolean {
    const chars = [...word];
    if (
      chars.length !== 2 ||
      new Set(chars).size !== chars.length
    ) {
      return false;
    }
    const known = this.wordAnswers
      ? (
          this.answerWordFirstIndex.get(
            `2|${chars[0]}`,
          ) ?? []
        ).includes(word)
      : (
          this.assonance?.words["2"] ?? []
        ).includes(word);
    return (
      known &&
      this.dissonanceWordCanUseCards(word, cards)
    );
  }

  private dissonanceGroupAssignment(
    word: string,
    cards: TrialCard[],
  ): number[] | null {
    const maxGroup = Math.max(
      -1,
      ...cards.map((card) => card.groupColor ?? -1),
    );
    const visibleGroups = Array.from(
      { length: maxGroup + 1 },
      (_, group) =>
        cards
          .filter((card) => card.groupColor === group)
          .map((card) => card.symbolId)
          .sort((left, right) => left - right)
          .join(","),
    );
    if (visibleGroups.every((group) => !group)) {
      return null;
    }
    const options = [...word].map((char) =>
      this.data
        .expandedDecompositions(char)
        .filter((way) => way.length >= 1 && way.length <= 10),
    );
    if (options.some((ways) => ways.length === 0)) {
      return null;
    }
    const selected: number[][] = [];
    const search = (index: number): number[] | null => {
      if (index >= options.length) {
        const groups =
          this.dissonanceRecipeGroupKeys(selected);
        const slotCount = Math.max(
          groups.length,
          visibleGroups.length,
        );
        for (
          let charIndex = 0;
          charIndex < slotCount;
          charIndex += 1
        ) {
          const candidate = groups[charIndex];
          if (
            candidate !==
            (visibleGroups[charIndex] ?? "")
          ) {
            return null;
          }
        }
        return groups.map((group, index) =>
          group ? index : -1,
        );
      }
      for (const way of options[index]) {
        selected.push(way);
        const result = search(index + 1);
        if (result) {
          return result;
        }
        selected.pop();
      }
      return null;
    };
    return search(0);
  }

  private dissonanceCardsKey(
    cards: TrialCard[],
  ): string {
    const maxGroup = Math.max(
      -1,
      ...cards.map((card) => card.groupColor ?? -1),
    );
    return Array.from(
      { length: maxGroup + 1 },
      (_, group) =>
        cards
          .filter((card) => card.groupColor === group)
          .map((card) => card.symbolId)
          .sort((left, right) => left - right)
          .join(","),
    ).join("|");
  }

  private dissonanceRecipeGroupKeys(
    recipe: readonly number[][],
  ): string[] {
    const counts = new Map<number, number>();
    for (const way of recipe) {
      for (const symbolId of way) {
        counts.set(
          symbolId,
          (counts.get(symbolId) ?? 0) + 1,
        );
      }
    }
    const crossSymbols = new Set(
      [...counts.keys()].filter(
        (symbolId) =>
          recipe.filter((way) =>
            way.includes(symbolId),
          ).length >= 2,
      ),
    );
    return recipe
      .map((way) =>
        way
          .filter((symbolId) => !crossSymbols.has(symbolId))
          .sort((left, right) => left - right),
      )
      .map((symbols) => symbols.join(","));
  }

  private pickCompositionEntry(
    entries: CompositionWordEntry[],
    lengths: number[],
  ): {
    entry: CompositionWordEntry;
    recipe: number[][];
  } | null {
    const available = entries.filter(
      (entry) =>
        [...entry.word].length >= lengths[0] &&
        [...entry.word].length <= lengths[lengths.length - 1] &&
        [...entry.word].every(
          (char) => !this.usedStageChars.has(char),
        ),
    );
    const pool = available.length > 0 ? available : entries;
    if (pool.length === 0) {
      return null;
    }
    const entry = pickWeighted(
      pool,
      (candidate) => Math.max(0, candidate.weight),
      this.random,
    );
    const recipe =
      pickRandom(entry.recipes, this.random) ?? null;
    return recipe ? { entry, recipe } : null;
  }

  private compositionAcceptedWords(
    cards: TrialCard[],
    lengths: number[],
  ): string[] {
    if (!this.composition) {
      return [];
    }
    const cardKey = this.symbolIdBagKey(
      cards.flatMap((card) => this.cardComponents(card)),
    );
    const cacheKey = `${lengths.join(",")}|${cardKey}`;
    const cached = this.compositionAcceptedCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const accepted: string[] = [];
    const firstChars = new Set<string>();
    const cardCounts = this.componentCounts(
      cards.flatMap((card) => this.cardComponents(card)),
    );
    const symbols = [...cardCounts.keys()];
    const selected: number[] = [];
    const collect = (index: number) => {
      if (index >= symbols.length) {
        if (selected.length > 0) {
          for (const char of this.data.accepted(selected)) {
            firstChars.add(char);
          }
        }
        return;
      }
      const symbolId = symbols[index];
      const maximum = cardCounts.get(symbolId) ?? 0;
      for (let count = 0; count <= maximum; count += 1) {
        selected.push(
          ...Array.from(
            { length: count },
            () => symbolId,
          ),
        );
        collect(index + 1);
        selected.splice(selected.length - count, count);
      }
    };
    collect(0);
    for (const length of lengths) {
      const candidates = this.answerWordsByFirst(
        length,
        firstChars,
        this.composition.words[
          String(length) as "2" | "3" | "4"
        ],
      );
      for (const word of candidates) {
        if (this.wordCanUseCards(word, cards)) {
          accepted.push(word);
        }
      }
    }
    accepted.sort((left, right) =>
      left.localeCompare(right, "zh-CN"),
    );
    this.compositionAcceptedCache.set(cacheKey, accepted);
    return accepted;
  }

  private assonanceAcceptedWords(
    cards: TrialCard[],
    lengths: number[],
  ): string[] {
    if (!this.assonance) {
      return [];
    }
    const assonance = this.assonance;
    const cardCounts = this.assonanceVisibleCounts(cards);
    const cardKey = this.countsKey(cardCounts);
    const cacheKey = `${lengths.join(",")}|${cardKey}`;
    const cached = this.assonanceAcceptedCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const visibleCounts = this.assonanceVisibleCounts(cards);
    const possibleChars = new Set<string>();
    const allChars =
      this.wordAnswers
        ? this.answerCharacters
        : new Set(
            (["2", "3", "4"] as const).flatMap(
              (length) =>
                assonance.words[length].flatMap((word) => [
                  ...word,
                ]),
            ),
          );
    for (const char of allChars) {
      if (
        this.data.expandedDecompositions(char).some((way) => {
          const counts = this.componentCounts(way);
          return [...counts.entries()].every(
            ([symbolId, count]) =>
              (visibleCounts.get(symbolId) ?? 0) > 0 &&
              count <=
                Math.max(
                  visibleCounts.get(symbolId) ?? 0,
                  visibleCounts.get(symbolId) === 1
                    ? 10
                    : 0,
                ),
          );
        })
      ) {
        possibleChars.add(char);
      }
    }
    const accepted: string[] = [];
    for (const length of lengths) {
      const candidates = this.answerWordsByFirst(
        length,
        possibleChars,
        assonance.words[
          String(length) as "2" | "3" | "4"
        ],
      );
      for (const word of candidates) {
        if (
          new Set([...word]).size !== [...word].length
        ) {
          continue;
        }
        if (
          ![...word].every((char) =>
            possibleChars.has(char),
          )
        ) {
          continue;
        }
        if (this.assonanceWordCanUseCards(word, cards)) {
          accepted.push(word);
        }
      }
    }
    accepted.sort((left, right) =>
      left.localeCompare(right, "zh-CN"),
    );
    this.assonanceAcceptedCache.set(cacheKey, accepted);
    return accepted;
  }

  private assonanceWordCanUseCards(
    word: string,
    cards: TrialCard[],
  ): boolean {
    const visibleCounts = this.assonanceVisibleCounts(cards);
    const visibleKey = this.countsKey(visibleCounts);
    const options = [...word].map((char) =>
      this.data
        .expandedDecompositions(char)
        .filter((way) => way.length >= 1 && way.length <= 10),
    );
    if (options.some((ways) => ways.length === 0)) {
      return false;
    }
    const selected: number[][] = [];
    const search = (index: number): boolean => {
      if (index >= options.length) {
        return (
          this.countsKey(
            this.assonanceCompressedCounts(selected),
          ) === visibleKey
        );
      }
      for (const way of options[index]) {
        selected.push(way);
        if (search(index + 1)) {
          return true;
        }
        selected.pop();
      }
      return false;
    };
    return search(0);
  }

  private assonanceCompressedCounts(
    recipe: readonly number[][],
  ): Map<number, number> {
    const counts = new Map<number, number>();
    for (const way of recipe) {
      for (const symbolId of way) {
        counts.set(
          symbolId,
          (counts.get(symbolId) ?? 0) + 1,
        );
      }
    }
    const displayed = new Map<number, number>();
    for (const [symbolId, count] of counts) {
      const charCount = recipe.filter((way) =>
        way.includes(symbolId),
      ).length;
      displayed.set(
        symbolId,
        charCount >= 2 ? 1 : count,
      );
    }
    return displayed;
  }

  private assonanceVisibleCounts(
    cards: TrialCard[],
  ): Map<number, number> {
    const counts = new Map<number, number>();
    for (const card of cards) {
      counts.set(
        card.symbolId,
        (counts.get(card.symbolId) ?? 0) +
          (card.displayMode === "quantity" ? 1 : 1),
      );
    }
    return counts;
  }

  private countsKey(counts: Map<number, number>): string {
    return [...counts.entries()]
      .filter(([, count]) => count > 0)
      .sort(([left], [right]) => left - right)
      .map(([symbolId, count]) => `${symbolId}:${count}`)
      .join(",");
  }

  private wordCanUseCards(
    word: string,
    cards: TrialCard[],
  ): boolean {
    const initial = this.componentCounts(
      cards.flatMap((card) => this.cardComponents(card)),
    );
    const options = [...word].map((char) =>
      this.data
        .expandedDecompositions(char)
        .filter((way) => way.length >= 1 && way.length <= 10),
    );
    if (options.some((ways) => ways.length === 0)) {
      return false;
    }
    const search = (
      index: number,
      remaining: Map<number, number>,
    ): boolean => {
      if (index >= options.length) {
        return remaining.size === 0;
      }
      for (const way of options[index]) {
        const next = this.consumeSubbag(remaining, way);
        if (next && search(index + 1, next)) {
          return true;
        }
      }
      return false;
    };
    return search(0, initial);
  }

  private consumeSubbag(
    source: Map<number, number>,
    way: readonly number[],
  ): Map<number, number> | null {
    const remainder = new Map(source);
    for (const symbolId of way) {
      const count = remainder.get(symbolId) ?? 0;
      if (count <= 0) {
        return null;
      }
      if (count === 1) {
        remainder.delete(symbolId);
      } else {
        remainder.set(symbolId, count - 1);
      }
    }
    return remainder;
  }

  private componentCounts(
    components: readonly number[],
  ): Map<number, number> {
    const counts = new Map<number, number>();
    for (const symbolId of components) {
      counts.set(
        symbolId,
        (counts.get(symbolId) ?? 0) + 1,
      );
    }
    return counts;
  }

  private repetendWayAllowed(
    way: readonly number[],
  ): boolean {
    const counts = this.componentCounts(way);
    return (
      counts.size >= 2 &&
      [...counts.values()].some((count) => count > 1)
    );
  }

  private repetendNormalWeight(
    way: readonly number[],
  ): number {
    return this.componentCounts(way).size === 2
      ? 0.2
      : 1;
  }

  private availableNormalRuleChoices(
    length: number,
    usedChars: Set<string>,
  ): TrialChoice[] {
    let available = this.availableChoices(
      length,
      usedChars,
    );
    const rule = this.activeRule();
    if (
      rule.policy.cards.normal.decoyMode === "attached"
    ) {
      available = available.filter((choice) =>
        choice.ways.some((way) =>
          this.outlandWayCanAttach(
            way,
            rule.policy.cards.normal,
          ),
        ),
      );
    }
    if (
      rule.policy.prompt.normal.mode ===
      "repetend-components"
    ) {
      available = available.filter((choice) =>
        choice.ways.some((way) =>
          this.repetendWayAllowed(way),
        ),
      );
    }
    return available;
  }

  private cardComponents(card: TrialCard): number[] {
    return [
      ...(card.remainingComponents ??
        card.components ??
        [card.symbolId]),
    ];
  }

  private activeRule(
    stage = this.state.stage,
  ): TrialRuleDefinition {
    if (
      stage === this.state.stage &&
      this.state.forcedRuleId &&
      this.rules?.rules[this.state.forcedRuleId]
    ) {
      return this.rules.rules[this.state.forcedRuleId];
    }
    const selectedId = this.stageRuleIds[stage - 1];
    return (
      (selectedId
        ? this.rules?.rules[selectedId]
        : null) ?? FALLBACK_TRIAL_RULE
    );
  }

  private ruleInheritsCards(
    phase: "normal" | "boss",
  ): boolean {
    return (
      (this.activeRule().policy.prompt[phase]
        .inheritedCards ?? 0) > 0
    );
  }

  private wayAllowedByRule(
    rule: TrialRuleDefinition,
    way: readonly number[],
  ): boolean {
    const excluded = rule.selection.excludedComponents;
    if (!excluded || excluded.length === 0) {
      return true;
    }
    const excludedSet = new Set(excluded);
    return way.every(
      (symbolId) =>
        !excludedSet.has(
          this.data.component(symbolId).name,
        ),
    );
  }

  private charAllowedByRule(
    rule: TrialRuleDefinition,
    char: string,
  ): boolean {
    const allowed = rule.selection.levels ?? [1, 2];
    const level = this.data.levels.get(char);
    return level !== undefined && allowed.includes(level);
  }

  private rulePoolOptions(rule: TrialRuleDefinition) {
    const usesReduction =
      rule.policy.prompt.normal.mode ===
      "reduction-components";
    const usesRepetition =
      rule.policy.prompt.normal.mode ===
        "repetend-components" ||
      rule.policy.prompt.boss.mode ===
        "repetend-components";
    return {
      normalPartLengths: rule.selection.normal.partLengths,
      bossPartLengths: rule.selection.boss.partLengths,
      bossAnswerCount: rule.selection.boss.answerCount,
      bossTotalParts: rule.selection.boss.totalParts,
      acceptNormalWay: (
        char: string,
        way: readonly number[],
      ) =>
        this.charAllowedByRule(rule, char) &&
        this.wayAllowedByRule(rule, way) &&
        (!usesRepetition ||
          this.repetendWayAllowed(way)) &&
        (!usesReduction ||
          this.reductionOptionsForWay(way).length > 0),
      acceptBossWay: (
        char: string,
        way: readonly number[],
      ) =>
        this.charAllowedByRule(rule, char) &&
        this.wayAllowedByRule(rule, way) &&
        (!usesReduction ||
          this.reductionOptionsForWay(way).length > 0),
    } satisfies TrialPoolAvailabilityOptions;
  }

  inspectStagePool(
    stage = this.state.stage,
  ): TrialPoolAvailability {
    const rule = this.activeRule(stage);
    if (
      rule.policy.prompt.normal.mode ===
      "gestalt-components"
    ) {
      return this.inspectGestaltPool(rule);
    }
    if (
      rule.policy.prompt.normal.mode ===
      "word-components"
    ) {
      return this.inspectCompositionPool(rule);
    }
    if (
      rule.policy.prompt.normal.mode ===
      "assonance-components"
    ) {
      return this.inspectAssonancePool(rule);
    }
    if (
      rule.policy.prompt.normal.mode ===
      "dissonance-components"
    ) {
      return this.inspectAssonancePool(rule);
    }
    return rule.policy.prompt.normal.mode ===
      "traditional-components"
      ? this.inspectTraditionalPool(rule)
      : this.inspectPool(this.rulePoolOptions(rule));
  }

  private inspectGestaltPool(
    rule: TrialRuleDefinition,
  ): TrialPoolAvailability {
    const pairs = this.gestalt?.pairs ?? [];
    const normalCharacters = new Set(
      pairs.flatMap((pair) =>
        pair.answers.map((answer) => answer.char),
      ),
    );
    const normalSufficient =
      pairs.length >= this.state.questionsPerStage;
    const bossSufficient = pairs.length >= 2;
    return {
      normal: {
        required: this.state.questionsPerStage,
        chars: normalCharacters.size,
        ways: pairs.length,
        byLength: [
          {
            length: 2,
            chars: normalCharacters.size,
            ways: pairs.length,
          },
        ],
        sufficient: normalSufficient,
      },
      boss: {
        answerCount: rule.selection.boss.answerCount,
        totalPartsMin: 4,
        totalPartsMax: 4,
        lengthCombinations: bossSufficient
          ? [[2, 2]]
          : [],
        sufficient: bossSufficient,
      },
      ready: normalSufficient && bossSufficient,
    };
  }

  private inspectCompositionPool(
    rule: TrialRuleDefinition,
  ): TrialPoolAvailability {
    const normalWords = this.composition?.normal ?? [];
    const bossWords = this.composition?.boss ?? [];
    const normalSufficient =
      normalWords.length >= this.state.questionsPerStage;
    const bossSufficient = bossWords.length > 0;
    return {
      normal: {
        required: this.state.questionsPerStage,
        chars: new Set(
          normalWords.flatMap((entry) => [
            ...entry.word,
          ]),
        ).size,
        ways: normalWords.reduce(
          (total, entry) =>
            total + entry.recipes.length,
          0,
        ),
        byLength: [
          {
            length: 4,
            chars: normalWords.length,
            ways: normalWords.reduce(
              (total, entry) =>
                total + entry.recipes.length,
              0,
            ),
          },
        ],
        sufficient: normalSufficient,
      },
      boss: {
        answerCount: rule.selection.boss.answerCount,
        totalPartsMin: 6,
        totalPartsMax: 8,
        lengthCombinations: bossSufficient
          ? [[6], [7], [8]]
          : [],
        sufficient: bossSufficient,
      },
      ready: normalSufficient && bossSufficient,
    };
  }

  private inspectAssonancePool(
    rule: TrialRuleDefinition,
  ): TrialPoolAvailability {
    const normalWords = this.assonance?.normal ?? [];
    const bossWords = this.assonance?.boss ?? [];
    const normalSufficient =
      normalWords.length >= this.state.questionsPerStage;
    const bossSufficient = bossWords.length > 0;
    return {
      normal: {
        required: this.state.questionsPerStage,
        chars: new Set(
          normalWords.flatMap((entry) => [
            ...entry.word,
          ]),
        ).size,
        ways: normalWords.reduce(
          (total, entry) =>
            total + entry.recipes.length,
          0,
        ),
        byLength: [
          {
            length: 4,
            chars: normalWords.length,
            ways: normalWords.reduce(
              (total, entry) =>
                total + entry.recipes.length,
              0,
            ),
          },
        ],
        sufficient: normalSufficient,
      },
      boss: {
        answerCount: rule.selection.boss.answerCount,
        totalPartsMin: 6,
        totalPartsMax: 10,
        lengthCombinations: bossSufficient
          ? [[6], [7], [8], [9], [10]]
          : [],
        sufficient: bossSufficient,
      },
      ready: normalSufficient && bossSufficient,
    };
  }

  private inspectTraditionalPool(
    rule: TrialRuleDefinition,
  ): TrialPoolAvailability {
    const normalLengths = [
      ...new Set(rule.selection.normal.partLengths),
    ].sort((left, right) => left - right);
    const buckets: TrialPoolLengthBucket[] = [];
    const normalChars = new Set<string>();
    let normalWays = 0;
    for (const length of normalLengths) {
      const choices = this.availableTraditionalChoices(length);
      const chars = new Set(
        choices.map((choice) => choice.char),
      );
      const ways = choices.reduce(
        (total, choice) => total + choice.ways.length,
        0,
      );
      chars.forEach((char) => normalChars.add(char));
      normalWays += ways;
      buckets.push({ length, chars: chars.size, ways });
    }
    const answerCount = Math.max(
      1,
      Math.floor(rule.selection.boss.answerCount),
    );
    const [totalPartsMin, totalPartsMax] =
      rule.selection.boss.totalParts;
    const bossLengths = [
      ...new Set(rule.selection.boss.partLengths),
    ]
      .filter(
        (length) =>
          this.availableTraditionalChoices(length).length > 0,
      )
      .sort((left, right) => left - right);
    const canAssignDistinctChars = (
      lengths: number[],
    ): boolean => {
      const used = new Set<string>();
      const assign = (index: number): boolean => {
        if (index >= lengths.length) {
          return true;
        }
        for (const choice of this.availableTraditionalChoices(
          lengths[index],
        )) {
          if (used.has(choice.char)) {
            continue;
          }
          used.add(choice.char);
          if (assign(index + 1)) {
            return true;
          }
          used.delete(choice.char);
        }
        return false;
      };
      return assign(0);
    };
    const lengthCombinations: number[][] = [];
    const walk = (
      startIndex: number,
      remaining: number,
      sum: number,
      current: number[],
    ): void => {
      if (remaining === 0) {
        if (
          sum >= totalPartsMin &&
          sum <= totalPartsMax &&
          canAssignDistinctChars(current)
        ) {
          lengthCombinations.push([...current]);
        }
        return;
      }
      for (
        let index = startIndex;
        index < bossLengths.length;
        index += 1
      ) {
        const length = bossLengths[index];
        if (sum + length > totalPartsMax) {
          continue;
        }
        current.push(length);
        walk(
          index,
          remaining - 1,
          sum + length,
          current,
        );
        current.pop();
      }
    };
    walk(0, answerCount, 0, []);
    const normalSufficient =
      normalChars.size >= this.state.questionsPerStage &&
      normalWays >= this.state.questionsPerStage;
    return {
      normal: {
        required: this.state.questionsPerStage,
        chars: normalChars.size,
        ways: normalWays,
        byLength: buckets,
        sufficient: normalSufficient,
      },
      boss: {
        answerCount,
        totalPartsMin,
        totalPartsMax,
        lengthCombinations,
        sufficient: lengthCombinations.length > 0,
      },
      ready: normalSufficient && lengthCombinations.length > 0,
    };
  }

  private timedSeconds(
    baseSeconds: number,
    multiplier: number,
    rule = this.activeRule(),
  ): number {
    const advancementMultiplier =
      trialAdvancementTimeMultiplier(
        rule.stars,
        this.advancement,
      );
    return Math.max(
      1,
      Math.round(
        baseSeconds *
          multiplier *
          advancementMultiplier,
      ),
    );
  }

  private buildChoices(): void {
    for (const [char, ways] of this.data.ways) {
      const level = this.data.levels.get(char);
      if (
        (level !== 1 && level !== 2 && level !== 3) ||
        !this.data.isCharSelectable(char) ||
        (!this.includeSupplementaryChars &&
          !this.data.isBasicPlaneCharacter(char))
      ) {
        continue;
      }
      for (let length = 2; length <= 10; length += 1) {
        const matching = ways.filter(
          (way) => way.length === length,
        );
        if (matching.length === 0) {
          continue;
        }
        const group =
          this.choicesByLength.get(length) ?? new Map();
        group.set(char, {
          char,
          ways: matching.map((way) => [...way]),
        });
        this.choicesByLength.set(length, group);
      }
    }
  }

  private gestaltPairKey(
    first: number,
    second: number,
  ): string {
    return [first, second]
      .sort((left, right) => left - right)
      .join("|");
  }

  private buildGestaltPairMap(): void {
    this.gestaltPairMap.clear();
    if (!this.gestalt) {
      return;
    }
    for (const pair of this.gestalt.pairs) {
      this.gestaltPairMap.set(
        this.gestaltPairKey(
          pair.components[0],
          pair.components[1],
        ),
        pair,
      );
    }
  }

  private buildCompositionWordIndex(): void {
    this.compositionWordIndex.clear();
    this.compositionAcceptedCache.clear();
    if (!this.composition) {
      return;
    }
    for (const length of ["2", "3", "4"] as const) {
      for (const word of this.composition.words[length]) {
        const first = [...word][0];
        const key = `${length}|${first}`;
        const words =
          this.compositionWordIndex.get(key) ?? [];
        words.push(word);
        this.compositionWordIndex.set(key, words);
      }
    }
  }

  private buildAnswerWordIndexes(): void {
    this.answerWordFirstIndex.clear();
    this.answerWordCharIndex.clear();
    this.answerCharacters.clear();
    if (!this.wordAnswers) {
      return;
    }
    for (const length of ["2", "3", "4"] as const) {
      for (const word of this.wordAnswers.words[length]) {
        const chars = [...word];
        for (const char of chars) {
          this.answerCharacters.add(char);
        }
        const firstKey = `${length}|${chars[0]}`;
        const firstWords =
          this.answerWordFirstIndex.get(firstKey) ?? [];
        firstWords.push(word);
        this.answerWordFirstIndex.set(
          firstKey,
          firstWords,
        );
        for (const char of new Set(chars)) {
          const charWords =
            this.answerWordCharIndex.get(char) ?? [];
          charWords.push(word);
          this.answerWordCharIndex.set(
            char,
            charWords,
          );
        }
      }
    }
  }

  private answerWordsByFirst(
    length: number,
    firstChars: Iterable<string>,
    fallbackWords: readonly string[],
  ): Set<string> {
    const words = new Set<string>();
    if (this.wordAnswers) {
      for (const first of firstChars) {
        for (const word of
          this.answerWordFirstIndex.get(
            `${length}|${first}`,
          ) ?? []) {
          words.add(word);
        }
      }
      return words;
    }
    const firstSet = new Set(firstChars);
    for (const word of fallbackWords) {
      if (firstSet.has([...word][0])) {
        words.add(word);
      }
    }
    return words;
  }

  private answerWordsContaining(
    length: number,
    chars: Iterable<string>,
    fallbackWords: readonly string[],
  ): Set<string> {
    const words = new Set<string>();
    if (this.wordAnswers) {
      for (const char of chars) {
        for (const word of
          this.answerWordCharIndex.get(char) ?? []) {
          if ([...word].length === length) {
            words.add(word);
          }
        }
      }
      return words;
    }
    const charSet = new Set(chars);
    for (const word of fallbackWords) {
      if (
        [...word].some((char) => charSet.has(char))
      ) {
        words.add(word);
      }
    }
    return words;
  }

  private buildTraditionalChoices(): void {
    this.traditionalChoicesByLength.clear();
    if (!this.traditional) {
      return;
    }
    for (const [char, traditionalChars] of Object.entries(
      this.traditional.chars,
    )) {
      const level = this.data.levels.get(char);
      if (level !== 1 && level !== 2) {
        continue;
      }
      for (const displayChar of traditionalChars) {
        if (!this.data.isCharSelectable(displayChar)) {
          continue;
        }
        const ways = this.data.ways.get(displayChar) ?? [];
        for (let length = 2; length <= 10; length += 1) {
          const matching = ways.filter(
            (way) => way.length === length,
          );
          if (matching.length === 0) {
            continue;
          }
          const group =
            this.traditionalChoicesByLength.get(length) ?? [];
          group.push({
            char,
            displayChar,
            ways: matching.map((way) => [...way]),
          });
          this.traditionalChoicesByLength.set(length, group);
        }
      }
    }
  }

  private availableChoices(
    length: number,
    excluded: Set<string>,
    kind: "normal" | "boss" = "normal",
  ): TrialChoice[] {
    const choices =
      this.choicesByLength.get(length) ?? new Map();
    const rule = this.activeRule();
    const usesReduction =
      rule.policy.prompt.normal.mode ===
      "reduction-components";
    const usesPrefabrication =
      kind === "normal" &&
      rule.policy.prompt.normal.mode ===
      "prefabricated-components";
    return [...choices.values()]
      .filter(
        (choice) =>
          !excluded.has(choice.char) &&
          this.charAllowedByRule(rule, choice.char),
      )
      .map((choice) => ({
        char: choice.char,
        ways: choice.ways.filter(
          (way: number[]) =>
            this.wayAllowedByRule(rule, way) &&
            (!usesReduction ||
              this.reductionOptionsForWay(way).length >
                0) &&
            (!usesPrefabrication ||
              this.prefabricationOptionsForComponents(
                way,
                new Set([choice.char]),
                this.usedPrefabricationHints,
                choice.char,
              ).length > 0),
        ),
      }))
      .filter((choice) => choice.ways.length > 0);
  }

  private reductionOptionsForWay(
    way: readonly number[],
    excludedSources = this.usedReductionSources,
  ): Array<{
    sourceIndex: number;
    sourceSymbolId: number;
    parts: [number, number];
  }> {
    const options: Array<{
      sourceIndex: number;
      sourceSymbolId: number;
      parts: [number, number];
    }> = [];
    const seenSources = new Set<number>();
    way.forEach((symbolId, sourceIndex) => {
      if (
        seenSources.has(symbolId) ||
        excludedSources.has(symbolId)
      ) {
        return;
      }
      seenSources.add(symbolId);
      for (const parts of this.data.twoPartAnswerExpansions(
        symbolId,
      )) {
        if (parts.length !== 2) {
          continue;
        }
        options.push({
          sourceIndex,
          sourceSymbolId: symbolId,
          parts: [parts[0], parts[1]],
        });
      }
    });
    return options;
  }

  private resolveReductionForWay(
    way: readonly number[],
    excludedSources = this.usedReductionSources,
  ): {
    displayWay: number[];
    expandedComponent: number;
    sourceIndex: number;
    parts: [number, number];
  } | null {
    const option = pickRandom(
      this.reductionOptionsForWay(way, excludedSources),
      this.random,
    );
    if (!option) {
      return null;
    }
    const displayWay = [...way];
    displayWay.splice(
      option.sourceIndex,
      1,
      ...option.parts,
    );
    return {
      displayWay,
      expandedComponent: option.sourceSymbolId,
      sourceIndex: option.sourceIndex,
      parts: [option.parts[0], option.parts[1]],
    };
  }

  private cardsWithReduction(
    answerWay: readonly number[],
    reduction: {
      sourceIndex: number;
      parts: [number, number];
    },
  ): TrialCard[] {
    const markers = answerWay.map(() => false);
    markers.splice(reduction.sourceIndex, 1, true, true);
    const displayWay = [...answerWay];
    displayWay.splice(
      reduction.sourceIndex,
      1,
      ...reduction.parts,
    );
    return shuffle(
      displayWay.map((symbolId, index) => ({
        ...this.makeCard(symbolId),
        ...(markers[index]
          ? { reductionPart: true }
          : {}),
      })),
      this.random,
    );
  }

  private prefabricationOptionsForComponents(
    components: readonly number[],
    excludedChars = new Set<string>(),
    excludedHints = this.usedPrefabricationHints,
    avoidExistingWayFor?: string,
  ): Array<{
    indices: [number, number];
    glyph: string;
  }> {
    const options: Array<{
      indices: [number, number];
      glyph: string;
    }> = [];
    for (let left = 0; left < components.length; left += 1) {
      for (
        let right = left + 1;
        right < components.length;
        right += 1
      ) {
        const chars = this.data
          .directTwoPartChars(
            components[left],
            components[right],
          )
          .filter(
            (char) =>
              !excludedChars.has(char) &&
              !excludedHints.has(char),
          );
        for (const glyph of chars) {
          if (
            avoidExistingWayFor &&
            this.prefabricationMatchesExistingWay(
              avoidExistingWayFor,
              components,
              [{ indices: [left, right], glyph }],
            )
          ) {
            continue;
          }
          options.push({
            indices: [left, right],
            glyph,
          });
        }
      }
    }
    return options;
  }

  private resolvePrefabricationForWay(
    way: readonly number[],
    answerChar: string,
  ): {
    prefabrication: {
      indices: [number, number];
      glyph: string;
    };
  } | null {
    const option = pickRandom(
      this.prefabricationOptionsForComponents(
        way,
        new Set([answerChar]),
        this.usedPrefabricationHints,
        answerChar,
      ),
      this.random,
    );
    if (!option) {
      return null;
    }
    return {
      prefabrication: {
        indices: [...option.indices],
        glyph: option.glyph,
      },
    };
  }

  private resolveOverlayForWay(
    way: readonly number[],
  ): { indices: [number, number] } | null {
    if (way.length < 2) {
      return null;
    }
    const first = Math.floor(this.random() * way.length);
    let second = Math.floor(this.random() * (way.length - 1));
    if (second >= first) {
      second += 1;
    }
    return {
      indices: [Math.min(first, second), Math.max(first, second)],
    };
  }

  private wildcardOptionsForWay(
    way: readonly number[],
  ): Array<{ index: number; answers: string[] }> {
    const key = way.join(",");
    const cached = this.wildcardOptionCache.get(key);
    if (cached) {
      return cached;
    }
    const options: Array<{
      index: number;
      answers: string[];
    }> = [];
    for (let index = 0; index < way.length; index += 1) {
      const known = [...way];
      known.splice(index, 1);
      const answers = new Set<string>();
      for (const componentId of this.data.componentIds()) {
        for (const answer of this.data.directChars([
          ...known,
          componentId,
        ])) {
          answers.add(answer);
        }
      }
      if (answers.size === 1) {
        options.push({
          index,
          answers: [...answers],
        });
      }
    }
    this.wildcardOptionCache.set(key, options);
    return options;
  }

  private resolveWildcardForWay(
    way: readonly number[],
  ): {
    index: number;
    answers: string[];
  } | null {
    const options = this.wildcardOptionsForWay(way);
    return options.length > 0
      ? pickRandom(options, this.random)
      : null;
  }

  private takeNormalChoice(length: number): TrialChoice {
    let available = this.availableChoices(
      length,
      this.usedStageChars,
    );
    if (
      length >= 7 &&
      this.state.partLengthPlan.length > 0
    ) {
      const recent = new Set(loadRecentLongChars());
      const fresh = available.filter(
        (choice) => !recent.has(choice.char),
      );
      if (fresh.length > 0) {
        available = fresh;
      }
    }
    const usesWildcard =
      this.activeRule().policy.prompt.normal.mode ===
      "wildcard-components";
    const usesRepetition =
      this.activeRule().policy.prompt.normal.mode ===
      "repetend-components";
    const usesOutland =
      this.activeRule().policy.cards.normal.decoyMode ===
      "attached";
    if (usesOutland) {
      available = available.filter((candidate) =>
        candidate.ways.some((candidateWay) =>
          this.outlandWayCanAttach(
            candidateWay,
            this.activeRule().policy.cards.normal,
          ),
        ),
      );
    }
    let choice: TrialChoice | null = null;
    let way: number[] | null = null;
    let wildcard: {
      index: number;
      answers: string[];
    } | null = null;
    if (usesRepetition) {
      const options = available.flatMap((candidate) =>
        candidate.ways
          .filter((candidateWay) =>
            this.repetendWayAllowed(candidateWay),
          )
          .map((candidateWay) => ({
            choice: candidate,
            way: candidateWay,
          })),
      );
      if (options.length > 0) {
        const picked = pickWeighted(
          options,
          (option) =>
            this.repetendNormalWeight(option.way),
          this.random,
        );
        choice = picked.choice;
        way = picked.way;
      }
    } else if (usesWildcard) {
      for (const candidate of shuffle(
        available,
        this.random,
      )) {
        for (const candidateWay of shuffle(
          candidate.ways,
          this.random,
        )) {
          const option =
            this.resolveWildcardForWay(candidateWay);
          if (option) {
            choice = candidate;
            way = candidateWay;
            wildcard = option;
            break;
          }
        }
        if (choice) {
          break;
        }
      }
    } else {
      choice = pickRandom(available, this.random);
      const allowedWays = usesOutland
        ? choice.ways.filter((candidateWay) =>
            this.outlandWayCanAttach(
              candidateWay,
              this.activeRule().policy.cards.normal,
            ),
          )
        : choice.ways;
      way = pickRandom(allowedWays, this.random);
    }
    if (!choice || !way) {
      throw new Error(
        "Unable to resolve a wildcard question.",
      );
    }
    const reduction =
      this.activeRule().policy.prompt.normal.mode ===
      "reduction-components"
        ? this.resolveReductionForWay(way)
        : null;
    const prefabrication =
      this.activeRule().policy.prompt.normal.mode ===
      "prefabricated-components"
        ? this.resolvePrefabricationForWay(
            way,
            choice.char,
          )
        : null;
    const overlay =
      this.activeRule().policy.prompt.normal.mode ===
      "overlay-components"
        ? this.resolveOverlayForWay(way)
        : null;
    if (
      this.activeRule().policy.prompt.normal.mode ===
        "reduction-components" &&
      !reduction
    ) {
      throw new Error(
        "Unable to resolve a reduction question.",
      );
    }
    if (
      this.activeRule().policy.prompt.normal.mode ===
        "prefabricated-components" &&
      !prefabrication
    ) {
      throw new Error(
        "Unable to resolve a prefabrication question.",
      );
    }
    if (
      this.activeRule().policy.prompt.normal.mode ===
        "overlay-components" &&
      !overlay
    ) {
      throw new Error(
        "Unable to resolve an overlay question.",
      );
    }
    if (usesWildcard && !wildcard) {
      throw new Error(
        "Unable to resolve a wildcard question.",
      );
    }
    this.usedStageChars.add(choice.char);
    this.usedStageBags.add(
      [...way].sort((left, right) => left - right).join(","),
    );
    if (reduction) {
      this.usedReductionSources.add(
        reduction.expandedComponent,
      );
    }
    if (prefabrication) {
      this.usedPrefabricationHints.add(
        prefabrication.prefabrication.glyph,
      );
    }
    if (
      length >= 7 &&
      this.state.partLengthPlan.length > 0
    ) {
      const recent = loadRecentLongChars().filter(
        (char) => char !== choice.char,
      );
      recent.push(choice.char);
      saveRecentLongChars(recent);
    }
    return {
      char: choice.char,
      ways: [way],
      displayWay: reduction?.displayWay,
      expandedComponent: reduction?.expandedComponent,
      reduction: reduction
        ? {
            sourceIndex: reduction.sourceIndex,
            parts: reduction.parts,
          }
        : undefined,
      prefabrication:
        prefabrication?.prefabrication,
      overlay: overlay ?? undefined,
      repetend: usesRepetition,
      wildcardIndex: wildcard?.index,
      wildcardAnswers: wildcard?.answers,
    };
  }

  private buildPartLengthPlan(
    rule: TrialRuleDefinition,
  ): number[] {
    const progression =
      rule.selection.normal.partLengthProgression;
    if (!progression) {
      return [];
    }
    const transitionCount =
      this.state.questionsPerStage - 1;
    const endpoints = progression.end.filter(
      (end) =>
        end - progression.start <= transitionCount,
    );
    if (endpoints.length === 0) {
      throw new Error(
        `Rule ${rule.id} has no possible part-length progression.`,
      );
    }
    const recent = new Set(loadRecentLongChars());
    const poolSize = (length: number): number => {
      const all = this.availableChoices(
        length,
        new Set(),
      );
      if (length < 7 || recent.size === 0) {
        return all.length;
      }
      const fresh = all.filter(
        (choice) => !recent.has(choice.char),
      );
      return fresh.length > 0 ? fresh.length : all.length;
    };
    const availableEndpoints = endpoints.filter(
      (end) => poolSize(end) > 0,
    );
    if (availableEndpoints.length === 0) {
      throw new Error(
        `Rule ${rule.id} has no available part-length endpoints.`,
      );
    }
    const end = pickWeighted(
      availableEndpoints,
      (candidate) => poolSize(candidate),
      this.random,
    );
    const increasesLeft =
      end - progression.start;
    const staysLeft =
      transitionCount - increasesLeft;
    const paths: Array<{
      lengths: number[];
      weight: number;
    }> = [];
    const build = (
      lengths: number[],
      increases: number,
      stays: number,
    ): void => {
      if (lengths.length === this.state.questionsPerStage) {
        const occurrences = new Map<number, number>();
        for (const length of lengths) {
          occurrences.set(
            length,
            (occurrences.get(length) ?? 0) + 1,
          );
        }
        const weight = [...occurrences.entries()].reduce(
          (product, [length, count]) =>
            product *
            Math.pow(poolSize(length), Math.max(0, count - 1)),
          1,
        );
        if (weight > 0) {
          paths.push({ lengths, weight });
        }
        return;
      }
      if (increases > 0) {
        build(
          [
            ...lengths,
            lengths[lengths.length - 1] + 1,
          ],
          increases - 1,
          stays,
        );
      }
      if (stays > 0) {
        build(
          [
            ...lengths,
            lengths[lengths.length - 1],
          ],
          increases,
          stays - 1,
        );
      }
    };
    build([progression.start], increasesLeft, staysLeft);
    if (paths.length === 0) {
      throw new Error(
        `Rule ${rule.id} has no available part-length progression.`,
      );
    }
    return pickWeighted(
      paths,
      (path) => path.weight,
      this.random,
    ).lengths;
  }

  private availableTraditionalChoices(
    length: number,
  ): TrialChoice[] {
    return (
      this.traditionalChoicesByLength.get(length) ?? []
    ).filter(
      (choice) => !this.usedStageChars.has(choice.char),
    );
  }

  private pickTraditionalNormalChoice(): TrialChoice {
    if (
      !this.traditional ||
      this.traditionalChoicesByLength.size === 0
    ) {
      throw new Error(
        "Traditional question data is not loaded.",
      );
    }
    const allowed = new Set(
      this.activeRule().selection.normal.partLengths,
    );
    const lengths = [
      ...this.traditionalChoicesByLength.keys(),
    ].filter(
      (length) =>
        allowed.has(length) &&
        this.availableTraditionalChoices(length).length > 0,
    );
    if (lengths.length === 0) {
      throw new Error(
        "No unused traditional characters remain in this stage.",
      );
    }
    const length = pickWeighted(
      lengths,
      (candidate) =>
        this.availableTraditionalChoices(candidate)
          .length,
      this.random,
    );
    const choices = this.availableTraditionalChoices(length);
    const choice = pickRandom(choices, this.random);
    const way = pickRandom(choice.ways, this.random);
    this.usedStageChars.add(choice.char);
    this.usedStageBags.add(
      [...way].sort((left, right) => left - right).join(","),
    );
    return {
      char: choice.char,
      displayChar: choice.displayChar,
      ways: [way],
    };
  }

  private pickNormalChoice(): TrialChoice {
    if (this.ruleInheritsCards("normal")) {
      return this.pickHallraumNormalChoice();
    }
    if (
      this.activeRule().policy.prompt.normal.mode ===
      "gestalt-components"
    ) {
      return this.pickGestaltNormalChoice();
    }
    if (
      this.activeRule().policy.prompt.normal.mode ===
      "traditional-components"
    ) {
      return this.pickTraditionalNormalChoice();
    }
    if (
      this.activeRule().policy.prompt.normal.mode ===
      "word-components"
    ) {
      return this.pickCompositionNormalChoice();
    }
    if (
      this.activeRule().policy.prompt.normal.mode ===
      "assonance-components"
    ) {
      return this.pickAssonanceNormalChoice();
    }
    if (
      this.activeRule().policy.prompt.normal.mode ===
      "dissonance-components"
    ) {
      return this.pickDissonanceNormalChoice();
    }
    const plannedLength =
      this.state.partLengthPlan[
        this.state.questionInStage - 1
      ];
    if (plannedLength !== undefined) {
      if (
        this.availableNormalRuleChoices(
          plannedLength,
          this.usedStageChars,
        ).length > 0
      ) {
        return this.takeNormalChoice(plannedLength);
      }
      throw new Error(
        "No unused questions remain for the planned part length.",
      );
    }
    const normalEffect = this.activeRule().selection.normal;
    const allowedLengths = new Set(normalEffect.partLengths);
    const lengths = [...this.choicesByLength.keys()].filter(
      (length) =>
        length >= 2 &&
        length <= 10 &&
        allowedLengths.has(length),
    );
    const availableLengths = lengths.filter(
      (length) =>
        this.availableNormalRuleChoices(
          length,
          this.usedStageChars,
        ).length > 0,
    );
    if (availableLengths.length === 0) {
      if (
        this.activeRule().policy.prompt.normal.mode ===
          "reduction-components" &&
        this.usedReductionSources.size > 0 &&
        !lengths.some(
          (length) =>
            this.availableNormalRuleChoices(
              length,
              new Set(),
            ).length > 0,
        )
      ) {
        throw new Error(
          "No unused reduction components remain in this stage.",
        );
      }
      throw new Error(
        "No unused trial questions remain in this stage.",
      );
    }
    const partWeights =
      normalEffect.partWeights ??
      (this.activeRule().family?.id === "outland"
        ? TRIAL_OUTLAND_PART_WEIGHTS
        : undefined);
    if (partWeights) {
      const weightedLengths = availableLengths.filter(
        (length) =>
          (partWeights[length] ?? 0) > 0,
      );
      const length =
        weightedLengths.length > 0
          ? pickWeighted(
              weightedLengths,
              (candidate) => partWeights[candidate] ?? 0,
              this.random,
            )
          : pickRandom(availableLengths, this.random);
      return this.takeNormalChoice(length);
    }
    if (normalEffect.partWeighting === "pool") {
      const length = pickWeighted(
        availableLengths,
        (candidate) =>
          this.availableNormalRuleChoices(
            candidate,
            this.usedStageChars,
          ).reduce(
            (total, choice) => total + choice.ways.length,
            0,
          ),
        this.random,
      );
      return this.takeNormalChoice(length);
    }
    const longLengths = lengths.filter(
      (length) => length >= 5,
    );
    const longChars = new Set(
      longLengths.flatMap((length) =>
        this.availableNormalRuleChoices(
          length,
          this.usedStageChars,
        ).map((choice) => choice.char),
      ),
    );
    const balanced = balanceChallengeClassProbabilities(
      TRIAL_BASE_PART_PROBABILITIES,
      allowedLengths.has(4)
        ? this.availableNormalRuleChoices(
            4,
            this.usedStageChars,
          ).length
        : 0,
      longChars.size,
    );
    const categories = [
      { key: "two", length: 2, weight: balanced.two },
      { key: "three", length: 3, weight: balanced.three },
      { key: "four", length: 4, weight: balanced.four },
    ].filter(
      ({ length }) =>
        allowedLengths.has(length) &&
        this.availableNormalRuleChoices(
          length,
          this.usedStageChars,
        ).length > 0,
    );
    if (longLengths.length > 0) {
      categories.push({
        key: "longer",
        length: 5,
        weight: balanced.longer,
      });
    }
    if (categories.length === 0) {
      if (
        this.activeRule().policy.prompt.normal.mode ===
          "reduction-components" &&
        this.usedReductionSources.size > 0 &&
        !lengths.some(
          (length) =>
            this.availableNormalRuleChoices(
              length,
              new Set(),
            ).length > 0,
        )
      ) {
        throw new Error(
          "No unused reduction components remain in this stage.",
        );
      }
      throw new Error(
        "No unused trial questions remain in this stage.",
      );
    }
    const category = pickWeighted(
      categories,
      ({ weight }) => weight,
      this.random,
    );
    const selectedLength =
      category.key === "longer"
        ? pickWeighted(
        longLengths,
        (candidateLength) =>
          this.availableNormalRuleChoices(
            candidateLength,
            this.usedStageChars,
          ).length * Math.exp(-0.55 * (candidateLength - 5)),
        this.random,
      )
        : category.length;
    return this.takeNormalChoice(selectedLength);
  }

  private pickHallraumNormalChoice(): TrialChoice {
    const step =
      this.hallraumSteps[
        this.state.questionInStage - 1
      ];
    if (!step) {
      throw new Error(
        "Hallraum question chain is not ready.",
      );
    }
    return {
      char: step.char,
      ways: [[...step.way]],
      hallraum: {
        inheritedSlot: step.inheritedSlot,
      },
    };
  }

  private pickGestaltNormalChoice(): TrialChoice {
    if (!this.gestalt || this.gestalt.pairs.length === 0) {
      throw new Error(
        "Gestalt question data is not loaded.",
      );
    }
    let available = this.gestalt.pairs.filter(
      (pair) =>
        !this.usedStageBags.has(
          `gestalt:${this.gestaltPairKey(
            pair.components[0],
            pair.components[1],
          )}`,
        ) &&
        pair.answers.every(
          (answer) =>
            !this.usedStageChars.has(answer.char),
        ),
    );
    if (available.length === 0) {
      for (const key of [...this.usedStageBags]) {
        if (key.startsWith("gestalt:")) {
          this.usedStageBags.delete(key);
        }
      }
      available = this.gestalt.pairs.filter((pair) =>
        pair.answers.every(
          (answer) =>
            !this.usedStageChars.has(answer.char),
        ),
      );
      if (available.length === 0) {
        throw new Error(
          "No unused Gestalt characters remain in this stage.",
        );
      }
    }
    const pair = pickRandom(available, this.random);
    const answer = pickRandom(pair.answers, this.random);
    const way =
      this.data.shortestDecomposition(answer.char) ?? [
        ...pair.components,
      ];
    this.usedStageBags.add(
      `gestalt:${this.gestaltPairKey(
        pair.components[0],
        pair.components[1],
      )}`,
    );
    for (const possible of pair.answers) {
      this.usedStageChars.add(possible.char);
    }
    return {
      char: answer.char,
      ways: [[...way]],
      gestaltPair: pair,
    };
  }

  private pickCompositionNormalChoice(): TrialChoice {
    if (!this.composition || this.composition.normal.length === 0) {
      throw new Error(
        "Composition question data is not loaded.",
      );
    }
    for (let attempt = 0; attempt < 256; attempt += 1) {
      const picked = this.pickCompositionEntry(
        this.composition.normal,
        [2],
      );
      if (!picked) {
        break;
      }
      const cards = this.compositionCards(picked.recipe);
      const acceptedWords = this.compositionAcceptedWords(
        cards,
        [2],
      );
      if (
        !acceptedWords.includes(picked.entry.word)
      ) {
        continue;
      }
      for (const char of picked.entry.word) {
        this.usedStageChars.add(char);
      }
      this.usedStageBags.add(
        `word:${picked.entry.word}`,
      );
      return {
        char: picked.entry.word,
        ways: [picked.recipe.flat()],
        composition: {
          word: picked.entry.word,
          recipes: [picked.recipe],
          acceptedWords,
        },
      };
    }
    throw new Error(
      "Unable to generate a composition question.",
    );
  }

  private pickAssonanceNormalChoice(): TrialChoice {
    if (!this.assonance || this.assonance.normal.length === 0) {
      throw new Error(
        "Assonance question data is not loaded.",
      );
    }
    for (let attempt = 0; attempt < 256; attempt += 1) {
      const picked = this.pickCompositionEntry(
        this.assonance.normal,
        [2],
      );
      if (!picked) {
        break;
      }
      const cards = this.assonanceCards(picked.recipe);
      const acceptedWords = this.assonanceAcceptedWords(
        cards,
        [2],
      );
      if (
        !acceptedWords.includes(picked.entry.word)
      ) {
        continue;
      }
      for (const char of picked.entry.word) {
        this.usedStageChars.add(char);
      }
      this.usedStageBags.add(
        `assonance:${picked.entry.word}`,
      );
      return {
        char: picked.entry.word,
        ways: [picked.recipe.flat()],
        assonance: {
          word: picked.entry.word,
          recipes: [picked.recipe],
          acceptedWords,
        },
      };
    }
    throw new Error(
      "Unable to generate an assonance question.",
    );
  }

  private pickDissonanceNormalChoice(): TrialChoice {
    if (!this.assonance || this.assonance.normal.length === 0) {
      throw new Error(
        "Dissonance question data is not loaded.",
      );
    }
    for (let attempt = 0; attempt < 256; attempt += 1) {
      const picked = this.pickCompositionEntry(
        this.assonance.normal,
        [2],
      );
      if (!picked) {
        break;
      }
      const cards = this.dissonanceCards(picked.recipe);
      if (cards.length === 0) {
        continue;
      }
      for (const char of picked.entry.word) {
        this.usedStageChars.add(char);
      }
      this.usedStageBags.add(
        `dissonance:${picked.entry.word}`,
      );
      return {
        char: picked.entry.word,
        ways: [picked.recipe.flat()],
        dissonance: {
          word: picked.entry.word,
          recipes: [picked.recipe],
        },
      };
    }
    throw new Error(
      "Unable to generate a dissonance question.",
    );
  }

  private questionFor(
    choice: TrialChoice,
  ): TrialQuestionState {
    const answerWay = [...choice.ways[0]];
    const displayWay = choice.displayWay ?? answerWay;
    const displayCards =
      choice.dissonance
        ? this.dissonanceCards(
            choice.dissonance.recipes[0],
          )
        : choice.assonance
        ? this.assonanceCards(
            choice.assonance.recipes[0],
          )
        : choice.hallraum
        ? this.hallraumCards(
            answerWay,
            choice.hallraum.inheritedSlot,
          )
        : choice.composition
        ? this.compositionCards(
            choice.composition.recipes[0],
          )
        : choice.gestaltPair
        ? choice.gestaltPair.components.map((symbolId) =>
            this.makeCard(symbolId),
          )
        : choice.wildcardIndex !== undefined
        ? this.cardsWithWildcard(
            answerWay,
            choice.wildcardIndex,
          )
        : choice.prefabrication
          ? this.cardsWithPrefabrication(answerWay, [
              choice.prefabrication,
            ])
          : choice.reduction
            ? this.cardsWithReduction(
                answerWay,
                choice.reduction,
              )
          : choice.repetend
            ? this.cardsWithRepetition(answerWay)
          : choice.overlay
            ? this.cardsWithOverlay(answerWay, [
                choice.overlay,
              ])
          : shuffleQuestionParts(
              displayWay,
              this.random,
            ).map((symbolId) => this.makeCard(symbolId));
    const acceptedComponents = displayCards.flatMap((card) =>
      this.cardComponents(card),
    );
    const repetendUses = choice.repetend
      ? this.repetendAcceptedForCards(displayCards)
      : undefined;
    return {
      char: choice.char,
      displayChar: choice.displayChar,
      expandedComponent: choice.expandedComponent,
      answerWay,
      displayCards,
      repetendUses,
      accepted: choice.displayChar
        ? [choice.char]
        : choice.dissonance
          ? choice.dissonance.acceptedWords ?? [choice.char]
        : choice.assonance
          ? choice.assonance.acceptedWords
        : choice.composition
          ? choice.composition.acceptedWords
        : repetendUses
          ? Object.keys(repetendUses)
        : choice.gestaltPair
          ? [
              ...this.data.acceptedContaining(
                choice.gestaltPair.components,
              ),
            ]
        : choice.wildcardIndex !== undefined
          ? [
              ...this.wildcardAcceptedAnswers(
                answerWay.filter(
                  (_, index) =>
                    index !== choice.wildcardIndex,
                ),
              ),
            ]
          : [...this.data.accepted(acceptedComponents)],
      pinyin: displayPinyinFor(this.pinyin, choice.char),
    };
  }

  private setQuestionTiming(
    baseSeconds: number,
    multiplier: number,
  ): void {
    const sharedBudget =
      this.activeRule().timing.sharedBudgetSeconds;
    if (sharedBudget !== undefined) {
      const effectiveBudget = this.timedSeconds(
        sharedBudget,
        1,
      );
      this.sharedTimeRemaining ??= effectiveBudget;
      this.state.timeLimit = effectiveBudget;
      this.state.remaining = Math.min(
        effectiveBudget,
        this.sharedTimeRemaining,
      );
      return;
    }
    this.state.timeLimit = this.timedSeconds(
      baseSeconds,
      multiplier,
    );
    this.state.remaining = this.state.timeLimit;
  }

  private applySharedCorrectBonus(
    remainingBeforeBonus: number,
  ): void {
    const timing = this.activeRule().timing;
    if (timing.sharedBudgetSeconds === undefined) {
      return;
    }
    const effectiveBudget = this.timedSeconds(
      timing.sharedBudgetSeconds,
      1,
    );
    this.sharedTimeRemaining = Math.min(
      effectiveBudget,
      remainingBeforeBonus +
        (timing.correctBonusSeconds ?? 0),
    );
    this.state.timeLimit = effectiveBudget;
    this.state.remaining = this.sharedTimeRemaining;
  }

  private showNormalQuestion(): void {
    this.clearTimers();
    this.currentRecorded = false;
    this.questionElapsedMs = 0;
    const choice = this.pickNormalChoice();
    const question = this.questionFor(choice);
    if (
      !this.addRuleDecoy(
        "normal",
        question.displayCards,
        [question.answerWay],
      )
    ) {
      throw new Error(
        "Unable to add the trial decoy card.",
      );
    }
    this.state.current = question;
    this.scheduleObscuration(
      "normal",
      this.state.current.displayCards,
    );
    this.state.boss = null;
    this.state.revealing = false;
    this.state.feedback = "";
    this.state.draft = "";
    this.state.revealAnswer = "";
    this.state.revealPinyin = [];
    this.state.revealMeta = "";
    this.setQuestionTiming(
      TRIAL_NORMAL_SECONDS,
      this.activeRule().timing.normalMultiplier,
    );
    this.recordEncounter(
      this.state.current.char,
      this.state.current.answerWay,
      this.state.current.displayChar,
    );
    this.startTimer();
    this.emit();
  }

  private submitNormal(): void {
    if (!this.state.current) {
      return;
    }
    const given = this.state.draft.trim();
    const inputMode =
      this.activeRule().policy.answer.normal.input;
    const accepted =
      inputMode === "pinyin"
        ? acceptedPinyinFor(
            this.pinyin,
            this.state.current.char,
          )
        : this.state.current.accepted;
    const answer =
      inputMode === "pinyin"
        ? normalizePinyinInput(given)
        : given;
    const acceptedAnswer =
      accepted.includes(answer) ||
      (inputMode !== "pinyin" &&
        trialRulePromptMode(
          this.activeRule(),
          "normal",
        ) === "dissonance-components" &&
        this.dissonanceNormalWordCanUseCards(
          answer,
          this.state.current.displayCards,
        ));
    if (!acceptedAnswer) {
      this.state.feedback = "wrong";
      this.emit();
      return;
    }
    const remainingBeforeBonus = this.remainingSeconds();
    this.clearTimer();
    this.applySharedCorrectBonus(remainingBeforeBonus);
    this.state.revealing = true;
    this.state.feedback = "correct";
    const correctAnswer =
      inputMode === "pinyin"
        ? this.state.current.char
        : answer;
    this.state.revealAnswer = correctAnswer;
    this.state.revealPinyin =
      inputMode === "pinyin"
        ? [this.state.current.pinyin]
        : [];
    this.state.revealMeta = this.metaFor(
      correctAnswer,
    );
    this.recordNormal(
      true,
      correctAnswer,
      given,
    );
    this.advanceId = setTimeout(() => {
      this.advanceId = null;
      if (
        this.state.questionInStage >=
        this.state.questionsPerStage
      ) {
        this.startBoss();
      } else {
        this.state.questionInStage += 1;
        this.showNormalQuestion();
      }
    }, 900);
    this.emit();
  }

  private startBoss(): void {
    this.clearTimers();
    this.currentRecorded = false;
    this.questionElapsedMs = 0;
    const rule = this.activeRule();
    if ((rule.policy.prompt.boss.inheritedCards ?? 0) > 0) {
      this.startHallraumBoss(rule);
      return;
    }
    if (
      rule.policy.prompt.boss.mode ===
      "gestalt-components"
    ) {
      this.startGestaltBoss(rule);
      return;
    }
    if (
      rule.policy.prompt.boss.mode ===
      "word-components"
    ) {
      this.startCompositionBoss(rule);
      return;
    }
    if (
      rule.policy.prompt.boss.mode ===
      "assonance-components"
    ) {
      this.startAssonanceBoss(rule);
      return;
    }
    if (
      rule.policy.prompt.boss.mode ===
      "dissonance-components"
    ) {
      this.startDissonanceBoss(rule);
      return;
    }
    const combinations =
      this.inspectStagePool().boss.lengthCombinations;
    if (combinations.length === 0) {
      throw new Error("Unable to generate a trial boss.");
    }
    let selectedLengths = pickWeighted(
      combinations,
      (lengths) =>
        lengths.reduce(
          (weight, length) =>
            weight *
            (TRIAL_BOSS_LENGTH_WEIGHTS[length] ??
              Math.exp(-0.55 * (length - 5))),
          1,
        ),
      this.random,
    );
    const usesPrefabrication =
      rule.policy.prompt.boss.mode ===
      "prefabricated-components";
    const usesOverlay =
      rule.policy.prompt.boss.mode ===
      "overlay-components";
    const usesWildcard =
      rule.policy.prompt.boss.mode ===
      "wildcard-components";
    const usesReduction =
      rule.policy.prompt.boss.mode ===
      "reduction-components";
    const usesRepetition =
      rule.policy.prompt.boss.mode ===
      "repetend-components";
    const usesOutland =
      rule.policy.cards.boss.decoyMode === "attached";
    let choices: TrialChoice[] | null = null;
    let ways: number[][] = [];
    let prefabricationGroups: Array<{
      indices: [number, number];
      glyph: string;
    }> = [];
    let overlayGroups: Array<{
      indices: [number, number];
    }> = [];
    const attempts = usesPrefabrication
      ? 64
      : usesRepetition
        ? 128
        : usesOutland
          ? 64
        : 1;
    for (
      let attempt = 0;
      attempt < attempts;
      attempt += 1
    ) {
      if (usesRepetition && attempt > 0) {
        selectedLengths = pickWeighted(
          combinations,
          (lengths) =>
            lengths.reduce(
              (weight, length) =>
                weight *
                (TRIAL_BOSS_LENGTH_WEIGHTS[length] ??
                  Math.exp(-0.55 * (length - 5))),
              1,
            ),
          this.random,
        );
      }
      choices = this.pickBossChoices(selectedLengths);
      if (!choices) {
        continue;
      }
      if (usesOutland) {
        choices = choices
          .map((choice) => ({
            ...choice,
            ways: choice.ways.filter((way) =>
              this.outlandWayCanAttach(
                way,
                rule.policy.cards.boss,
              ),
            ),
          }))
          .filter((choice) => choice.ways.length > 0);
        if (choices.length !== selectedLengths.length) {
          continue;
        }
      }
      ways = usesRepetition
        ? this.pickRepetendBossWays(choices) ?? []
        : choices.map((choice) =>
            pickRandom(choice.ways, this.random),
          );
      prefabricationGroups = usesPrefabrication
        ? this.pickBossPrefabricationGroups(
            ways,
            choices.map((choice) => choice.char),
          )
        : [];
      overlayGroups = usesOverlay
        ? this.pickBossOverlayGroups(ways)
        : [];
      if (
        (!usesPrefabrication ||
          prefabricationGroups.length === 2) &&
        (!usesRepetition ||
          ways.length === choices.length) &&
        (!usesOutland ||
          ways.every((way) =>
            this.outlandWayCanAttach(
              way,
              rule.policy.cards.boss,
            ),
          ))
      ) {
        break;
      }
    }
    if (
      !choices ||
      (usesRepetition && ways.length !== choices.length) ||
      (usesPrefabrication &&
        prefabricationGroups.length !== 2) ||
      (usesOutland &&
        !ways.every((way) =>
          this.outlandWayCanAttach(
            way,
            rule.policy.cards.boss,
          ),
        ))
    ) {
      throw new Error("Unable to generate a trial boss answer set.");
    }
    const displayWays = choices.map(
      (choice, index) =>
        choice.displayWay ?? ways[index],
    );
    const cards = usesWildcard
      ? shuffle(
          ways.flatMap((way, answerIndex) =>
            way.map((symbolId, componentIndex) =>
              componentIndex ===
              choices![answerIndex].wildcardIndex
                ? this.makeWildcardCard(symbolId)
                : this.makeCard(symbolId),
            ),
          ),
          this.random,
        )
      : usesPrefabrication
        ? this.cardsWithPrefabrication(
            ways.flat(),
            prefabricationGroups,
          )
        : usesOverlay
          ? this.cardsWithOverlay(
              ways.flat(),
              overlayGroups,
            )
        : usesRepetition
          ? this.cardsWithRepetition(ways.flat())
        : usesReduction
          ? shuffle(
              choices.flatMap((choice) =>
                choice.reduction
                  ? this.cardsWithReduction(
                      choice.ways[0],
                      choice.reduction,
                    )
                  : [],
              ),
              this.random,
            )
        : shuffle(
            displayWays
              .flat()
              .map((symbolId) => this.makeCard(symbolId)),
            this.random,
          );
    if (usesPrefabrication) {
      for (const group of prefabricationGroups) {
        this.usedPrefabricationHints.add(group.glyph);
      }
    }
    if (
      !this.addRuleDecoy(
        "boss",
        cards,
        ways,
      )
    ) {
      throw new Error("Unable to add the trial boss decoy cards.");
    }
    this.scheduleObscuration("boss", cards);
    this.state.phase = "boss";
    this.state.questionInStage =
      this.state.questionsPerStage + 1;
    this.state.current = null;
    this.state.boss = {
      cards,
      initialCards: cards.map((card) => ({
        ...card,
        ...(card.components
          ? {
              remainingComponents: [...card.components],
              ...(card.displayMode === "quantity"
                ? {
                    remainingQuantity:
                      card.components.length,
                  }
                : {}),
            }
          : {}),
      })),
      expectedAnswers: choices.map((choice) => choice.char),
      expectedDisplayChars: choices.map(
        (choice) => choice.displayChar ?? choice.char,
      ),
      expectedPinyin: choices.map((choice) =>
        displayPinyinFor(this.pinyin, choice.char),
      ),
      expectedWays: ways.map((way) => [...way]),
      displayWays: displayWays.map((way) => [...way]),
      expandedComponents: choices.flatMap((choice) =>
        choice.expandedComponent === undefined
          ? []
          : [choice.expandedComponent],
      ),
      pendingAnswers: [],
      pendingSubmissions: [],
      pendingAnswer: "",
      pendingCardIds: [],
      consumedCardIds: [],
      submissionCount: 0,
    };
    this.state.revealing = false;
    this.state.feedback = "";
    this.state.draft = "";
    this.state.revealAnswer = "";
    this.state.revealPinyin = [];
    this.state.revealMeta = "BOSS";
    this.setQuestionTiming(
      TRIAL_BOSS_SECONDS,
      rule.timing.bossMultiplier,
    );
    choices.forEach((choice, index) => {
      this.recordEncounter(
        choice.char,
        ways[index],
        choice.displayChar,
      );
    });
    this.startTimer();
    this.emit();
  }

  private startHallraumBoss(
    rule: TrialRuleDefinition,
  ): void {
    const plan = this.hallraumBossPlan;
    if (!plan) {
      throw new Error(
        "Hallraum boss plan is not ready.",
      );
    }
    const groups = plan.ways.map((way, index) =>
      this.hallraumCards(
        way,
        plan.inheritedSlots[index],
      ),
    );
    const cards = shuffle(
      groups.flat(),
      this.random,
    );
    this.state.phase = "boss";
    this.state.questionInStage =
      this.state.questionsPerStage + 1;
    this.state.current = null;
    this.state.boss = {
      cards,
      initialCards: cards.map((card) => ({ ...card })),
      expectedAnswers: [...plan.chars],
      expectedDisplayChars: [...plan.chars],
      expectedPinyin: plan.chars.map((char) =>
        displayPinyinFor(this.pinyin, char),
      ),
      expectedWays: [
        [...plan.ways[0]],
        [...plan.ways[1]],
      ],
      displayWays: [
        [...plan.ways[0]],
        [...plan.ways[1]],
      ],
      expandedComponents: [],
      inheritedSources: [
        ...(this.hallraumSteps[
          this.hallraumSteps.length - 1
        ]?.way ?? []),
      ],
      pendingAnswers: [],
      pendingSubmissions: [],
      pendingAnswer: "",
      pendingCardIds: [],
      consumedCardIds: [],
      submissionCount: 0,
    };
    this.state.revealing = false;
    this.state.feedback = "";
    this.state.draft = "";
    this.state.revealAnswer = "";
    this.state.revealPinyin = [];
    this.state.revealMeta = "BOSS";
    this.setQuestionTiming(
      TRIAL_BOSS_SECONDS,
      rule.timing.bossMultiplier,
    );
    plan.chars.forEach((char, index) => {
      this.recordEncounter(char, plan.ways[index]);
    });
    this.startTimer();
    this.emit();
  }

  private startGestaltBoss(
    rule: TrialRuleDefinition,
  ): void {
    const groups = this.pickBossGestaltGroups();
    if (!groups) {
      throw new Error(
        "Unable to generate a Gestalt boss.",
      );
    }
    const groupedCards = groups.map((group) => ({
      cards: group.components.map((symbolId) =>
        this.makeCard(symbolId),
      ),
      answers: group.answers.map((answer) => answer.char),
    }));
    const cards = shuffle(
      groupedCards.flatMap((group) => group.cards),
      this.random,
    );
    const groupsWithCards = groupedCards.map((group) => ({
      cardIds: group.cards.map((card) => card.uid),
      answers: group.answers,
    }));
    const expectedAnswers = groups.map(
      (group) => group.answers[0].char,
    );
    const expectedWays = groups.map(
      (group) =>
        this.data.shortestDecomposition(
          group.answers[0].char,
        ) ?? [...group.components],
    );
    this.state.phase = "boss";
    this.state.questionInStage =
      this.state.questionsPerStage + 1;
    this.state.current = null;
    this.state.boss = {
      cards,
      initialCards: cards.map((card) => ({ ...card })),
      expectedAnswers,
      expectedDisplayChars: [...expectedAnswers],
      expectedPinyin: expectedAnswers.map((char) =>
        displayPinyinFor(this.pinyin, char),
      ),
      expectedWays,
      displayWays: groups.map((group) => [
        ...group.components,
      ]),
      expandedComponents: [],
      gestaltGroups: groupsWithCards,
      pendingAnswers: [],
      pendingSubmissions: [],
      pendingAnswer: "",
      pendingCardIds: [],
      consumedCardIds: [],
      submissionCount: 0,
    };
    this.state.revealing = false;
    this.state.feedback = "";
    this.state.draft = "";
    this.state.revealAnswer = "";
    this.state.revealPinyin = [];
    this.state.revealMeta = "BOSS";
    this.setQuestionTiming(
      TRIAL_BOSS_SECONDS,
      rule.timing.bossMultiplier,
    );
    groups.forEach((group, index) => {
      this.recordEncounter(
        group.answers[0].char,
        expectedWays[index],
      );
    });
    this.startTimer();
    this.emit();
  }

  private startCompositionBoss(
    rule: TrialRuleDefinition,
  ): void {
    if (!this.composition || this.composition.boss.length === 0) {
      throw new Error(
        "Composition boss data is not loaded.",
      );
    }
    const picked = this.pickCompositionEntry(
      this.composition.boss,
      [3, 4],
    );
    if (!picked) {
      throw new Error(
        "Unable to generate a composition boss.",
      );
    }
    const cards = this.compositionCards(picked.recipe);
    const acceptedWords = this.compositionAcceptedWords(
      cards,
      [3, 4],
    );
    if (!acceptedWords.includes(picked.entry.word)) {
      throw new Error(
        "Composition boss cards do not resolve to the selected word.",
      );
    }
    const expectedAnswers = [...picked.entry.word];
    for (const char of expectedAnswers) {
      this.usedStageChars.add(char);
    }
    this.usedStageBags.add(
      `word:${picked.entry.word}`,
    );
    this.state.phase = "boss";
    this.state.questionInStage =
      this.state.questionsPerStage + 1;
    this.state.current = null;
    this.state.boss = {
      cards,
      initialCards: cards.map((card) => ({ ...card })),
      expectedAnswers,
      expectedDisplayChars: [...expectedAnswers],
      expectedPinyin: expectedAnswers.map((char) =>
        displayPinyinFor(this.pinyin, char),
      ),
      expectedWays: picked.recipe.map((way) => [...way]),
      displayWays: picked.recipe.map((way) => [...way]),
      expandedComponents: [],
      acceptedWords,
      pendingAnswers: [],
      pendingSubmissions: [],
      pendingAnswer: "",
      pendingCardIds: [],
      consumedCardIds: [],
      submissionCount: 0,
    };
    this.state.revealing = false;
    this.state.feedback = "";
    this.state.draft = "";
    this.state.revealAnswer = "";
    this.state.revealPinyin = [];
    this.state.revealMeta = "BOSS";
    this.setQuestionTiming(
      TRIAL_BOSS_SECONDS,
      rule.timing.bossMultiplier,
    );
    expectedAnswers.forEach((char, index) => {
      this.recordEncounter(char, picked.recipe[index]);
    });
    this.startTimer();
    this.emit();
  }

  private startAssonanceBoss(
    rule: TrialRuleDefinition,
  ): void {
    if (!this.assonance || this.assonance.boss.length === 0) {
      throw new Error(
        "Assonance boss data is not loaded.",
      );
    }
    const picked = this.pickCompositionEntry(
      this.assonance.boss,
      [3, 4],
    );
    if (!picked) {
      throw new Error(
        "Unable to generate an assonance boss.",
      );
    }
    const cards = this.assonanceCards(picked.recipe);
    const acceptedWords = this.assonanceAcceptedWords(
      cards,
      [3, 4],
    );
    if (!acceptedWords.includes(picked.entry.word)) {
      throw new Error(
        "Assonance boss cards do not resolve to the selected word.",
      );
    }
    const expectedAnswers = [...picked.entry.word];
    for (const char of expectedAnswers) {
      this.usedStageChars.add(char);
    }
    this.usedStageBags.add(
      `assonance:${picked.entry.word}`,
    );
    this.state.phase = "boss";
    this.state.questionInStage =
      this.state.questionsPerStage + 1;
    this.state.current = null;
    this.state.boss = {
      cards,
      initialCards: cards.map((card) => ({ ...card })),
      expectedAnswers,
      expectedDisplayChars: [...expectedAnswers],
      expectedPinyin: expectedAnswers.map((char) =>
        displayPinyinFor(this.pinyin, char),
      ),
      expectedWays: picked.recipe.map((way) => [...way]),
      displayWays: picked.recipe.map((way) => [...way]),
      expandedComponents: [],
      acceptedWords,
      pendingAnswers: [],
      pendingSubmissions: [],
      pendingAnswer: "",
      pendingCardIds: [],
      consumedCardIds: [],
      submissionCount: 0,
    };
    this.state.revealing = false;
    this.state.feedback = "";
    this.state.draft = "";
    this.state.revealAnswer = "";
    this.state.revealPinyin = [];
    this.state.revealMeta = "BOSS";
    this.setQuestionTiming(
      TRIAL_BOSS_SECONDS,
      rule.timing.bossMultiplier,
    );
    expectedAnswers.forEach((char, index) => {
      this.recordEncounter(char, picked.recipe[index]);
    });
    this.startTimer();
    this.emit();
  }

  private startDissonanceBoss(
    rule: TrialRuleDefinition,
  ): void {
    if (!this.assonance || this.assonance.boss.length === 0) {
      throw new Error(
        "Dissonance boss data is not loaded.",
      );
    }
    let picked:
      | {
          entry: CompositionWordEntry;
          recipe: number[][];
        }
      | null = null;
    let cards: TrialCard[] = [];
    for (let attempt = 0; attempt < 256; attempt += 1) {
      picked = this.pickCompositionEntry(
        this.assonance.boss,
        [3, 4],
      );
      if (!picked) {
        break;
      }
      cards = this.dissonanceCards(picked.recipe);
      if (cards.length > 0) {
        break;
      }
    }
    if (
      !picked ||
      cards.length === 0
    ) {
      throw new Error(
        "Unable to generate a dissonance boss.",
      );
    }
    const acceptedWords = this.dissonanceAcceptedWords(
      cards,
      [3, 4],
    );
    if (!acceptedWords.includes(picked.entry.word)) {
      throw new Error(
        "Dissonance boss cards do not resolve to the selected word.",
      );
    }
    const expectedAnswers = [...picked.entry.word];
    for (const char of expectedAnswers) {
      this.usedStageChars.add(char);
    }
    this.usedStageBags.add(
      `dissonance:${picked.entry.word}`,
    );
    this.state.phase = "boss";
    this.state.questionInStage =
      this.state.questionsPerStage + 1;
    this.state.current = null;
    this.state.boss = {
      cards,
      initialCards: cards.map((card) => ({ ...card })),
      expectedAnswers,
      expectedDisplayChars: [...expectedAnswers],
      expectedPinyin: expectedAnswers.map((char) =>
        displayPinyinFor(this.pinyin, char),
      ),
      expectedWays: picked.recipe.map((way) => [...way]),
      displayWays: picked.recipe.map((way) => [...way]),
      expandedComponents: [],
      acceptedWords,
      pendingAnswers: [],
      pendingSubmissions: [],
      pendingAnswer: "",
      pendingCardIds: [],
      consumedCardIds: [],
      submissionCount: 0,
    };
    this.state.revealing = false;
    this.state.feedback = "";
    this.state.draft = "";
    this.state.revealAnswer = "";
    this.state.revealPinyin = [];
    this.state.revealMeta = "BOSS";
    this.setQuestionTiming(
      TRIAL_BOSS_SECONDS,
      rule.timing.bossMultiplier,
    );
    expectedAnswers.forEach((char, index) => {
      this.recordEncounter(char, picked!.recipe[index]);
    });
    this.startTimer();
    this.emit();
  }

  private recordEncounter(
    char: string,
    way: number[],
    _displayChar?: string,
  ): void {
    this.onEncounter(char, way);
  }

  private pickBossPrefabricationGroups(
    ways: number[][],
    expectedAnswers: string[],
  ): Array<{
    indices: [number, number];
    glyph: string;
  }> {
    const components = ways.flat();
    const options = this.prefabricationOptionsForComponents(
      components,
      new Set(expectedAnswers),
    );
    const combinations: Array<
      [
        {
          indices: [number, number];
          glyph: string;
        },
        {
          indices: [number, number];
          glyph: string;
        },
      ]
    > = [];
    for (let left = 0; left < options.length; left += 1) {
      for (
        let right = left + 1;
        right < options.length;
        right += 1
      ) {
        const first = options[left];
        const second = options[right];
        const indices = new Set([
          ...first.indices,
          ...second.indices,
        ]);
        if (
          indices.size !== 4 ||
          first.glyph === second.glyph
        ) {
          continue;
        }
        const groups = [first, second];
        let offsets = 0;
        if (
          expectedAnswers.some((answer, index) => {
            const length = ways[index]?.length ?? 0;
            const positions = Array.from(
              { length },
              (_, offset) => offsets + offset,
            );
            offsets += length;
            return this.prefabricationMatchesExistingWay(
              answer,
              components,
              groups,
              positions,
            );
          })
        ) {
          continue;
        }
        combinations.push([first, second]);
      }
    }
    if (combinations.length === 0) {
      return [];
    }
    return pickRandom(combinations, this.random);
  }

  private pickBossOverlayGroups(
    ways: number[][],
  ): Array<{ indices: [number, number] }> {
    const indices = shuffle(
      ways.flat().map((_, index) => index),
      this.random,
    ).slice(0, 4);
    if (indices.length < 4) {
      return [];
    }
    return [
      {
        indices: [
          Math.min(indices[0], indices[1]),
          Math.max(indices[0], indices[1]),
        ],
      },
      {
        indices: [
          Math.min(indices[2], indices[3]),
          Math.max(indices[2], indices[3]),
        ],
      },
    ];
  }

  private prefabricationMatchesExistingWay(
    answer: string,
    components: readonly number[],
    groups: ReadonlyArray<{
      indices: [number, number];
      glyph: string;
    }>,
    positions = components.map((_, index) => index),
  ): boolean {
    const grouped = new Map<
      number,
      { indices: [number, number]; glyph: string }
    >();
    for (const group of groups) {
      grouped.set(group.indices[0], group);
      grouped.set(group.indices[1], group);
    }
    const symbolIds: number[] = [];
    const emitted = new Set<string>();
    for (const position of positions) {
      const group = grouped.get(position);
      if (!group) {
        symbolIds.push(components[position]);
        continue;
      }
      const key = `${group.indices[0]}:${group.indices[1]}:${group.glyph}`;
      if (!emitted.has(key)) {
        emitted.add(key);
        const symbolId = this.symbolIdByName.get(
          group.glyph,
        );
        if (symbolId === undefined) {
          return false;
        }
        symbolIds.push(symbolId);
      }
    }
    const target = this.symbolIdBagKey(symbolIds);
    return (this.data.ways.get(answer) ?? []).some(
      (way) =>
        this.symbolIdBagKey(way) ===
        target,
    );
  }

  private symbolIdBagKey(symbolIds: readonly number[]): string {
    return [...symbolIds]
      .sort((left, right) => left - right)
      .join(",");
  }

  private pickRepetendBossWays(
    choices: TrialChoice[],
  ): number[][] | null {
    const options = choices.map((choice) =>
      shuffle(choice.ways, this.random),
    );
    if (options.some((ways) => ways.length === 0)) {
      return null;
    }
    const selected: number[][] = [];
    const search = (index: number): number[][] | null => {
      if (index >= options.length) {
        return this.repetendBossWaysAllowed(selected)
          ? selected.map((way) => [...way])
          : null;
      }
      for (const way of options[index]) {
        selected.push(way);
        const result = search(index + 1);
        if (result) {
          return result;
        }
        selected.pop();
      }
      return null;
    };
    return search(0);
  }

  private repetendBossWaysAllowed(
    ways: number[][],
  ): boolean {
    if (ways.length < 2) {
      return false;
    }
    const answerCounts = ways.map((way) =>
      this.componentCounts(way),
    );
    const totalCounts = this.componentCounts(ways.flat());
    if (
      totalCounts.size < 6 ||
      totalCounts.size > 8
    ) {
      return false;
    }
    const repeatedSymbols = [...totalCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([symbolId]) => symbolId);
    if (repeatedSymbols.length < 2) {
      return false;
    }
    return repeatedSymbols.some(
      (symbolId) =>
        answerCounts.filter(
          (counts) => (counts.get(symbolId) ?? 0) > 0,
        ).length >= 2,
    );
  }

  private pickBossChoices(
    lengths: number[],
  ): TrialChoice[] | null {
    if (
      this.activeRule().policy.prompt.boss.mode ===
      "wildcard-components"
    ) {
      return this.pickWildcardBossChoices(lengths);
    }
    if (
      this.activeRule().policy.prompt.boss.mode ===
      "repetend-components"
    ) {
      return this.pickRepetendBossChoices(lengths);
    }
    if (
      this.activeRule().policy.prompt.boss.mode ===
        "prefabricated-components" ||
      this.activeRule().policy.prompt.boss.mode ===
        "overlay-components"
    ) {
      return this.pickPrefabricationBossChoices(lengths);
    }
    if (
      this.activeRule().policy.prompt.boss.mode ===
      "reduction-components"
    ) {
      return this.pickReductionBossChoices(lengths);
    }
    if (
      this.activeRule().policy.prompt.boss.mode ===
      "traditional-components"
    ) {
      return this.pickTraditionalBossChoices(lengths);
    }
    const selected: TrialChoice[] = [];
    for (const length of lengths) {
      let available = this.availableChoices(
        length,
        new Set([
          ...this.usedStageChars,
          ...selected.map((choice) => choice.char),
        ]),
        "boss",
      );
      if (available.length === 0) {
        available = this.availableChoices(
          length,
          new Set([
            ...this.usedStageChars,
            ...selected.map((choice) => choice.char),
          ]),
          "boss",
        );
      }
      if (available.length === 0) {
        return null;
      }
      if (
        length >= 7 &&
        this.activeRule().selection.normal
          .partLengthProgression
      ) {
        const recent = new Set(loadRecentLongChars());
        const fresh = available.filter(
          (choice) => !recent.has(choice.char),
        );
        if (fresh.length > 0) {
          available = fresh;
        }
      }
      const choice = pickRandom(available, this.random);
      if (
        length >= 7 &&
        this.activeRule().selection.normal
          .partLengthProgression
      ) {
        const recent = loadRecentLongChars().filter(
          (char) => char !== choice.char,
        );
        recent.push(choice.char);
        saveRecentLongChars(recent);
      }
      selected.push(choice);
    }
    return selected;
  }

  private gestaltPairFor(
    first: number,
    second: number,
  ): GestaltPair | undefined {
    return this.gestaltPairMap.get(
      this.gestaltPairKey(first, second),
    );
  }

  private pickBossGestaltGroups():
    | [GestaltPair, GestaltPair]
    | null {
    if (!this.gestalt || this.gestalt.pairs.length < 2) {
      return null;
    }
    const availablePairs = this.gestalt.pairs.filter(
      (pair) =>
        pair.answers.every(
          (answer) =>
            !this.usedStageChars.has(answer.char),
        ),
    );
    if (availablePairs.length < 2) {
      return null;
    }
    for (let attempt = 0; attempt < 4096; attempt += 1) {
      const first = pickRandom(
        availablePairs,
        this.random,
      );
      const second = pickRandom(
        availablePairs,
        this.random,
      );
      if (first === second) {
        continue;
      }
      const firstAnswers = new Set(
        first.answers.map((answer) => answer.char),
      );
      if (
        second.answers.some((answer) =>
          firstAnswers.has(answer.char),
        )
      ) {
        continue;
      }
      if (this.gestaltBossPairingIsAllowed(first, second)) {
        for (const answer of [
          ...first.answers,
          ...second.answers,
        ]) {
          this.usedStageChars.add(answer.char);
        }
        return [first, second];
      }
    }
    return null;
  }

  private gestaltBossPairingIsAllowed(
    first: GestaltPair,
    second: GestaltPair,
  ): boolean {
    const [a, b] = first.components;
    const [c, d] = second.components;
    const crossAC = Boolean(this.gestaltPairFor(a, c));
    const crossBD = Boolean(this.gestaltPairFor(b, d));
    const crossAD = Boolean(this.gestaltPairFor(a, d));
    const crossBC = Boolean(this.gestaltPairFor(b, c));
    return !(
      (crossAC && crossBD) ||
      (crossAD && crossBC)
    );
  }

  private pickReductionBossChoices(
    lengths: number[],
  ): TrialChoice[] | null {
    const selected: TrialChoice[] = [];
    const reservedSources = new Set(
      this.usedReductionSources,
    );
    for (const length of lengths) {
      let available = this.availableChoices(
        length,
        new Set([
          ...this.usedStageChars,
          ...selected.map((choice) => choice.char),
        ]),
        "boss",
      );
      if (available.length === 0) {
        available = this.availableChoices(
          length,
          new Set([
            ...this.usedStageChars,
            ...selected.map((choice) => choice.char),
          ]),
          "boss",
        );
      }
      const candidates = available
        .map((choice) => ({
          choice,
          options: choice.ways.flatMap((way) =>
            this.reductionOptionsForWay(
              way,
              reservedSources,
            ).map((option) => ({ way, option })),
          ),
        }))
        .filter(({ options }) => options.length > 0);
      if (candidates.length === 0) {
        return null;
      }
      const picked = pickRandom(candidates, this.random);
      const resolution = pickRandom(
        picked.options,
        this.random,
      );
      const displayWay = [...resolution.way];
      displayWay.splice(
        resolution.option.sourceIndex,
        1,
        ...resolution.option.parts,
      );
      reservedSources.add(
        resolution.option.sourceSymbolId,
      );
      selected.push({
        char: picked.choice.char,
        ways: [[...resolution.way]],
        displayWay,
        expandedComponent:
          resolution.option.sourceSymbolId,
        reduction: {
          sourceIndex: resolution.option.sourceIndex,
          parts: [
            resolution.option.parts[0],
            resolution.option.parts[1],
          ],
        },
      });
    }
    for (const source of reservedSources) {
      this.usedReductionSources.add(source);
    }
    return selected;
  }

  private pickWildcardBossChoices(
    lengths: number[],
  ): TrialChoice[] | null {
    const selected: TrialChoice[] = [];
    for (const length of lengths) {
      let available = this.availableChoices(
        length,
        new Set([
          ...this.usedStageChars,
          ...selected.map((choice) => choice.char),
        ]),
        "boss",
      );
      if (available.length === 0) {
        available = this.availableChoices(
          length,
          new Set([
            ...this.usedStageChars,
            ...selected.map((choice) => choice.char),
          ]),
          "boss",
        );
      }
      let resolved: TrialChoice | null = null;
      for (const choice of shuffle(
        available,
        this.random,
      )) {
        for (const way of shuffle(
          choice.ways,
          this.random,
        )) {
          const wildcard =
            this.resolveWildcardForWay(way);
          if (!wildcard) {
            continue;
          }
          resolved = {
            char: choice.char,
            ways: [[...way]],
            wildcardIndex: wildcard.index,
            wildcardAnswers: wildcard.answers,
          };
          break;
        }
        if (resolved) {
          break;
        }
      }
      if (!resolved) {
        return null;
      }
      selected.push(resolved);
    }
    return selected;
  }

  private pickPrefabricationBossChoices(
    lengths: number[],
  ): TrialChoice[] | null {
    const selected: TrialChoice[] = [];
    for (const length of lengths) {
      let available = this.availableChoices(
        length,
        new Set([
          ...this.usedStageChars,
          ...selected.map((choice) => choice.char),
        ]),
        "boss",
      );
      if (available.length === 0) {
        available = this.availableChoices(
          length,
          new Set([
            ...this.usedStageChars,
            ...selected.map((choice) => choice.char),
          ]),
          "boss",
        );
      }
      if (available.length === 0) {
        return null;
      }
      const choice = pickRandom(available, this.random);
      selected.push({
        char: choice.char,
        ways: [
          [...pickRandom(choice.ways, this.random)],
        ],
      });
    }
    return selected;
  }

  private pickRepetendBossChoices(
    lengths: number[],
  ): TrialChoice[] | null {
    const selected: TrialChoice[] = [];
    for (const length of lengths) {
      let available = this.availableChoices(
        length,
        new Set([
          ...this.usedStageChars,
          ...selected.map((choice) => choice.char),
        ]),
        "boss",
      );
      if (available.length === 0) {
        available = this.availableChoices(
          length,
          new Set([
            ...this.usedStageChars,
            ...selected.map((choice) => choice.char),
          ]),
          "boss",
        );
      }
      if (available.length === 0) {
        return null;
      }
      const choice = pickRandom(available, this.random);
      selected.push({
        char: choice.char,
        ways: choice.ways.map((way) => [...way]),
      });
    }
    return selected;
  }

  private pickTraditionalBossChoices(
    lengths: number[],
  ): TrialChoice[] | null {
    const selected: TrialChoice[] = [];
    for (const length of lengths) {
      let available = this.availableTraditionalChoices(
        length,
      ).filter(
        (choice) =>
          !this.usedStageChars.has(choice.char) &&
          !selected.some(
            (picked) => picked.char === choice.char,
          ),
      );
      if (available.length === 0) {
        available = this.availableTraditionalChoices(
          length,
        ).filter(
          (choice) =>
            !selected.some(
              (picked) => picked.char === choice.char,
            ),
        );
      }
      if (available.length === 0) {
        return null;
      }
      selected.push(pickRandom(available, this.random));
    }
    return selected;
  }

  private submitBoss(): void {
    if (!this.state.boss) {
      return;
    }
    const raw = this.state.draft.trim();
    if (
      this.activeRule().policy.answer.boss.input ===
        "word" &&
      this.state.boss.acceptedWords
    ) {
      this.submitCompositionBoss(raw);
      return;
    }
    const inputMode =
      this.activeRule().policy.answer.boss.input;
    const pinyinSubmission =
      inputMode === "pinyin"
        ? this.resolveBossPinyinSubmission(raw)
        : null;
    const chars =
      inputMode === "pinyin"
        ? pinyinSubmission?.chars ?? []
        : [...raw];
    const pendingAnswers = this.state.boss.pendingAnswers;
    const assignment =
      inputMode === "pinyin"
        ? pinyinSubmission?.assignment ?? null
        : this.assignBossAnswers(chars);
    if (
      chars.length === 0 ||
      chars.length >
        this.state.boss.expectedAnswers.length -
          pendingAnswers.length ||
      new Set([...pendingAnswers, ...chars]).size !==
        pendingAnswers.length + chars.length ||
      !assignment
    ) {
      this.state.feedback = "wrong";
      this.emit();
      return;
    }
    this.state.boss.cards = assignment.remainingCards;
    this.state.boss.pendingSubmissions.push(
      ...assignment.submissions,
    );
    this.state.boss.pendingAnswers.push(...chars);
    this.state.boss.pendingAnswer =
      this.state.boss.pendingAnswers.join("");
    this.state.boss.pendingCardIds.push(
      ...assignment.submissions.flatMap(
        (submission) => submission.cardIds,
      ),
    );
    this.state.boss.consumedCardIds =
      this.consumedBossCardIds(
        assignment.remainingCards,
      );
    this.state.boss.submissionCount =
      this.state.boss.pendingAnswers.length;
    this.state.draft = "";
    if (
      this.state.boss.pendingAnswers.length ===
      this.state.boss.expectedAnswers.length
    ) {
      if (
        this.remainingAnswerComponents(
          this.state.boss.cards,
        ).length === 0
      ) {
        this.completeBoss(this.state.boss.pendingAnswer);
      } else {
        this.state.feedback = "wrong";
        this.emit();
      }
      return;
    }
    this.state.feedback = "partial";
    this.emit();
  }

  private submitCompositionBoss(raw: string): void {
    if (!this.state.boss || !raw) {
      return;
    }
    const boss = this.state.boss;
    const newChars = [...raw];
    const currentPrefix = boss.pendingAnswer;
    const sequence = `${currentPrefix}${raw}`;
    const acceptedWords = boss.acceptedWords ?? [];
    const matchingWords = acceptedWords.filter((word) =>
      word.startsWith(sequence),
    );
    if (matchingWords.length === 0) {
      this.state.feedback = "wrong";
      this.emit();
      return;
    }
    const assignment =
      this.activeRule().policy.prompt.boss.mode ===
      "dissonance-components"
        ? this.assignDissonanceBossPrefix(
            boss.cards,
            newChars,
            [...currentPrefix].length,
            matchingWords,
          )
        : this.assignCompositionBossPrefix(
            boss.cards,
            newChars,
            [...currentPrefix].length,
            matchingWords,
          );
    if (!assignment) {
      this.state.feedback = "wrong";
      this.emit();
      return;
    }
    boss.cards = assignment.remainingCards;
    boss.pendingSubmissions.push(
      ...assignment.submissions,
    );
    boss.pendingAnswers.push(...newChars);
    boss.pendingAnswer = sequence;
    boss.pendingCardIds.push(
      ...assignment.submissions.flatMap(
        (submission) => submission.cardIds,
      ),
    );
    boss.consumedCardIds = this.consumedBossCardIds(
      assignment.remainingCards,
    );
    boss.submissionCount = boss.pendingAnswers.length;
    this.state.draft = "";
    if (acceptedWords.includes(sequence)) {
      this.completeBoss(sequence);
      return;
    }
    this.state.feedback = "partial";
    this.emit();
  }

  private resolveBossPinyinSubmission(raw: string): {
    chars: string[];
    assignment: TrialBossAssignment;
  } | null {
    if (!this.state.boss || !raw) {
      return null;
    }
    const tokens = raw
      .split(/\s+/)
      .map(normalizePinyinInput)
      .filter(Boolean);
    const available = this.state.boss.expectedAnswers.filter(
      (char) =>
        !this.state.boss?.pendingAnswers.includes(char),
    );
    if (
      tokens.length === 0 ||
      tokens.length > available.length
    ) {
      return null;
    }
    const choices = tokens.map((token) =>
      available.filter((char) =>
        acceptedPinyinFor(this.pinyin, char).includes(
          token,
        ),
      ),
    );
    if (choices.some((candidates) => candidates.length === 0)) {
      return null;
    }
    const chosen: string[] = [];
    const search = (index: number): {
      chars: string[];
      assignment: TrialBossAssignment;
    } | null => {
      if (index >= tokens.length) {
        const assignment = this.assignBossAnswers(chosen);
        return assignment
          ? { chars: [...chosen], assignment }
          : null;
      }
      for (const char of choices[index]) {
        if (chosen.includes(char)) {
          continue;
        }
        chosen.push(char);
        const result = search(index + 1);
        if (result) {
          return result;
        }
        chosen.pop();
      }
      return null;
    };
    return search(0);
  }

  private acceptedAnswersForCards(
    cards: TrialCard[],
  ): Set<string> {
    if (
      this.activeRule().policy.prompt.boss.mode !==
        "traditional-components" ||
      !this.state.boss
    ) {
      return this.data.accepted(
        cards.flatMap((card) =>
          this.cardComponents(card),
        ),
      );
    }
    const bag = cards
      .map((card) => card.symbolId)
      .sort((left, right) => left - right)
      .join(",");
    const accepted = new Set<string>();
    this.state.boss.expectedWays.forEach((way, index) => {
      const expectedBag = [...way]
        .sort((left, right) => left - right)
        .join(",");
      if (
        expectedBag === bag &&
        this.state.boss?.expectedAnswers[index]
      ) {
        accepted.add(
          this.state.boss.expectedAnswers[index],
        );
      }
    });
    return accepted;
  }

  private assignBossAnswers(
    answers: string[],
  ): TrialBossAssignment | null {
    if (!this.state.boss) {
      return null;
    }
    if (this.ruleInheritsCards("boss")) {
      return this.assignHallraumBossAnswers(answers);
    }
    if (
      this.activeRule().policy.prompt.boss.mode ===
      "gestalt-components"
    ) {
      return this.assignGestaltBossAnswers(answers);
    }
    if (
      this.activeRule().policy.prompt.boss.mode ===
      "wildcard-components"
    ) {
      return this.assignWildcardBossAnswers(answers);
    }
    if (
      this.activeRule().policy.prompt.boss.mode ===
      "repetend-components"
    ) {
      return this.assignRepetendBossAnswers(answers);
    }
    if (
      this.activeRule().policy.prompt.boss.mode ===
        "prefabricated-components" ||
      this.activeRule().policy.prompt.boss.mode ===
        "overlay-components"
    ) {
      return this.assignPrefabricatedBossAnswers(
        answers,
      );
    }
    const allowedLengths = new Set(
      this.activeRule().selection.boss.partLengths,
    );
    const allowsUnexpectedOutlandAnswer =
      this.activeRule().family?.id === "outland";
    const submissions: TrialBossSubmission[] = [];
    let fallback: TrialBossAssignment | null = null;
    const search = (
      answerIndex: number,
      cards: TrialCard[],
    ): TrialBossAssignment | null => {
      if (answerIndex >= answers.length) {
        const assignment = {
          remainingCards: cards,
          submissions: submissions.map(
            (submission) => ({
              ...submission,
              cardIds: [...submission.cardIds],
              componentUses:
                submission.componentUses.map((use) => ({
                  ...use,
                })),
            }),
          ),
        };
        if (
          this.remainingAnswerComponents(cards).length === 0
        ) {
          return assignment;
        }
        fallback ??= assignment;
        return null;
      }
      const answerCards = cards.filter(
        (card) => !card.mustIgnore,
      );
      const limit = 1 << answerCards.length;
      for (let mask = 1; mask < limit; mask += 1) {
        const selected = cardsForMask(answerCards, mask);
        if (
          !allowsUnexpectedOutlandAnswer &&
          !allowedLengths.has(selected.length)
        ) {
          continue;
        }
        if (
          !this.acceptedAnswersForCards(selected).has(
            answers[answerIndex],
          )
        ) {
          continue;
        }
        const remaining = cards.filter(
          (card) =>
            !selected.some((used) => used.uid === card.uid),
        );
        submissions.push({
          answer: answers[answerIndex],
          cardIds: selected.map((card) => card.uid),
          componentUses: selected.map((card) => ({
            cardUid: card.uid,
            symbolId: card.symbolId,
          })),
        });
        const result = search(
          answerIndex + 1,
          remaining,
        );
        if (result) {
          return result;
        }
        submissions.pop();
      }
      return null;
    };
    return search(0, this.state.boss.cards) ?? fallback;
  }

  private bossAnswerCandidatesForCards(
    cards: TrialCard[],
  ): Set<string> {
    const mode =
      this.activeRule().policy.prompt.boss.mode;
    const playable = cards.filter(
      (card) => !card.mustIgnore,
    );
    if (
      !this.activeRule().selection.boss.partLengths.includes(
        playable.length,
      )
    ) {
      return new Set();
    }
    if (mode === "gestalt-components") {
      return this.data.acceptedContaining(
        playable.map((card) => card.symbolId),
      );
    }
    if (mode === "wildcard-components") {
      const wildcards = playable.filter(
        (card) => card.displayMode === "wildcard",
      );
      if (wildcards.length !== 1) {
        return new Set();
      }
      return this.wildcardAcceptedAnswers(
        playable
          .filter((card) => card !== wildcards[0])
          .map((card) => card.symbolId),
      );
    }
    if (mode === "repetend-components") {
      return new Set(
        Object.keys(
          this.repetendAcceptedForCards(playable),
        ),
      );
    }
    if (
      this.ruleInheritsCards("boss") &&
      playable.filter(
        (card) => card.source === "inherited",
      ).length !== 1
    ) {
      return new Set();
    }
    return this.acceptedAnswersForCards(playable);
  }

  private resolveBossRevealAnswers(): string[] {
    if (!this.state.boss) {
      return [];
    }
    const boss = this.state.boss;
    const expected = [...boss.expectedAnswers];
    const submitted = [
      ...new Set(boss.pendingAnswers),
    ];
    if (boss.acceptedWords?.length) {
      const submittedPrefix = boss.pendingAnswer;
      const word =
        boss.acceptedWords.find((candidate) =>
          candidate.startsWith(submittedPrefix),
        ) ?? boss.acceptedWords[0];
      return [...word];
    }
    const completesFromInitial = (
      sequence: string[],
    ): boolean => {
      if (
        sequence.length !== expected.length ||
        new Set(sequence).size !== sequence.length
      ) {
        return false;
      }
      const currentCards = boss.cards;
      boss.cards = boss.initialCards.map((card) => ({
        ...card,
        ...(card.components
          ? {
              remainingComponents: [...card.components],
              ...(card.displayMode === "quantity"
                ? {
                    remainingQuantity:
                      card.components.length,
                  }
                : {}),
            }
          : {}),
      }));
      const assignment = this.assignBossAnswers(sequence);
      boss.cards = currentCards;
      return (
        assignment !== null &&
        assignment.remainingCards.length === 0
      );
    };
    if (submitted.length >= expected.length) {
      const sequence = submitted.slice(0, expected.length);
      if (completesFromInitial(sequence)) {
        return sequence;
      }
    }
    for (const submittedChar of submitted) {
      const sequence = [
        submittedChar,
        ...expected.filter(
          (char) => char !== submittedChar,
        ),
      ].slice(0, expected.length);
      if (completesFromInitial(sequence)) {
        return sequence;
      }
    }
    if (expected.length !== 2) {
      return expected;
    }
    const playable = boss.initialCards.filter(
      (card) => !card.mustIgnore,
    );
    const limit = 1 << playable.length;
    const partitions: Array<{
      first: Set<string>;
      second: Set<string>;
    }> = [];
    for (let mask = 1; mask < limit - 1; mask += 1) {
      const firstCards = cardsForMask(playable, mask);
      const secondCards = playable.filter(
        (_, index) => (mask & (1 << index)) === 0,
      );
      const first =
        this.bossAnswerCandidatesForCards(firstCards);
      if (first.size === 0) {
        continue;
      }
      const second =
        this.bossAnswerCandidatesForCards(secondCards);
      if (second.size === 0) {
        continue;
      }
      partitions.push({ first, second });
    }
    const chooseOther = (
      candidates: Set<string>,
      excluded: string,
    ): string | null => {
      const preferred = expected.find(
        (char) =>
          char !== excluded && candidates.has(char),
      );
      if (preferred) {
        return preferred;
      }
      return (
        [...candidates]
          .filter((char) => char !== excluded)
          .sort((left, right) =>
            left.localeCompare(right, "zh-CN"),
          )[0] ?? null
      );
    };
    if (submitted.length >= 2) {
      for (const partition of partitions) {
        if (
          partition.first.has(submitted[0]) &&
          partition.second.has(submitted[1])
        ) {
          return [submitted[0], submitted[1]];
        }
        if (
          partition.second.has(submitted[0]) &&
          partition.first.has(submitted[1])
        ) {
          return [submitted[0], submitted[1]];
        }
      }
    }
    for (const submittedChar of submitted) {
      for (const partition of partitions) {
        if (partition.first.has(submittedChar)) {
          const other = chooseOther(
            partition.second,
            submittedChar,
          );
          if (other) {
            return [submittedChar, other];
          }
        }
        if (partition.second.has(submittedChar)) {
          const other = chooseOther(
            partition.first,
            submittedChar,
          );
          if (other) {
            return [submittedChar, other];
          }
        }
      }
    }
    return expected;
  }

  private assignHallraumBossAnswers(
    answers: string[],
  ): TrialBossAssignment | null {
    if (!this.state.boss) {
      return null;
    }
    const boss = this.state.boss;
    const inheritedSources = boss.inheritedSources ?? [];
    const usedSources = new Set(
      boss.pendingSubmissions.flatMap((submission) =>
        submission.componentUses
          .filter((use) => use.inherited)
          .map((use) => use.sourceIndex)
          .filter(
            (index): index is number =>
              index !== undefined,
          ),
      ),
    );
    const allowedLengths = new Set(
      this.activeRule().selection.boss.partLengths,
    );
    const submissions: TrialBossSubmission[] = [];
    let fallback: TrialBossAssignment | null = null;
    const search = (
      answerIndex: number,
      cards: TrialCard[],
      reservedSources: Set<number>,
    ): TrialBossAssignment | null => {
      if (answerIndex >= answers.length) {
        const assignment = {
          remainingCards: cards,
          submissions: submissions.map((submission) =>
            this.cloneBossSubmission(submission),
          ),
        };
        if (
          this.remainingAnswerComponents(cards).length === 0
        ) {
          return assignment;
        }
        const remainingAnswerCount =
          boss.expectedAnswers.length -
          boss.pendingAnswers.length -
          answers.length;
        if (
          remainingAnswerCount > 0 &&
          this.canCompleteHallraumBossCards(
            cards,
            remainingAnswerCount,
            reservedSources,
            new Set([
              ...boss.pendingAnswers,
              ...answers,
            ]),
          )
        ) {
          return assignment;
        }
        fallback ??= assignment;
        return null;
      }
      const inheritedCards = cards.filter(
        (card) =>
          !card.mustIgnore &&
          card.source === "inherited",
      );
      const knownCards = cards.filter(
        (card) =>
          !card.mustIgnore &&
          card.source !== "inherited",
      );
      for (const inheritedCard of inheritedCards) {
        for (
          let sourceIndex = 0;
          sourceIndex < inheritedSources.length;
          sourceIndex += 1
        ) {
          if (reservedSources.has(sourceIndex)) {
            continue;
          }
          const sourceSymbol =
            inheritedSources[sourceIndex];
          const limit = 1 << knownCards.length;
          for (let mask = 0; mask < limit; mask += 1) {
            const selectedKnown = knownCards.filter(
              (_, index) =>
                (mask & (1 << index)) !== 0,
            );
            const selected = [
              ...selectedKnown,
              inheritedCard,
            ];
            if (
              !allowedLengths.has(selected.length) ||
              !this.data
                .accepted([
                  ...selectedKnown.map(
                    (card) => card.symbolId,
                  ),
                  sourceSymbol,
                ])
                .has(answers[answerIndex])
            ) {
              continue;
            }
            const remaining = cards.filter(
              (card) =>
                !selected.some(
                  (used) => used.uid === card.uid,
                ),
            );
            submissions.push({
              answer: answers[answerIndex],
              cardIds: selected.map((card) => card.uid),
              componentUses: [
                ...selectedKnown.map((card) => ({
                  cardUid: card.uid,
                  symbolId: card.symbolId,
                })),
                {
                  cardUid: inheritedCard.uid,
                  symbolId: sourceSymbol,
                  inherited: true,
                  sourceIndex,
                },
              ],
            });
            const result = search(
              answerIndex + 1,
              remaining,
              new Set([
                ...reservedSources,
                sourceIndex,
              ]),
            );
            if (result) {
              return result;
            }
            submissions.pop();
          }
        }
      }
      return null;
    };
    return (
      search(
        0,
        this.state.boss.cards,
        usedSources,
      ) ?? fallback
    );
  }

  private canCompleteHallraumBossCards(
    cards: TrialCard[],
    answerCount: number,
    reservedSources: Set<number>,
    reservedAnswers: Set<string>,
  ): boolean {
    if (answerCount === 0) {
      return this.remainingAnswerComponents(cards).length === 0;
    }
    if (!this.state.boss) {
      return false;
    }
    const allowedLengths = new Set(
      this.activeRule().selection.boss.partLengths,
    );
    const inheritedSources =
      this.state.boss.inheritedSources ?? [];
    const inheritedCards = cards.filter(
      (card) =>
        !card.mustIgnore &&
        card.source === "inherited",
    );
    const knownCards = cards.filter(
      (card) =>
        !card.mustIgnore &&
        card.source !== "inherited",
    );
    for (const inheritedCard of inheritedCards) {
      for (
        let sourceIndex = 0;
        sourceIndex < inheritedSources.length;
        sourceIndex += 1
      ) {
        if (reservedSources.has(sourceIndex)) {
          continue;
        }
        const limit = 1 << knownCards.length;
        for (let mask = 0; mask < limit; mask += 1) {
          const selectedKnown = knownCards.filter(
            (_, index) => (mask & (1 << index)) !== 0,
          );
          if (
            !allowedLengths.has(
              selectedKnown.length + 1,
            )
          ) {
            continue;
          }
          const candidates = this.data.accepted([
            ...selectedKnown.map(
              (card) => card.symbolId,
            ),
            inheritedSources[sourceIndex],
          ]);
          const selectedIds = new Set([
            inheritedCard.uid,
            ...selectedKnown.map((card) => card.uid),
          ]);
          const remaining = cards.filter(
            (card) => !selectedIds.has(card.uid),
          );
          for (const candidate of candidates) {
            if (reservedAnswers.has(candidate)) {
              continue;
            }
            if (
              this.canCompleteHallraumBossCards(
                remaining,
                answerCount - 1,
                new Set([
                  ...reservedSources,
                  sourceIndex,
                ]),
                new Set([
                  ...reservedAnswers,
                  candidate,
                ]),
              )
            ) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  private assignCompositionBossPrefix(
    cards: TrialCard[],
    newChars: string[],
    prefixLength: number,
    matchingWords: string[],
  ): TrialBossAssignment | null {
    const submissions: TrialBossSubmission[] = [];
    const search = (
      index: number,
      remainingCards: TrialCard[],
    ): TrialBossAssignment | null => {
      if (index >= newChars.length) {
        const nextLength = prefixLength + newChars.length;
        for (const word of matchingWords) {
          const suffix = [...word].slice(nextLength);
          if (
            suffix.length === 0
              ? this.remainingAnswerComponents(
                  remainingCards,
                ).length === 0
              : this.wordCanUseCardsForRule(
                  suffix.join(""),
                  remainingCards,
                )
          ) {
            return {
              remainingCards,
              submissions: submissions.map((submission) =>
                this.cloneBossSubmission(submission),
              ),
            };
          }
        }
        return null;
      }
      const ways = this.data
        .expandedDecompositions(newChars[index])
        .filter((way) => way.length >= 1 && way.length <= 10);
      for (const way of ways) {
        const uses = this.componentUsesForBag(
          remainingCards,
          way,
        );
        if (!uses) {
          continue;
        }
        const nextCards = this.consumeBossComponentUses(
          remainingCards,
          uses,
        );
        submissions.push({
          answer: newChars[index],
          cardIds: [
            ...new Set(uses.map((use) => use.cardUid)),
          ],
          componentUses: uses.map((use) => ({ ...use })),
        });
        const result = search(index + 1, nextCards);
        if (result) {
          return result;
        }
        submissions.pop();
      }
      return null;
    };
    return search(0, cards);
  }

  private assignDissonanceBossPrefix(
    cards: TrialCard[],
    newChars: string[],
    prefixLength: number,
    matchingWords: string[],
  ): TrialBossAssignment | null {
    if (!this.state.boss) {
      return null;
    }
    for (const word of matchingWords) {
      const assignment = this.dissonanceGroupAssignment(
        word,
        this.state.boss.initialCards,
      );
      if (!assignment) {
        continue;
      }
      let remainingCards = cards;
      const submissions: TrialBossSubmission[] = [];
      let valid = true;
      for (
        let index = 0;
        index < newChars.length;
        index += 1
      ) {
        const group = assignment[prefixLength + index];
        if (group === undefined) {
          valid = false;
          break;
        }
        if (group < 0) {
          submissions.push({
            answer: newChars[index],
            cardIds: [],
            componentUses: [],
          });
          continue;
        }
        const groupCards = remainingCards.filter(
          (card) => card.groupColor === group,
        );
        if (groupCards.length === 0) {
          valid = false;
          break;
        }
        const uses = groupCards.map((card) => ({
          cardUid: card.uid,
          symbolId: card.symbolId,
        }));
        remainingCards = this.consumeBossComponentUses(
          remainingCards,
          uses,
        );
        submissions.push({
          answer: newChars[index],
          cardIds: groupCards.map((card) => card.uid),
          componentUses: uses,
        });
      }
      if (valid) {
        return {
          remainingCards,
          submissions,
        };
      }
    }
    return null;
  }

  private wordCanUseCardsForRule(
    word: string,
    cards: TrialCard[],
  ): boolean {
    const mode =
      this.activeRule().policy.prompt.boss.mode;
    if (mode === "assonance-components") {
      return this.assonanceWordCanUseCards(word, cards);
    }
    if (mode === "dissonance-components") {
      return this.dissonanceWordCanUseCards(word, cards);
    }
    return this.wordCanUseCards(word, cards);
  }

  private assignGestaltBossAnswers(
    answers: string[],
  ): TrialBossAssignment | null {
    if (
      !this.state.boss?.gestaltGroups ||
      this.state.boss.gestaltGroups.length === 0
    ) {
      return null;
    }
    const groups = this.state.boss.gestaltGroups;
    const submissions: TrialBossSubmission[] = [];
    const search = (
      answerIndex: number,
      cards: TrialCard[],
      usedGroups: Set<number>,
    ): TrialBossAssignment | null => {
      if (answerIndex >= answers.length) {
        return {
          remainingCards: cards,
          submissions: submissions.map(
            (submission) =>
              this.cloneBossSubmission(submission),
          ),
        };
      }
      for (
        let groupIndex = 0;
        groupIndex < groups.length;
        groupIndex += 1
      ) {
        if (usedGroups.has(groupIndex)) {
          continue;
        }
        const group = groups[groupIndex];
        const groupCards = cards.filter((card) =>
          group.cardIds.includes(card.uid),
        );
        if (groupCards.length !== group.cardIds.length) {
          continue;
        }
        const accepted = this.data.acceptedContaining(
          groupCards.map((card) => card.symbolId),
        );
        if (!accepted.has(answers[answerIndex])) {
          continue;
        }
        const remaining = cards.filter(
          (card) => !group.cardIds.includes(card.uid),
        );
        submissions.push({
          answer: answers[answerIndex],
          cardIds: [...group.cardIds],
          componentUses: groupCards.map((card) => ({
            cardUid: card.uid,
            symbolId: card.symbolId,
          })),
        });
        const result = search(
          answerIndex + 1,
          remaining,
          new Set([...usedGroups, groupIndex]),
        );
        if (result) {
          return result;
        }
        submissions.pop();
      }
      return null;
    };
    return search(
      0,
      this.state.boss.cards,
      new Set(),
    );
  }

  private assignWildcardBossAnswers(
    answers: string[],
  ): TrialBossAssignment | null {
    if (!this.state.boss) {
      return null;
    }
    const boss = this.state.boss;
    const allowedLengths = new Set(
      this.activeRule().selection.boss.partLengths,
    );
    const submissions: TrialBossSubmission[] = [];
    let fallback: TrialBossAssignment | null = null;
    const search = (
      answerIndex: number,
      cards: TrialCard[],
    ): TrialBossAssignment | null => {
      if (answerIndex >= answers.length) {
        const assignment = {
          remainingCards: cards,
          submissions: submissions.map(
            (submission) =>
              this.cloneBossSubmission(submission),
          ),
        };
        if (
          this.remainingAnswerComponents(cards).length === 0
        ) {
          return assignment;
        }
        const remainingAnswerCount =
          boss.expectedAnswers.length -
          boss.pendingAnswers.length -
          answers.length;
        if (
          remainingAnswerCount > 0 &&
          this.canCompleteWildcardBossCards(
            cards,
            remainingAnswerCount,
            new Set([
              ...boss.pendingAnswers,
              ...answers,
            ]),
          )
        ) {
          return assignment;
        }
        fallback ??= assignment;
        return null;
      }
      const wildcards = cards.filter(
        (card) =>
          !card.mustIgnore &&
          card.displayMode === "wildcard",
      );
      const knownCards = cards.filter(
        (card) =>
          !card.mustIgnore &&
          card.displayMode !== "wildcard",
      );
      for (const wildcard of wildcards) {
        const limit = 1 << knownCards.length;
        for (let mask = 0; mask < limit; mask += 1) {
          const selectedKnown = knownCards.filter(
            (_, index) => (mask & (1 << index)) !== 0,
          );
          const selected = [...selectedKnown, wildcard];
          if (
            !allowedLengths.has(selected.length) ||
            !this.wildcardCanForm(
              selectedKnown.map((card) => card.symbolId),
              answers[answerIndex],
            )
          ) {
            continue;
          }
          const remaining = cards.filter(
            (card) =>
              !selected.some(
                (used) => used.uid === card.uid,
              ),
          );
          submissions.push({
            answer: answers[answerIndex],
            cardIds: selected.map((card) => card.uid),
            componentUses: [
              ...selectedKnown.map((card) => ({
                cardUid: card.uid,
                symbolId: card.symbolId,
              })),
              {
                cardUid: wildcard.uid,
                symbolId: wildcard.symbolId,
                wildcard: true,
              },
            ],
          });
          const result = search(
            answerIndex + 1,
            remaining,
          );
          if (result) {
            return result;
          }
          submissions.pop();
        }
      }
      return null;
    };
    return search(0, this.state.boss.cards) ?? fallback;
  }

  private canCompleteWildcardBossCards(
    cards: TrialCard[],
    answerCount: number,
    reservedAnswers: Set<string>,
  ): boolean {
    if (answerCount === 0) {
      return this.remainingAnswerComponents(cards).length === 0;
    }
    const allowedLengths = new Set(
      this.activeRule().selection.boss.partLengths,
    );
    const wildcards = cards.filter(
      (card) =>
        !card.mustIgnore &&
        card.displayMode === "wildcard",
    );
    const knownCards = cards.filter(
      (card) =>
        !card.mustIgnore &&
        card.displayMode !== "wildcard",
    );
    for (const wildcard of wildcards) {
      const limit = 1 << knownCards.length;
      for (let mask = 0; mask < limit; mask += 1) {
        const selectedKnown = knownCards.filter(
          (_, index) => (mask & (1 << index)) !== 0,
        );
        const selected = [...selectedKnown, wildcard];
        if (!allowedLengths.has(selected.length)) {
          continue;
        }
        const candidates = [
          ...this.wildcardAcceptedAnswers(
            selectedKnown.map((card) => card.symbolId),
          ),
        ].filter((answer) => !reservedAnswers.has(answer));
        const remaining = cards.filter(
          (card) =>
            !selected.some(
              (used) => used.uid === card.uid,
            ),
        );
        for (const candidate of candidates) {
          if (
            this.canCompleteWildcardBossCards(
              remaining,
              answerCount - 1,
              new Set([...reservedAnswers, candidate]),
            )
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }

  private wildcardCanForm(
    known: readonly number[],
    answer: string,
  ): boolean {
    return this.wildcardAcceptedAnswers(known).has(answer);
  }

  private wildcardAcceptedAnswers(
    known: readonly number[],
  ): Set<string> {
    const key = [...known]
      .sort((left, right) => left - right)
      .join(",");
    const cached = this.wildcardAcceptedCache.get(key);
    if (cached) {
      return cached;
    }
    const answers = new Set<string>();
    for (const componentId of this.data.componentIds()) {
      for (const answer of this.data.accepted([
        ...known,
        componentId,
      ])) {
        answers.add(answer);
      }
    }
    this.wildcardAcceptedCache.set(key, answers);
    return answers;
  }

  private assignRepetendBossAnswers(
    answers: string[],
  ): TrialBossAssignment | null {
    if (!this.state.boss) {
      return null;
    }
    const allowedLengths = new Set(
      this.activeRule().selection.boss.partLengths,
    );
    const submissions: TrialBossSubmission[] = [];
    let fallback: TrialBossAssignment | null = null;
    const search = (
      answerIndex: number,
      cards: TrialCard[],
    ): TrialBossAssignment | null => {
      if (answerIndex >= answers.length) {
        const assignment = {
          remainingCards: cards,
          submissions: submissions.map((submission) =>
            this.cloneBossSubmission(submission),
          ),
        };
        if (
          this.remainingAnswerComponents(cards).length === 0
        ) {
          return assignment;
        }
        fallback ??= assignment;
        return null;
      }
      const ways = shuffle(
        this.data
          .expandedDecompositions(answers[answerIndex])
          .filter((way) =>
            allowedLengths.has(way.length),
          ),
        this.random,
      );
      for (const way of ways) {
        const uses = this.componentUsesForBag(
          cards,
          way,
        );
        if (!uses) {
          continue;
        }
        const remaining = this.consumeBossComponentUses(
          cards,
          uses,
        );
        submissions.push({
          answer: answers[answerIndex],
          cardIds: [
            ...new Set(uses.map((use) => use.cardUid)),
          ],
          componentUses: uses.map((use) => ({ ...use })),
        });
        const result = search(
          answerIndex + 1,
          remaining,
        );
        if (result) {
          return result;
        }
        submissions.pop();
      }
      return null;
    };
    return search(0, this.state.boss.cards) ?? fallback;
  }

  private componentUsesForBag(
    cards: TrialCard[],
    components: readonly number[],
  ): TrialCardComponentUse[] | null {
    const available = cards
      .filter((card) => !card.mustIgnore)
      .map((card) => ({
        card,
        remaining: [...this.cardComponents(card)],
      }))
      .sort(
        (left, right) =>
          Number(
            right.card.displayMode === "quantity",
          ) -
          Number(
            left.card.displayMode === "quantity",
          ),
      );
    const counts = this.componentCounts(components);
    const uses: TrialCardComponentUse[] = [];
    for (const [symbolId, count] of [
      ...counts.entries(),
    ].sort(([left], [right]) => left - right)) {
      for (let index = 0; index < count; index += 1) {
        const slot = available.find(({ remaining }) =>
          remaining.includes(symbolId),
        );
        if (!slot) {
          return null;
        }
        slot.remaining.splice(
          slot.remaining.indexOf(symbolId),
          1,
        );
        uses.push({
          cardUid: slot.card.uid,
          symbolId,
        });
      }
    }
    return uses;
  }

  private assignPrefabricatedBossAnswers(
    answers: string[],
  ): TrialBossAssignment | null {
    if (!this.state.boss) {
      return null;
    }
    const allowedLengths = new Set(
      this.activeRule().selection.boss.partLengths,
    );
    const submissions: TrialBossSubmission[] = [];
    let fallback: TrialBossAssignment | null = null;
    const search = (
      answerIndex: number,
      cards: TrialCard[],
    ): TrialBossAssignment | null => {
      if (answerIndex >= answers.length) {
        const assignment = {
          remainingCards: cards,
          submissions: submissions.map(
            (submission) =>
              this.cloneBossSubmission(submission),
          ),
        };
        if (
          this.remainingAnswerComponents(cards).length === 0
        ) {
          return assignment;
        }
        fallback ??= assignment;
        return null;
      }
      const tokens = cards
        .filter((card) => !card.mustIgnore)
        .flatMap((card) =>
          this.cardComponents(card).map((symbolId) => ({
            cardUid: card.uid,
            symbolId,
          })),
        );
      const limit = 1 << tokens.length;
      for (let mask = 1; mask < limit; mask += 1) {
        const selectedUses = tokens.filter(
          (_, index) => (mask & (1 << index)) !== 0,
        );
        if (
          !allowedLengths.has(selectedUses.length) ||
          !this.data
            .accepted(
              selectedUses.map((use) => use.symbolId),
            )
            .has(answers[answerIndex])
        ) {
          continue;
        }
        const remaining = this.consumeBossComponentUses(
          cards,
          selectedUses,
        );
        submissions.push({
          answer: answers[answerIndex],
          cardIds: [
            ...new Set(
              selectedUses.map((use) => use.cardUid),
            ),
          ],
          componentUses: selectedUses.map((use) => ({
            ...use,
          })),
        });
        const result = search(
          answerIndex + 1,
          remaining,
        );
        if (result) {
          return result;
        }
        submissions.pop();
      }
      return null;
    };
    return search(0, this.state.boss.cards) ?? fallback;
  }

  private consumeBossComponentUses(
    cards: TrialCard[],
    uses: TrialCardComponentUse[],
  ): TrialCard[] {
    const counts = new Map<string, number>();
    for (const use of uses) {
      const key = `${use.cardUid}:${use.symbolId}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return cards.flatMap((card) => {
      const components = this.cardComponents(card);
      const usedKeys = [...counts.entries()].filter(
        ([key]) =>
          Number(key.split(":")[0]) === card.uid,
      );
      if (usedKeys.length === 0) {
        return [
          card.components
            ? {
                ...card,
                remainingComponents: [...components],
                ...(card.displayMode === "quantity"
                  ? {
                      remainingQuantity:
                        components.length,
                    }
                  : {}),
              }
            : card,
        ];
      }
      if (!card.components) {
        return [];
      }
      const remaining = [...components];
      for (const [key, count] of usedKeys) {
        const symbolId = Number(key.split(":")[1]);
        for (let index = 0; index < count; index += 1) {
          const componentIndex =
            remaining.indexOf(symbolId);
          if (componentIndex >= 0) {
            remaining.splice(componentIndex, 1);
          }
        }
      }
      return remaining.length > 0
        ? [
            {
              ...card,
              remainingComponents: remaining,
              ...(card.displayMode === "quantity"
                ? { remainingQuantity: remaining.length }
                : {}),
            },
          ]
        : [];
    });
  }

  private remainingAnswerComponents(
    cards: TrialCard[],
  ): number[] {
    return cards
      .filter((card) => !card.mustIgnore)
      .flatMap((card) => this.cardComponents(card));
  }

  private consumedBossCardIds(
    remainingCards: TrialCard[],
  ): number[] {
    if (!this.state.boss) {
      return [];
    }
    const remaining = new Set(
      remainingCards.map((card) => card.uid),
    );
    return this.state.boss.initialCards
      .filter((card) => !remaining.has(card.uid))
      .map((card) => card.uid);
  }

  private cloneBossSubmission(
    submission: TrialBossSubmission,
  ): TrialBossSubmission {
    return {
      ...submission,
      cardIds: [...submission.cardIds],
      componentUses: submission.componentUses.map(
        (use) => ({ ...use }),
      ),
    };
  }

  private completeBoss(answer: string): void {
    if (!this.state.boss) {
      return;
    }
    this.state.boss.revealAnswers = [
      ...this.state.boss.pendingAnswers,
    ];
    const remainingBeforeBonus = this.remainingSeconds();
    this.clearTimer();
    this.applySharedCorrectBonus(remainingBeforeBonus);
    this.state.revealing = true;
    this.state.feedback = "correct";
    this.state.revealAnswer = answer;
    this.state.revealPinyin =
      this.activeRule().policy.answer.boss.input ===
      "pinyin"
        ? [...answer].map((char) =>
            displayPinyinFor(this.pinyin, char),
          )
        : [];
    this.state.revealMeta = "BOSS";
    this.recordBoss(true, answer);
    this.advanceId = setTimeout(() => {
      this.advanceId = null;
      this.advanceFromBoss(true);
    }, 1200);
    this.emit();
  }

  private advanceFromBoss(cleared: boolean): void {
    if (this.state.stage >= TRIAL_STAGE_COUNT) {
      this.finish(cleared);
      return;
    }
    const completedStage = this.state.stage;
    this.state.forcedRuleId = null;
    this.state.stage += 1;
    this.state.partLengthPlan = [];
    this.state.ruleId = this.activeRule(
      this.state.stage,
    ).id;
    this.state.phase = "stage-intro";
    this.state.questionInStage = 0;
    this.grantSkipForCompletedStage(completedStage);
    this.state.timeLimit = 0;
    this.state.remaining = 0;
    this.state.paused = false;
    this.state.revealing = false;
    this.state.feedback = "";
    this.state.draft = "";
    this.state.revealPinyin = [];
    this.state.current = null;
    this.state.boss = null;
    this.emit();
  }

  private recordNormal(
    ok: boolean,
    answer = this.state.current?.char ?? "",
    given = this.state.draft,
  ): void {
    if (this.currentRecorded || !this.state.current) {
      return;
    }
    this.currentRecorded = true;
    this.finalizeQuestionTime(this.state.timeLimit);
    const recordedAnswer = ok
      ? answer
      : this.state.current.char;
    const recordedWay =
      this.state.current.repetendUses?.[recordedAnswer] ??
      this.state.current.answerWay;
    const recordedCards =
      this.repetendDisplayCardsForAnswer(
        this.state.current,
        recordedAnswer,
      );
    this.state.history.push({
      stage: this.state.stage,
      ruleId: this.state.ruleId,
      slot: this.state.questionInStage,
      kind: "normal",
      answerWay: [...recordedWay],
      displayCards: recordedCards.map(
        (card) => ({ ...card }),
      ),
      answerDetails: [
        {
          char: recordedAnswer,
          displayChar:
            this.state.current.displayChar &&
            this.state.current.displayChar !== recordedAnswer
              ? this.state.current.displayChar
              : undefined,
          expandedComponent:
            this.state.current.expandedComponent,
          answerWay: [...recordedWay],
          displayCards: recordedCards.map(
            (card) => ({ ...card }),
          ),
          meta: this.metaFor(recordedAnswer),
          pinyin:
            this.activeRule().policy.answer.normal.input ===
            "pinyin"
              ? displayPinyinFor(
                  this.pinyin,
                  recordedAnswer,
                )
              : undefined,
        },
      ],
      parts: this.data.names(recordedWay),
      displayParts: this.data.names(
        recordedCards.map(
          (card) => card.symbolId,
        ),
      ),
      displaySymbolIds: recordedCards.map(
        (card) => card.symbolId,
      ),
      answer: recordedAnswer,
      given,
      ok,
      meta: this.metaFor(recordedAnswer),
    });
  }

  private recordBoss(ok: boolean, given?: string): void {
    if (this.currentRecorded || !this.state.boss) {
      return;
    }
    this.currentRecorded = true;
    this.finalizeQuestionTime(this.state.timeLimit);
    const submitted =
      given ??
      `${this.state.boss.pendingAnswer}${this.state.draft}`;
    if (ok && !this.state.boss.revealAnswers) {
      this.state.boss.revealAnswers = [
        ...this.state.boss.pendingAnswers,
      ];
    } else if (!ok && !this.state.boss.revealAnswers) {
      this.state.boss.revealAnswers =
        this.resolveBossRevealAnswers();
    }
    const answer =
      this.state.boss.revealAnswers?.join("") ??
      (ok
        ? submitted
        : this.state.boss.expectedAnswers.join(""));
    const meta = [...answer]
      .map(
        (char) =>
          this.metaFor(char) ||
          `表外 U+${(char.codePointAt(0) ?? 0)
            .toString(16)
            .toUpperCase()
            .padStart(4, "0")}`,
      )
      .join(" · ");
    const submittedGroups =
      ok && this.state.boss.pendingSubmissions.length > 0
        ? this.state.boss.pendingSubmissions.map(
            (submission) => ({
              char: submission.answer,
              cards: this.state.boss!.initialCards.filter(
                (card) =>
                  submission.cardIds.includes(card.uid),
              ),
            }),
          )
        : this.groupCardsByExpectedAnswers();
    const answerDetails: TrialHistoryAnswer[] =
      submittedGroups.map(({ char, cards }) => ({
        char,
        displayChar: this.displayCharForBossAnswer(char),
        expandedComponent:
          this.expandedComponentForBossAnswer(char),
        answerWay: cards.map((card) => card.symbolId),
        displayCards: cards.map((card) => ({ ...card })),
        meta: this.metaFor(char),
        pinyin:
          this.activeRule().policy.answer.boss.input ===
          "pinyin"
            ? displayPinyinFor(this.pinyin, char)
            : undefined,
      }));
    this.state.history.push({
      stage: this.state.stage,
      ruleId: this.state.ruleId,
      slot: this.state.questionsPerStage + 1,
      kind: "boss",
      answerWay: this.state.boss.expectedWays.flatMap(
        (way) => [...way],
      ),
      displayCards: this.state.boss.initialCards.map(
        (card) => ({ ...card }),
      ),
      answerDetails,
      parts: this.state.boss.expectedWays.flatMap((way) =>
        this.data.names(way),
      ),
      displayParts: this.state.boss.initialCards.map((card) =>
        this.data.component(card.symbolId).name,
      ),
      displaySymbolIds: this.state.boss.initialCards.map(
        (card) => card.symbolId,
      ),
      answer,
      given: submitted,
      ok,
      meta,
    });
  }

  private displayCharForBossAnswer(
    char: string,
  ): string | undefined {
    if (!this.state.boss) {
      return undefined;
    }
    const index =
      this.state.boss.expectedAnswers.indexOf(char);
    const displayChar =
      index >= 0
        ? this.state.boss.expectedDisplayChars[index]
        : undefined;
    return displayChar && displayChar !== char
      ? displayChar
      : undefined;
  }

  private expandedComponentForBossAnswer(
    char: string,
  ): number | undefined {
    if (!this.state.boss) {
      return undefined;
    }
    const index =
      this.state.boss.expectedAnswers.indexOf(char);
    return index >= 0
      ? this.state.boss.expandedComponents[index]
      : undefined;
  }

  private groupCardsByExpectedAnswers(): Array<{
    char: string;
    cards: TrialCard[];
  }> {
    if (!this.state.boss) {
      return [];
    }
    if (
      this.activeRule().policy.prompt.boss.mode ===
        "gestalt-components" &&
      this.state.boss.gestaltGroups
    ) {
      const submitted = this.state.boss.pendingSubmissions.map(
        (submission) => submission.answer,
      );
      const orderedAnswers =
        this.state.boss.revealAnswers ??
        [
          ...submitted,
          ...this.state.boss.expectedAnswers.filter(
            (char) => !submitted.includes(char),
          ),
        ];
      const usedGroups = new Set<number>();
      const groupAccepts = (
        groupIndex: number,
        char: string,
      ): boolean => {
        const group =
          this.state.boss!.gestaltGroups![groupIndex];
        const groupCards =
          this.state.boss!.initialCards.filter((card) =>
            group.cardIds.includes(card.uid),
          );
        return this.data
          .acceptedContaining(
            groupCards.map((card) => card.symbolId),
          )
          .has(char);
      };
      return orderedAnswers.flatMap((char) => {
        const groupIndex =
          this.state.boss!.gestaltGroups!.findIndex(
            (_group, index) =>
              !usedGroups.has(index) &&
              groupAccepts(index, char),
          );
        if (groupIndex < 0) {
          return [];
        }
        usedGroups.add(groupIndex);
        const group =
          this.state.boss!.gestaltGroups![groupIndex];
        const groupCards =
          this.state.boss!.initialCards.filter((card) =>
            group.cardIds.includes(card.uid),
          );
        return [
          {
            char,
            cards: groupCards,
          },
        ];
      });
    }
    if (
      this.activeRule().policy.prompt.boss.mode ===
        "prefabricated-components" ||
      this.activeRule().policy.prompt.boss.mode ===
        "overlay-components" ||
      this.activeRule().policy.prompt.boss.mode ===
        "repetend-components"
    ) {
      const available = this.state.boss.initialCards.map(
        (card) => ({
          ...card,
          ...(card.components
            ? {
                remainingComponents: [...card.components],
                ...(card.displayMode === "quantity"
                  ? {
                      remainingQuantity:
                        card.components.length,
                    }
                  : {}),
              }
            : {}),
        }),
      );
      return (
        this.state.boss.revealAnswers ??
        this.state.boss.expectedAnswers
      ).map((char) => {
          const answerIndex =
            this.state.boss?.expectedAnswers.indexOf(
              char,
            ) ?? -1;
          const way =
            answerIndex >= 0
              ? this.state.boss?.expectedWays[
                  answerIndex
                ] ?? []
              : [];
          const cards = new Map<number, TrialCard>();
          for (const symbolId of way) {
            const cardIndex = available.findIndex((card) =>
              this.cardComponents(card).includes(symbolId),
            );
            if (cardIndex < 0) {
              cards.set(-symbolId, {
                uid: -symbolId,
                symbolId,
                source: "answer",
              });
              continue;
            }
            const card = available[cardIndex];
            cards.set(card.uid, card);
            if (!card.components) {
              available.splice(cardIndex, 1);
              continue;
            }
            const remaining = this.cardComponents(card);
            remaining.splice(
              remaining.indexOf(symbolId),
              1,
            );
            if (remaining.length === 0) {
              available.splice(cardIndex, 1);
            } else {
              available[cardIndex] = {
                ...card,
                remainingComponents: remaining,
                ...(card.displayMode === "quantity"
                  ? { remainingQuantity: remaining.length }
                  : {}),
              };
            }
          }
          return { char, cards: [...cards.values()] };
        });
    }
    const remaining = [...this.state.boss.initialCards];
    const submitted = this.state.boss.pendingSubmissions.map(
      (submission) => submission.answer,
    );
    const orderedAnswers =
      this.state.boss.revealAnswers ??
      [
        ...submitted,
        ...this.state.boss.expectedAnswers.filter(
          (char) => !submitted.includes(char),
        ),
      ];
    return orderedAnswers.map(
      (char) => {
        const answerIndex =
          this.state.boss?.expectedAnswers.indexOf(char) ??
          -1;
        const way =
          answerIndex >= 0
            ? this.state.boss?.displayWays[answerIndex] ?? []
            : [];
        const cards = way.map((symbolId) => {
          const index = remaining.findIndex(
            (card) => card.symbolId === symbolId,
          );
          const card =
            index >= 0
              ? remaining.splice(index, 1)[0]
              : {
                  uid: -1,
                  symbolId,
                  source: "answer" as const,
                };
          return card;
        });
        return { char, cards };
      },
    );
  }

  private finish(
    cleared: boolean,
    titleOverride?: TrialResultState["title"],
  ): void {
    if (
      this.state.phase === "playing" &&
      !this.currentRecorded
    ) {
      this.recordNormal(false);
    } else if (
      this.state.phase === "boss" &&
      !this.currentRecorded
    ) {
      this.recordBoss(false);
    }
    this.clearTimers();
    this.state.phase = "results";
    this.state.paused = false;
    this.state.revealing = false;
    this.state.timeLimit = 0;
    this.state.remaining = 0;
    const correctCount = this.state.history.filter(
      (item) => item.ok,
    ).length;
    const successful =
      cleared &&
      this.state.history.every((item) => item.ok);
    const clearedStages = successful
      ? TRIAL_STAGE_COUNT
      : Math.max(0, this.state.stage - 1);
    const title =
      titleOverride ??
      (successful
        ? this.state.skipsUsed > 0
          ? "雾径得津"
          : "知我梦中"
        : "覆鹿遗蕉");
    const crisEarned = calculateTrialCrisReward(
      {
        advancement: this.advancement.level,
        clearedStages,
        cleared: successful,
        perfect: title === "知我梦中",
      },
    );
    if (crisEarned > 0) {
      this.crisLedger?.add(crisEarned);
    }
    this.state.result = {
      title,
      cleared: successful,
      reachedStage: this.state.stage,
      correctCount,
      averageQuestionSeconds:
        this.timedQuestionCount === 0
          ? 0
          : this.totalQuestionTimeMs /
            1000 /
            this.timedQuestionCount,
      crisEarned,
    };
    this.emit();
  }

  private metaFor(char: string): string {
    const length = [...char].length;
    if (length > 1) {
      return `${length}字词`;
    }
    const codePoint = char.codePointAt(0) ?? 0;
    return (
      this.data.answerMeta(char) ||
      `表外 U+${codePoint
        .toString(16)
        .toUpperCase()
        .padStart(4, "0")}`
    );
  }

  private scheduleObscuration(
    kind: "normal" | "boss",
    cards: TrialCard[],
  ): void {
    const cardPolicy = this.activeRule().policy.cards[kind];
    if (
      cardPolicy.display !== "obscured" ||
      cardPolicy.obscureAfterMs === undefined ||
      cards.length === 0
    ) {
      return;
    }
    const targetCount =
      cardPolicy.obscureCount === "all"
        ? cards.length
        : Math.min(
            cards.length,
            cardPolicy.obscureCount ?? 0,
          );
    const targets = shuffle(
      [...cards],
      this.random,
    ).slice(0, targetCount);
    for (const card of targets) {
      card.obscuredAtMs = cardPolicy.obscureAfterMs;
      card.obscured = false;
      card.displayMode = "obscured";
    }
  }

  private buildHallraumCatalog(): void {
    if (this.hallraumBagsByLength) {
      return;
    }
    const grouped = new Map<
      number,
      Map<
        string,
        {
          components: number[];
          directAnswers: Set<string>;
        }
      >
    >();
    const acceptedByBag = new Map<string, Set<string>>();
    this.hallraumBagsByLengthAndSymbol.clear();
    this.hallraumAcceptedAnswerBags.clear();
    this.hallraumUnknownBlackCache.clear();
    for (const [char, ways] of this.data.ways) {
      if (!this.data.isCharSelectable(char)) {
        continue;
      }
      for (const way of this.data.expandedDecompositions(char)) {
        if (way.length < 2 || way.length > 10) {
          continue;
        }
        const components = [...way].sort(
          (left, right) => left - right,
        );
        const key = this.symbolIdBagKey(components);
        const answers =
          acceptedByBag.get(key) ?? new Set<string>();
        answers.add(char);
        acceptedByBag.set(key, answers);
      }
      for (const way of ways) {
        if (way.length < 2 || way.length > 10) {
          continue;
        }
        const components = [...way].sort(
          (left, right) => left - right,
        );
        const key = this.symbolIdBagKey(components);
        const lengthGroups =
          grouped.get(components.length) ?? new Map();
        const entry = lengthGroups.get(key) ?? {
          components,
          directAnswers: new Set<string>(),
        };
        entry.directAnswers.add(char);
        lengthGroups.set(key, entry);
        grouped.set(components.length, lengthGroups);
      }
    }
    this.hallraumAcceptedAnswerBags = acceptedByBag;
    this.hallraumBagsByLength = new Map();
    for (const [length, groups] of grouped) {
      const entries = [...groups.values()]
        .map((entry): HallraumBagEntry => ({
          components: [...entry.components],
          directAnswers: [...entry.directAnswers].sort(
            (left, right) =>
              left.localeCompare(right, "zh-CN"),
          ),
          acceptedAnswers: [
            ...(acceptedByBag.get(
              this.symbolIdBagKey(entry.components),
            ) ?? []),
          ].sort(
            (left, right) =>
              left.localeCompare(right, "zh-CN"),
          ),
        }))
        .sort((left, right) =>
          this.symbolIdBagKey(left.components).localeCompare(
            this.symbolIdBagKey(right.components),
          ),
        );
      this.hallraumBagsByLength.set(length, entries);
      for (const entry of entries) {
        for (const symbolId of new Set(entry.components)) {
          const indexKey = `${length}|${symbolId}`;
          const bucket =
            this.hallraumBagsByLengthAndSymbol.get(
              indexKey,
            ) ?? [];
          bucket.push(entry);
          this.hallraumBagsByLengthAndSymbol.set(
            indexKey,
            bucket,
          );
        }
      }
    }
  }

  private hallraumLengthOrder(
    questionIndex: number,
  ): number[] {
    return [
      questionIndex === this.state.questionsPerStage - 1
        ? 4
        : 3,
    ];
  }

  private hallraumCandidateBags(
    length: number,
    inheritedSymbol: number | null,
    inheritedSources: ReadonlySet<number> | null,
    usedChars: ReadonlySet<string>,
    rule: TrialRuleDefinition,
  ): HallraumBagEntry[] {
    const entries =
      inheritedSymbol === null
        ? this.hallraumBagsByLength?.get(length) ?? []
        : this.hallraumBagsByLengthAndSymbol.get(
            `${length}|${inheritedSymbol}`,
          ) ?? [];
    const allowedLevels =
      rule.selection.levels ?? [1, 2];
    return entries.filter((entry) => {
      if (
        entry.acceptedAnswers.some((char) =>
          usedChars.has(char),
        )
      ) {
        return false;
      }
      if (
        !entry.acceptedAnswers.some((char) => {
          const level = this.data.levels.get(char);
          return (
            level !== undefined &&
            allowedLevels.includes(level) &&
            (this.includeSupplementaryChars ||
              this.data.isBasicPlaneCharacter(char))
          );
        })
      ) {
        return false;
      }
      if (inheritedSymbol === null) {
        return true;
      }
      const visible = [...entry.components];
      visible.splice(
        visible.indexOf(inheritedSymbol),
        1,
      );
      const globalPossible =
        this.hallraumUnknownInheritedSymbols(visible);
      const possible = this.hallraumPossibleInheritedSymbols(
        visible,
        inheritedSources,
      );
      return (
        globalPossible.length > 1 &&
        globalPossible.includes(inheritedSymbol) &&
        possible.length === 1 &&
        possible[0] === inheritedSymbol
      );
    });
  }

  private rankHallraumCandidates(
    candidates: HallraumBagEntry[],
    previousWay: readonly number[],
    inheritedSymbol: number | null,
  ): HallraumBagEntry[] {
    return candidates
      .map((candidate) => {
        const weight = hallraumComponentDiversityWeight(
          candidate.components,
          previousWay,
          inheritedSymbol,
        );
        const sample = Math.max(
          Number.EPSILON,
          1 - this.random(),
        );
        return {
          candidate,
          key: -Math.log(sample) / weight,
        };
      })
      .sort((left, right) => left.key - right.key)
      .map(({ candidate }) => candidate);
  }

  private hallraumPossibleInheritedSymbols(
    visibleComponents: readonly number[],
    inheritedSources: ReadonlySet<number> | null,
  ): number[] {
    if (!inheritedSources) {
      return [];
    }
    return [...inheritedSources].filter(
      (symbolId) =>
        this.data.accepted([
          ...visibleComponents,
          symbolId,
        ]).size > 0,
    );
  }

  private hallraumUnknownInheritedSymbols(
    visibleComponents: readonly number[],
  ): number[] {
    const key = this.symbolIdBagKey(visibleComponents);
    const cached = this.hallraumUnknownBlackCache.get(key);
    if (cached) {
      return cached;
    }
    const possible = this.data
      .componentIds()
      .filter((symbolId) =>
        this.hallraumAcceptedAnswerBags.has(
          this.symbolIdBagKey([
            ...visibleComponents,
            symbolId,
          ]),
        ),
      );
    this.hallraumUnknownBlackCache.set(key, possible);
    return possible;
  }

  private pickHallraumBossPlan(
    finalStep: HallraumStep,
    usedChars: ReadonlySet<string>,
  ): HallraumBossPlan | null {
    const sourceIndices = shuffle(
      finalStep.way.map((_, index) => index),
      this.random,
    );
    for (const firstIndex of sourceIndices) {
      for (const secondIndex of shuffle(
        finalStep.way.map((_, index) => index),
        this.random,
      )) {
        if (firstIndex === secondIndex) {
          continue;
        }
        const firstInherited =
          finalStep.way[firstIndex];
        const secondInherited =
          finalStep.way[secondIndex];
        for (let firstLength = 2; firstLength <= 6; firstLength += 1) {
          const secondLengths = shuffle(
            [6, 7, 8]
              .map((total) => total - firstLength)
              .filter(
                (length) => length >= 2 && length <= 6,
              ),
            this.random,
          );
          const firstEntries =
            this.hallraumBagsByLengthAndSymbol.get(
              `${firstLength}|${firstInherited}`,
            ) ?? [];
          if (firstEntries.length === 0) {
            continue;
          }
          const rankedFirst =
            this.rankHallraumCandidates(
              firstEntries,
              finalStep.way,
              firstInherited,
            ).slice(0, 160);
          for (const secondLength of secondLengths) {
            const secondEntries =
              this.hallraumBagsByLengthAndSymbol.get(
                `${secondLength}|${secondInherited}`,
              ) ?? [];
            if (secondEntries.length === 0) {
              continue;
            }
            const rankedSecond =
              this.rankHallraumCandidates(
                secondEntries,
                finalStep.way,
                secondInherited,
              ).slice(0, 160);
            for (const first of rankedFirst) {
              const firstAnswers =
                first.directAnswers.filter((char) => {
                  const level = this.data.levels.get(char);
                  return (
                    !usedChars.has(char) &&
                    (level === 1 || level === 2) &&
                    (this.includeSupplementaryChars ||
                      this.data.isBasicPlaneCharacter(char))
                  );
                });
              if (firstAnswers.length === 0) {
                continue;
              }
              for (const second of rankedSecond) {
                const secondAnswers =
                  second.directAnswers.filter((char) => {
                    const level = this.data.levels.get(char);
                    return (
                      !usedChars.has(char) &&
                      (level === 1 || level === 2) &&
                      (this.includeSupplementaryChars ||
                        this.data.isBasicPlaneCharacter(char))
                    );
                  });
                if (secondAnswers.length === 0) {
                  continue;
                }
                const firstChar = pickRandom(
                  firstAnswers,
                  this.random,
                );
                const secondChar = pickRandom(
                  secondAnswers.filter(
                    (char) => char !== firstChar,
                  ),
                  this.random,
                );
                if (!secondChar) {
                  continue;
                }
                return {
                  chars: [firstChar, secondChar],
                  ways: [
                    [...first.components],
                    [...second.components],
                  ],
                  inheritedSlots: [
                    first.components.indexOf(firstInherited),
                    second.components.indexOf(secondInherited),
                  ],
                };
              }
            }
          }
        }
      }
    }
    return null;
  }

  private buildHallraumChain(): void {
    this.buildHallraumCatalog();
    const rule = this.activeRule();
    const usedChars = new Set<string>();
    const steps: HallraumStep[] = [];
    let expansions = 0;
    const search = (depth: number): boolean => {
      if (++expansions > 60000) {
        return false;
      }
      if (depth >= this.state.questionsPerStage) {
        const boss = this.pickHallraumBossPlan(
          steps[steps.length - 1],
          usedChars,
        );
        if (!boss) {
          return false;
        }
        this.hallraumSteps = steps.map((step) => ({
          ...step,
          way: [...step.way],
          acceptedAnswers: [...step.acceptedAnswers],
        }));
        this.hallraumBossPlan = {
          chars: [...boss.chars],
          ways: [
            [...boss.ways[0]],
            [...boss.ways[1]],
          ],
          inheritedSlots: [...boss.inheritedSlots],
        };
        this.usedStageChars = new Set(usedChars);
        return true;
      }
      const inheritedChoices =
        depth === 0
          ? [null]
          : shuffle(
              [
                ...new Set(
                  steps[depth - 1].way,
                ),
              ],
              this.random,
            );
      for (const inheritedSymbol of inheritedChoices) {
        const inheritedSources =
          depth === 0
            ? null
            : new Set(steps[depth - 1].way);
        for (const length of this.hallraumLengthOrder(depth)) {
          const candidates = this.rankHallraumCandidates(
            this.hallraumCandidateBags(
              length,
              inheritedSymbol,
              inheritedSources,
              usedChars,
              rule,
            ),
            depth === 0 ? [] : steps[depth - 1].way,
            inheritedSymbol,
          ).slice(0, 120);
          for (const candidate of candidates) {
            const answerChoices =
              candidate.directAnswers.filter((char) => {
                const level = this.data.levels.get(char);
                return (
                  (level === 1 || level === 2) &&
                  (this.includeSupplementaryChars ||
                    this.data.isBasicPlaneCharacter(char))
                );
              });
            if (answerChoices.length === 0) {
              continue;
            }
            const inheritedSlot =
              inheritedSymbol === null
                ? null
                : candidate.components.indexOf(
                    inheritedSymbol,
                  );
            if (
              inheritedSlot !== null &&
              inheritedSlot < 0
            ) {
              continue;
            }
            const answer = pickRandom(
              answerChoices,
              this.random,
            );
            const step: HallraumStep = {
              char: answer,
              way: [...candidate.components],
              inheritedSlot,
              acceptedAnswers: [
                ...candidate.acceptedAnswers,
              ],
            };
            steps.push(step);
            for (const char of candidate.acceptedAnswers) {
              usedChars.add(char);
            }
            if (search(depth + 1)) {
              return true;
            }
            for (const char of candidate.acceptedAnswers) {
              usedChars.delete(char);
            }
            steps.pop();
          }
        }
      }
      return false;
    };
    if (!search(0)) {
      throw new Error(
        "Unable to generate a Hallraum question chain.",
      );
    }
  }

  private buildFugueQuestionPool(): FugueQuestionPlan[] {
    const plans: FugueQuestionPlan[] = [];
    const used = new Set<string>();
    let attempts = 0;
    while (plans.length < this.state.questionsPerStage) {
      attempts += 1;
      if (attempts > 4000) {
        throw new Error(
          "Unable to generate the Fugue question queue.",
        );
      }
      const length = pickWeighted(
        [3, 4],
        (candidate) => (candidate === 3 ? 42 : 23),
        this.random,
      );
      const choices = [
        ...(this.choicesByLength.get(length)?.values() ??
          []),
      ];
      if (choices.length === 0) {
        continue;
      }
      const choice = pickRandom(choices, this.random);
      if (
        used.has(choice.char) ||
        !this.charAllowedByRule(
          this.activeRule(),
          choice.char,
        )
      ) {
        continue;
      }
      const way = pickRandom(choice.ways, this.random);
      const accepted = [
        ...this.data.accepted(way),
      ];
      plans.push({
        char: choice.char,
        way: [...way],
        accepted,
      });
      used.add(choice.char);
      for (const char of accepted) {
        used.add(char);
      }
    }
    return plans;
  }

  private fugueBossCompletePairs(
    plan: FugueBossPlan,
  ): Set<string> {
    const cards = plan.ways
      .flat()
      .map((symbolId, index): TrialCard => ({
        uid: index + 1,
        symbolId,
        source: "answer",
      }));
    const allowedLengths = new Set(
      this.activeRule().selection.boss.partLengths,
    );
    const pairs = new Set<string>();
    const limit = 1 << cards.length;
    for (let mask = 1; mask < limit - 1; mask += 1) {
      const first = cardsForMask(cards, mask);
      const second = cards.filter(
        (_, index) => (mask & (1 << index)) === 0,
      );
      if (
        !allowedLengths.has(first.length) ||
        !allowedLengths.has(second.length)
      ) {
        continue;
      }
      const firstAnswers =
        this.acceptedAnswersForCards(first);
      const secondAnswers =
        this.acceptedAnswersForCards(second);
      for (const firstChar of firstAnswers) {
        const firstLevel =
          this.data.levels.get(firstChar);
        if (
          (firstLevel !== 1 && firstLevel !== 2) ||
          (!this.includeSupplementaryChars &&
            !this.data.isBasicPlaneCharacter(firstChar))
        ) {
          continue;
        }
        for (const secondChar of secondAnswers) {
          if (secondChar === firstChar) {
            continue;
          }
          const secondLevel =
            this.data.levels.get(secondChar);
          if (
            (secondLevel !== 1 && secondLevel !== 2) ||
            (!this.includeSupplementaryChars &&
              !this.data.isBasicPlaneCharacter(secondChar))
          ) {
            continue;
          }
          pairs.add(
            [firstChar, secondChar]
              .sort((left, right) =>
                left.localeCompare(right, "zh-CN"),
              )
              .join("|"),
          );
        }
      }
    }
    return pairs;
  }

  private fugueBossSubmissionCharacters(
    plan: FugueBossPlan,
  ): Set<string> {
    const cards = plan.ways
      .flat()
      .map((symbolId, index): TrialCard => ({
        uid: index + 1,
        symbolId,
        source: "answer",
      }));
    const allowedLengths = new Set(
      this.activeRule().selection.boss.partLengths,
    );
    const chars = new Set<string>();
    const limit = 1 << cards.length;
    for (let mask = 1; mask < limit; mask += 1) {
      const selected = cardsForMask(cards, mask);
      if (!allowedLengths.has(selected.length)) {
        continue;
      }
      for (const char of
        this.acceptedAnswersForCards(selected)) {
        const level = this.data.levels.get(char);
        if (
          (level === 1 || level === 2) &&
          (this.includeSupplementaryChars ||
            this.data.isBasicPlaneCharacter(char))
        ) {
          chars.add(char);
        }
      }
    }
    return chars;
  }

  private generateFugueBossPlan(
    usedChars: ReadonlySet<string>,
  ): FugueBossPlan | null {
    const lengthPairs: Array<[number, number]> = [
      [2, 4],
      [3, 3],
      [4, 2],
      [2, 5],
      [5, 2],
      [2, 6],
      [6, 2],
      [3, 4],
      [4, 3],
      [3, 5],
      [5, 3],
    ];
    for (let attempt = 0; attempt < 512; attempt += 1) {
      const [firstLength, secondLength] =
        pickRandom(lengthPairs, this.random);
      const firstChoices = [
        ...(this.choicesByLength.get(firstLength)?.values() ??
          []),
      ].filter(
        (choice) =>
          !usedChars.has(choice.char) &&
          this.charAllowedByRule(
            this.activeRule(),
            choice.char,
          ),
      );
      const secondChoices = [
        ...(this.choicesByLength.get(secondLength)?.values() ??
          []),
      ].filter(
        (choice) =>
          !usedChars.has(choice.char) &&
          this.charAllowedByRule(
            this.activeRule(),
            choice.char,
          ),
      );
      if (
        firstChoices.length === 0 ||
        secondChoices.length === 0
      ) {
        continue;
      }
      const first = pickRandom(firstChoices, this.random);
      const second = pickRandom(
        secondChoices.filter(
          (choice) => choice.char !== first.char,
        ),
        this.random,
      );
      if (!second) {
        continue;
      }
      const plan: FugueBossPlan = {
        chars: [first.char, second.char],
        ways: [
          [...pickRandom(first.ways, this.random)],
          [...pickRandom(second.ways, this.random)],
        ],
        acceptedPairs: new Set(),
        submissionChars: new Set(),
      };
      plan.acceptedPairs =
        this.fugueBossCompletePairs(plan);
      plan.submissionChars =
        this.fugueBossSubmissionCharacters(plan);
      if (plan.acceptedPairs.size === 0) {
        continue;
      }
      return plan;
    }
    return null;
  }

  private buildFugueStage(): void {
    this.fugueQuestions = this.buildFugueQuestionPool();
    const lastThreeAnswers = new Set(
      this.fugueQuestions
        .slice(-3)
        .flatMap((question) => question.accepted),
    );
    const usedChars = new Set(
      this.fugueQuestions.flatMap((question) => [
        question.char,
        ...question.accepted,
      ]),
    );
    for (let attempt = 0; attempt < 160; attempt += 1) {
      const left = this.generateFugueBossPlan(
        usedChars,
      );
      if (!left) {
        break;
      }
      const right = this.generateFugueBossPlan(
        new Set([
          ...usedChars,
          ...left.chars,
          ...[...left.acceptedPairs].flatMap((key) =>
            key.split("|"),
          ),
        ]),
      );
      if (!right) {
        continue;
      }
      const blocksKnownAnswer = [...lastThreeAnswers].some(
        (char) =>
          left.submissionChars.has(char) ||
          right.submissionChars.has(char),
      );
      if (blocksKnownAnswer) {
        continue;
      }
      const leftBlocked = [...left.acceptedPairs].some(
        (key) =>
          key
            .split("|")
            .some((char) =>
              right.submissionChars.has(char),
            ),
      );
      const rightBlocked = [...right.acceptedPairs].some(
        (key) =>
          key
            .split("|")
            .some((char) =>
              left.submissionChars.has(char),
            ),
      );
      if (leftBlocked || rightBlocked) {
        continue;
      }
      this.fugueBossPlans = [left, right];
      break;
    }
    if (!this.fugueBossPlans) {
      throw new Error(
        "Unable to generate a Fugue boss pair.",
      );
    }
    this.fugueQuestionIndex = 2;
    const slots: [
      FugueSlotState,
      FugueSlotState,
    ] = [
      {
        id: "left",
        mode: "normal",
        current: null,
        boss: null,
        remaining: TRIAL_NORMAL_SECONDS,
        timeLimit: TRIAL_NORMAL_SECONDS,
        feedback: "",
        revealing: false,
        questionNumber: 1,
      },
      {
        id: "right",
        mode: "normal",
        current: null,
        boss: null,
        remaining: TRIAL_NORMAL_SECONDS,
        timeLimit: TRIAL_NORMAL_SECONDS,
        feedback: "",
        revealing: false,
        questionNumber: 2,
      },
    ];
    this.state.fugue = {
      slots,
      queueRemaining:
        this.state.questionsPerStage - 2,
    };
    this.setFugueNormalQuestion(
      0,
      this.fugueQuestions[0],
      1,
    );
    this.setFugueNormalQuestion(
      1,
      this.fugueQuestions[1],
      2,
    );
    this.state.questionInStage = 2;
  }

  private setFugueNormalQuestion(
    slotIndex: number,
    plan: FugueQuestionPlan,
    questionNumber: number,
  ): void {
    if (!this.state.fugue) {
      return;
    }
    const slot = this.state.fugue.slots[slotIndex];
    const displayCards = shuffleQuestionParts(
      plan.way,
      this.random,
    ).map((symbolId) => this.makeCard(symbolId));
    slot.mode = "normal";
    slot.current = {
      char: plan.char,
      accepted: [...plan.accepted],
      pinyin: displayPinyinFor(
        this.pinyin,
        plan.char,
      ),
      answerWay: [...plan.way],
      displayCards,
    };
    slot.boss = null;
    slot.feedback = "";
    slot.revealing = false;
    slot.questionNumber = questionNumber;
    slot.remaining = TRIAL_NORMAL_SECONDS;
    slot.timeLimit = TRIAL_NORMAL_SECONDS;
    this.recordEncounter(plan.char, plan.way);
  }

  private createFugueBossState(
    plan: FugueBossPlan,
  ): TrialBossState {
    const cards = shuffle(
      plan.ways
        .flat()
        .map((symbolId) => this.makeCard(symbolId)),
      this.random,
    );
    return {
      cards,
      initialCards: cards.map((card) => ({
        ...card,
      })),
      expectedAnswers: [...plan.chars],
      expectedDisplayChars: [...plan.chars],
      expectedPinyin: plan.chars.map((char) =>
        displayPinyinFor(this.pinyin, char),
      ),
      expectedWays: [
        [...plan.ways[0]],
        [...plan.ways[1]],
      ],
      displayWays: [
        [...plan.ways[0]],
        [...plan.ways[1]],
      ],
      expandedComponents: [],
      pendingAnswers: [],
      pendingSubmissions: [],
      pendingAnswer: "",
      pendingCardIds: [],
      consumedCardIds: [],
      submissionCount: 0,
    };
  }

  private startFugueBoss(slotIndex: number): void {
    if (!this.state.fugue || !this.fugueBossPlans) {
      return;
    }
    const slot = this.state.fugue.slots[slotIndex];
    const boss = this.createFugueBossState(
      this.fugueBossPlans[slotIndex],
    );
    slot.mode = "boss";
    slot.current = null;
    slot.boss = boss;
    slot.questionNumber = null;
    slot.remaining = TRIAL_BOSS_SECONDS;
    slot.timeLimit = TRIAL_BOSS_SECONDS;
    slot.feedback = "";
    slot.revealing = false;
    for (const char of boss.expectedAnswers) {
      this.recordEncounter(
        char,
        boss.expectedWays[
          boss.expectedAnswers.indexOf(char)
        ],
      );
    }
    this.fugueDeadlines[slotIndex] =
      performance.now() + TRIAL_BOSS_SECONDS * 1000;
  }

  private recordFugueNormal(
    slot: FugueSlotState,
    answer: string,
    given: string,
  ): void {
    if (!slot.current) {
      return;
    }
    this.recordFugueQuestionTime(slot);
    const cards = slot.current.displayCards.map(
      (card) => ({ ...card }),
    );
    this.state.history.push({
      stage: this.state.stage,
      ruleId: this.state.ruleId,
      slot: slot.questionNumber ?? 0,
      kind: "normal",
      answerWay: [...slot.current.answerWay],
      displayCards: cards,
      answerDetails: [
        {
          char: answer,
          answerWay: [...slot.current.answerWay],
          displayCards: cards.map((card) => ({
            ...card,
          })),
          meta: this.metaFor(answer),
          pinyin: slot.current.pinyin,
        },
      ],
      parts: this.data.names(slot.current.answerWay),
      displayParts: this.data.names(
        cards.map((card) => card.symbolId),
      ),
      displaySymbolIds: cards.map(
        (card) => card.symbolId,
      ),
      answer,
      given,
      ok: true,
      meta: this.metaFor(answer),
    });
  }

  private recordFugueBoss(slot: FugueSlotState): void {
    if (!slot.boss) {
      return;
    }
    this.recordFugueQuestionTime(slot);
    const boss = slot.boss;
    const answer = boss.pendingAnswers.join("");
    this.state.history.push({
      stage: this.state.stage,
      ruleId: this.state.ruleId,
      slot: this.state.questionsPerStage + 1,
      kind: "boss",
      answerWay: boss.expectedWays.flatMap((way) => [
        ...way,
      ]),
      displayCards: boss.initialCards.map((card) => ({
        ...card,
      })),
      answerDetails: boss.pendingSubmissions.map(
        (submission) => ({
          char: submission.answer,
          answerWay: submission.componentUses.map(
            (use) => use.symbolId,
          ),
          displayCards: boss.initialCards
            .filter((card) =>
              submission.cardIds.includes(card.uid),
            )
            .map((card) => ({ ...card })),
          meta: this.metaFor(submission.answer),
          pinyin:
            this.activeRule().policy.answer.boss.input ===
            "pinyin"
              ? displayPinyinFor(
                  this.pinyin,
                  submission.answer,
                )
              : undefined,
        }),
      ),
      parts: boss.expectedWays.flatMap((way) =>
        this.data.names(way),
      ),
      displayParts: boss.initialCards.map((card) =>
        this.data.component(card.symbolId).name,
      ),
      displaySymbolIds: boss.initialCards.map(
        (card) => card.symbolId,
      ),
      answer,
      given: answer,
      ok: true,
      meta: [...answer]
        .map((char) => this.metaFor(char))
        .join(" · "),
    });
  }

  private recordFugueQuestionTime(
    slot: FugueSlotState,
  ): void {
    const remaining = Math.max(
      0,
      Math.min(slot.timeLimit, slot.remaining),
    );
    this.totalQuestionTimeMs +=
      Math.max(0, slot.timeLimit - remaining) * 1000;
    this.timedQuestionCount += 1;
  }

  private scheduleFugueAdvance(
    slotIndex: number,
  ): void {
    if (!this.state.fugue) {
      return;
    }
    const slot = this.state.fugue.slots[slotIndex];
    slot.revealing = true;
    this.fugueDeadlines[slotIndex] =
      Number.POSITIVE_INFINITY;
    if (this.fugueAdvanceIds[slotIndex] !== null) {
      clearTimeout(this.fugueAdvanceIds[slotIndex]!);
    }
    this.fugueAdvanceIds[slotIndex] = setTimeout(() => {
      this.fugueAdvanceIds[slotIndex] = null;
      if (!this.state.fugue) {
        return;
      }
      slot.revealing = false;
      slot.feedback = "";
      this.state.revealing = false;
      if (
        this.fugueQuestionIndex <
        this.fugueQuestions.length
      ) {
        const plan =
          this.fugueQuestions[this.fugueQuestionIndex];
        this.fugueQuestionIndex += 1;
        this.state.fugue.queueRemaining = Math.max(
          0,
          this.state.questionsPerStage -
            this.fugueQuestionIndex,
        );
        this.setFugueNormalQuestion(
          slotIndex,
          plan,
          this.fugueQuestionIndex,
        );
        this.fugueDeadlines[slotIndex] =
          performance.now() +
          TRIAL_NORMAL_SECONDS * 1000;
      } else {
        this.startFugueBoss(slotIndex);
      }
      this.state.draft = "";
      this.emit();
    }, 650);
  }

  private completeFugueBossSide(
    slotIndex: number,
  ): void {
    if (!this.state.fugue) {
      return;
    }
    const slot = this.state.fugue.slots[slotIndex];
    slot.mode = "done";
    slot.remaining = 0;
    slot.revealing = false;
    slot.feedback = "correct";
    this.fugueDeadlines[slotIndex] =
      Number.POSITIVE_INFINITY;
    this.recordFugueBoss(slot);
    if (
      this.state.fugue.slots.every(
        (candidate) => candidate.mode === "done",
      ) &&
      this.fugueStageAdvanceId === null
    ) {
      this.fugueStageAdvanceId = setTimeout(() => {
        this.fugueStageAdvanceId = null;
        if (this.state.stage >= TRIAL_STAGE_COUNT) {
          this.finish(true);
          return;
        }
        this.state.forcedRuleId = null;
        this.state.stage += 1;
        this.state.partLengthPlan = [];
        this.state.ruleId = this.activeRule(
          this.state.stage,
        ).id;
        this.state.phase = "stage-intro";
        this.state.questionInStage = 0;
        this.grantSkipForCompletedStage(
          this.state.stage - 1,
        );
        this.state.timeLimit = 0;
        this.state.remaining = 0;
        this.state.paused = false;
        this.state.revealing = false;
        this.state.feedback = "";
        this.state.draft = "";
        this.state.current = null;
        this.state.boss = null;
        this.state.fugue = undefined;
        this.emit();
      }, 900);
    }
  }

  private cloneFugueBossState(
    boss: TrialBossState,
  ): TrialBossState {
    return {
      ...boss,
      cards: boss.cards.map((card) => ({
        ...card,
        ...(card.remainingComponents
          ? {
              remainingComponents: [
                ...card.remainingComponents,
              ],
            }
          : {}),
      })),
      initialCards: boss.initialCards.map((card) => ({
        ...card,
      })),
      expectedAnswers: [...boss.expectedAnswers],
      expectedDisplayChars: [
        ...boss.expectedDisplayChars,
      ],
      expectedPinyin: [...boss.expectedPinyin],
      expectedWays: boss.expectedWays.map((way) => [...way]),
      displayWays: boss.displayWays.map((way) => [...way]),
      expandedComponents: [...boss.expandedComponents],
      pendingAnswers: [...boss.pendingAnswers],
      pendingSubmissions: boss.pendingSubmissions.map(
        (submission) => this.cloneBossSubmission(submission),
      ),
      pendingCardIds: [...boss.pendingCardIds],
      consumedCardIds: [...boss.consumedCardIds],
      ...(boss.revealAnswers
        ? { revealAnswers: [...boss.revealAnswers] }
        : {}),
    };
  }

  private tryFugueBossSubmission(
    bossState: TrialBossState,
    raw: string,
  ): {
    boss: TrialBossState;
    completed: boolean;
  } | null {
    const chars = [...raw];
    if (
      chars.length === 0 ||
      chars.length >
        bossState.expectedAnswers.length -
          bossState.pendingAnswers.length ||
      new Set([
        ...bossState.pendingAnswers,
        ...chars,
      ]).size !==
        bossState.pendingAnswers.length + chars.length
    ) {
      return null;
    }
    const boss = this.cloneFugueBossState(bossState);
    const previous = this.state.boss;
    this.state.boss = boss;
    const assignment = this.assignBossAnswers(chars);
    this.state.boss = previous;
    if (!assignment) {
      return null;
    }
    boss.cards = assignment.remainingCards;
    boss.pendingSubmissions.push(
      ...assignment.submissions,
    );
    boss.pendingAnswers.push(...chars);
    boss.pendingAnswer = boss.pendingAnswers.join("");
    boss.pendingCardIds.push(
      ...assignment.submissions.flatMap(
        (submission) => submission.cardIds,
      ),
    );
    boss.consumedCardIds = boss.initialCards
      .filter(
        (card) =>
          !boss.cards.some(
            (current) => current.uid === card.uid,
          ),
      )
      .map((card) => card.uid);
    boss.submissionCount = boss.pendingAnswers.length;
    return {
      boss,
      completed:
        boss.pendingAnswers.length ===
          boss.expectedAnswers.length &&
        this.remainingAnswerComponents(boss.cards)
          .length === 0,
    };
  }

  private submitFugue(): void {
    if (!this.state.fugue || this.state.paused) {
      return;
    }
    const raw = this.state.draft.trim();
    if (!raw) {
      return;
    }
    const normalMatches = this.state.fugue.slots.map(
      (slot) =>
        slot.mode === "normal" &&
        !slot.revealing &&
        Boolean(slot.current?.accepted.includes(raw)),
    );
    const bossMatches = this.state.fugue.slots.map(
      (slot) =>
        slot.mode === "boss" &&
        !slot.revealing &&
        slot.boss
          ? this.tryFugueBossSubmission(
              slot.boss,
              raw,
            )
          : null,
    );
    const matches = this.state.fugue.slots.map(
      (_, index) =>
        normalMatches[index] ||
        bossMatches[index] !== null,
    );
    const matched = matches
      .map((value, index) => (value ? index : -1))
      .filter((index) => index >= 0);
    if (matched.length !== 1) {
      this.state.feedback = "wrong";
      for (const slot of this.state.fugue.slots) {
        if (
          slot.mode !== "done" &&
          !slot.revealing
        ) {
          slot.feedback = "wrong";
        }
      }
      this.emit();
      return;
    }
    const slotIndex = matched[0];
    const slot = this.state.fugue.slots[slotIndex];
    if (normalMatches[slotIndex]) {
      slot.feedback = "correct";
      this.state.feedback = "correct";
      this.state.draft = "";
      this.state.questionInStage = Math.min(
        this.state.questionsPerStage,
        this.state.questionInStage + 1,
      );
      this.recordFugueNormal(slot, raw, raw);
      this.scheduleFugueAdvance(slotIndex);
      this.emit();
      return;
    }
    const result = bossMatches[slotIndex]!;
    slot.boss = result.boss;
    this.state.feedback = result.completed
      ? "correct"
      : "partial";
    slot.feedback = result.completed
      ? "correct"
      : "partial";
    this.state.draft = "";
    if (result.completed) {
      this.completeFugueBossSide(slotIndex);
    }
    this.emit();
  }

  private surrenderFugue(): void {
    if (!this.state.fugue || this.state.revealing) {
      return;
    }
    this.clearFugueTimers();
    this.clearTimer();
    this.state.revealing = true;
    this.state.feedback = "wrong";
    for (const slot of this.state.fugue.slots) {
      if (slot.mode === "done") {
        continue;
      }
      slot.revealing = true;
      slot.feedback = "wrong";
      slot.remaining = 0;
      if (slot.boss) {
        slot.boss.revealAnswers =
          this.resolveBossRevealAnswersForState(
            slot.boss,
          );
      }
    }
    this.emit();
  }

  private resolveBossRevealAnswersForState(
    boss: TrialBossState,
  ): string[] {
    const previous = this.state.boss;
    this.state.boss = boss;
    const answers = this.resolveBossRevealAnswers();
    this.state.boss = previous;
    return answers;
  }

  undoFugueBossAnswer(
    slotIndex: number,
    index = -1,
  ): void {
    if (!this.state.fugue) {
      return;
    }
    const boss =
      this.state.fugue.slots[slotIndex].boss;
    if (
      !boss ||
      boss.pendingSubmissions.length === 0 ||
      this.state.fugue.slots[slotIndex].mode !== "boss"
    ) {
      return;
    }
    const resolvedIndex =
      index < 0
        ? boss.pendingSubmissions.length - 1
        : index;
    boss.pendingSubmissions.splice(resolvedIndex, 1);
    boss.pendingAnswers = boss.pendingSubmissions.map(
      (submission) => submission.answer,
    );
    boss.pendingAnswer = boss.pendingAnswers.join("");
    boss.pendingCardIds = boss.pendingSubmissions.flatMap(
      (submission) => submission.cardIds,
    );
    let cards = boss.initialCards.map((card) => ({
      ...card,
      ...(card.components
        ? {
            remainingComponents: [...card.components],
            ...(card.displayMode === "quantity"
              ? {
                  remainingQuantity:
                    card.components.length,
                }
              : {}),
          }
        : {}),
    }));
    for (const submission of boss.pendingSubmissions) {
      cards = this.consumeBossComponentUses(
        cards,
        submission.componentUses,
      );
    }
    boss.cards = cards;
    boss.consumedCardIds = boss.initialCards
      .filter(
        (card) =>
          !cards.some(
            (current) => current.uid === card.uid,
          ),
      )
      .map((card) => card.uid);
    boss.submissionCount = boss.pendingAnswers.length;
    this.state.fugue.slots[slotIndex].feedback = "";
    this.state.feedback = "";
    this.state.draft = "";
    this.emit();
  }

  private addRuleDecoy(
    kind: "normal" | "boss",
    cards: TrialCard[],
    answerWays: readonly number[][] = [],
  ): boolean {
    const cardPolicy = this.activeRule().policy.cards[kind];
    if (cardPolicy.decoyMode === "attached") {
      return this.attachOutlandDecoys(
        cards,
        answerWays,
        cardPolicy,
      );
    }
    const names = cardPolicy.decoyComponents;
    const count = cardPolicy.decoyCount ?? 0;
    if (
      count === 0 ||
      (!names?.length && !cardPolicy.decoyRarity)
    ) {
      return true;
    }
    const answerIds = new Set(
      cards.flatMap((card) => this.cardComponents(card)),
    );
    const namedCandidates = [
      ...new Set(
        (names ?? [])
          .map((name) => this.symbolIdByName.get(name))
          .filter(
            (symbolId): symbolId is number =>
              symbolId !== undefined &&
              !answerIds.has(symbolId),
          ),
      ),
    ];
    const weightedCandidates =
      cardPolicy.decoyRarity === "N"
        ? this.data
            .commonComponents()
            .filter(
              ({ symbolId }) => !answerIds.has(symbolId),
            )
        : [];
    if (
      namedCandidates.length < count &&
      weightedCandidates.length < count
    ) {
      return false;
    }
    let selected: number[] = [];
    for (let attempt = 0; attempt < 64; attempt += 1) {
      if (weightedCandidates.length > 0) {
        const pool = [...weightedCandidates];
        selected = [];
        while (selected.length < count && pool.length > 0) {
          const picked = pickWeighted(
            pool,
            ({ count: usage }) =>
              cardPolicy.decoyWeighting === "usage"
                ? usage
                : 1,
            this.random,
          );
          selected.push(picked.symbolId);
          pool.splice(pool.indexOf(picked), 1);
        }
      } else {
        selected = shuffle(
          namedCandidates,
          this.random,
        ).slice(0, count);
      }
      if (
        selected.length === count &&
        (!cardPolicy.decoyUnique ||
          !this.decoyCreatesUnexpectedAnswer(
            selected,
            answerWays,
          ))
      ) {
        break;
      }
      selected = [];
    }
    if (selected.length !== count) {
      return false;
    }
    for (const symbolId of selected) {
      const decoy = this.makeCard(symbolId, "decoy");
      decoy.mustIgnore = true;
      cards.push(decoy);
    }
    const mixed = shuffle(cards, this.random);
    cards.splice(0, cards.length, ...mixed);
    return true;
  }

  private outlandCompositeIndex(
    names: readonly string[],
  ): Map<string, OutlandCompositeOption[]> {
    const cacheKey = [...names].sort().join("|");
    const cached = this.outlandCompositeIndexes.get(cacheKey);
    if (cached) {
      return cached;
    }
    const familyIds = new Set(
      this.data
        .componentIds()
        .filter((symbolId) =>
          names.includes(
            this.data.component(symbolId).name,
          ),
        ),
    );
    const index = new Map<string, OutlandCompositeOption[]>();
    for (const [glyph, ways] of this.data.ways) {
      if (
        [...glyph].length !== 1 ||
        !this.data.isCharSelectable(glyph)
      ) {
        continue;
      }
      for (const way of ways) {
        if (way.length < 2 || way.length > 10) {
          continue;
        }
        const seenBases = new Set<number>();
        for (
          let baseIndex = 0;
          baseIndex < way.length;
          baseIndex += 1
        ) {
          const baseId = way[baseIndex];
          if (seenBases.has(baseId)) {
            continue;
          }
          seenBases.add(baseId);
          const attached = [...way];
          attached.splice(baseIndex, 1);
          if (
            attached.length === 0 ||
            attached.some(
              (symbolId) => !familyIds.has(symbolId),
            )
          ) {
            continue;
          }
          const normalized = [...attached].sort(
            (left, right) => left - right,
          );
          const key = `${baseId}|${normalized.length}`;
          const options = index.get(key) ?? [];
          if (
            !options.some(
              (option) =>
                option.glyph === glyph &&
                option.attached.join(",") ===
                  normalized.join(","),
            )
          ) {
            options.push({
              glyph,
              attached: normalized,
            });
            index.set(key, options);
          }
        }
      }
    }
    this.outlandCompositeIndexes.set(cacheKey, index);
    return index;
  }

  private outlandWayCanAttach(
    way: readonly number[],
    policy: TrialRuleDefinition["policy"]["cards"]["normal"],
  ): boolean {
    if (
      policy.decoyMode !== "attached" ||
      !policy.decoyComponents?.length
    ) {
      return true;
    }
    const expected = policy.decoyCount ?? 2;
    return Boolean(
      this.pickOutlandAttachmentPlan(
        way,
        policy.decoyComponents,
        expected,
        false,
      ),
    );
  }

  private pickOutlandAttachmentPlan(
    way: readonly number[],
    names: readonly string[],
    total: number,
    randomize: boolean,
  ): OutlandAttachment[] | null {
    const index = this.outlandCompositeIndex(names);
    const order = randomize
      ? shuffle(
          way.map((_, cardIndex) => cardIndex),
          this.random,
        )
      : way.map((_, cardIndex) => cardIndex);
    const selected: OutlandAttachment[] = [];
    const search = (
      orderIndex: number,
      remaining: number,
    ): boolean => {
      if (orderIndex >= order.length) {
        return remaining === 0;
      }
      const cardIndex = order[orderIndex];
      let counts = [
        ...new Set(
          Array.from(
            { length: remaining + 1 },
            (_, count) => count,
          ).filter(
            (count) =>
              count === 0 ||
              Boolean(
                index.get(
                  `${way[cardIndex]}|${count}`,
                )?.length,
              ),
          ),
        ),
      ];
      if (randomize) {
        counts = shuffle(counts, this.random);
      }
      for (const count of counts) {
        if (count === 0) {
          if (
            search(orderIndex + 1, remaining)
          ) {
            return true;
          }
          continue;
        }
        let options = [
          ...(index.get(
            `${way[cardIndex]}|${count}`,
          ) ?? []),
        ];
        if (randomize) {
          options = shuffle(options, this.random);
        }
        for (const option of options) {
          selected.push({ cardIndex, option });
          if (
            search(
              orderIndex + 1,
              remaining - count,
            )
          ) {
            return true;
          }
          selected.pop();
        }
      }
      return false;
    };
    return search(0, total) ? selected : null;
  }

  private attachOutlandDecoys(
    cards: TrialCard[],
    answerWays: readonly number[][],
    policy: TrialRuleDefinition["policy"]["cards"]["normal"],
  ): boolean {
    const names = policy.decoyComponents;
    if (!names?.length || answerWays.length === 0) {
      return false;
    }
    const expected = policy.decoyCount ?? 2;
    const reserved = new Set<number>();
    const attachments: OutlandAttachment[] = [];
    for (const answerWay of answerWays) {
      const cardIndices: number[] = [];
      for (const symbolId of answerWay) {
        const cardIndex = cards.findIndex(
          (card, index) =>
            !reserved.has(index) &&
            card.symbolId === symbolId,
        );
        if (cardIndex < 0) {
          return false;
        }
        reserved.add(cardIndex);
        cardIndices.push(cardIndex);
      }
      let plan: OutlandAttachment[] | null = null;
      const candidateWay = cardIndices.map(
        (cardIndex) => cards[cardIndex].symbolId,
      );
      const totals = shuffle(
        [expected - 1, expected, expected + 1].filter(
          (total) => total >= 1,
        ),
        this.random,
      );
      for (const total of totals) {
        const candidate = this.pickOutlandAttachmentPlan(
          candidateWay,
          names,
          total,
          true,
        );
        if (candidate) {
          plan = candidate.map((attachment) => ({
            cardIndex:
              cardIndices[attachment.cardIndex],
            option: attachment.option,
          }));
          break;
        }
      }
      if (!plan) {
        return false;
      }
      attachments.push(...plan);
    }
    for (const attachment of attachments) {
      const card = cards[attachment.cardIndex];
      card.displayGlyph = attachment.option.glyph;
      card.displayMode = "attached";
      card.attachedComponents = [
        ...attachment.option.attached,
      ];
    }
    return true;
  }

  private decoyCreatesUnexpectedAnswer(
    decoyIds: number[],
    answerWays: readonly number[][],
  ): boolean {
    for (const way of answerWays) {
      for (const decoyId of decoyIds) {
        for (let removed = 0; removed < way.length; removed += 1) {
          const components = [...way];
          components.splice(removed, 1);
          components.push(decoyId);
          if (
            this.data.accepted(components).size > 0
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }

  private syncObscuredCards(now: number): boolean {
    const activeElapsedMs =
      this.questionElapsedMs +
      (this.questionRunStartedAt === null
        ? 0
        : now - this.questionRunStartedAt);
    const groups: TrialCard[][] = [];
    if (this.state.current) {
      groups.push(this.state.current.displayCards);
    }
    if (this.state.boss) {
      groups.push(
        this.state.boss.cards,
        this.state.boss.initialCards,
      );
    }
    let changed = false;
    for (const cards of groups) {
      for (const card of cards) {
        if (
          !card.obscured &&
          card.obscuredAtMs !== undefined &&
          activeElapsedMs >= card.obscuredAtMs
        ) {
          card.obscured = true;
          changed = true;
        }
      }
    }
    return changed;
  }

  private clearFugueTimers(): void {
    for (const id of this.fugueAdvanceIds) {
      if (id !== null) {
        clearTimeout(id);
      }
    }
    this.fugueAdvanceIds = [null, null];
    if (this.fugueStageAdvanceId !== null) {
      clearTimeout(this.fugueStageAdvanceId);
      this.fugueStageAdvanceId = null;
    }
  }

  private startFugueTimer(): void {
    this.clearTimer();
    const now = performance.now();
    if (!this.state.fugue) {
      return;
    }
    this.state.fugue.slots.forEach((slot, index) => {
      this.fugueDeadlines[index] =
        now + slot.remaining * 1000;
    });
    this.timerId = setInterval(() => this.tick(), 200);
  }

  private freezeFugueTimers(): void {
    const now = performance.now();
    if (!this.state.fugue) {
      return;
    }
    this.state.fugue.slots.forEach((slot, index) => {
      if (slot.mode !== "done") {
        slot.remaining = Math.max(
          0,
          Math.ceil(
            (this.fugueDeadlines[index] - now) / 1000,
          ),
        );
      }
    });
    this.clearTimer();
  }

  private resumeFugueTimers(): void {
    this.startFugueTimer();
  }

  private tickFugue(): void {
    if (!this.state.fugue || this.state.paused) {
      return;
    }
    const now = performance.now();
    let changed = false;
    for (
      let index = 0;
      index < this.state.fugue.slots.length;
      index += 1
    ) {
      const slot = this.state.fugue.slots[index];
      if (
        slot.mode === "done" ||
        slot.revealing
      ) {
        continue;
      }
      const remaining = Math.max(
        0,
        Math.ceil(
          (this.fugueDeadlines[index] - now) / 1000,
        ),
      );
      if (remaining !== slot.remaining) {
        slot.remaining = remaining;
        changed = true;
      }
      if (remaining <= 0) {
        this.surrenderFugue();
        return;
      }
    }
    if (changed) {
      this.emit("tick");
    }
  }

  private startTimer(): void {
    this.clearTimer();
    const now = performance.now();
    this.deadline = now + this.state.remaining * 1000;
    this.questionRunStartedAt = now;
    this.timerId = setInterval(() => this.tick(), 200);
  }

  private tick(): void {
    if (this.state.fugue) {
      this.tickFugue();
      return;
    }
    if (this.state.paused || this.state.revealing) {
      return;
    }
    const obscuredChanged = this.syncObscuredCards(
      performance.now(),
    );
    const remaining = this.remainingSeconds();
    if (remaining <= 0) {
      this.state.remaining = 0;
      if (this.state.phase === "playing") {
        this.recordNormal(false);
      } else if (this.state.phase === "boss") {
        this.recordBoss(false);
      }
      this.revealMiss();
      return;
    }
    const remainingChanged =
      remaining !== this.state.remaining;
    if (remainingChanged) {
      this.state.remaining = remaining;
    }
    if (obscuredChanged) {
      this.emit("obscure");
    } else if (remainingChanged) {
      this.emit("tick");
    }
  }

  private remainingSeconds(): number {
    return Math.max(
      0,
      Math.ceil((this.deadline - performance.now()) / 1000),
    );
  }

  private revealMiss(): void {
    this.clearTimer();
    this.state.paused = false;
    this.state.revealing = true;
    this.state.feedback = "wrong";
    if (this.state.phase === "boss" && this.state.boss) {
      this.state.boss.revealAnswers =
        this.state.boss.revealAnswers ??
        this.resolveBossRevealAnswers();
    }
    this.state.revealAnswer =
      this.state.phase === "playing"
        ? (this.state.current?.char ?? "")
        : (this.state.boss?.revealAnswers?.join("") ??
          this.state.boss?.expectedAnswers.join("") ??
          "");
    const answerInput =
      this.state.phase === "playing"
        ? this.activeRule().policy.answer.normal.input
        : this.activeRule().policy.answer.boss.input;
    this.state.revealPinyin =
      answerInput === "pinyin"
        ? this.state.phase === "playing"
          ? [
              displayPinyinFor(
                this.pinyin,
                this.state.current?.char ?? "",
              ),
            ]
          : [...this.state.revealAnswer].map((char) =>
              displayPinyinFor(this.pinyin, char),
            )
        : [];
    this.state.revealMeta =
      this.state.phase === "playing"
        ? this.metaFor(this.state.revealAnswer)
        : [...this.state.revealAnswer]
            .map((char) => this.metaFor(char))
            .join(" · ");
    this.emit();
  }

  private finalizeQuestionTime(limitSeconds: number): void {
    if (this.questionRunStartedAt !== null) {
      this.questionElapsedMs +=
        performance.now() - this.questionRunStartedAt;
      this.questionRunStartedAt = null;
    }
    const elapsed = Math.max(
      0,
      Math.min(
        this.questionElapsedMs,
        limitSeconds * 1000,
      ),
    );
    this.totalQuestionTimeMs += elapsed;
    this.timedQuestionCount += 1;
    this.questionElapsedMs = 0;
  }

  private clearTimer(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private clearTimers(): void {
    this.clearTimer();
    if (this.advanceId) {
      clearTimeout(this.advanceId);
      this.advanceId = null;
    }
  }
}
