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
