import {
  loadAssonanceData,
  type AssonanceData,
} from "./assonance";
import {
  loadCompositionData,
  type CompositionData,
} from "./composition";
import {
  loadGestaltData,
  type GestaltData,
} from "./gestalt";
import {
  loadPinyinData,
  type PinyinData,
} from "./pinyin";
import type { TrialSession } from "./trial";
import type {
  TrialRuleDefinition,
  TrialRulePromptMode,
} from "./trial-rules";
import {
  loadTraditionalData,
  type TraditionalData,
} from "./traditional";
import {
  loadWordAnswerData,
  type WordAnswerData,
} from "./word-answers";

export interface TrialRuleDataRequirements {
  pinyin: boolean;
  traditional: boolean;
  gestalt: boolean;
  composition: boolean;
  assonance: boolean;
  wordAnswers: boolean;
  any: boolean;
}

const promptModes = (
  rule: TrialRuleDefinition | null | undefined,
): TrialRulePromptMode[] =>
  [
    rule?.policy.prompt.normal.mode,
    rule?.policy.prompt.boss.mode,
  ].filter(
    (mode): mode is TrialRulePromptMode =>
      mode !== undefined,
  );

export function trialRuleDataRequirements(
  rule: TrialRuleDefinition | null | undefined,
): TrialRuleDataRequirements {
  const modes = promptModes(rule);
  const answerInputs = [
    rule?.policy.answer.normal.input,
    rule?.policy.answer.boss.input,
  ];
  const composition = modes.includes("word-components");
  const assonance =
    modes.includes("assonance-components") ||
    modes.includes("dissonance-components");
  const pinyin = answerInputs.includes("pinyin");
  const traditional = modes.includes("traditional-components");
  const gestalt = modes.includes("gestalt-components");
  const wordAnswers =
    composition ||
    modes.includes("assonance-components") ||
    modes.includes("dissonance-components");
  return {
    pinyin,
    traditional,
    gestalt,
    composition,
    assonance,
    wordAnswers,
    any:
      pinyin ||
      traditional ||
      gestalt ||
      composition ||
      assonance ||
      wordAnswers,
  };
}

export class TrialRuntimeData {
  pinyin: PinyinData | null = null;
  traditional: TraditionalData | null = null;
  gestalt: GestaltData | null = null;
  composition: CompositionData | null = null;
  assonance: AssonanceData | null = null;
  wordAnswers: WordAnswerData | null = null;

  async ensure(
    rule: TrialRuleDefinition | null | undefined,
    baseUrl: string,
    trial: TrialSession,
  ): Promise<void> {
    const requirements = trialRuleDataRequirements(rule);
    const tasks: Promise<void>[] = [];

    if (requirements.pinyin) {
      tasks.push(
        this.loadPinyin(baseUrl, trial),
      );
    }
    if (requirements.traditional) {
      tasks.push(
        this.loadTraditional(baseUrl, trial),
      );
    }
    if (requirements.gestalt) {
      tasks.push(
        this.loadGestalt(baseUrl, trial),
      );
    }
    if (requirements.composition) {
      tasks.push(
        this.loadComposition(baseUrl, trial),
      );
    }
    if (requirements.assonance) {
      tasks.push(
        this.loadAssonance(baseUrl, trial),
      );
    }
    if (requirements.wordAnswers) {
      tasks.push(
        this.loadWordAnswers(baseUrl, trial),
      );
    }

    await Promise.all(tasks);
  }

  private async loadPinyin(
    baseUrl: string,
    trial: TrialSession,
  ): Promise<void> {
    this.pinyin ??= await loadPinyinData(baseUrl);
    trial.setPinyinData(this.pinyin);
  }

  private async loadTraditional(
    baseUrl: string,
    trial: TrialSession,
  ): Promise<void> {
    this.traditional ??= await loadTraditionalData(baseUrl);
    trial.setTraditionalData(this.traditional);
  }

  private async loadGestalt(
    baseUrl: string,
    trial: TrialSession,
  ): Promise<void> {
    this.gestalt ??= await loadGestaltData(baseUrl);
    trial.setGestaltData(this.gestalt);
  }

  private async loadComposition(
    baseUrl: string,
    trial: TrialSession,
  ): Promise<void> {
    this.composition ??= await loadCompositionData(baseUrl);
    trial.setCompositionData(this.composition);
  }

  private async loadAssonance(
    baseUrl: string,
    trial: TrialSession,
  ): Promise<void> {
    this.assonance ??= await loadAssonanceData(baseUrl);
    trial.setAssonanceData(this.assonance);
  }

  private async loadWordAnswers(
    baseUrl: string,
    trial: TrialSession,
  ): Promise<void> {
    this.wordAnswers ??=
      await loadWordAnswerData(baseUrl);
    trial.setWordAnswerData(this.wordAnswers);
  }
}
