import type { ChallengeDifficulty, Level } from "./data";

const SHARE_URL = "https://dveissre.github.io/zigsaw/";

export interface ShareHistoryItem {
  ok: boolean;
  isEx: boolean;
  level?: Level;
}

export interface ChallengeShareOptions {
  correctCount: number;
  stage: string;
  isEx: boolean;
  difficulty: ChallengeDifficulty;
  averageQuestionSeconds: number;
  history: ShareHistoryItem[];
}

export type TrialResultTitle =
  | "覆鹿遗蕉"
  | "临歧何反"
  | "雾径得津"
  | "知我梦中";

export interface TrialShareHistoryItem {
  ok: boolean;
  kind: "normal" | "boss";
  stage: number;
  level?: Level;
}

export interface TrialShareOptions {
  advancement: number;
  title: TrialResultTitle;
  correctCount: number;
  reachedStage: number;
  stageName: string;
  ruleName: string;
  history: TrialShareHistoryItem[];
}

const DIFFICULTY_LABELS: Record<ChallengeDifficulty, string> = {
  beginner: "入门",
  standard: "普通",
  expert: "专家",
};

export function challengeStageEmoji(
  stage: number,
  isEx: boolean,
): string {
  if (isEx) {
    return "🌌";
  }
  if (stage <= 5) {
    return "🌱";
  }
  if (stage <= 11) {
    return "🔥";
  }
  return "🏔️";
}

export function challengeResultEmoji(
  item: ShareHistoryItem,
): string {
  if (!item.ok) {
    return "🟥";
  }
  if (item.isEx) {
    return "🟪";
  }
  if (item.level === 2) {
    return "🟩";
  }
  if (item.level === 3) {
    return "🟦";
  }
  return "⬜";
}

export function challengeTimeEmoji(averageSeconds: number): string {
  if (averageSeconds < 6) {
    return "⚡";
  }
  if (averageSeconds < 15) {
    return "💫";
  }
  if (averageSeconds < 25) {
    return "🕒";
  }
  return "⏳";
}

export function trialResultEmoji(
  title: TrialResultTitle,
): string {
  return {
    覆鹿遗蕉: "🌫️",
    临歧何反: "🏕️",
    雾径得津: "🌄",
    知我梦中: "🌌",
  }[title];
}

export function trialCompletionEmoji(stage: number): string {
  if (stage <= 3) {
    return "🔸";
  }
  if (stage <= 6) {
    return "🔹";
  }
  return "🔷";
}

export function trialQuestionEmoji(
  item: TrialShareHistoryItem,
): string {
  if (!item.ok) {
    return "🟥";
  }
  if (item.kind === "boss") {
    return "🟪";
  }
  if (item.level === 2 || item.level === 3) {
    return "🟩";
  }
  return "⬜";
}

export function trialShareHistory(
  history: TrialShareHistoryItem[],
  reachedStage: number,
): TrialShareHistoryItem[] {
  if (reachedStage <= 1) {
    return history.filter((item) => item.stage === 1);
  }
  return history.filter(
    (item) =>
      item.stage === reachedStage ||
      item.stage === reachedStage - 1,
  );
}

export function buildChallengeShareText({
  correctCount,
  stage,
  isEx,
  difficulty,
  averageQuestionSeconds,
  history,
}: ChallengeShareOptions): string {
  const numericStage = Number.parseInt(stage, 10);
  const stageEmoji = challengeStageEmoji(
    Number.isFinite(numericStage) ? numericStage : 1,
    isEx,
  );
  const symbols = history.map(challengeResultEmoji);
  const visibleSymbols =
    symbols.length > 20 ? symbols.slice(-20) : symbols;
  const overflow = symbols.length > 20 ? "▫️◽" : "";

  return [
    `◈ ZIGSAW - 挑战 - ${DIFFICULTY_LABELS[difficulty]}`,
    `${stageEmoji} ${correctCount} 题﹫阶段 ${stage}`,
    `${challengeTimeEmoji(averageQuestionSeconds)} 平均用时 ${Math.max(
      0,
      averageQuestionSeconds,
    ).toFixed(1)}s`,
    `${overflow}${visibleSymbols.join("")}`,
    "",
    SHARE_URL,
  ].join("\n");
}

export function buildTrialShareText({
  advancement,
  title,
  correctCount,
  reachedStage,
  stageName,
  ruleName,
  history,
}: TrialShareOptions): string {
  const symbols = trialShareHistory(
    history,
    reachedStage,
  ).map(trialQuestionEmoji);
  return [
    `◈ ZIGSAW - 试炼 - 进阶 ${advancement}`,
    `${trialResultEmoji(title)} ${title}`,
    `${trialCompletionEmoji(reachedStage)} ${correctCount} 题﹫${stageName}「${ruleName}」`,
    symbols.join(""),
    "",
    SHARE_URL,
  ].join("\n");
}
