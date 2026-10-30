import type {
  ChallengeDifficulty,
  ChallengeBounds,
  GameData,
  GameSettings,
  Mode,
} from "./data";
import { externalCharacterMeta } from "./data";
import {
  calculateCrisReward,
  type CrisLedger,
} from "./cris";
import { recordKey, type RecordStore } from "./records";

export interface Question {
  char: string;
  way: number[];
  symbolIds: number[];
  parts: string[];
  displayParts: string[];
  displaySymbolIds: number[];
  accepted: string[];
}

export interface HistoryItem {
  parts: string[];
  displayParts: string[];
  displaySymbolIds: number[];
  answer: string;
  given: string;
  ok: boolean;
  meta: string;
  isEx: boolean;
}

export interface ResultState {
  title: string;
  record: number;
  newRecord: boolean;
  averageQuestionSeconds: number;
  crisEarned: number;
}

export interface GameState {
  phase: "playing" | "results";
  settings: GameSettings;
  index: number;
  correctCount: number;
  remaining: number;
  paused: boolean;
  revealing: boolean;
  pendingSettlement: boolean;
  skipsRemaining: number;
  feedback: string;
  draft: string;
  current: Question | null;
  revealAnswer: string;
  revealMeta: string;
  advanceLabel: string;
  history: HistoryItem[];
  result: ResultState | null;
}

export type SessionEvent = "state" | "tick";
type SessionListener = (state: GameState, event: SessionEvent) => void;

export interface ChallengeClassProbabilities {
  two: number;
  three: number;
  four: number;
  longer: number;
}

export const MAX_CHALLENGE_SKIPS = 5;

export function initialChallengeSkips(
  difficulty: ChallengeDifficulty,
): number {
  return difficulty === "expert" ? 0 : 1;
}

const shuffle = <T>(items: T[], random: () => number): T[] => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
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

export function shuffleQuestionParts<T>(
  parts: T[],
  random: () => number,
): T[] {
  const result = shuffle(parts, random);
  if (
    result.length > 1 &&
    result.every((part, index) => part === parts[index])
  ) {
    const swapIndex = result.findIndex((part) => part !== result[0]);
    if (swapIndex > 0) {
      [result[0], result[swapIndex]] = [result[swapIndex], result[0]];
    }
  }
  return result;
}

export function challengeClassProbabilities(
  settings: GameSettings,
  stage: number,
  position: number,
): ChallengeClassProbabilities {
  const localProgress =
    settings.stageQuestions <= 1
      ? 0
      : Math.min(
          1,
          Math.max(0, (position - 1) / (settings.stageQuestions - 1)),
        );
  const effectiveStage = Math.max(0, stage - 1) + 0.5 * localProgress;
  const two = Math.max(0.05, 0.25 - 0.2 * (effectiveStage / 7));
  const threeFour = 0.65 + 0.1 * Math.min(1, effectiveStage / 11);
  const fourThreeRatio = Math.min(
    1.2,
    0.55 + (0.47 * Math.max(0, stage - 1)) / 11,
  );
  const four = (threeFour * fourThreeRatio) / (1 + fourThreeRatio);

  return {
    two,
    three: threeFour - four,
    four,
    longer: Math.max(0, 1 - two - threeFour),
  };
}

export function balanceChallengeClassProbabilities(
  probabilities: ChallengeClassProbabilities,
  fourPartCharacters: number,
  longerPartCharacters: number,
  // A 5+ part character may be at most twice as likely as the average
  // 4-part character when the long-group inventory is sparse.
  fairnessFactor = 2,
): ChallengeClassProbabilities {
  if (fourPartCharacters <= 0 || longerPartCharacters <= 0) {
    return { ...probabilities };
  }

  const longCap =
    (fairnessFactor * probabilities.four * longerPartCharacters) /
    fourPartCharacters;
  const longer = Math.min(probabilities.longer, longCap);
  const excess = probabilities.longer - longer;
  const threeFourTotal = probabilities.three + probabilities.four;

  if (threeFourTotal <= 0) {
    return {
      two: probabilities.two,
      three: probabilities.three,
      four: probabilities.four + excess,
      longer,
    };
  }

  return {
    two: probabilities.two,
    three:
      probabilities.three + excess * (probabilities.three / threeFourTotal),
    four:
      probabilities.four + excess * (probabilities.four / threeFourTotal),
    longer,
  };
}

export class GameSession {
  readonly state: GameState;
  private readonly data: GameData;
  private readonly records: RecordStore;
  private readonly onChange: SessionListener;
  private readonly random: () => number;
  private readonly crisLedger: CrisLedger | null;
  private pool: string[] = [];
  private usedBags = new Set<string>();
  private usedChars = new Set<string>();
  private deadline = 0;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private advanceId: ReturnType<typeof setTimeout> | null = null;
  private currentRecorded = false;
  private questionRunStartedAt: number | null = null;
  private questionElapsedMs = 0;
  private totalQuestionTimeMs = 0;
  private timedQuestionCount = 0;
  private challengeExEntered = false;
  private challengeExCorrectCount = 0;

  constructor(
    data: GameData,
    settings: GameSettings,
    records: RecordStore,
    onChange: SessionListener,
    random: () => number = Math.random,
    crisLedger: CrisLedger | null = null,
  ) {
    this.data = data;
    this.records = records;
    this.onChange = onChange;
    this.random = random;
    this.crisLedger = crisLedger;
    this.state = {
      phase: "playing",
      settings: structuredClone(settings),
      index: 0,
      correctCount: 0,
      remaining: settings.seconds,
      paused: false,
      revealing: false,
      pendingSettlement: false,
      skipsRemaining:
        settings.mode === "challenge"
          ? initialChallengeSkips(settings.difficulty)
          : Number.POSITIVE_INFINITY,
      feedback: "",
      draft: "",
      current: null,
      revealAnswer: "",
      revealMeta: "",
      advanceLabel: "",
      history: [],
      result: null,
    };
    this.start();
  }

  private emit(event: SessionEvent = "state"): void {
    this.onChange(this.state, event);
  }

  private buildPool(): string[] {
    const chars = new Set<string>();
    for (const level of this.state.settings.levels) {
      for (const char of this.data.candidates(
        level,
        this.state.settings.partsLow,
        this.state.settings.partsHigh,
      )) {
        chars.add(char);
      }
    }
    return shuffle([...chars], this.random);
  }

  private start(): void {
    this.pool =
      this.state.settings.mode === "challenge" ? [] : this.buildPool();
    this.nextQuestion();
  }

  private nextQuestion(): void {
    this.clearTimers();
    this.questionRunStartedAt = null;
    this.questionElapsedMs = 0;
    this.state.index += 1;
    this.state.current = this.pickQuestion();
    this.state.remaining = this.state.settings.seconds;
    this.state.paused = false;
    this.state.revealing = false;
    this.state.pendingSettlement = false;
    this.state.feedback = "";
    this.state.draft = "";
    this.state.revealAnswer = "";
    this.state.revealMeta = "";
    this.state.advanceLabel = "";
    this.currentRecorded = false;
    this.grantExEntrySkip();
    this.startTimer();
    this.emit();
  }

  private waysInRange(char: string): number[][] {
    return (this.data.ways.get(char) ?? []).filter(
      (way) =>
        way.length >= this.state.settings.partsLow &&
        way.length <= this.state.settings.partsHigh,
    );
  }

  private pickQuestion(
    componentCount?: number,
    excludeChar?: string,
  ): Question {
    if (this.state.settings.mode === "challenge") {
      return this.pickChallengeQuestion(componentCount, excludeChar);
    }

    const waysFor = (char: string): number[][] =>
      this.waysInRange(char).filter(
        (way) =>
          componentCount === undefined ||
          way.length === componentCount,
      );

    while (this.pool.length > 0) {
      const char = this.pool.pop();
      if (!char || char === excludeChar) {
        break;
      }
      const ways = waysFor(char);
      if (ways.length === 0) {
        continue;
      }
      const way = pickRandom(ways, this.random);
      const key = [...way].sort((a, b) => a - b).join(",");
      if (this.usedBags.has(key)) {
        continue;
      }
      this.usedBags.add(key);
      this.usedChars.add(char);
      return this.toQuestion(char, way);
    }

    const chars = this.buildPool().filter(
      (char) => char !== excludeChar && waysFor(char).length > 0,
    );
    if (chars.length === 0) {
      throw new Error("没有符合设置的字");
    }
    const char = pickRandom(chars, this.random);
    const way = pickRandom(waysFor(char), this.random);
    this.usedChars.add(char);
    return this.toQuestion(char, way);
  }

  private pickChallengeQuestion(
    componentCount?: number,
    excludeChar?: string,
  ): Question {
    const bounds = this.challengeBounds();
    const minParts = bounds.isEx ? 3 : 2;
    const source = bounds.isEx
      ? this.data.exOrder
      : this.data.challengeOrder.slice(bounds.start, bounds.end);
    let window = source.filter(
      (char) =>
        this.data.isCharSelectable(char) &&
        (this.data.ways.get(char) ?? []).some(
          (way) => way.length >= minParts,
        ),
    );

    if (window.length === 0) {
      const fallback = bounds.isEx
        ? this.data.exOrder
        : this.data.challengeOrder;
      window = fallback.filter(
        (char) =>
          this.data.isCharSelectable(char) &&
          (this.data.ways.get(char) ?? []).some(
            (way) => way.length >= minParts,
          ),
      );
    }

    type Choice = {
      char: string;
      ways: number[][];
      length: number;
    };

    const choicesByLength = new Map<number, Map<string, Choice>>();

    for (const char of window) {
      const ways = this.data.ways.get(char) ?? [];
      for (const way of ways) {
        if (way.length < minParts) {
          continue;
        }
        let group = choicesByLength.get(way.length);
        if (!group) {
          group = new Map();
          choicesByLength.set(way.length, group);
        }
        const choice = group.get(char) ?? {
          char,
          ways: [],
          length: way.length,
        };
        choice.ways.push(way);
        group.set(char, choice);
      }
    }

    const allChoices = [...choicesByLength.values()].flatMap((group) =>
      [...group.values()],
    );
    const eligibleChoices = excludeChar
      ? allChoices.filter((choice) => choice.char !== excludeChar)
      : allChoices;
    if (eligibleChoices.length === 0) {
      throw new Error("没有另一道相同部件数的题");
    }
    const unusedChoices = eligibleChoices.filter(
      (choice) => !this.usedChars.has(choice.char),
    );
    const availableChoices =
      unusedChoices.length > 0 ? unusedChoices : eligibleChoices;
    if (availableChoices.length === 0) {
      throw new Error("没有符合当前阶段的字");
    }

    const makeQuestion = (selected: Choice): Question => {
      const unusedWays = selected.ways.filter(
        (way) =>
          !this.usedBags.has([...way].sort((a, b) => a - b).join(",")),
      );
      const way = pickRandom(
        unusedWays.length > 0 ? unusedWays : selected.ways,
        this.random,
      );
      this.usedChars.add(selected.char);
      this.usedBags.add([...way].sort((a, b) => a - b).join(","));
      return this.toQuestion(selected.char, way);
    };

    if (componentCount !== undefined) {
      const sameLength = availableChoices.filter(
        (choice) => choice.length === componentCount,
      );
      if (sameLength.length === 0) {
        throw new Error("没有另一道相同部件数的题");
      }
      return makeQuestion(pickRandom(sameLength, this.random));
    }

    const groups = new Map<number, Choice[]>();
    for (const choice of availableChoices) {
      const group = groups.get(choice.length) ?? [];
      group.push(choice);
      groups.set(choice.length, group);
    }

    const position = bounds.isEx
      ? this.state.settings.stageQuestions
      : ((this.state.index - 1) % this.state.settings.stageQuestions) + 1;
    const probabilities = challengeClassProbabilities(
      this.state.settings,
      bounds.stage,
      position,
    );
    const longChoices = [...groups.entries()]
      .filter(([componentCount]) => componentCount >= 5)
      .flatMap(([, choices]) => choices);
    const balancedProbabilities = balanceChallengeClassProbabilities(
      probabilities,
      groups.get(4)?.length ?? 0,
      new Set(longChoices.map((choice) => choice.char)).size,
    );

    const categories = [
      { key: "two", weight: balancedProbabilities.two, componentCount: 2 },
      {
        key: "three",
        weight: balancedProbabilities.three,
        componentCount: 3,
      },
      {
        key: "four",
        weight: balancedProbabilities.four,
        componentCount: 4,
      },
    ].filter(({ componentCount }) => groups.has(componentCount));

    const longGroups = [...groups.entries()]
      .filter(([componentCount]) => componentCount >= 5)
      .sort(([left], [right]) => left - right);
    if (longGroups.length > 0) {
      categories.push({
        key: "longer",
        weight: balancedProbabilities.longer,
        componentCount: 5,
      });
    }

    const category = pickWeighted(
      categories,
      ({ weight }) => weight,
      this.random,
    );
    let selectedGroup: Choice[];

    if (category.key === "longer") {
      const stageProgress = Math.min(1, Math.max(0, bounds.stage - 1) / 11);
      const decay = 0.52 - 0.18 * stageProgress;
      const [componentCount] = pickWeighted(
        longGroups,
        ([count, choices]) =>
          choices.length * Math.exp(-decay * (count - 5)),
        this.random,
      );
      selectedGroup = groups.get(componentCount) ?? [];
    } else {
      selectedGroup = groups.get(category.componentCount) ?? [];
    }

    return makeQuestion(pickRandom(selectedGroup, this.random));
  }

  private toQuestion(char: string, way: number[]): Question {
    const parts = this.data.names(way);
    const displaySymbolIds = shuffleQuestionParts([...way], this.random);
    return {
      char,
      way,
      symbolIds: [...way],
      parts,
      displayParts: this.data.names(displaySymbolIds),
      displaySymbolIds,
      accepted: [...this.data.accepted(way)],
    };
  }

  setDraft(value: string): void {
    this.state.draft = value;
    if (this.state.feedback === "wrong") {
      this.state.feedback = "";
    }
  }

  skipQuestion(): void {
    if (
      this.state.phase !== "playing" ||
      this.state.revealing ||
      this.state.paused ||
      !this.state.current
    ) {
      return;
    }
    if (
      this.state.settings.mode === "challenge" &&
      this.state.skipsRemaining <= 0
    ) {
      return;
    }

    const current = this.state.current;
    let replacement: Question;
    try {
      replacement = this.pickQuestion(
        current.symbolIds.length,
        current.char,
      );
    } catch {
      return;
    }

    if (this.state.settings.mode === "challenge") {
      this.state.skipsRemaining -= 1;
    }
    this.clearTimers();
    this.questionRunStartedAt = null;
    this.questionElapsedMs = 0;
    this.state.current = replacement;
    this.state.remaining = this.state.settings.seconds;
    this.state.paused = false;
    this.state.revealing = false;
    this.state.pendingSettlement = false;
    this.state.feedback = "";
    this.state.draft = "";
    this.state.revealAnswer = "";
    this.state.revealMeta = "";
    this.state.advanceLabel = "";
    this.currentRecorded = false;
    this.startTimer();
    this.emit();
  }

  setExEnabled(enabled: boolean): void {
    if (this.state.settings.mode !== "challenge") {
      return;
    }
    this.state.settings.exEnabled = enabled;
    if (enabled && !this.challengeExEntered) {
      this.challengeExCorrectCount = 0;
    }
  }

  submit(): void {
    if (
      this.state.phase !== "playing" ||
      this.state.revealing ||
      this.state.paused ||
      !this.state.current
    ) {
      return;
    }

    const answer = this.state.draft.trim();
    if (!answer) {
      return;
    }

    if (!this.state.current.accepted.includes(answer)) {
      this.state.feedback = "wrong";
      this.emit();
      return;
    }

    this.clearTimers();
    this.state.correctCount += 1;
    this.recordCurrent(true, answer, answer);
    this.grantChallengeProgressReward();
    this.state.revealing = true;
    this.state.feedback = "correct";
    this.state.revealAnswer = answer;
    this.state.revealMeta = this.metaFor(answer);

    if (
      this.state.settings.mode === "normal" &&
      this.state.index >= this.state.settings.count
    ) {
      this.state.pendingSettlement = true;
    }
    const isEx =
      this.state.settings.mode === "challenge" &&
      this.challengeBounds().isEx;
    this.advanceId = setTimeout(() => {
      this.advanceId = null;
      this.advance();
    }, isEx ? 1600 : 900);
    this.emit();
  }

  togglePause(): void {
    if (this.state.phase !== "playing" || this.state.revealing) {
      return;
    }

    if (!this.state.paused) {
      const now = performance.now();
      this.state.remaining = this.remainingSeconds();
      if (this.questionRunStartedAt !== null) {
        this.questionElapsedMs += now - this.questionRunStartedAt;
        this.questionRunStartedAt = null;
      }
      this.state.paused = true;
      this.state.feedback = "paused";
      this.clearTimer();
    } else {
      this.state.paused = false;
      this.state.feedback = "";
      this.startTimer();
    }
    this.emit();
  }

  surrender(): void {
    if (
      this.state.phase !== "playing" ||
      this.state.revealing ||
      !this.state.current
    ) {
      return;
    }
    this.clearTimers();
    this.state.paused = false;
    this.recordCurrent(false, this.state.draft);
    const practice = this.state.settings.mode === "normal";
    this.revealCurrent(
      practice ? "继续" : "结算",
      !practice,
    );
  }

  advance(): void {
    if (this.state.phase !== "playing" || !this.state.revealing) {
      return;
    }
    if (this.advanceId) {
      clearTimeout(this.advanceId);
      this.advanceId = null;
    }
    if (this.state.pendingSettlement) {
      this.finish();
      return;
    }
    if (
      this.state.settings.mode !== "normal" &&
      this.state.history.length > 0 &&
      !this.state.history[this.state.history.length - 1].ok
    ) {
      this.finish();
      return;
    }
    if (
      this.state.settings.mode === "normal" &&
      this.state.index >= this.state.settings.count
    ) {
      this.finish();
      return;
    }
    this.nextQuestion();
  }

  private tick(): void {
    if (this.state.paused || this.state.revealing) {
      return;
    }
    const remaining = this.remainingSeconds();
    if (remaining <= 0) {
      this.state.remaining = 0;
      this.revealTimeout();
      return;
    }
    if (remaining !== this.state.remaining) {
      this.state.remaining = remaining;
      this.emit("tick");
    }
  }

  private revealTimeout(): void {
    if (!this.state.current) {
      return;
    }
    this.clearTimers();
    this.recordCurrent(false, this.state.draft);
    const practice = this.state.settings.mode === "normal";
    this.revealCurrent(
      practice ? "继续" : "结算",
      !practice,
    );
  }

  private revealCurrent(advanceLabel: string, pendingSettlement: boolean): void {
    if (!this.state.current) {
      return;
    }
    this.state.revealing = true;
    this.state.feedback = "wrong";
    this.state.revealAnswer = this.state.current.char;
    this.state.revealMeta = this.metaFor(this.state.current.char);
    this.state.advanceLabel = advanceLabel;
    this.state.pendingSettlement = pendingSettlement;
    this.emit();
  }

  private recordCurrent(
    ok: boolean,
    given: string,
    displayedAnswer = this.state.current?.char ?? "",
  ): void {
    if (this.currentRecorded || !this.state.current) {
      return;
    }
    this.currentRecorded = true;
    this.finalizeQuestionTime();
    this.state.history.push({
      parts: this.state.current.parts,
      displayParts: [...this.state.current.displayParts],
      displaySymbolIds: [...this.state.current.displaySymbolIds],
      answer: displayedAnswer,
      given,
      ok,
      meta: this.metaFor(displayedAnswer),
      isEx:
        this.state.settings.mode === "challenge" &&
        this.challengeBounds().isEx,
    });
  }

  private metaFor(char: string): string {
    if (
      this.state.settings.mode === "challenge" &&
      this.challengeBounds().isEx &&
      !this.data.levels.has(char)
    ) {
      return externalCharacterMeta(char);
    }
    const meta = this.data.answerMeta(char);
    return meta ? `（${meta}）` : "";
  }

  private addChallengeSkip(): void {
    if (this.state.settings.mode !== "challenge") {
      return;
    }
    this.state.skipsRemaining = Math.min(
      MAX_CHALLENGE_SKIPS,
      this.state.skipsRemaining + 1,
    );
  }

  private grantExEntrySkip(): void {
    if (
      this.state.settings.mode !== "challenge" ||
      !this.state.settings.exEnabled ||
      !this.challengeBounds().isEx
    ) {
      return;
    }
    if (this.challengeExEntered) {
      return;
    }
    this.challengeExEntered = true;
    if (
      this.state.settings.difficulty === "expert"
    ) {
      this.addChallengeSkip();
    }
  }

  private grantChallengeProgressReward(): void {
    if (this.state.settings.mode !== "challenge") {
      return;
    }
    const bounds = this.challengeBounds();
    if (bounds.isEx) {
      if (this.state.settings.difficulty !== "expert") {
        return;
      }
      this.challengeExCorrectCount += 1;
      if (this.challengeExCorrectCount % 10 === 0) {
        this.addChallengeSkip();
      }
      return;
    }
    if (
      this.state.index % this.state.settings.stageQuestions !== 0
    ) {
      return;
    }
    const difficulty = this.state.settings.difficulty;
    if (
      difficulty === "beginner" ||
      (difficulty === "standard" && bounds.stage % 4 === 0)
    ) {
      this.addChallengeSkip();
    }
  }

  private finish(): void {
    if (this.state.phase === "results") {
      return;
    }
    this.clearTimers();
    this.state.phase = "results";

    const mode: Mode = this.state.settings.mode;
    const normalWin =
      mode === "normal" &&
      this.state.history.length >= this.state.settings.count &&
      this.state.correctCount === this.state.history.length;
    let record = 0;
    let newRecord = false;

    if (mode !== "normal") {
      const key = recordKey(this.state.settings);
      const previous = this.records.load(key);
      record = Math.max(previous, this.state.correctCount);
      newRecord = this.state.correctCount > previous;
      if (newRecord) {
        this.records.save(key, record);
      }
    }

    let title = normalWin ? "胜利" : "本局结束";
    if (mode === "endless") {
      title = "无尽结束";
    } else if (mode === "challenge") {
      title = "挑战结束";
    }

    this.state.result = {
      title,
      record,
      newRecord,
      averageQuestionSeconds:
        this.timedQuestionCount > 0
          ? this.totalQuestionTimeMs /
            this.timedQuestionCount /
            1000
          : 0,
      crisEarned: 0,
    };
    if (mode === "challenge") {
      const normalCorrect = this.state.history.filter(
        (item) => item.ok && !item.isEx,
      ).length;
      const exCorrect = this.state.history.filter(
        (item) => item.ok && item.isEx,
      ).length;
      const crisEarned = calculateCrisReward(
        {
          difficulty: this.state.settings.difficulty,
          normalCorrect,
          exCorrect,
          stagesCleared: Math.floor(
            normalCorrect /
              Math.max(1, this.state.settings.stageQuestions),
          ),
          stageQuestions: this.state.settings.stageQuestions,
          enteredEx: this.state.history.some(
            (item) => item.isEx,
          ),
        },
      );
      this.state.result.crisEarned = crisEarned;
      if (crisEarned > 0) {
        this.crisLedger?.add(crisEarned);
      }
    }
    this.emit();
  }

  private challengeBounds(): ChallengeBounds {
    return this.data.challengeBounds(this.state.settings, this.state.index);
  }

  private startTimer(): void {
    this.clearTimer();
    const now = performance.now();
    this.deadline = now + this.state.remaining * 1000;
    this.questionRunStartedAt = now;
    this.timerId = setInterval(() => this.tick(), 200);
  }

  private finalizeQuestionTime(): void {
    if (this.questionRunStartedAt !== null) {
      this.questionElapsedMs +=
        performance.now() - this.questionRunStartedAt;
      this.questionRunStartedAt = null;
    }
    const elapsed = Math.max(
      0,
      Math.min(
        this.questionElapsedMs,
        this.state.settings.seconds * 1000,
      ),
    );
    this.totalQuestionTimeMs += elapsed;
    this.timedQuestionCount += 1;
    this.questionElapsedMs = 0;
  }

  private remainingSeconds(): number {
    return Math.max(0, Math.ceil((this.deadline - performance.now()) / 1000));
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

  destroy(): void {
    this.clearTimers();
  }
}

