import type {
  GameData,
  GameSettings,
} from "./data";
import type { CrisLedger } from "./cris";
import {
  FALLBACK_TRIAL_RULE,
  trialRuleForStage,
  type TrialRuleDefinition,
  type TrialRulesData,
} from "./trial-rules";
import {
  balanceChallengeClassProbabilities,
  shuffleQuestionParts,
} from "./session";

export const TRIAL_STAGE_COUNT = 7;
export const TRIAL_QUESTIONS_PER_STAGE = 8;
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
  quantity?: number;
  remainingQuantity?: number;
  obscuredAtMs?: number;
  obscured?: boolean;
  mustIgnore?: boolean;
  displayGlyph?: string;
  displayMode?:
    | "component"
    | "compound"
    | "quantity"
    | "obscured"
    | "wildcard";
}

export interface TrialQuestionState {
  char: string;
  accepted: string[];
  answerWay: number[];
  displayCards: TrialCard[];
}

export interface TrialHistoryAnswer {
  char: string;
  answerWay: number[];
  displayCards: TrialCard[];
  meta: string;
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
  expectedWays: number[][];
  pendingAnswers: string[];
  pendingSubmissions: Array<{
    answer: string;
    cardIds: number[];
  }>;
  pendingAnswer: string;
  pendingCardIds: number[];
  consumedCardIds: number[];
  submissionCount: number;
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
  title: "试炼完成" | "试炼结束";
  cleared: boolean;
  reachedStage: number;
  correctCount: number;
  averageQuestionSeconds: number;
  crisEarned: number;
}

export interface TrialState {
  phase: TrialPhase;
  stage: number;
  ruleId: string;
  forcedRuleId: string | null;
  partLengthPlan: number[];
  questionInStage: number;
  timeLimit: number;
  remaining: number;
  paused: boolean;
  revealing: boolean;
  feedback: TrialFeedback;
  draft: string;
  current: TrialQuestionState | null;
  boss: TrialBossState | null;
  revealAnswer: string;
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

export function calculateTrialCrisReward(
  _correctCount: number,
  _clearedStages: number,
): number {
  // Balance is intentionally deferred until the first playable pass.
  return 0;
}

export class TrialSession {
  readonly state: TrialState;
  private readonly data: GameData;
  private readonly random: () => number;
  private readonly includeSupplementaryChars: boolean;
  private readonly pausePenalty: boolean;
  private readonly crisLedger: CrisLedger | null;
  private readonly rules: TrialRulesData | null;
  private readonly onEncounter: (
    char: string,
    way: number[],
  ) => void;
  private readonly onChange: TrialListener;
  private readonly choicesByLength = new Map<
    number,
    Map<string, TrialChoice>
  >();
  private readonly symbolIdByName = new Map<
    string,
    number
  >();
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
  ) {
    this.data = data;
    this.random = random;
    this.onChange = onChange;
    this.includeSupplementaryChars =
      settings.includeSupplementaryChars;
    this.pausePenalty = pausePenalty;
    this.onEncounter = onEncounter;
    this.crisLedger = crisLedger;
    this.rules = rules;
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
      ruleId: trialRuleForStage(rules, 1).id,
      forcedRuleId: null,
      partLengthPlan: [],
      questionInStage: 0,
      timeLimit: 0,
      remaining: 0,
      paused: false,
      revealing: false,
      feedback: "",
      draft: "",
      current: null,
      boss: null,
      revealAnswer: "",
      revealMeta: "",
      history: [],
      result: null,
    };
    this.buildChoices();
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
    this.sharedTimeRemaining =
      rule.timing.sharedBudgetSeconds ?? null;
    this.state.partLengthPlan =
      this.buildPartLengthPlan(rule);
    this.state.ruleId = rule.id;
    this.state.phase = "playing";
    this.state.questionInStage = 1;
    this.showNormalQuestion();
  }

  setDraft(value: string): void {
    this.state.draft = value;
    if (this.state.feedback === "wrong") {
      this.state.feedback = "";
    }
  }

  setRuleOverride(ruleId: string | null): void {
    if (this.state.phase !== "stage-intro") {
      return;
    }
    if (ruleId === null) {
      this.state.forcedRuleId = null;
      this.state.ruleId = trialRuleForStage(
        this.rules,
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
      this.state.revealing ||
      !this.state.draft.trim()
    ) {
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
    this.state.boss.consumedCardIds = [
      ...this.state.boss.pendingCardIds,
    ];
    const consumed = new Set(
      this.state.boss.consumedCardIds,
    );
    this.state.boss.cards =
      this.state.boss.initialCards.filter(
        (card) => !consumed.has(card.uid),
      );
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

  surrender(): void {
    if (
      this.state.phase === "stage-intro" ||
      this.state.phase === "results" ||
      this.state.revealing
    ) {
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
    const filteredByLength = new Map<
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
            acceptWay(choice.char, way),
          ),
        }))
        .filter((choice) => choice.ways.length > 0);
      filteredByLength.set(length, choices);
    }

    for (const length of requestedNormalLengths) {
      const choices = filteredByLength.get(length) ?? [];
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
          (filteredByLength.get(length)?.length ?? 0) > 0,
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
          filteredByLength.get(lengths[index]) ?? [];
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
      normalChars.size >= TRIAL_QUESTIONS_PER_STAGE &&
      normalWays >= TRIAL_QUESTIONS_PER_STAGE;
    const bossSufficient = lengthCombinations.length > 0;
    return {
      normal: {
        required: TRIAL_QUESTIONS_PER_STAGE,
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
    return this.rules
      ? trialRuleForStage(this.rules, stage)
      : FALLBACK_TRIAL_RULE;
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

  private rulePoolOptions(rule: TrialRuleDefinition) {
    return {
      normalPartLengths: rule.selection.normal.partLengths,
      bossPartLengths: rule.selection.boss.partLengths,
      bossAnswerCount: rule.selection.boss.answerCount,
      bossTotalParts: rule.selection.boss.totalParts,
      acceptWay: (_char: string, way: readonly number[]) =>
        this.wayAllowedByRule(rule, way),
    } satisfies TrialPoolAvailabilityOptions;
  }

  inspectStagePool(
    stage = this.state.stage,
  ): TrialPoolAvailability {
    return this.inspectPool(
      this.rulePoolOptions(this.activeRule(stage)),
    );
  }

  private timedSeconds(baseSeconds: number, multiplier: number): number {
    return Math.max(1, Math.round(baseSeconds * multiplier));
  }

  private buildChoices(): void {
    for (const [char, ways] of this.data.ways) {
      const level = this.data.levels.get(char);
      if (
        (level !== 1 && level !== 2) ||
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

  private availableChoices(
    length: number,
    excluded: Set<string>,
  ): TrialChoice[] {
    const choices =
      this.choicesByLength.get(length) ?? new Map();
    const rule = this.activeRule();
    return [...choices.values()]
      .filter((choice) => !excluded.has(choice.char))
      .map((choice) => ({
        char: choice.char,
        ways: choice.ways.filter((way: number[]) =>
          this.wayAllowedByRule(rule, way),
        ),
      }))
      .filter((choice) => choice.ways.length > 0);
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
    const choice = pickRandom(available, this.random);
    const way = pickRandom(choice.ways, this.random);
    this.usedStageChars.add(choice.char);
    this.usedStageBags.add(
      [...way].sort((left, right) => left - right).join(","),
    );
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
      TRIAL_QUESTIONS_PER_STAGE - 1;
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
      if (lengths.length === TRIAL_QUESTIONS_PER_STAGE) {
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

  private pickNormalChoice(): TrialChoice {
    const plannedLength =
      this.state.partLengthPlan[
        this.state.questionInStage - 1
      ];
    if (plannedLength !== undefined) {
      if (
        this.availableChoices(
          plannedLength,
          this.usedStageChars,
        ).length > 0
      ) {
        return this.takeNormalChoice(plannedLength);
      }
      this.usedStageChars.clear();
      this.usedStageBags.clear();
      return this.takeNormalChoice(plannedLength);
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
        this.availableChoices(length, this.usedStageChars)
          .length > 0,
    );
    if (availableLengths.length === 0) {
      this.usedStageChars.clear();
      this.usedStageBags.clear();
      return this.pickNormalChoice();
    }
    if (normalEffect.partWeights) {
      const weightedLengths = availableLengths.filter(
        (length) =>
          (normalEffect.partWeights?.[String(length)] ?? 0) >
          0,
      );
      const length =
        weightedLengths.length > 0
          ? pickWeighted(
              weightedLengths,
              (candidate) =>
                normalEffect.partWeights?.[
                  String(candidate)
                ] ?? 0,
              this.random,
            )
          : pickRandom(availableLengths, this.random);
      return this.takeNormalChoice(length);
    }
    if (normalEffect.partWeighting === "pool") {
      const length = pickWeighted(
        availableLengths,
        (candidate) =>
          this.availableChoices(
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
        this.availableChoices(length, this.usedStageChars).map(
          (choice) => choice.char,
        ),
      ),
    );
    const balanced = balanceChallengeClassProbabilities(
      TRIAL_BASE_PART_PROBABILITIES,
      allowedLengths.has(4)
        ? this.availableChoices(4, this.usedStageChars).length
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
        this.availableChoices(length, this.usedStageChars)
          .length > 0,
    );
    if (longLengths.length > 0) {
      categories.push({
        key: "longer",
        length: 5,
        weight: balanced.longer,
      });
    }
    if (categories.length === 0) {
      this.usedStageChars.clear();
      this.usedStageBags.clear();
      return this.pickNormalChoice();
    }
    const category = pickWeighted(
      categories,
      ({ weight }) => weight,
      this.random,
    );
    let available: TrialChoice[];
    if (category.key === "longer") {
      const length = pickWeighted(
        longLengths,
        (candidateLength) =>
          this.availableChoices(
            candidateLength,
            this.usedStageChars,
          ).length * Math.exp(-0.55 * (candidateLength - 5)),
        this.random,
      );
      available = this.availableChoices(
        length,
        this.usedStageChars,
      );
    } else {
      available = this.availableChoices(
        category.length,
        this.usedStageChars,
      );
    }
    const choice = pickRandom(available, this.random);
    const way = pickRandom(choice.ways, this.random);
    this.usedStageChars.add(choice.char);
    this.usedStageBags.add(
      [...way].sort((left, right) => left - right).join(","),
    );
    return {
      char: choice.char,
      ways: [way],
    };
  }

  private questionFor(
    choice: TrialChoice,
  ): TrialQuestionState {
    const answerWay = [...choice.ways[0]];
    const displayCards = shuffleQuestionParts(
      answerWay,
      this.random,
    ).map((symbolId) => this.makeCard(symbolId));
    return {
      char: choice.char,
      answerWay,
      displayCards,
      accepted: [...this.data.accepted(answerWay)],
    };
  }

  private setQuestionTiming(
    baseSeconds: number,
    multiplier: number,
  ): void {
    const sharedBudget =
      this.activeRule().timing.sharedBudgetSeconds;
    if (sharedBudget !== undefined) {
      this.sharedTimeRemaining ??= sharedBudget;
      this.state.timeLimit = sharedBudget;
      this.state.remaining = Math.min(
        sharedBudget,
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
    this.sharedTimeRemaining = Math.min(
      timing.sharedBudgetSeconds,
      remainingBeforeBonus +
        (timing.correctBonusSeconds ?? 0),
    );
    this.state.timeLimit = timing.sharedBudgetSeconds;
    this.state.remaining = this.sharedTimeRemaining;
  }

  private showNormalQuestion(): void {
    this.clearTimers();
    this.currentRecorded = false;
    this.questionElapsedMs = 0;
    const choice = this.pickNormalChoice();
    const question = this.questionFor(choice);
    if (!this.addRuleDecoy("normal", question.displayCards)) {
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
    this.state.revealMeta = "";
    this.setQuestionTiming(
      TRIAL_NORMAL_SECONDS,
      this.activeRule().timing.normalMultiplier,
    );
    this.onEncounter(
      this.state.current.char,
      this.state.current.answerWay,
    );
    this.startTimer();
    this.emit();
  }

  private submitNormal(): void {
    if (!this.state.current) {
      return;
    }
    const answer = this.state.draft.trim();
    if (!this.state.current.accepted.includes(answer)) {
      this.state.feedback = "wrong";
      this.emit();
      return;
    }
    const remainingBeforeBonus = this.remainingSeconds();
    this.clearTimer();
    this.applySharedCorrectBonus(remainingBeforeBonus);
    this.state.revealing = true;
    this.state.feedback = "correct";
    this.state.revealAnswer = answer;
    this.state.revealMeta = this.metaFor(answer);
    this.recordNormal(true, answer);
    this.advanceId = setTimeout(() => {
      this.advanceId = null;
      if (this.state.questionInStage >= TRIAL_QUESTIONS_PER_STAGE) {
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
    const combinations =
      this.inspectStagePool().boss.lengthCombinations;
    if (combinations.length === 0) {
      throw new Error("Unable to generate a trial boss.");
    }
    const selectedLengths = pickWeighted(
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
    const choices = this.pickBossChoices(selectedLengths);
    if (!choices) {
      throw new Error("Unable to generate a trial boss answer set.");
    }
    const ways = choices.map((choice) =>
      pickRandom(choice.ways, this.random),
    );
    const cards = shuffle(
      ways
        .flat()
        .map((symbolId) => this.makeCard(symbolId)),
      this.random,
    );
    if (!this.addRuleDecoy("boss", cards)) {
      throw new Error("Unable to add the trial boss decoy cards.");
    }
    this.scheduleObscuration("boss", cards);
    this.state.phase = "boss";
    this.state.questionInStage =
      TRIAL_QUESTIONS_PER_STAGE + 1;
    this.state.current = null;
    this.state.boss = {
      cards,
      initialCards: cards.map((card) => ({ ...card })),
      expectedAnswers: choices.map((choice) => choice.char),
      expectedWays: ways.map((way) => [...way]),
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
    this.state.revealMeta = "BOSS";
    this.setQuestionTiming(
      TRIAL_BOSS_SECONDS,
      rule.timing.bossMultiplier,
    );
    choices.forEach((choice, index) => {
      this.onEncounter(choice.char, ways[index]);
    });
    this.startTimer();
    this.emit();
  }

  private pickBossChoices(
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
      );
      if (available.length === 0) {
        available = this.availableChoices(
          length,
          new Set(selected.map((choice) => choice.char)),
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

  private submitBoss(): void {
    if (!this.state.boss) {
      return;
    }
    const chars = [...this.state.draft.trim()];
    const pendingAnswers = this.state.boss.pendingAnswers;
    if (
      chars.length === 0 ||
      chars.length >
        this.state.boss.expectedAnswers.length -
          pendingAnswers.length ||
      new Set([...pendingAnswers, ...chars]).size !==
        pendingAnswers.length + chars.length
    ) {
      this.state.feedback = "wrong";
      this.emit();
      return;
    }
    const assignment = this.assignBossAnswers(chars);
    if (!assignment) {
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
    this.state.boss.consumedCardIds = [
      ...this.state.boss.pendingCardIds,
    ];
    this.state.boss.submissionCount =
      this.state.boss.pendingAnswers.length;
    this.state.draft = "";
    if (
      this.state.boss.pendingAnswers.length ===
      this.state.boss.expectedAnswers.length
    ) {
      this.completeBoss(this.state.boss.pendingAnswer);
      return;
    }
    this.state.feedback = "partial";
    this.emit();
  }

  private assignBossAnswers(
    answers: string[],
  ): {
    remainingCards: TrialCard[];
    submissions: Array<{
      answer: string;
      cardIds: number[];
    }>;
  } | null {
    if (!this.state.boss) {
      return null;
    }
    const allowedLengths = new Set(
      this.activeRule().selection.boss.partLengths,
    );
    const expectedAnswers = new Set(
      this.state.boss.expectedAnswers,
    );
    const answersLeftAfterSubmit =
      this.state.boss.expectedAnswers.length -
      this.state.boss.pendingAnswers.length -
      answers.length;
    const submissions: Array<{
      answer: string;
      cardIds: number[];
    }> = [];
    const search = (
      answerIndex: number,
      cards: TrialCard[],
    ): {
      remainingCards: TrialCard[];
      submissions: Array<{
        answer: string;
        cardIds: number[];
      }>;
    } | null => {
      if (answerIndex >= answers.length) {
        if (answersLeftAfterSubmit === 0) {
          const unusedAnswerCards = cards.filter(
            (card) => !card.mustIgnore,
          );
          return unusedAnswerCards.length === 0
            ? {
                remainingCards: cards,
                submissions: submissions.map(
                  (submission) => ({
                    ...submission,
                    cardIds: [...submission.cardIds],
                  }),
                ),
              }
            : null;
        }
        return this.canPartitionBossCards(
          cards,
          answersLeftAfterSubmit,
          allowedLengths,
          new Set([
            ...(this.state.boss?.pendingAnswers ?? []),
            ...answers,
          ]),
        )
          ? {
              remainingCards: cards,
              submissions: submissions.map(
                (submission) => ({
                  ...submission,
                  cardIds: [...submission.cardIds],
                }),
              ),
            }
          : null;
      }
      const answerCards = cards.filter(
        (card) => !card.mustIgnore,
      );
      if (!expectedAnswers.has(answers[answerIndex])) {
        return null;
      }
      const limit = 1 << answerCards.length;
      for (let mask = 1; mask < limit; mask += 1) {
        const selected = cardsForMask(answerCards, mask);
        if (!allowedLengths.has(selected.length)) {
          continue;
        }
        if (
          !this.data
            .accepted(selected.map((card) => card.symbolId))
            .has(answers[answerIndex])
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
    return search(0, this.state.boss.cards);
  }

  private canPartitionBossCards(
    cards: TrialCard[],
    answerCount: number,
    allowedLengths: Set<number>,
    reservedChars: Set<string>,
  ): boolean {
    const answerCards = cards.filter(
      (card) => !card.mustIgnore,
    );
    if (answerCount === 0) {
      return answerCards.length === 0;
    }
    if (answerCards.length === 0) {
      return false;
    }
    const limit = 1 << answerCards.length;
    for (let mask = 1; mask < limit; mask += 1) {
      if ((mask & 1) === 0) {
        continue;
      }
      const selected = cardsForMask(answerCards, mask);
      if (!allowedLengths.has(selected.length)) {
        continue;
      }
      const candidates = [
        ...this.data.accepted(
          selected.map((card) => card.symbolId),
        ),
      ].filter(
        (char) =>
          !reservedChars.has(char) &&
          (this.state.boss?.expectedAnswers.includes(
            char,
          ) ??
            false),
      );
      if (candidates.length === 0) {
        continue;
      }
      const remaining = cards.filter(
        (card) =>
          !selected.some((used) => used.uid === card.uid),
      );
      for (const candidate of candidates) {
        if (
          this.canPartitionBossCards(
            remaining,
            answerCount - 1,
            allowedLengths,
            new Set([...reservedChars, candidate]),
          )
        ) {
          return true;
        }
      }
    }
    return false;
  }

  private completeBoss(answer: string): void {
    if (!this.state.boss) {
      return;
    }
    const remainingBeforeBonus = this.remainingSeconds();
    this.clearTimer();
    this.applySharedCorrectBonus(remainingBeforeBonus);
    this.state.revealing = true;
    this.state.feedback = "correct";
    this.state.revealAnswer = answer;
    this.state.revealMeta = "BOSS";
    this.recordBoss(true, answer);
    this.advanceId = setTimeout(() => {
      this.advanceId = null;
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
      this.state.timeLimit = 0;
      this.state.remaining = 0;
      this.state.paused = false;
      this.state.revealing = false;
      this.state.feedback = "";
      this.state.draft = "";
      this.state.current = null;
      this.state.boss = null;
      this.emit();
    }, 1200);
    this.emit();
  }

  private recordNormal(
    ok: boolean,
    given = this.state.draft,
  ): void {
    if (this.currentRecorded || !this.state.current) {
      return;
    }
    this.currentRecorded = true;
    this.finalizeQuestionTime(this.state.timeLimit);
    const answer = ok
      ? given
      : this.state.current.char;
    this.state.history.push({
      stage: this.state.stage,
      ruleId: this.state.ruleId,
      slot: this.state.questionInStage,
      kind: "normal",
      answerWay: [...this.state.current.answerWay],
      displayCards: this.state.current.displayCards.map(
        (card) => ({ ...card }),
      ),
      answerDetails: [
        {
          char: answer,
          answerWay: [...this.state.current.answerWay],
          displayCards: this.state.current.displayCards.map(
            (card) => ({ ...card }),
          ),
          meta: this.metaFor(answer),
        },
      ],
      parts: this.data.names(this.state.current.answerWay),
      displayParts: this.data.names(
        this.state.current.displayCards.map(
          (card) => card.symbolId,
        ),
      ),
      displaySymbolIds: this.state.current.displayCards.map(
        (card) => card.symbolId,
      ),
      answer,
      given,
      ok,
      meta: this.metaFor(answer),
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
    const answer = ok
      ? submitted
      : this.state.boss.expectedAnswers.join("");
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
        answerWay: cards.map((card) => card.symbolId),
        displayCards: cards.map((card) => ({ ...card })),
        meta: this.metaFor(char),
      }));
    this.state.history.push({
      stage: this.state.stage,
      ruleId: this.state.ruleId,
      slot: TRIAL_QUESTIONS_PER_STAGE + 1,
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

  private groupCardsByExpectedAnswers(): Array<{
    char: string;
    cards: TrialCard[];
  }> {
    if (!this.state.boss) {
      return [];
    }
    const remaining = [...this.state.boss.initialCards];
    return this.state.boss.expectedAnswers.map(
      (char, answerIndex) => {
        const way =
          this.state.boss?.expectedWays[answerIndex] ?? [];
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

  private finish(cleared: boolean): void {
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
    const clearedStages = cleared
      ? TRIAL_STAGE_COUNT
      : Math.max(0, this.state.stage - 1);
    const crisEarned = calculateTrialCrisReward(
      correctCount,
      clearedStages,
    );
    if (crisEarned > 0) {
      this.crisLedger?.add(crisEarned);
    }
    this.state.result = {
      title: cleared ? "试炼完成" : "试炼结束",
      cleared,
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

  private addRuleDecoy(
    kind: "normal" | "boss",
    cards: TrialCard[],
  ): boolean {
    const cardPolicy = this.activeRule().policy.cards[kind];
    const names = cardPolicy.decoyComponents;
    const count = cardPolicy.decoyCount ?? 0;
    if (!names || names.length === 0 || count === 0) {
      return true;
    }
    const answerIds = new Set(
      cards.map((card) => card.symbolId),
    );
    const candidates = [
      ...new Set(
        names
          .map((name) => this.symbolIdByName.get(name))
          .filter(
            (symbolId): symbolId is number =>
              symbolId !== undefined &&
              !answerIds.has(symbolId),
          ),
      ),
    ];
    if (candidates.length < count) {
      return false;
    }
    const selected = shuffle(candidates, this.random).slice(
      0,
      count,
    );
    for (const symbolId of selected) {
      const decoy = this.makeCard(symbolId, "decoy");
      decoy.mustIgnore = true;
      cards.push(decoy);
    }
    const mixed = shuffle(cards, this.random);
    cards.splice(0, cards.length, ...mixed);
    return true;
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

  private startTimer(): void {
    this.clearTimer();
    const now = performance.now();
    this.deadline = now + this.state.remaining * 1000;
    this.questionRunStartedAt = now;
    this.timerId = setInterval(() => this.tick(), 200);
  }

  private tick(): void {
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
    this.state.revealAnswer =
      this.state.phase === "playing"
        ? (this.state.current?.char ?? "")
        : (this.state.boss?.expectedAnswers.join("") ?? "");
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
