import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import archivedFugueRuleJson from "../docs/archive/trial-rules/fugue.rule.json";
import archivedMultiexposureRuleJson from "../docs/archive/trial-rules/multiexposure.rule.json";
import archivedRulesRegistryJson from "../docs/archive/trial-rules/registry.json";
import trialRuleDataJson from "../public/data/trial-rules.json";
import { GameData, type GameSettings } from "../src/game/data";
import {
  TRIAL_BASE_PART_PROBABILITIES,
  TRIAL_BOSS_CHAR_MAX_PARTS,
  TRIAL_BOSS_CHAR_MIN_PARTS,
  TRIAL_BOSS_MAX_PARTS,
  TRIAL_BOSS_MIN_PARTS,
  TRIAL_BOSS_SECONDS,
  TRIAL_NORMAL_SECONDS,
  TRIAL_OUTLAND_PART_WEIGHTS,
  TrialSession,
  calculateTrialCrisReward,
  hallraumComponentDiversityWeight,
  orderedBossAnswerChars,
  trialSkipBudgetWithoutSpending,
  type TrialCard,
  type TrialQuestionState,
  type TrialSessionEvent,
} from "../src/game/trial";
import {
  parseTrialRulesData,
  type TrialRulesData,
} from "../src/game/trial-rules";
import {
  trialAdvancementConfig,
  trialAdvancementTimeMultiplier,
  trialAdvancementUnlockedByFirstClear,
} from "../src/game/trial-advancement";
import {
  acceptedPinyinFor,
  displayPinyinFor,
  normalizePinyinInput,
  type PinyinData,
} from "../src/game/pinyin";
import type { TraditionalData } from "../src/game/traditional";
import type { GestaltData } from "../src/game/gestalt";
import type { CompositionData } from "../src/game/composition";
import type { AssonanceData } from "../src/game/assonance";
import type { WordAnswerData } from "../src/game/word-answers";

const trialRulesData =
  trialRuleDataJson as unknown as TrialRulesData;
const archivedFugueRulesData: TrialRulesData = {
  ...trialRulesData,
  rules: {
    ...trialRulesData.rules,
    fugue:
      archivedFugueRuleJson as unknown as TrialRulesData["rules"][string],
  },
};

const settings: GameSettings = {
  levels: [1, 2],
  partsLow: 2,
  partsHigh: 18,
  mode: "trial",
  count: 10,
  seconds: TRIAL_NORMAL_SECONDS,
  stageQuestions: 8,
  stageSize: 1500,
  stageShift: 300,
  exEnabled: true,
  includeSupplementaryChars: true,
  difficulty: "standard",
  trialAdvancement: 1,
};

function settingsAtAdvancement(level: number): GameSettings {
  return {
    ...settings,
    trialAdvancement: level,
  };
}

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function createData(
  lengthCounts: Partial<Record<number, number>> = {},
): GameData {
  const symbols: Record<string, string> = {};
  for (let index = 0; index < 48; index += 1) {
    symbols[String(index + 1)] = String.fromCodePoint(
      0x4e00 + index,
    );
  }
  const chars: Record<string, number[][]> = {};
  const level1: string[] = [];
  let charCode = 0x6000;
  for (let length = 2; length <= 8; length += 1) {
    const count = lengthCounts[length] ?? 24;
    for (let index = 0; index < count; index += 1) {
      const char = String.fromCodePoint(charCode++);
      const way = Array.from(
        { length },
        (_, offset) =>
          ((index * 7 + offset * 5) % 48) + 1,
      );
      chars[char] = [way];
      level1.push(char);
    }
  }
  return new GameData(
    { symbols, chars },
    {
      levels: {
        一级: level1,
        二级: [],
        三级: [],
      },
    },
  );
}

function createBylandData(): GameData {
  const symbolNames = [
    "水",
    "氵",
    "冫",
    "雨",
    "木",
    "口",
    "日",
    "月",
    "女",
    "子",
    "大",
    "小",
    "山",
    "土",
    "人",
    "亻",
    "彳",
    "艹",
    "屮",
    "禾",
    "石",
    "讠",
    "耳",
    "又",
  ];
  const symbols = Object.fromEntries(
    symbolNames.map((name, index) => [
      String(index + 1),
      name,
    ]),
  );
  const chars: Record<string, number[][]> = {
    沐: [[1, 5]],
    淋: [[2, 5, 5]],
    霖: [[4, 5, 5, 5]],
    霜: [[4, 7, 5]],
    杏: [[5, 6]],
    杲: [[7, 5]],
    明: [[7, 8]],
    好: [[9, 10]],
    尖: [[11, 12]],
    杉: [[5, 13]],
    尘: [[12, 13]],
    坐: [[9, 13]],
  };
  return new GameData(
    { symbols, chars },
    {
      levels: {
        一级: Object.keys(chars),
        二级: [],
        三级: [],
      },
    },
  );
}

function createOutlandData(): GameData {
  const chars: Record<string, number[][]> = {
    杏: [[5, 6]],
    呆: [[6, 5]],
    沐: [[2, 5]],
    霂: [[2, 4, 5]],
    霖: [[2, 3, 4, 5]],
    明: [[7, 8]],
    旪: [[7, 8]],
    木: [[5]],
  };
  return new GameData(
    {
      symbols: {
        "1": "水",
        "2": "氵",
        "3": "冫",
        "4": "雨",
        "5": "木",
        "6": "口",
        "7": "日",
        "8": "月",
      },
      chars,
    },
    {
      levels: {
        一级: Object.keys(chars),
        二级: [],
        三级: [],
      },
    },
  );
}

function createHallraumUniquenessData(): GameData {
  const chars: Record<string, number[][]> = {
    甲: [[1, 2, 3]],
    乙: [[2, 4, 5]],
    丙: [[3, 4, 5]],
    丁: [[3, 4, 6]],
    戊: [[3, 6, 4]],
  };
  return new GameData(
    {
      symbols: {
        "1": "A",
        "2": "B",
        "3": "C",
        "4": "X",
        "5": "Y",
        "6": "Z",
      },
      chars,
    },
    {
      levels: {
        一级: Object.keys(chars),
        二级: [],
        三级: [],
      },
    },
  );
}

function createHallraumBossData(): GameData {
  const chars: Record<string, number[][]> = {
    甲: [[1, 4]],
    乙: [[2, 5]],
    丙: [[1, 2]],
    丁: [[4, 5]],
    戊: [[1, 4, 2]],
    壬: [[2, 4]],
    癸: [[5, 5]],
  };
  return new GameData(
    {
      symbols: {
        "1": "A",
        "2": "B",
        "3": "C",
        "4": "X",
        "5": "Y",
        "6": "Z",
      },
      chars,
    },
    {
      levels: {
        一级: Object.keys(chars),
        二级: [],
        三级: [],
      },
    },
  );
}

function createPublicGameData(): GameData {
  const read = (path: string): unknown =>
    JSON.parse(
      readFileSync(resolve(process.cwd(), path), "utf8"),
    );
  return new GameData(
    read("public/data/char_sym.json") as never,
    read("public/data/tongyong_hanzi.json") as never,
    read("public/data/component-assets.json") as never,
    "https://example.invalid/",
    read(
      "public/data/char_sym_answer_compat.json",
    ) as never,
  );
}

const pinyinFixture: PinyinData = {
  chars: {
    杏: [
      { marked: "xìng", plain: "xing", tone: 4, poly: false },
    ],
    杲: [
      { marked: "gǎo", plain: "gao", tone: 3, poly: false },
    ],
    行: [
      { marked: "xíng", plain: "xing", tone: 2, poly: true },
      { marked: "háng", plain: "hang", tone: 2, poly: true },
    ],
    乐: [
      { marked: "lè", plain: "le", tone: 4, poly: true },
      { marked: "yuè", plain: "yue", tone: 4, poly: true },
    ],
    女: [
      { marked: "nǚ", plain: "nü", tone: 3, poly: false },
    ],
  },
};

function createNuncupationData(): GameData {
  const chars: Record<string, number[][]> = {
    杏: [[1, 2]],
    杲: [[3, 1]],
    行: [[1, 3]],
    乐: [[3, 4]],
  };
  return new GameData(
    {
      symbols: {
        "1": "木",
        "2": "口",
        "3": "日",
        "4": "月",
      },
      chars,
    },
    {
      levels: {
        一级: Object.keys(chars),
        二级: [],
        三级: [],
      },
    },
  );
}

function createTraditionalFixture(): {
  data: GameData;
  traditional: TraditionalData;
} {
  const symbols: Record<string, string> = {};
  for (let index = 1; index <= 32; index += 1) {
    symbols[String(index)] = String.fromCodePoint(
      0x4e00 + index,
    );
  }
  const simpleChars: Record<string, number[][]> = {};
  const traditional: TraditionalData = { chars: {} };
  const traditionalChars: Record<string, number[][]> = {};
  for (let index = 0; index < 8; index += 1) {
    const simple = String.fromCodePoint(0x7000 + index);
    const display = String.fromCodePoint(0x8000 + index);
    simpleChars[simple] = [[1, 2]];
    traditionalChars[display] = [
      [3 + index * 2, 4 + index * 2, 5 + index * 2],
    ];
    traditional.chars[simple] = [display];
  }
  return {
    data: new GameData(
      { symbols, chars: { ...simpleChars, ...traditionalChars } },
      {
        levels: {
          一级: Object.keys(simpleChars),
          二级: [],
          三级: [],
        },
      },
    ),
    traditional,
  };
}

function createReductionData(): GameData {
  const fillers = [
    "木",
    "口",
    "日",
    "月",
    "女",
    "子",
    "山",
  ];
  const symbols: Record<string, string> = Object.fromEntries(
    fillers.map((name, index) => [
      String(index + 1),
      name,
    ]),
  );
  const sourceIds = Array.from(
    { length: 60 },
    (_, index) => index + 10,
  );
  for (const [index, symbolId] of sourceIds.entries()) {
    symbols[String(symbolId)] = String.fromCodePoint(
      0x5000 + index,
    );
  }
  symbols["1"] = "木";
  symbols["2"] = "口";

  const chars: Record<string, number[][]> = {};
  const level1: string[] = [];
  const alternateByBag = new Map<string, string>();
  let answerCode = 0x7000;
  let alternateCode = 0x6000;
  for (const sourceId of sourceIds) {
    for (let length = 2; length <= 6; length += 1) {
      const suffix = Array.from(
        { length: length - 1 },
        (_, index) => (index % fillers.length) + 3,
      );
      const answer = String.fromCodePoint(answerCode++);
      chars[answer] = [[sourceId, ...suffix]];
      level1.push(answer);

      const displayBag = [1, 2, ...suffix];
      const bag = [...displayBag]
        .sort((left, right) => left - right)
        .join(",");
      let alternate = alternateByBag.get(bag);
      if (!alternate) {
        alternate = String.fromCodePoint(alternateCode++);
        alternateByBag.set(bag, alternate);
        chars[alternate] = [[...displayBag]];
        level1.push(alternate);
      }
    }
  }

  return new GameData(
    { symbols, chars },
    {
      levels: {
        一级: level1,
        二级: [],
        三级: [],
      },
    },
    null,
    "",
    {
      format: "zh-char-sym-answer-compat/1",
      expansions: Object.fromEntries(
        sourceIds.map((symbolId) => [
          String(symbolId),
          [[1, 2]],
        ]),
      ),
    },
  );
}

function createPrefabricationData(): GameData {
  const symbols: Record<string, string> = {};
  for (let symbolId = 1; symbolId <= 160; symbolId += 1) {
    symbols[String(symbolId)] = String.fromCodePoint(
      0x4000 + symbolId,
    );
  }
  const chars: Record<string, number[][]> = {};
  const levelOne: string[] = [];
  const levelThree: string[] = [];
  for (let index = 0; index < 40; index += 1) {
    const base = index * 4 + 1;
    const hint = String.fromCodePoint(0x9000 + index);
    chars[hint] = [[base, base + 1]];
    levelThree.push(hint);

    const threePart = String.fromCodePoint(0x7000 + index);
    chars[threePart] = [[base, base + 1, base + 2]];
    levelOne.push(threePart);

    const fourPart = String.fromCodePoint(0x7100 + index);
    chars[fourPart] = [
      [base, base + 1, base + 2, base + 3],
    ];
    levelOne.push(fourPart);
  }
  return new GameData(
    { symbols, chars },
    {
      levels: {
        一级: levelOne,
        二级: [],
        三级: levelThree,
      },
    },
  );
}

function createMingBossData(): GameData {
  const symbols = {
    "34": "人",
    "55": "㔾",
    "57": "凵",
    "90": "口",
    "104": "夕",
    "148": "五",
    "153": "艹",
    "155": "止",
  };
  const chars = {
    芕: [[153, 104]],
    仓: [[55, 34]],
    茗: [[153, 104, 90]],
    苑: [[153, 104, 55]],
    龉: [[34, 57, 90, 148, 155]],
  };
  return new GameData(
    { symbols, chars },
    {
      levels: {
        一级: Object.keys(chars),
        二级: [],
        三级: [],
      },
    },
  );
}

function createExistingWayCollisionData(): GameData {
  return new GameData(
    {
      symbols: {
        "1": "革",
        "2": "廴",
        "3": "⺕",
        "4": "𰀁",
        "5": "聿",
      },
      chars: {
        鞬: [
          [1, 2, 3, 4],
          [1, 2, 5],
        ],
        聿: [[3, 4]],
      },
    },
    {
      levels: {
        一级: ["鞬"],
        二级: [],
        三级: ["聿"],
      },
    },
  );
}

function createWildcardData(): GameData {
  const symbols: Record<string, string> = {};
  for (let symbolId = 1; symbolId <= 160; symbolId += 1) {
    symbols[String(symbolId)] = String.fromCodePoint(
      0x4000 + symbolId,
    );
  }
  const chars: Record<string, number[][]> = {};
  const levelOne: string[] = [];
  for (let index = 0; index < 40; index += 1) {
    const base = index * 4 + 1;
    const threePart = String.fromCodePoint(0x7000 + index);
    chars[threePart] = [[base, base + 1, base + 2]];
    levelOne.push(threePart);
    const fourPart = String.fromCodePoint(0x7100 + index);
    chars[fourPart] = [
      [base, base + 1, base + 2, base + 3],
    ];
    levelOne.push(fourPart);
  }
  return new GameData(
    { symbols, chars },
    {
      levels: {
        一级: levelOne,
        二级: [],
        三级: [],
      },
    },
  );
}

function createPolydactylyData(): GameData {
  const symbols: Record<string, string> = {};
  for (let symbolId = 1; symbolId <= 360; symbolId += 1) {
    symbols[String(symbolId)] = String.fromCodePoint(
      0x4000 + symbolId,
    );
  }
  const chars: Record<string, number[][]> = {
    偽: [[1, 3, 5]],
    僅: [[2, 3]],
    答: [[3, 4, 5]],
    片: [[6, 7]],
  };
  const levelOne = Object.keys(chars);
  for (let index = 0; index < 201; index += 1) {
    const char = String.fromCodePoint(0x7000 + index);
    chars[char] = [[1, 10 + index]];
    levelOne.push(char);
  }
  for (let index = 0; index < 101; index += 1) {
    const char = String.fromCodePoint(0x7100 + index);
    chars[char] = [[2, 250 + index]];
    levelOne.push(char);
  }
  return new GameData(
    { symbols, chars },
    {
      levels: {
        一级: levelOne,
        二级: [],
        三级: [],
      },
    },
  );
}

function createWildcardCompatibilityData(): GameData {
  return new GameData(
    {
      symbols: {
        "1": "木",
        "2": "口",
        "3": "日",
        "4": "明",
        "5": "甲",
      },
      chars: {
        答: [[1, 2, 5]],
        昌: [[4, 4]],
      },
    },
    {
      levels: {
        一级: ["答", "昌"],
        二级: [],
        三级: [],
      },
    },
    null,
    "",
    {
      format: "zh-char-sym-answer-compat/1",
      expansions: {
        "4": [[1, 2]],
      },
    },
  );
}

function createGestaltFixture(): {
  data: GameData;
  gestalt: GestaltData;
} {
  const data = createNuncupationData();
  const answers = (chars: string[]) =>
    chars.map((char) => ({
      char,
      level: data.levels.get(char) ?? 1,
    }));
  return {
    data,
    gestalt: {
      format: "zigsaw-gestalt-pairs/1",
      excludedComponents: [],
      pairs: [
        {
          components: [1, 2],
          answers: answers(["杏"]),
        },
        {
          components: [3, 4],
          answers: answers(["乐"]),
        },
        {
          components: [1, 3],
          answers: answers(["行"]),
        },
        {
          components: [2, 4],
          answers: answers(["杲"]),
        },
      ],
    },
  };
}

function createGestaltCompatibilityFixture(): {
  data: GameData;
  gestalt: GestaltData;
} {
  const data = new GameData(
    {
      symbols: {
        "1": "囗",
        "2": "五",
        "3": "口",
        "4": "日",
        "5": "一",
        "6": "木",
        "7": "口",
      },
      chars: {
        圄: [[1, 2, 3]],
        晤: [[4, 2, 3]],
        杏: [[6, 7]],
      },
    },
    {
      levels: {
        一级: ["圄", "晤", "杏"],
        二级: [],
        三级: [],
      },
    },
    null,
    "",
    {
      format: "zh-char-sym-answer-compat/1",
      expansions: {
        "4": [[1, 5]],
      },
    },
  );
  const answers = (chars: string[]) =>
    chars.map((char) => ({
      char,
      level: data.levels.get(char) ?? 1,
    }));
  return {
    data,
    gestalt: {
      format: "zigsaw-gestalt-pairs/1",
      excludedComponents: [],
      pairs: [
        {
          components: [1, 2],
          answers: answers(["圄"]),
        },
        {
          components: [6, 7],
          answers: answers(["杏"]),
        },
      ],
    },
  };
}

function createRepetendData(): GameData {
  const chars: Record<string, number[][]> = {
    森: [[1, 1, 1, 2, 2, 3]],
    品: [[2, 2, 2]],
    甲: [[1, 1, 2, 3, 4]],
    乙: [[1, 5, 5, 6, 7]],
    吠: [[8, 2]],
    哭: [[8, 2, 2]],
    器: [[8, 2, 2, 2, 2]],
  };
  return new GameData(
    {
      symbols: {
        "1": "木",
        "2": "口",
        "3": "日",
        "4": "月",
        "5": "女",
        "6": "子",
        "7": "大",
        "8": "犬",
      },
      chars,
    },
    {
      levels: {
        一级: Object.keys(chars),
        二级: [],
        三级: [],
      },
    },
  );
}

function createCompositionFixture(): {
  data: GameData;
  composition: CompositionData;
} {
  const chars: Record<string, number[][]> = {
    上: [[1, 2]],
    台: [[3, 4]],
    问: [[5]],
    答: [[3, 4]],
    止: [[3, 4]],
    丁: [[2, 1]],
    计: [[1]],
    算: [[2, 3]],
    机: [[4, 5, 6]],
  };
  const data = new GameData(
    {
      symbols: {
        "1": "一",
        "2": "丨",
        "3": "丿",
        "4": "丶",
        "5": "乙",
        "6": "亅",
      },
      chars,
    },
    {
      levels: {
        一级: Object.keys(chars),
        二级: [],
        三级: [],
      },
    },
    null,
    "",
    {
      format: "zh-char-sym-answer-compat/1",
      expansions: {
        "5": [[1, 2]],
      },
    },
  );
  return {
    data,
    composition: {
      format: "zigsaw-composition-words/1",
      sourceHash: "",
      symbolHash: "",
      answerCompatibilityHash: "",
      weighting: "test",
      words: {
        "2": ["上台", "台上", "问台", "问答"],
        "3": ["计算机", "机算计"],
        "4": [],
      },
      normal: [
        {
          word: "上台",
          weight: 1,
          recipes: [[[1, 2], [3, 4]]],
        },
      ],
      boss: [
        {
          word: "计算机",
          weight: 1,
          recipes: [[[1], [2, 3], [4, 5, 6]]],
        },
        {
          word: "机算计",
          weight: 1,
          recipes: [[[4, 5, 6], [2, 3], [1]]],
        },
      ],
    },
  };
}

function createAssonanceFixture(): {
  data: GameData;
  assonance: AssonanceData;
} {
  const chars: Record<string, number[][]> = {
    上: [[1, 1, 2, 4]],
    台: [[1, 3]],
    止: [[3, 4]],
    丁: [[2, 1]],
    问: [[5, 5]],
    答: [[2, 3]],
    甲: [[1, 1, 2, 4]],
    乙: [[1, 3, 5]],
    丙: [[2, 3, 6]],
    卜: [[2, 4]],
    也: [[3]],
    子: [[4]],
    丑: [[5]],
    寅: [[6]],
  };
  return {
    data: new GameData(
      {
        symbols: {
          "1": "一",
          "2": "丨",
          "3": "丿",
          "4": "丶",
          "5": "乙",
          "6": "亅",
        },
        chars,
      },
      {
        levels: {
          一级: Object.keys(chars),
          二级: [],
          三级: [],
        },
      },
    ),
    assonance: {
      format: "zigsaw-assonance-words/1",
      sourceHash: "",
      symbolHash: "",
      answerCompatibilityHash: "",
      weighting: "test",
      words: {
        "2": ["上台", "止丁", "问答", "甲丁"],
        "3": ["甲乙丙"],
        "4": [],
      },
      normal: [
        {
          word: "上台",
          weight: 1,
          recipes: [[[1, 1, 2, 4], [1, 3]]],
        },
      ],
      boss: [
        {
          word: "甲乙丙",
          weight: 1,
          recipes: [
            [
              [1, 1, 2, 4],
              [1, 3, 5],
              [2, 3, 6],
            ],
          ],
        },
      ],
    },
  };
}

function createWordAnswerData(): WordAnswerData {
  return {
    format: "zigsaw-word-answers/1",
    sourceHash: "",
    symbolsHash: "",
    words: {
      "2": ["上台", "台上", "问台", "问答", "甲丁", "止丁", "卜也"],
      "3": [
        "计算机",
        "机算计",
        "甲乙丙",
        "子丑寅",
      ],
      "4": [],
    },
  };
}

function createWildcardAmbiguousBossData(): GameData {
  return new GameData(
    {
      symbols: {
        "1": "𰀠",
        "2": "忄",
        "3": "屮",
        "4": "口",
        "5": "凵",
        "6": "艮",
        "7": "ヨ",
      },
      chars: {
        咄: [[4, 3, 5]],
        恨: [
          [2, 6],
          [2, 7, 1],
        ],
      },
    },
    {
      levels: {
        一级: ["咄", "恨"],
        二级: [],
        三级: [],
      },
    },
  );
}

function createWildcardSharedLongWayData(): GameData {
  return new GameData(
    {
      symbols: {
        "1": "𰀠",
        "2": "忄",
        "3": "土",
        "4": "ヨ",
        "5": "艮",
      },
      chars: {
        垠: [
          [3, 5],
          [3, 4, 1],
        ],
        恨: [
          [2, 5],
          [2, 4, 1],
        ],
      },
    },
    {
      levels: {
        一级: ["垠", "恨"],
        二级: [],
        三级: [],
      },
    },
  );
}

function createWildcardNiangBossData(): GameData {
  return new GameData(
    {
      symbols: {
        "1": "𰀠",
        "2": "忄",
        "3": "女",
        "4": "丶",
        "5": "艮",
        "6": "ヨ",
      },
      chars: {
        娘: [
          [3, 4, 5],
          [3, 4, 6, 1],
        ],
        恨: [
          [2, 5],
          [2, 6, 1],
        ],
      },
    },
    {
      levels: {
        一级: ["娘", "恨"],
        二级: [],
        三级: [],
      },
    },
  );
}

function createSelcouthData(): GameData {
  const symbols: Record<string, string> = {};
  for (let symbolId = 1; symbolId <= 90; symbolId += 1) {
    symbols[String(symbolId)] = String.fromCodePoint(
      0x4000 + symbolId,
    );
  }
  const chars: Record<string, number[][]> = {};
  const levelOne: string[] = [];
  const levelTwo: string[] = [];
  const levelThree: string[] = [];
  for (let index = 0; index < 10; index += 1) {
    const base = index * 3 + 1;
    const way = [base, base + 1, base + 2];
    const one = String.fromCodePoint(0x5000 + index);
    const two = String.fromCodePoint(0x6000 + index);
    const three = String.fromCodePoint(0x7000 + index);
    chars[one] = [[...way]];
    chars[two] = [[...way]];
    chars[three] = [[...way]];
    levelOne.push(one);
    levelTwo.push(two);
    levelThree.push(three);
  }
  return new GameData(
    { symbols, chars },
    {
      levels: {
        一级: levelOne,
        二级: levelTwo,
        三级: levelThree,
      },
    },
  );
}

describe("trial session", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("parses v2 rule data with public and internal policy text", () => {
    const parsed = parseTrialRulesData(trialRuleDataJson);
    expect(parsed.version).toBe(3);
    expect(parsed.stageStars).toEqual([
      [0],
      [1],
      [1],
      [2],
      [2],
      [2, 3],
      [3],
    ]);
    expect(parsed.rules.tetrarchy.description.public).toContain(
      "四个部件",
    );
    expect(parsed.rules.tetrarchy.description.internal).toContain(
      "8 张卡",
    );
    expect(
      parsed.rules.tetrarchy.description.debug,
    ).toContain("8 张卡");
    expect(parsed.rules.tetrarchy.policy.answer.boss.distinct).toBe(
      true,
    );
    expect(parsed.rules.unrestricted.english).toBe("Unbound");
    expect(parsed.rules.inspissation.name).toBe("拾级");
    expect(parsed.rules.inspissation.english).toBe("Anabasis");
    expect(parsed.rules.inspissation.icon).toBe(
      "anabasis.svg",
    );
    expect(parsed.rules["byland-water"].english).toBe("Eagre");
    expect(parsed.rules["byland-herb"].english).toBe("Verdure");
    expect(parsed.rules["byland-mount"].english).toBe("Cairn");
    expect(parsed.rules["byland-people"].english).toBe(
      "Oost",
    );
    expect(parsed.rules["byland-speech"].english).toBe(
      "Whobub",
    );
    expect(parsed.rules["outland-water"].english).toBe(
      "Pelagus",
    );
    expect(parsed.rules["outland-herb"].english).toBe(
      "Boscage",
    );
    expect(parsed.rules["outland-mount"].english).toBe(
      "Massif",
    );
    expect(parsed.rules["outland-people"].english).toBe(
      "Middangeard",
    );
    expect(parsed.rules["outland-speech"].english).toBe(
      "Babel",
    );
    expect(parsed.rules["outland-mount"].icon).toBe(
      "outland-mount.svg",
    );
    expect(parsed.rules.unrestricted.description.public).toBe(
      "无额外规则。\n在每幕最后的守幕关卡，需要回答两个汉字。",
    );
    expect(parsed.rules.reschedule.description.debug).toBe(
      "每幕初始及上限为 90 秒，普通题和守幕共用；答对后剩余时间加 5 秒，暂停扣 15 秒。",
    );
    expect(parsed.rules.hallraum.name).toBe(
      "回声室",
    );
    expect(parsed.rules.hallraum.stars).toBe(3);
    expect(parsed.rules.hallraum.allowSkip).toBe(false);
    expect(parsed.rules.repetend.stars).toBe(1);
    expect(parsed.rules.wildcard.stars).toBe(2);
    expect(parsed.rules.minimalism.name).toBe("简赅");
    expect(parsed.rules.minimalism.description.public).toBe(
      "答案均由二或三个部件组成，作答时间减半。\n守幕关卡答案为三个汉字。",
    );
    expect(parsed.rules.aphantasia.name).toBe("盲视");
    expect(parsed.rules.aphantasia.english).toBe(
      "Anopia",
    );
    expect(
      parsed.rules.aphantasia.policy.cards.normal
        .obscureAfterMs,
    ).toBe(1500);
    expect(
      parsed.rules.aphantasia.policy.cards.boss
        .obscureAfterMs,
    ).toBe(6000);
    expect(parsed.rules).not.toHaveProperty("fugue");
    expect(parsed.rules).not.toHaveProperty(
      "multiexposure",
    );
    const parsedArchived = parseTrialRulesData({
      ...trialRuleDataJson,
      rules: {
        ...trialRuleDataJson.rules,
        fugue: archivedFugueRuleJson,
        multiexposure: archivedMultiexposureRuleJson,
      },
    });
    expect(parsedArchived.rules.fugue.name).toBe("赋格曲");
    expect(parsedArchived.rules.multiexposure.name).toBe(
      "双重曝光",
    );
    expect(
      parsed.rules.hallraum.policy.prompt.normal
        .inheritedCards,
    ).toBe(1);
    expect(
      parsed.rules.hallraum.policy.prompt.boss
        .inheritedCards,
    ).toBe(2);
    expect(
      parsed.rules.nuncupation.policy.answer.normal.input,
    ).toBe("pinyin");
    expect(
      parsed.rules.reductionism.policy.prompt.normal.mode,
    ).toBe("reduction-components");
    expect(
      parsed.rules.prefabrication.policy.prompt.normal.mode,
    ).toBe("prefabricated-components");
    expect(parsed.rules.prefabrication.english).toBe(
      "Prefab",
    );
    expect(
      parsed.rules.composition.policy.prompt.normal.mode,
    ).toBe("word-components");
    expect(
      parsed.rules.composition.policy.answer.boss.input,
    ).toBe("word");
    expect(
      parsed.rules.assonance.policy.prompt.normal.mode,
    ).toBe("assonance-components");
    expect(
      parsed.rules.assonance.stars,
    ).toBe(3);
    expect(
      parsed.rules.dissonance.policy.prompt.normal.mode,
    ).toBe("dissonance-components");
    expect(
      parsed.rules.repetend.policy.prompt.normal.mode,
    ).toBe("repetend-components");
    expect(
      parsed.rules.repetend.policy.cards.boss.display,
    ).toBe("quantity");
    expect(
      parsed.rules.wildcard.policy.prompt.normal.mode,
    ).toBe("wildcard-components");
    expect(
      parsed.rules.polydactyly.policy.cards.normal
        .decoyUnique,
    ).toBe(true);
    expect(parsed.rules.selcouth.selection.levels).toEqual([3]);
    expect(parsed.rules.selcouth.description.public).toBe(
      "答案为三级通规汉字。",
    );
    expect(parsed.rules.selcouth.description.debug).toBe(
      "排除一、二级字与表外字，结构不变。",
    );
    expect(parsed.rules.gestalt.policy.prompt.normal.mode).toBe(
      "gestalt-components",
    );
    expect(parsed.rules.unrestricted.selection.normal).toEqual({
      partLengths: [2, 3, 4, 5, 6, 7, 8, 9, 10],
    });
    expect(
      Object.values(parsed.rules).every(
        (rule) =>
          !/普通题|BOSS/.test(rule.description.public),
      ),
    ).toBe(true);
    expect(
      Object.values(parsed.rules).every(
        (rule) =>
          rule.description.debug.trim().length > 0 &&
          !/data-source|\.json|symbolId|DOM|activeRule|兼容层/.test(
            rule.description.debug,
          ) &&
          rule.description.debug !==
            rule.description.internal,
      ),
    ).toBe(true);
  });

  it("keeps retired trial rules exclusively in the archive registry", () => {
    const parsed = parseTrialRulesData(trialRuleDataJson);
    const archiveRoot = resolve(
      "docs/archive/trial-rules",
    );
    for (const entry of archivedRulesRegistryJson.rules) {
      expect(parsed.rules).not.toHaveProperty(entry.id);
      for (const file of [
        entry.snapshot,
        entry.documentation,
        entry.icon,
      ]) {
        expect(existsSync(resolve(archiveRoot, file))).toBe(
          true,
        );
      }
      const snapshot = JSON.parse(
        readFileSync(
          resolve(archiveRoot, entry.snapshot),
          "utf8",
        ),
      ) as { id?: string };
      expect(snapshot.id).toBe(entry.id);
    }
  });

  it("starts stages from a blocking intro and uses thirty-second questions", () => {
    vi.useFakeTimers();
    const trial = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(1),
    );

    expect(trial.state.phase).toBe("stage-intro");
    expect(trial.state.stage).toBe(1);
    trial.beginStage();

    expect(trial.state.phase).toBe("playing");
    expect(trial.state.questionInStage).toBe(1);
    expect(trial.state.remaining).toBe(TRIAL_NORMAL_SECONDS);
    expect(trial.state.timeLimit).toBe(TRIAL_NORMAL_SECONDS);
    expect(trial.state.current).not.toBeNull();
  });

  it("resolves cumulative advancement settings through level four", () => {
    const expected = [
      {
        questions: 7,
        initialSkips: 3,
        skipEvery: 2,
        threeStar: 1.3,
        lowStar: 1,
      },
      {
        questions: 8,
        initialSkips: 3,
        skipEvery: 3,
        threeStar: 1.3,
        lowStar: 1,
      },
      {
        questions: 8,
        initialSkips: 3,
        skipEvery: 3,
        threeStar: 1,
        lowStar: 1,
      },
      {
        questions: 8,
        initialSkips: 1,
        skipEvery: 3,
        threeStar: 1,
        lowStar: 1,
      },
      {
        questions: 8,
        initialSkips: 1,
        skipEvery: 3,
        threeStar: 1,
        lowStar: 0.7,
      },
    ];
    for (const [level, values] of expected.entries()) {
      const config = trialAdvancementConfig(level);
      expect(config.normalQuestionsPerStage).toBe(
        values.questions,
      );
      expect(config.initialSkips).toBe(
        values.initialSkips,
      );
      expect(config.skipGrantEveryStages).toBe(
        values.skipEvery,
      );
      expect(config.threeStarTimeMultiplier).toBe(
        values.threeStar,
      );
      expect(config.lowStarTimeMultiplier).toBe(
        values.lowStar,
      );
    }
    expect(trialAdvancementConfig(5)).toEqual({
      ...trialAdvancementConfig(4),
      level: 5,
    });
    expect(trialAdvancementConfig(6)).toEqual({
      ...trialAdvancementConfig(4),
      level: 6,
    });
    expect(trialAdvancementConfig(7)).toEqual({
      ...trialAdvancementConfig(4),
      level: 7,
    });
    expect(
      trialAdvancementTimeMultiplier(
        1,
        trialAdvancementConfig(4),
      ),
    ).toBe(0.7);
    expect(
      trialAdvancementTimeMultiplier(
        3,
        trialAdvancementConfig(4),
      ),
    ).toBe(1);
    expect(
      trialAdvancementTimeMultiplier(
        0,
        trialAdvancementConfig(4),
      ),
    ).toBe(1);
    expect(
      trialAdvancementUnlockedByFirstClear(0, false),
    ).toBe(1);
    expect(
      trialAdvancementUnlockedByFirstClear(0, true),
    ).toBeNull();
    expect(
      trialAdvancementUnlockedByFirstClear(3, false),
    ).toBe(4);
    expect(
      trialAdvancementUnlockedByFirstClear(4, false),
    ).toBeNull();
  });

  it("rewards trial progress through back-loaded milestones", () => {
    const reward = (
      advancement: number,
      clearedStages: number,
      cleared = false,
      perfect = false,
    ) =>
      calculateTrialCrisReward({
        advancement,
        clearedStages,
        cleared,
        perfect,
      });

    expect(
      [0, 1, 2, 3, 4, 5, 6, 7].map((stages) =>
        reward(1, stages, stages === 7),
      ),
    ).toEqual([0, 0, 5, 12, 27, 48, 75, 150]);
    expect(reward(1, 6)).toBe(75);
    expect(reward(1, 7, false)).toBe(75);
    expect(reward(1, 7, true)).toBe(150);
    expect(reward(1, 7, true, true)).toBe(180);
    expect(reward(0, 7, true)).toBe(100);
    expect(reward(0, 7, true, true)).toBe(120);
    expect(reward(2, 7, true)).toBe(180);
    expect(reward(2, 7, true, true)).toBe(216);
    expect(reward(3, 7, true)).toBe(220);
    expect(reward(4, 7, true)).toBe(280);
  });

  it("uses seven normal questions and the eighth slot for advancement zero", async () => {
    vi.useFakeTimers();
    const trial = new TrialSession(
      createData(),
      settingsAtAdvancement(0),
      () => {},
      seededRandom(30),
    );
    expect(trial.state.questionsPerStage).toBe(7);
    expect(trial.state.skipsRemaining).toBe(3);
    trial.beginStage();
    trial.state.questionInStage = 7;
    trial.setDraft(trial.state.current?.char ?? "");
    trial.submit();
    await vi.advanceTimersByTimeAsync(900);

    expect(trial.state.phase).toBe("boss");
    expect(trial.state.questionInStage).toBe(8);
  });

  it("keeps one cumulative skip budget across the trial", () => {
    expect(
      [1, 2, 3, 4, 5, 6, 7].map((stage) =>
        trialSkipBudgetWithoutSpending(stage, 0),
      ),
    ).toEqual([3, 3, 4, 4, 5, 5, 6]);
    expect(
      [1, 2, 3, 4, 5, 6, 7].map((stage) =>
        trialSkipBudgetWithoutSpending(stage, 1),
      ),
    ).toEqual([3, 3, 3, 4, 4, 4, 5]);

    const trial = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(31),
    );
    trial.beginStage();
    const original = trial.state.current?.char;
    trial.skipQuestion();

    expect(trial.state.skipsRemaining).toBe(2);
    expect(trial.state.skipsUsed).toBe(1);
    expect(trial.state.questionInStage).toBe(1);
    expect(trial.state.current?.char).not.toBe(original);
    expect(trial.state.history).toHaveLength(0);
  });

  it("keeps question eight and the boss slot in place when skipped", () => {
    const trial = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(35),
    );
    trial.beginStage();
    trial.state.questionInStage = 8;
    const original = trial.state.current?.char;
    trial.skipQuestion();

    expect(trial.state.phase).toBe("playing");
    expect(trial.state.questionInStage).toBe(8);
    expect(trial.state.current?.char).not.toBe(original);
    expect(trial.state.skipsRemaining).toBe(2);

    (
      trial as unknown as { startBoss: () => void }
    ).startBoss();
    expect(trial.state.phase).toBe("boss");
    trial.skipQuestion();
    expect(trial.state.phase).toBe("boss");
    expect(trial.state.questionInStage).toBe(9);
    expect(trial.state.skipsRemaining).toBe(1);
    expect(trial.state.boss?.initialCards.length).toBeGreaterThan(0);
  });

  it("revives a missed question by replacing it without advancing", async () => {
    vi.useFakeTimers();
    const trial = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(36),
    );
    trial.beginStage();
    trial.state.questionInStage = 8;
    await vi.advanceTimersByTimeAsync(
      (TRIAL_NORMAL_SECONDS + 1) * 1000,
    );
    expect(trial.state.revealing).toBe(true);

    trial.reviveWithSkip();
    expect(trial.state.phase).toBe("playing");
    expect(trial.state.revealing).toBe(false);
    expect(trial.state.questionInStage).toBe(8);
    expect(trial.state.skipsRemaining).toBe(2);
    expect(trial.state.skipsUsed).toBe(1);
    expect(trial.state.history).toHaveLength(0);

    trial.state.skipsRemaining = 0;
    trial.surrender();
    trial.reviveWithSkip();
    expect(trial.state.revealing).toBe(true);
    expect(trial.state.questionInStage).toBe(8);
    trial.state.skipsRemaining = 1;
    trial.reviveWithSkip();
    expect(trial.state.history).toHaveLength(0);

    trial.state.stage = 7;
    (
      trial as unknown as { startBoss: () => void }
    ).startBoss();
    trial.setDraft(
      trial.state.boss?.expectedAnswers.join("") ?? "",
    );
    trial.submit();
    await vi.advanceTimersByTimeAsync(1200);
    expect(trial.state.phase).toBe("results");
    expect(trial.state.result?.title).toBe("雾径得津");
  });

  it("replaces the boss without advancing after a skipped miss", () => {
    const trial = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(37),
    );
    trial.beginStage();
    (
      trial as unknown as { startBoss: () => void }
    ).startBoss();
    trial.surrender();
    trial.reviveWithSkip();

    expect(trial.state.phase).toBe("boss");
    expect(trial.state.questionInStage).toBe(9);
    expect(trial.state.revealing).toBe(false);
    expect(trial.state.skipsRemaining).toBe(2);
    expect(trial.state.history).toHaveLength(0);
  });

  it("disables question skipping for inherited-card rules", () => {
    const trial = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(32),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("hallraum");
    trial.state.phase = "playing";
    trial.state.questionInStage = 1;
    trial.state.skipsRemaining = 3;
    trial.skipQuestion();

    expect(trial.state.skipsRemaining).toBe(3);
    expect(trial.state.questionInStage).toBe(1);
  });

  it("stacks Hallraum's one-third time cut with the three-star bonus", () => {
    const trial = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(38),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("hallraum");
    const timedSeconds = (
      trial as unknown as {
        timedSeconds: (
          baseSeconds: number,
          multiplier: number,
        ) => number;
      }
    ).timedSeconds.bind(trial);
    expect(
      timedSeconds(
        TRIAL_NORMAL_SECONDS,
        trialRulesData.rules.hallraum.timing
          .normalMultiplier,
      ),
    ).toBe(26);
    expect(timedSeconds(TRIAL_BOSS_SECONDS, 1)).toBe(117);
  });

  it("weights Hallraum candidates toward unused visible components", () => {
    const previous = [1, 2, 3];
    expect(
      hallraumComponentDiversityWeight(
        [2, 4, 5],
        previous,
        2,
      ),
    ).toBe(10);
    expect(
      hallraumComponentDiversityWeight(
        [2, 1, 4],
        previous,
        2,
      ),
    ).toBe(1.5);
    expect(
      hallraumComponentDiversityWeight(
        [2, 1, 3],
        previous,
        2,
      ),
    ).toBe(0.25);
  });

  it("carries used skips forward and grants one after stages three and six", () => {
    const trial = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(33),
    );
    trial.beginStage();
    trial.skipQuestion();
    (
      trial as unknown as { startBoss: () => void }
    ).startBoss();
    trial.surrender();
    trial.continueAfterMiss();
    expect(trial.state.stage).toBe(2);
    expect(trial.state.skipsRemaining).toBe(2);

    const stageThree = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(34),
    );
    stageThree.state.stage = 3;
    stageThree.beginStage();
    (
      stageThree as unknown as { startBoss: () => void }
    ).startBoss();
    stageThree.surrender();
    stageThree.continueAfterMiss();
    expect(stageThree.state.stage).toBe(4);
    expect(stageThree.state.skipsRemaining).toBe(4);
  });

  it("grants a skip after every two completed stages at advancement zero", () => {
    const trial = new TrialSession(
      createData(),
      settingsAtAdvancement(0),
      () => {},
      seededRandom(34),
    );
    trial.state.stage = 2;
    trial.beginStage();
    (
      trial as unknown as { startBoss: () => void }
    ).startBoss();
    trial.surrender();
    trial.continueAfterMiss();

    expect(trial.state.stage).toBe(3);
    expect(trial.state.skipsRemaining).toBe(4);
  });

  it("applies Tetrarchy to four-part questions and its two four-part boss answers", () => {
    vi.useFakeTimers();
    const trial = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(20),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.state.stage = 2;
    trial.setRuleOverride("tetrarchy");
    trial.beginStage();

    expect(
      trialRulesData.rules[trial.state.ruleId].stars,
    ).toBe(1);
    expect(trial.state.timeLimit).toBe(30);
    expect(trial.state.current?.answerWay).toHaveLength(4);
    expect(trial.state.current?.displayCards).toHaveLength(4);

    (
      trial as unknown as { startBoss: () => void }
    ).startBoss();
    expect(trial.state.timeLimit).toBe(90);
    expect(trial.state.boss?.expectedAnswers).toHaveLength(2);
    expect(
      trial.state.boss?.expectedWays.map((way) => way.length),
    ).toEqual([4, 4]);
    expect(trial.state.boss?.initialCards).toHaveLength(8);
  });

  it("lets debug override the current stage rule and clears the override on the next stage", async () => {
    vi.useFakeTimers();
    const trial = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(19),
      false,
      () => {},
      null,
      trialRulesData,
    );

    trial.setRuleOverride("aphantasia");
    expect(trial.state.forcedRuleId).toBe("aphantasia");
    expect(trial.state.ruleId).toBe("aphantasia");
    trial.beginStage();
    expect(trial.state.ruleId).toBe("aphantasia");
    expect(
      trial.state.current?.displayCards.every(
        (card) => card.obscuredAtMs === 1500,
      ),
    ).toBe(true);

    (
      trial as unknown as { startBoss: () => void }
    ).startBoss();
    trial.setDraft(
      trial.state.boss?.expectedAnswers.join("") ?? "",
    );
    trial.submit();
    await vi.advanceTimersByTimeAsync(1200);

    expect(trial.state.stage).toBe(2);
    expect(trial.state.phase).toBe("stage-intro");
    expect(trial.state.forcedRuleId).toBeNull();
    expect(
      trialRulesData.rules[trial.state.ruleId].stars,
    ).toBe(1);
  });

  it("can clear a debug rule override before entering the stage", () => {
    const trial = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(18),
      false,
      () => {},
      null,
      trialRulesData,
    );

    trial.setRuleOverride("myopia");
    trial.setRuleOverride(null);
    expect(trial.state.forcedRuleId).toBeNull();
    expect(trial.state.ruleId).toBe("unrestricted");
  });

  it("excludes a Byland family from answers while allowing distinct decoy cards", () => {
    const data = createBylandData();
    const trial = new TrialSession(
      data,
      settings,
      () => {},
      seededRandom(33),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("byland-water");
    const available = (
      trial as unknown as {
        availableChoices: (
          length: number,
          excluded: Set<string>,
        ) => Array<{ char: string; ways: number[][] }>;
      }
    ).availableChoices(2, new Set());

    expect(
      available.some((choice) => choice.char === "沐"),
    ).toBe(false);
    expect(
      available.every((choice) =>
        choice.ways.every((way) =>
          way.every(
            (symbolId) =>
              !["水", "氵", "冫", "雨"].includes(
                data.component(symbolId).name,
              ),
          ),
        ),
      ),
    ).toBe(true);

    const helpers = trial as unknown as {
      addRuleDecoy: (
        kind: "normal" | "boss",
        cards: Array<{
          uid: number;
          symbolId: number;
          source: "answer" | "decoy";
          mustIgnore?: boolean;
        }>,
        answerWays?: readonly number[][],
      ) => boolean;
      assignBossAnswers: (
        answers: string[],
      ) => unknown;
    };
    const answerCards: Array<{
      uid: number;
      symbolId: number;
      source: "answer" | "decoy";
      mustIgnore?: boolean;
    }> = [
      { uid: 1, symbolId: 5, source: "answer" as const },
      { uid: 2, symbolId: 6, source: "answer" as const },
    ];
    expect(
      helpers.addRuleDecoy("normal", answerCards),
    ).toBe(true);
    expect(answerCards).toHaveLength(3);
    expect(
      answerCards.filter((card) => card.source === "decoy"),
    ).toHaveLength(1);
    expect(
      answerCards.some(
        (card) =>
          card.source === "decoy" &&
          !card.mustIgnore,
      ),
    ).toBe(false);
    const bossCards: typeof answerCards = [
      { uid: 21, symbolId: 5, source: "answer" },
      { uid: 22, symbolId: 6, source: "answer" },
      { uid: 23, symbolId: 7, source: "answer" },
      { uid: 24, symbolId: 8, source: "answer" },
    ];
    expect(helpers.addRuleDecoy("boss", bossCards)).toBe(
      true,
    );
    const bossDecoys = bossCards.filter(
      (card) => card.source === "decoy",
    );
    expect(bossDecoys).toHaveLength(2);
    expect(
      new Set(bossDecoys.map((card) => card.symbolId)).size,
    ).toBe(2);
    trial.state.boss = {
      cards: [],
      initialCards: [],
      expectedAnswers: ["杏", "杲"],
      expectedDisplayChars: ["杏", "杲"],
      expectedPinyin: ["", ""],
      expectedWays: [
        [5, 6],
        [7, 5],
      ],
      displayWays: [
        [5, 6],
        [7, 5],
      ],
      expandedComponents: [],
      pendingAnswers: [],
      pendingSubmissions: [],
      pendingAnswer: "",
      pendingCardIds: [],
      consumedCardIds: [],
      submissionCount: 0,
    };
    expect(
      helpers.assignBossAnswers(["尖"]),
    ).toBeNull();
  });

  it("attaches Outland components without changing their answer identities", () => {
    const data = createOutlandData();
    const trial = new TrialSession(
      data,
      settings,
      () => {},
      seededRandom(34),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("outland-water");
    const helpers = trial as unknown as {
      addRuleDecoy: (
        kind: "normal" | "boss",
        cards: TrialCard[],
        answerWays?: readonly number[][],
      ) => boolean;
    };
    const normalTotals: number[] = [];
    for (let index = 0; index < 120; index += 1) {
      const cards: TrialCard[] = [
        { uid: index * 2, symbolId: 5, source: "answer" },
        {
          uid: index * 2 + 1,
          symbolId: 5,
          source: "answer",
        },
      ];
      expect(
        helpers.addRuleDecoy(
          "normal",
          cards,
          [[5, 5]],
        ),
      ).toBe(true);
      expect(cards).toHaveLength(2);
      const total = cards.reduce(
        (sum, card) =>
          sum + (card.attachedComponents?.length ?? 0),
        0,
      );
      normalTotals.push(total);
      expect(total).toBeGreaterThanOrEqual(1);
      expect(total).toBeLessThanOrEqual(3);
      for (const card of cards) {
        expect(card.symbolId).toBe(5);
        expect(card.source).toBe("answer");
        expect(card.mustIgnore).not.toBe(true);
        if (card.displayGlyph) {
          expect(card.displayMode).toBe("attached");
          expect(data.ways.has(card.displayGlyph)).toBe(
            true,
          );
        }
      }
    }
    expect(
      normalTotals.reduce(
        (sum, total) => sum + total,
        0,
      ) / normalTotals.length,
    ).toBeCloseTo(2, 0);
    expect(new Set(normalTotals).size).toBeGreaterThan(1);

    const bossTotals: number[] = [];
    for (let index = 0; index < 120; index += 1) {
      const bossCards: TrialCard[] = [
        {
          uid: 1000 + index * 2,
          symbolId: 5,
          source: "answer",
        },
        {
          uid: 1001 + index * 2,
          symbolId: 5,
          source: "answer",
        },
      ];
      expect(
        helpers.addRuleDecoy(
          "boss",
          bossCards,
          [[5], [5]],
        ),
      ).toBe(true);
      expect(bossCards).toHaveLength(2);
      bossTotals.push(
        bossCards.reduce(
          (sum, card) =>
            sum +
            (card.attachedComponents?.length ?? 0),
          0,
        ),
      );
    }
    expect(
      bossTotals.reduce(
        (sum, total) => sum + total,
        0,
      ) / bossTotals.length,
    ).toBeCloseTo(4, 0);
    expect(new Set(bossTotals).size).toBeGreaterThan(1);
  });

  it("keeps two-part Outland questions near the challenge baseline", () => {
    const total = Object.values(
      TRIAL_OUTLAND_PART_WEIGHTS,
    ).reduce((sum, weight) => sum + weight, 0);
    expect(
      TRIAL_OUTLAND_PART_WEIGHTS[2] / total,
    ).toBeCloseTo(0.15, 2);
    expect(
      (TRIAL_OUTLAND_PART_WEIGHTS[3] +
        TRIAL_OUTLAND_PART_WEIGHTS[4]) /
        total,
    ).toBeCloseTo(0.65, 2);
  });

  it("accepts an unexpected BOSS answer made from Outland attached cards", () => {
    const data = createOutlandData();
    const trial = new TrialSession(
      data,
      settings,
      () => {},
      seededRandom(35),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("outland-water");
    const attachedCard: TrialCard = {
      uid: 1,
      symbolId: 5,
      source: "answer",
      displayGlyph: "沐",
      displayMode: "attached",
      attachedComponents: [2],
    };
    const cards: TrialCard[] = [
      attachedCard,
      { uid: 2, symbolId: 6, source: "answer" },
      { uid: 3, symbolId: 7, source: "answer" },
      { uid: 4, symbolId: 8, source: "answer" },
    ];
    trial.state.phase = "boss";
    trial.state.questionInStage = 9;
    trial.state.boss = {
      cards: cards.map((card) => ({ ...card })),
      initialCards: cards.map((card) => ({ ...card })),
      expectedAnswers: ["杏", "明"],
      expectedDisplayChars: ["杏", "明"],
      expectedPinyin: ["", ""],
      expectedWays: [
        [5, 6],
        [7, 8],
      ],
      displayWays: [
        [5, 6],
        [7, 8],
      ],
      expandedComponents: [],
      pendingAnswers: [],
      pendingSubmissions: [],
      pendingAnswer: "",
      pendingCardIds: [],
      consumedCardIds: [],
      submissionCount: 0,
    };
    trial.state.timeLimit = 90;
    trial.state.remaining = 90;

    trial.setDraft("呆");
    trial.submit();

    expect(trial.state.feedback).toBe("partial");
    expect(trial.state.boss.pendingAnswers).toEqual(["呆"]);
    expect(
      trial.state.boss.pendingSubmissions[0].cardIds,
    ).toEqual([1, 2]);
    trial.setDraft("旪");
    trial.submit();
    expect(trial.state.feedback).toBe("correct");
    expect(trial.state.boss.pendingAnswers).toEqual([
      "呆",
      "旪",
    ]);
  });

  it("accepts a one-card unexpected answer from an Outland attached card", () => {
    const data = createOutlandData();
    const trial = new TrialSession(
      data,
      settings,
      () => {},
      seededRandom(36),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("outland-water");
    const attachedCard: TrialCard = {
      uid: 1,
      symbolId: 5,
      source: "answer",
      displayGlyph: "沐",
      displayMode: "attached",
      attachedComponents: [2],
    };
    trial.state.phase = "boss";
    trial.state.questionInStage = 9;
    trial.state.boss = {
      cards: [
        attachedCard,
        { uid: 2, symbolId: 6, source: "answer" },
        { uid: 3, symbolId: 7, source: "answer" },
        { uid: 4, symbolId: 8, source: "answer" },
      ],
      initialCards: [
        { ...attachedCard },
        { uid: 2, symbolId: 6, source: "answer" },
        { uid: 3, symbolId: 7, source: "answer" },
        { uid: 4, symbolId: 8, source: "answer" },
      ],
      expectedAnswers: ["杏", "明"],
      expectedDisplayChars: ["杏", "明"],
      expectedPinyin: ["", ""],
      expectedWays: [
        [5, 6],
        [7, 8],
      ],
      displayWays: [
        [5, 6],
        [7, 8],
      ],
      expandedComponents: [],
      pendingAnswers: [],
      pendingSubmissions: [],
      pendingAnswer: "",
      pendingCardIds: [],
      consumedCardIds: [],
      submissionCount: 0,
    };
    trial.state.timeLimit = 90;
    trial.state.remaining = 90;

    trial.setDraft("木");
    trial.submit();

    expect(trial.state.feedback).toBe("partial");
    expect(trial.state.boss.pendingAnswers).toEqual(["木"]);
    expect(
      trial.state.boss.pendingSubmissions[0].cardIds,
    ).toEqual([1]);
  });

  it("uses the inherited card's possible identities for Hallraum uniqueness", () => {
    const trial = new TrialSession(
      createHallraumUniquenessData(),
      settings,
      () => {},
      seededRandom(37),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("hallraum");
    const helpers = trial as unknown as {
      buildHallraumCatalog: () => void;
      hallraumPossibleInheritedSymbols: (
        visibleComponents: readonly number[],
        inheritedSources: ReadonlySet<number> | null,
      ) => number[];
      hallraumUnknownInheritedSymbols: (
        visibleComponents: readonly number[],
      ) => number[];
      hallraumCandidateBags: (
        length: number,
        inheritedSymbol: number | null,
        inheritedSources: ReadonlySet<number> | null,
        usedChars: ReadonlySet<string>,
        rule: TrialRulesData["rules"][string],
      ) => Array<{ components: number[] }>;
      hallraumLengthOrder: (
        questionIndex: number,
      ) => number[];
      hallraumBagsByLength: Map<
        number,
        Array<{
          directAnswers: string[];
          acceptedAnswers: string[];
        }>
      >;
    };
    helpers.buildHallraumCatalog();

    expect(
      helpers
        .hallraumUnknownInheritedSymbols([4, 5])
        .sort((left, right) => left - right),
    ).toEqual([2, 3]);
    expect(
      helpers.hallraumUnknownInheritedSymbols([4, 6]),
    ).toEqual([3]);
    expect(
      helpers
        .hallraumPossibleInheritedSymbols(
          [4, 5],
          new Set([1, 2, 3]),
        )
        .sort((left, right) => left - right),
    ).toEqual([2, 3]);
    expect(
      helpers.hallraumPossibleInheritedSymbols(
        [4, 6],
        new Set([1, 2, 3]),
      ),
    ).toEqual([3]);
    expect(
      helpers.hallraumCandidateBags(
        3,
        3,
        new Set([2, 3]),
        new Set(),
        trialRulesData.rules.hallraum,
      ).filter((entry) =>
        entry.components.includes(4) &&
        entry.components.includes(5),
      ),
    ).toHaveLength(0);
    expect(
      helpers.hallraumCandidateBags(
        3,
        3,
        new Set([3]),
        new Set(),
        trialRulesData.rules.hallraum,
      ).filter((entry) =>
        entry.components.includes(4) &&
        entry.components.includes(5),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      helpers.hallraumCandidateBags(
        3,
        3,
        new Set([3]),
        new Set(),
        trialRulesData.rules.hallraum,
      ).filter((entry) =>
        entry.components.includes(4) &&
        entry.components.includes(6),
      ).length,
    ).toBe(0);
    for (let question = 0; question < 7; question += 1) {
      expect(helpers.hallraumLengthOrder(question)).toEqual([
        3,
      ]);
    }
    expect(helpers.hallraumLengthOrder(7)).toEqual([4]);
    for (const entries of helpers.hallraumBagsByLength.values()) {
      expect(
        entries.every(
          (entry) => entry.directAnswers.length > 0,
        ),
      ).toBe(true);
    }

    const sevenQuestionTrial = new TrialSession(
      createHallraumUniquenessData(),
      settingsAtAdvancement(0),
      () => {},
      seededRandom(37),
      false,
      () => {},
      null,
      trialRulesData,
    );
    sevenQuestionTrial.setRuleOverride("hallraum");
    const sevenQuestionHelpers =
      sevenQuestionTrial as unknown as {
        hallraumLengthOrder: (
          questionIndex: number,
        ) => number[];
      };
    for (let question = 0; question < 6; question += 1) {
      expect(
        sevenQuestionHelpers.hallraumLengthOrder(question),
      ).toEqual([3]);
    }
    expect(
      sevenQuestionHelpers.hallraumLengthOrder(6),
    ).toEqual([4]);
  });

  it("builds a complete seven-question Hallraum chain at advancement zero", () => {
    const trial = new TrialSession(
      createPublicGameData(),
      settingsAtAdvancement(0),
      () => {},
      seededRandom(39),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("hallraum");
    trial.beginStage();
    const helpers = trial as unknown as {
      hallraumSteps: Array<{
        way: number[];
      }>;
      hallraumBossPlan: {
        ways: [number[], number[]];
        inheritedSlots: [number, number];
      } | null;
    };

    expect(helpers.hallraumSteps).toHaveLength(7);
    expect(helpers.hallraumSteps.at(-1)?.way).toHaveLength(4);
    expect(helpers.hallraumBossPlan).not.toBeNull();
    const bossPlan = helpers.hallraumBossPlan!;
    for (const [index, slot] of bossPlan
      .inheritedSlots.entries()) {
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(slot).toBeLessThan(bossPlan.ways[index].length);
    }
  });

  it("assigns one inherited Hallraum card to each boss answer", () => {
    const trial = new TrialSession(
      createHallraumBossData(),
      settings,
      () => {},
      seededRandom(38),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("hallraum");
    const cards: TrialCard[] = [
      {
        uid: 1,
        symbolId: 1,
        source: "inherited",
        displayMode: "obscured",
        obscured: true,
      },
      { uid: 2, symbolId: 4, source: "answer" },
      {
        uid: 3,
        symbolId: 2,
        source: "inherited",
        displayMode: "obscured",
        obscured: true,
      },
      { uid: 4, symbolId: 5, source: "answer" },
    ];
    trial.state.phase = "boss";
    trial.state.questionInStage = 9;
    trial.state.boss = {
      cards: cards.map((card) => ({ ...card })),
      initialCards: cards.map((card) => ({ ...card })),
      expectedAnswers: ["甲", "乙"],
      expectedDisplayChars: ["甲", "乙"],
      expectedPinyin: ["", ""],
      expectedWays: [
        [1, 4],
        [2, 5],
      ],
      displayWays: [
        [1, 4],
        [2, 5],
      ],
      expandedComponents: [],
      inheritedSources: [1, 2, 4, 5],
      pendingAnswers: [],
      pendingSubmissions: [],
      pendingAnswer: "",
      pendingCardIds: [],
      consumedCardIds: [],
      submissionCount: 0,
    };
    trial.state.timeLimit = 90;
    trial.state.remaining = 90;
    const helpers = trial as unknown as {
      assignBossAnswers: (answers: string[]) =>
        | {
            submissions: Array<{
              cardIds: number[];
              componentUses: Array<{
                inherited?: boolean;
                sourceIndex?: number;
              }>;
            }>;
          }
        | null;
    };

    const assignment = helpers.assignBossAnswers([
      "甲",
      "乙",
    ]);
    expect(assignment).not.toBeNull();
    expect(
      assignment?.submissions.map((submission) =>
        submission.cardIds.filter((uid) => uid === 1 || uid === 3),
      ),
    ).toEqual([[1], [3]]);
    expect(
      helpers.assignBossAnswers(["丙", "丁"]),
    ).toBeNull();
    const unexpected = helpers.assignBossAnswers([
      "壬",
      "癸",
    ]);
    expect(unexpected).not.toBeNull();
    expect(
      unexpected?.submissions.flatMap((submission) =>
        submission.componentUses
          .filter((use) => use.inherited)
          .map((use) => use.sourceIndex),
      ),
    ).toEqual([1, 3]);
  });

  it("reveals only a correct boss pair and preserves a correct submitted part", () => {
    const trial = new TrialSession(
      createHallraumBossData(),
      settings,
      () => {},
      seededRandom(39),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("hallraum");
    const cards: TrialCard[] = [
      {
        uid: 1,
        symbolId: 1,
        source: "inherited",
        displayMode: "obscured",
        obscured: true,
      },
      { uid: 2, symbolId: 4, source: "answer" },
      {
        uid: 3,
        symbolId: 2,
        source: "inherited",
        displayMode: "obscured",
        obscured: true,
      },
      { uid: 4, symbolId: 5, source: "answer" },
    ];
    trial.state.phase = "boss";
    trial.state.questionInStage = 9;
    trial.state.boss = {
      cards: cards.map((card) => ({ ...card })),
      initialCards: cards.map((card) => ({ ...card })),
      expectedAnswers: ["甲", "乙"],
      expectedDisplayChars: ["甲", "乙"],
      expectedPinyin: ["", ""],
      expectedWays: [
        [1, 4],
        [2, 5],
      ],
      displayWays: [
        [1, 4],
        [2, 5],
      ],
      expandedComponents: [],
      inheritedSources: [1, 2, 4, 5],
      pendingAnswers: ["戊"],
      pendingSubmissions: [],
      pendingAnswer: "戊",
      pendingCardIds: [1, 2, 3],
      consumedCardIds: [],
      submissionCount: 1,
    };
    const resolver = trial as unknown as {
      resolveBossRevealAnswers: () => string[];
    };

    expect(resolver.resolveBossRevealAnswers()).toEqual([
      "甲",
      "乙",
    ]);
    trial.state.boss.pendingAnswers = ["甲"];
    trial.state.boss.pendingAnswer = "甲";
    expect(resolver.resolveBossRevealAnswers()).toEqual([
      "甲",
      "乙",
    ]);
    trial.state.boss.revealAnswers = ["甲", "乙"];
    expect(
      orderedBossAnswerChars(trial.state.boss),
    ).toEqual(["甲", "乙"]);
  });

  it("normalizes pinyin case and ü/v variants", () => {
    expect(normalizePinyinInput("  NÜ  ")).toBe("nv");
    expect(normalizePinyinInput("LvE")).toBe("lve");
    expect(
      acceptedPinyinFor(pinyinFixture, "行"),
    ).toEqual(["xing", "hang"]);
    expect(displayPinyinFor(pinyinFixture, "行")).toBe(
      "xíng / háng",
    );
  });

  it("builds two Fugue lanes and refills only the answering lane", async () => {
    vi.useFakeTimers();
    const trial = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(40),
      true,
      () => {},
      null,
      archivedFugueRulesData,
    );
    trial.setRuleOverride("fugue");
    trial.beginStage();
    const fugue = trial.state.fugue!;
    const generation = trial as unknown as {
      fugueQuestions: Array<{
        accepted: string[];
      }>;
      fugueBossPlans: Array<{
        acceptedPairs: Set<string>;
        submissionChars: Set<string>;
      }>;
    };

    expect(fugue.slots).toHaveLength(2);
    expect(
      fugue.slots
        .map((slot) => slot.current?.answerWay.length)
        .every((length) => length === 3 || length === 4),
    ).toBe(true);
    trial.togglePause();
    expect(
      trial.state.fugue?.slots.map(
        (slot) => slot.remaining,
      ),
    ).toEqual([15, 15]);
    trial.togglePause();
    const originalLeft =
      fugue.slots[0].current?.accepted ?? [];
    const originalRight =
      fugue.slots[1].current?.accepted ?? [];
    fugue.slots[0].current!.accepted = ["同"];
    fugue.slots[1].current!.accepted = ["同"];
    trial.setDraft("同");
    trial.submit();
    expect(trial.state.feedback).toBe("wrong");
    expect(
      trial.state.fugue?.slots.map(
        (slot) => slot.questionNumber,
      ),
    ).toEqual([1, 2]);
    fugue.slots[0].current!.accepted = originalLeft;
    fugue.slots[1].current!.accepted = originalRight;
    const rightAnswers = new Set(
      fugue.slots[1].current?.accepted ?? [],
    );
    const answer = fugue.slots[0].current?.accepted.find(
      (candidate) => !rightAnswers.has(candidate),
    );
    expect(answer).toBeTruthy();
    const rightBefore = fugue.slots[1].current?.char;

    trial.setDraft(answer!);
    trial.submit();
    await vi.advanceTimersByTimeAsync(700);

    expect(
      trial.state.fugue?.slots[0].questionNumber,
    ).toBe(3);
    expect(
      trial.state.fugue?.slots[1].questionNumber,
    ).toBe(2);
    expect(trial.state.fugue?.slots[1].current?.char).toBe(
      rightBefore,
    );
    const lastThreeAnswers = new Set(
      generation.fugueQuestions
        .slice(-3)
        .flatMap((question) => question.accepted),
    );
    expect(
      [...lastThreeAnswers].some(
        (char) =>
          generation.fugueBossPlans[0].submissionChars.has(
            char,
          ) ||
          generation.fugueBossPlans[1].submissionChars.has(
            char,
          ),
      ),
    ).toBe(false);
    expect(
      [...generation.fugueBossPlans[0].acceptedPairs].some(
        (key) =>
          key.split("|").some((char) =>
            generation.fugueBossPlans[1].submissionChars.has(
              char,
            ),
          ),
      ),
    ).toBe(false);
    expect(
      [...generation.fugueBossPlans[1].acceptedPairs].some(
        (key) =>
          key.split("|").some((char) =>
            generation.fugueBossPlans[0].submissionChars.has(
              char,
            ),
          ),
      ),
    ).toBe(false);
  });

  it("accepts any pinyin reading and stores tone-marked reveal data", () => {
    vi.useFakeTimers();
    const trial = new TrialSession(
      createNuncupationData(),
      settings,
      () => {},
      seededRandom(34),
      false,
      () => {},
      null,
      trialRulesData,
      pinyinFixture,
    );
    trial.setRuleOverride("nuncupation");
    trial.state.phase = "playing";
    trial.state.current = {
      char: "杲",
      accepted: ["杲"],
      pinyin: "gǎo",
      answerWay: [3, 1],
      displayCards: [],
    };
    trial.state.timeLimit = 30;
    trial.state.remaining = 30;
    trial.setDraft("GAO");
    trial.submit();

    expect(trial.state.feedback).toBe("correct");
    expect(trial.state.revealAnswer).toBe("杲");
    expect(trial.state.revealPinyin).toEqual(["gǎo"]);
    expect(trial.state.history[0].given).toBe("GAO");
    expect(
      trial.state.history[0].answerDetails[0].pinyin,
    ).toBe("gǎo");
  });

  it("resolves simultaneous BOSS pinyin in either order", () => {
    const trial = new TrialSession(
      createNuncupationData(),
      settings,
      () => {},
      seededRandom(35),
      false,
      () => {},
      null,
      trialRulesData,
      pinyinFixture,
    );
    trial.setRuleOverride("nuncupation");
    trial.state.phase = "boss";
    trial.state.boss = {
      cards: [
        { uid: 1, symbolId: 1, source: "answer" },
        { uid: 2, symbolId: 3, source: "answer" },
        { uid: 3, symbolId: 3, source: "answer" },
        { uid: 4, symbolId: 4, source: "answer" },
      ],
      initialCards: [],
      expectedAnswers: ["行", "乐"],
      expectedDisplayChars: ["行", "乐"],
      expectedPinyin: ["xíng / háng", "lè / yuè"],
      expectedWays: [
        [1, 3],
        [3, 4],
      ],
      displayWays: [
        [1, 3],
        [3, 4],
      ],
      expandedComponents: [],
      pendingAnswers: [],
      pendingSubmissions: [],
      pendingAnswer: "",
      pendingCardIds: [],
      consumedCardIds: [],
      submissionCount: 0,
    };
    const resolved = (
      trial as unknown as {
        resolveBossPinyinSubmission: (
          raw: string,
        ) => {
          chars: string[];
          assignment: unknown;
        } | null;
      }
    ).resolveBossPinyinSubmission("YUE HANG");

    expect(resolved?.chars).toEqual(["乐", "行"]);
    expect(resolved?.assignment).not.toBeNull();
  });

  it("uses traditional decompositions for Abscission while judging simplified answers", () => {
    vi.useFakeTimers();
    const { data, traditional } = createTraditionalFixture();
    const encountered: string[] = [];
    const trial = new TrialSession(
      data,
      settings,
      () => {},
      seededRandom(36),
      false,
      (char) => encountered.push(char),
      null,
      trialRulesData,
      null,
      traditional,
    );
    trial.setRuleOverride("abscission");
    trial.beginStage();

    expect(trial.state.current?.char).toBeDefined();
    expect(trial.state.current?.displayChar).toBeDefined();
    expect(trial.state.current?.displayChar).not.toBe(
      trial.state.current?.char,
    );
    expect(trial.state.current?.answerWay).toHaveLength(3);
    expect(trial.state.current?.accepted).toEqual([
      trial.state.current?.char,
    ]);
    expect(encountered).toContain(
      trial.state.current?.char,
    );
    expect(encountered).not.toContain(
      trial.state.current?.displayChar,
    );
    const normalAnswer = trial.state.current?.char ?? "";
    const normalDisplayChar =
      trial.state.current?.displayChar;
    trial.setDraft(normalAnswer);
    trial.submit();
    expect(trial.state.feedback).toBe("correct");
    expect(trial.state.revealAnswer).toBe(normalAnswer);
    expect(
      trial.state.history[0].answerDetails[0].displayChar,
    ).toBe(normalDisplayChar);

    (
      trial as unknown as { startBoss: () => void }
    ).startBoss();
    expect(trial.state.boss?.expectedAnswers).toHaveLength(2);
    expect(
      trial.state.boss?.expectedDisplayChars,
    ).toHaveLength(2);
    expect(new Set(encountered)).toEqual(
      new Set([
        normalAnswer,
        ...(trial.state.boss?.expectedAnswers ?? []),
      ]),
    );
    expect(trial.state.boss?.initialCards).toHaveLength(6);
    trial.setDraft(
      trial.state.boss?.expectedAnswers.join("") ?? "",
    );
    trial.submit();
    expect(trial.state.feedback).toBe("correct");
    expect(
      trial.state.history[1].answerDetails.map(
        (detail) => detail.char,
      ),
    ).toEqual(trial.state.boss?.expectedAnswers);
    expect(
      trial.state.history[1].answerDetails.map(
        (detail) => detail.displayChar,
      ),
    ).toEqual(
      trial.state.boss?.expectedDisplayChars,
    );
  });

  it("expands one reducible component and accepts another displayed answer", () => {
    vi.useFakeTimers();
    const gameData = createReductionData();
    const trial = new TrialSession(
      gameData,
      settings,
      () => {},
      seededRandom(37),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("reductionism");
    trial.beginStage();

    const current = trial.state.current;
    expect(current?.expandedComponent).toBeDefined();
    expect(current?.displayCards).toHaveLength(
      (current?.answerWay.length ?? 0) + 1,
    );
    expect(
      current?.displayCards.filter(
        (card) => card.reductionPart,
      ),
    ).toHaveLength(2);
    expect(current?.accepted.length).toBeGreaterThan(1);

    const alternate = current?.accepted.find(
      (char) => char !== current.char,
    );
    expect(alternate).toBeTruthy();
    trial.setDraft(alternate!);
    trial.submit();

    expect(trial.state.feedback).toBe("correct");
    expect(trial.state.revealAnswer).toBe(alternate);
    expect(trial.state.history[0].answer).toBe(alternate);
    expect(
      trial.state.history[0].answerDetails[0].expandedComponent,
    ).toBe(current?.expandedComponent);
  });

  it("does not prefabricate into an existing decomposition of the answer", () => {
    const trial = new TrialSession(
      createExistingWayCollisionData(),
      settings,
      () => {},
      seededRandom(43),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("prefabrication");
    const choices = (
      trial as unknown as {
        availableChoices: (
          length: number,
          excluded: Set<string>,
        ) => Array<{ char: string }>;
      }
    ).availableChoices(4, new Set());

    expect(
      choices.some((choice) => choice.char === "鞬"),
    ).toBe(false);
  });

  it("uses one wildcard per normal answer and one per boss answer with unique solutions", async () => {
    vi.useFakeTimers();
    const trial = new TrialSession(
      createWildcardData(),
      settings,
      () => {},
      seededRandom(45),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("wildcard");
    trial.beginStage();

    for (let index = 0; index < 8; index += 1) {
      const current = trial.state.current!;
      const wildcards = current.displayCards.filter(
        (card) => card.displayMode === "wildcard",
      );
      expect(wildcards).toHaveLength(1);
      expect(current.displayCards).toHaveLength(
        current.answerWay.length,
      );
      expect(current.accepted).toHaveLength(1);
      trial.setDraft(current.accepted[0]);
      trial.submit();
      await vi.advanceTimersByTimeAsync(900);
    }

    expect(trial.state.phase).toBe("boss");
    const boss = trial.state.boss!;
    expect(
      boss.initialCards.filter(
        (card) => card.displayMode === "wildcard",
      ),
    ).toHaveLength(2);
    expect(boss.expectedAnswers).toHaveLength(2);
    expect(new Set(boss.expectedAnswers).size).toBe(2);
    trial.setDraft(boss.expectedAnswers.join(""));
    trial.submit();
    expect(trial.state.feedback).toBe("correct");
  });

  it("lets a wildcard boss card stand in for a component other than its hidden source", () => {
    vi.useFakeTimers();
    const trial = new TrialSession(
      createNuncupationData(),
      settings,
      () => {},
      seededRandom(46),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("wildcard");
    trial.state.phase = "boss";
    trial.state.questionInStage = 9;
    const cards: TrialCard[] = [
      {
        uid: 1,
        symbolId: 2,
        source: "answer" as const,
      },
      {
        uid: 2,
        symbolId: 4,
        source: "wildcard" as const,
        displayMode: "wildcard" as const,
      },
      {
        uid: 3,
        symbolId: 3,
        source: "answer" as const,
      },
      {
        uid: 4,
        symbolId: 3,
        source: "wildcard" as const,
        displayMode: "wildcard" as const,
      },
    ];
    trial.state.boss = {
      cards: cards.map((card) => ({ ...card })),
      initialCards: cards.map((card) => ({ ...card })),
      expectedAnswers: ["杲", "行"],
      expectedDisplayChars: ["杲", "行"],
      expectedPinyin: ["", ""],
      expectedWays: [
        [3, 1],
        [1, 3],
      ],
      displayWays: [
        [3, 1],
        [1, 3],
      ],
      expandedComponents: [],
      pendingAnswers: [],
      pendingSubmissions: [],
      pendingAnswer: "",
      pendingCardIds: [],
      consumedCardIds: [],
      submissionCount: 0,
    };
    trial.state.timeLimit = 90;
    trial.state.remaining = 90;

    trial.setDraft("杏");
    trial.submit();

    expect(trial.state.feedback).toBe("partial");
    expect(trial.state.boss?.pendingAnswers).toEqual(["杏"]);
    expect(
      trial.state.boss?.pendingSubmissions[0].componentUses,
    ).toEqual(
      expect.arrayContaining([
        { cardUid: 1, symbolId: 2 },
        {
          cardUid: 2,
          symbolId: 4,
          wildcard: true,
        },
      ]),
    );
  });

  it("checks wildcard uniqueness without compatibility but accepts compatibility answers", () => {
    const trial = new TrialSession(
      createWildcardCompatibilityData(),
      settings,
      () => {},
      seededRandom(49),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("wildcard");
    const helpers = trial as unknown as {
      wildcardOptionsForWay: (
        way: number[],
      ) => Array<{ index: number; answers: string[] }>;
      wildcardAcceptedAnswers: (
        known: number[],
      ) => Set<string>;
    };

    const options = helpers.wildcardOptionsForWay([1, 2, 5]);
    expect(
      options.every((option) => option.answers.length === 1),
    ).toBe(true);
    expect(
      options.some(
        ({ index, answers }) =>
          index === 2 && answers[0] === "答",
      ),
    ).toBe(true);
    expect(
      [...helpers.wildcardAcceptedAnswers([1, 2])].sort(),
    ).toEqual(["昌", "答"].sort());
  });

  it("prefers a wildcard boss decomposition that consumes all cards", () => {
    vi.useFakeTimers();
    const trial = new TrialSession(
      createWildcardAmbiguousBossData(),
      settings,
      () => {},
      seededRandom(50),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("wildcard");
    trial.state.phase = "boss";
    trial.state.questionInStage = 9;
    const cards = [
      { uid: 1, symbolId: 1, source: "answer" as const },
      { uid: 2, symbolId: 2, source: "answer" as const },
      { uid: 3, symbolId: 3, source: "answer" as const },
      { uid: 4, symbolId: 4, source: "answer" as const },
      {
        uid: 5,
        symbolId: 6,
        source: "wildcard" as const,
        displayMode: "wildcard" as const,
      },
      {
        uid: 6,
        symbolId: 7,
        source: "wildcard" as const,
        displayMode: "wildcard" as const,
      },
    ];
    trial.state.boss = {
      cards: cards.map((card) => ({ ...card })),
      initialCards: cards.map((card) => ({ ...card })),
      expectedAnswers: ["咄", "恨"],
      expectedDisplayChars: ["咄", "恨"],
      expectedPinyin: ["", ""],
      expectedWays: [
        [4, 3, 5],
        [2, 6],
      ],
      displayWays: [
        [4, 3, 5],
        [2, 6],
      ],
      expandedComponents: [],
      pendingAnswers: [],
      pendingSubmissions: [],
      pendingAnswer: "",
      pendingCardIds: [],
      consumedCardIds: [],
      submissionCount: 0,
    };
    trial.state.timeLimit = 90;
    trial.state.remaining = 90;

    trial.setDraft("咄恨");
    trial.submit();

    expect(trial.state.feedback).toBe("correct");
    expect(
      trial.state.boss?.pendingSubmissions[1].cardIds,
    ).toEqual(
      expect.arrayContaining([1, 2]),
    );
  });

  it("chooses an extendable first decomposition for a two-submission wildcard boss", () => {
    vi.useFakeTimers();
    const trial = new TrialSession(
      createWildcardSharedLongWayData(),
      settings,
      () => {},
      seededRandom(51),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("wildcard");
    trial.state.phase = "boss";
    trial.state.questionInStage = 9;
    const cards = [
      { uid: 1, symbolId: 3, source: "answer" as const },
      { uid: 2, symbolId: 2, source: "answer" as const },
      { uid: 3, symbolId: 1, source: "answer" as const },
      { uid: 4, symbolId: 1, source: "answer" as const },
      {
        uid: 5,
        symbolId: 5,
        source: "wildcard" as const,
        displayMode: "wildcard" as const,
      },
      {
        uid: 6,
        symbolId: 4,
        source: "wildcard" as const,
        displayMode: "wildcard" as const,
      },
    ];
    trial.state.boss = {
      cards: cards.map((card) => ({ ...card })),
      initialCards: cards.map((card) => ({ ...card })),
      expectedAnswers: ["垠", "恨"],
      expectedDisplayChars: ["垠", "恨"],
      expectedPinyin: ["", ""],
      expectedWays: [
        [3, 5],
        [2, 5],
      ],
      displayWays: [
        [3, 5],
        [2, 5],
      ],
      expandedComponents: [],
      pendingAnswers: [],
      pendingSubmissions: [],
      pendingAnswer: "",
      pendingCardIds: [],
      consumedCardIds: [],
      submissionCount: 0,
    };
    trial.state.timeLimit = 90;
    trial.state.remaining = 90;

    trial.setDraft("垠");
    trial.submit();
    expect(trial.state.feedback).toBe("partial");
    expect(
      trial.state.boss?.pendingSubmissions[0].componentUses,
    ).toEqual(
      expect.arrayContaining([
        { cardUid: 1, symbolId: 3 },
        { cardUid: 3, symbolId: 1 },
        expect.objectContaining({ wildcard: true }),
      ]),
    );

    trial.setDraft("恨");
    trial.submit();
    expect(trial.state.feedback).toBe("correct");
  });

  it("finds a complete split when the first wildcard answer has short and long decompositions", () => {
    vi.useFakeTimers();
    const trial = new TrialSession(
      createWildcardNiangBossData(),
      settings,
      () => {},
      seededRandom(52),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("wildcard");
    trial.state.phase = "boss";
    trial.state.questionInStage = 9;
    const cards = [
      { uid: 1, symbolId: 3, source: "answer" as const },
      { uid: 2, symbolId: 4, source: "answer" as const },
      { uid: 3, symbolId: 2, source: "answer" as const },
      { uid: 4, symbolId: 1, source: "answer" as const },
      {
        uid: 5,
        symbolId: 5,
        source: "wildcard" as const,
        displayMode: "wildcard" as const,
      },
      {
        uid: 6,
        symbolId: 6,
        source: "wildcard" as const,
        displayMode: "wildcard" as const,
      },
    ];
    trial.state.boss = {
      cards: cards.map((card) => ({ ...card })),
      initialCards: cards.map((card) => ({ ...card })),
      expectedAnswers: ["娘", "恨"],
      expectedDisplayChars: ["娘", "恨"],
      expectedPinyin: ["", ""],
      expectedWays: [
        [3, 4, 5],
        [2, 5],
      ],
      displayWays: [
        [3, 4, 5],
        [2, 5],
      ],
      expandedComponents: [],
      pendingAnswers: [],
      pendingSubmissions: [],
      pendingAnswer: "",
      pendingCardIds: [],
      consumedCardIds: [],
      submissionCount: 0,
    };
    trial.state.timeLimit = 90;
    trial.state.remaining = 90;

    trial.setDraft("娘");
    trial.submit();
    expect(trial.state.feedback).toBe("partial");
    trial.setDraft("恨");
    trial.submit();
    expect(trial.state.feedback).toBe("correct");
  });

  it("restricts Selcouth questions to third-level characters", async () => {
    vi.useFakeTimers();
    const gameData = createSelcouthData();
    const trial = new TrialSession(
      gameData,
      settings,
      () => {},
      seededRandom(54),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("selcouth");
    trial.beginStage();

    for (let index = 0; index < 8; index += 1) {
      const current = trial.state.current!;
      expect(gameData.levels.get(current.char)).toBe(3);
      trial.setDraft(current.char);
      trial.submit();
      await vi.advanceTimersByTimeAsync(900);
    }

    expect(trial.state.phase).toBe("boss");
    for (const answer of trial.state.boss?.expectedAnswers ??
      []) {
      expect(gameData.levels.get(answer)).toBe(3);
    }
  });

  it("extends normal and boss time by thirty percent for three-star rules", () => {
    vi.useFakeTimers();
    const trial = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(55),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("aphantasia");
    trial.beginStage();
    expect(trial.state.timeLimit).toBe(39);
    expect(trial.state.remaining).toBe(39);

    (
      trial as unknown as { startBoss: () => void }
    ).startBoss();
    expect(trial.state.timeLimit).toBe(117);
    expect(trial.state.remaining).toBe(117);
  });

  it("removes the three-star bonus from advancement two onward", () => {
    vi.useFakeTimers();
    const trial = new TrialSession(
      createData(),
      settingsAtAdvancement(2),
      () => {},
      seededRandom(56),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("aphantasia");
    trial.beginStage();
    expect(trial.state.timeLimit).toBe(30);
    expect(trial.state.remaining).toBe(30);

    (
      trial as unknown as { startBoss: () => void }
    ).startBoss();
    expect(trial.state.timeLimit).toBe(90);
    expect(trial.state.remaining).toBe(90);
  });

  it("reduces one- and two-star time at advancement four", () => {
    vi.useFakeTimers();
    const trial = new TrialSession(
      createData(),
      settingsAtAdvancement(4),
      () => {},
      seededRandom(57),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("presto");
    trial.beginStage();
    expect(trial.state.timeLimit).toBe(14);
    expect(trial.state.remaining).toBe(14);

    (
      trial as unknown as { startBoss: () => void }
    ).startBoss();
    expect(trial.state.timeLimit).toBe(42);
    expect(trial.state.remaining).toBe(42);
  });

  it("leaves unrestricted and three-star rule time unshortened at advancement four", () => {
    const unrestricted = new TrialSession(
      createData(),
      settingsAtAdvancement(4),
      () => {},
      seededRandom(58),
      false,
      () => {},
      null,
      trialRulesData,
    );
    unrestricted.setRuleOverride("unrestricted");
    unrestricted.beginStage();
    expect(unrestricted.state.timeLimit).toBe(30);

    const threeStar = new TrialSession(
      createData(),
      settingsAtAdvancement(4),
      () => {},
      seededRandom(59),
      false,
      () => {},
      null,
      trialRulesData,
    );
    threeStar.setRuleOverride("aphantasia");
    threeStar.beginStage();
    expect(threeStar.state.timeLimit).toBe(30);
  });

  it("shortens Reschedule's shared cap while keeping its fixed bonus and pause penalty", () => {
    const trial = new TrialSession(
      createData(),
      settingsAtAdvancement(4),
      () => {},
      seededRandom(60),
      true,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("reschedule");
    trial.beginStage();
    expect(trial.state.timeLimit).toBe(63);
    expect(trial.state.remaining).toBe(63);

    trial.togglePause();
    expect(trial.state.paused).toBe(true);
    expect(trial.state.remaining).toBe(48);
  });

  it("adds a weighted N-rarity decoy that creates no unexpected answer", () => {
    const gameData = createPolydactylyData();
    const trial = new TrialSession(
      gameData,
      settings,
      () => {},
      seededRandom(47),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("polydactyly");
    const cards: TrialCard[] = [
      { uid: 1, symbolId: 3, source: "answer" as const },
      { uid: 2, symbolId: 4, source: "answer" as const },
      { uid: 3, symbolId: 5, source: "answer" as const },
    ];
    const added = (
      trial as unknown as {
        addRuleDecoy: (
          kind: "normal" | "boss",
          cards: TrialCard[],
          answerWays: number[][],
        ) => boolean;
      }
    ).addRuleDecoy("normal", cards, [[3, 4, 5]]);

    expect(added).toBe(true);
    const decoys = cards.filter(
      (card) => card.source === "decoy",
    );
    expect(decoys).toHaveLength(1);
    expect(decoys[0].symbolId).toBe(2);
    expect(
      (decoys[0] as { mustIgnore?: boolean }).mustIgnore,
    ).toBe(true);
  });

  it("allows polydactyly boss decoys to remain after both answers", () => {
    vi.useFakeTimers();
    const gameData = createPolydactylyData();
    const trial = new TrialSession(
      gameData,
      settings,
      () => {},
      seededRandom(48),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("polydactyly");
    trial.state.phase = "boss";
    trial.state.questionInStage = 9;
    const cards = [
      { uid: 1, symbolId: 3, source: "answer" as const },
      { uid: 2, symbolId: 4, source: "answer" as const },
      { uid: 3, symbolId: 5, source: "answer" as const },
      { uid: 4, symbolId: 6, source: "answer" as const },
      { uid: 5, symbolId: 7, source: "answer" as const },
      {
        uid: 6,
        symbolId: 1,
        source: "decoy" as const,
        mustIgnore: true,
      },
      {
        uid: 7,
        symbolId: 2,
        source: "decoy" as const,
        mustIgnore: true,
      },
    ];
    trial.state.boss = {
      cards: cards.map((card) => ({ ...card })),
      initialCards: cards.map((card) => ({ ...card })),
      expectedAnswers: ["答", "片"],
      expectedDisplayChars: ["答", "片"],
      expectedPinyin: ["", ""],
      expectedWays: [
        [3, 4, 5],
        [6, 7],
      ],
      displayWays: [
        [3, 4, 5],
        [6, 7],
      ],
      expandedComponents: [],
      pendingAnswers: [],
      pendingSubmissions: [],
      pendingAnswer: "",
      pendingCardIds: [],
      consumedCardIds: [],
      submissionCount: 0,
    };
    trial.state.timeLimit = 90;
    trial.state.remaining = 90;

    trial.setDraft("答片");
    trial.submit();

    expect(trial.state.feedback).toBe("correct");
    expect(trial.state.boss?.cards).toEqual([
      expect.objectContaining({
        uid: 6,
        source: "decoy",
      }),
      expect.objectContaining({
        uid: 7,
        source: "decoy",
      }),
    ]);
  });

  it("never expands the same component twice in a stage and accepts alternate boss answers", async () => {
    vi.useFakeTimers();
    const gameData = createReductionData();
    const trial = new TrialSession(
      gameData,
      settings,
      () => {},
      seededRandom(38),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("reductionism");
    trial.beginStage();

    const expandedSources: number[] = [];
    for (let index = 0; index < 8; index += 1) {
      const current = trial.state.current;
      expect(current).not.toBeNull();
      expandedSources.push(current!.expandedComponent!);
      trial.setDraft(current!.char);
      trial.submit();
      await vi.advanceTimersByTimeAsync(900);
    }

    expect(new Set(expandedSources).size).toBe(8);
    expect(trial.state.phase).toBe("boss");
    const boss = trial.state.boss!;
    expect(
      new Set(boss.expandedComponents).size,
    ).toBe(2);
    expect(
      boss.expandedComponents.some((source) =>
        expandedSources.includes(source),
      ),
    ).toBe(false);
    expect(
      boss.displayWays.map((way) => way.length),
    ).toEqual(
      boss.expectedWays.map((way) => way.length + 1),
    );
    expect(
      boss.initialCards.filter(
        (card) => card.reductionPart,
      ),
    ).toHaveLength(4);

    const alternate = [
      ...gameData.accepted(boss.displayWays[0]),
    ].find(
      (char) => !boss.expectedAnswers.includes(char),
    );
    expect(alternate).toBeTruthy();
    trial.setDraft(`${alternate}${boss.expectedAnswers[1]}`);
    trial.submit();
    expect(trial.state.feedback).toBe("correct");
    expect(trial.state.boss?.pendingAnswers).toContain(
      alternate,
    );
  });

  it("prefabricates one yellow hint card without repeating a hint during the stage", async () => {
    vi.useFakeTimers();
    const trial = new TrialSession(
      createPrefabricationData(),
      settings,
      () => {},
      seededRandom(39),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("prefabrication");
    expect(
      trialRulesData.rules.prefabrication.selection.normal
        .partWeights?.["4"],
    ).toBeGreaterThan(
      trialRulesData.rules.prefabrication.selection.normal
        .partWeights?.["3"] ?? 0,
    );
    trial.beginStage();

    const hints = new Set<string>();
    for (let index = 0; index < 8; index += 1) {
      const current = trial.state.current!;
      const compound = current.displayCards.filter(
        (card) => card.displayMode === "compound",
      );
      expect(compound).toHaveLength(1);
      expect(compound[0].components).toHaveLength(2);
      expect(current.displayCards).toHaveLength(
        current.answerWay.length - 1,
      );
      expect(current.accepted).toContain(current.char);
      hints.add(compound[0].displayGlyph!);
      trial.setDraft(current.char);
      trial.submit();
      await vi.advanceTimersByTimeAsync(900);
    }
    expect(hints.size).toBe(8);
    expect(trial.state.phase).toBe("boss");
    expect(trial.state.boss?.initialCards).toHaveLength(6);
    const bossHints = trial.state.boss!.initialCards
      .filter((card) => card.displayMode === "compound")
      .map((card) => card.displayGlyph!);
    expect(bossHints).toHaveLength(2);
    expect(
      bossHints.some((hint) => hints.has(hint)),
    ).toBe(false);
    expect(new Set(bossHints).size).toBe(2);
    trial.setDraft(
      trial.state.boss?.expectedAnswers.join("") ?? "",
    );
    trial.submit();
    expect(trial.state.feedback).toBe("correct");
  });

  it("allows a prefabricated boss card to be consumed across both answers", () => {
    vi.useFakeTimers();
    const gameData = createPrefabricationData();
    const trial = new TrialSession(
      gameData,
      settings,
      () => {},
      seededRandom(40),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("prefabrication");
    const firstAnswer = String.fromCodePoint(0x7100);
    const secondAnswer = String.fromCodePoint(0x7101);
    const firstWay = gameData.ways.get(firstAnswer)![0];
    const secondWay = gameData.ways.get(secondAnswer)![0];
    const initialCards = [
      {
        uid: 1,
        symbolId: firstWay[0],
        source: "answer" as const,
        components: [firstWay[0], secondWay[0]],
        remainingComponents: [
          firstWay[0],
          secondWay[0],
        ],
        displayGlyph: "預",
        displayMode: "compound" as const,
      },
      {
        uid: 2,
        symbolId: firstWay[1],
        source: "answer" as const,
        components: [firstWay[1], secondWay[1]],
        remainingComponents: [
          firstWay[1],
          secondWay[1],
        ],
        displayGlyph: "製",
        displayMode: "compound" as const,
      },
      {
        uid: 3,
        symbolId: firstWay[2],
        source: "answer" as const,
      },
      {
        uid: 4,
        symbolId: firstWay[3],
        source: "answer" as const,
      },
      {
        uid: 5,
        symbolId: secondWay[2],
        source: "answer" as const,
      },
      {
        uid: 6,
        symbolId: secondWay[3],
        source: "answer" as const,
      },
    ];
    trial.state.phase = "boss";
    trial.state.questionInStage = 9;
    trial.state.boss = {
      cards: initialCards.map((card) => ({
        ...card,
        ...(card.components
          ? { remainingComponents: [...card.components] }
          : {}),
      })),
      initialCards: initialCards.map((card) => ({
        ...card,
        ...(card.components
          ? { remainingComponents: [...card.components] }
          : {}),
      })),
      expectedAnswers: [firstAnswer, secondAnswer],
      expectedDisplayChars: [firstAnswer, secondAnswer],
      expectedPinyin: ["", ""],
      expectedWays: [firstWay, secondWay],
      displayWays: [firstWay, secondWay],
      expandedComponents: [],
      pendingAnswers: [],
      pendingSubmissions: [],
      pendingAnswer: "",
      pendingCardIds: [],
      consumedCardIds: [],
      submissionCount: 0,
    };
    trial.state.timeLimit = 90;
    trial.state.remaining = 90;

    trial.setDraft(firstAnswer);
    trial.submit();
    expect(trial.state.feedback).toBe("partial");
    expect(
      trial.state.boss?.cards.filter(
        (card) => card.displayMode === "compound",
      ),
    ).toHaveLength(2);
    expect(trial.state.boss?.consumedCardIds).toEqual([3, 4]);

    trial.undoBossAnswer();
    expect(trial.state.boss?.cards).toHaveLength(6);
    expect(trial.state.boss?.consumedCardIds).toEqual([]);
    trial.setDraft(firstAnswer);
    trial.submit();
    trial.setDraft(secondAnswer);
    trial.submit();
    expect(trial.state.feedback).toBe("correct");
    expect(
      trial.state.boss?.pendingSubmissions,
    ).toHaveLength(2);
  });

  it("accepts a valid prefabricated boss answer before requiring a solvable remainder", () => {
    vi.useFakeTimers();
    const gameData = createMingBossData();
    const trial = new TrialSession(
      gameData,
      settings,
      () => {},
      seededRandom(41),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("prefabrication");
    trial.state.phase = "boss";
    trial.state.questionInStage = 9;
    trial.state.boss = {
      cards: [
        {
          uid: 1,
          symbolId: 153,
          source: "answer",
          components: [153, 104],
          remainingComponents: [153, 104],
          displayGlyph: "芕",
          displayMode: "compound",
        },
        {
          uid: 2,
          symbolId: 55,
          source: "answer",
        },
        {
          uid: 3,
          symbolId: 34,
          source: "answer",
        },
        {
          uid: 4,
          symbolId: 57,
          source: "answer",
        },
        {
          uid: 5,
          symbolId: 90,
          source: "answer",
          components: [90, 148],
          remainingComponents: [90, 148],
          displayGlyph: "㕶",
          displayMode: "compound",
        },
        {
          uid: 6,
          symbolId: 155,
          source: "answer",
        },
      ],
      initialCards: [],
      expectedAnswers: ["苑", "龉"],
      expectedDisplayChars: ["苑", "龉"],
      expectedPinyin: ["", ""],
      expectedWays: [
        [153, 104, 55],
        [34, 57, 90, 148, 155],
      ],
      displayWays: [
        [153, 104, 55],
        [34, 57, 90, 148, 155],
      ],
      expandedComponents: [],
      pendingAnswers: [],
      pendingSubmissions: [],
      pendingAnswer: "",
      pendingCardIds: [],
      consumedCardIds: [],
      submissionCount: 0,
    };
    trial.state.boss.initialCards =
      trial.state.boss.cards.map((card) => ({
        ...card,
        ...(card.components
          ? { remainingComponents: [...card.components] }
          : {}),
      }));
    trial.state.timeLimit = 90;
    trial.state.remaining = 90;

    trial.setDraft("茗");
    trial.submit();

    expect(trial.state.feedback).toBe("partial");
    expect(trial.state.boss?.pendingAnswers).toEqual(["茗"]);
    expect(
      trial.state.boss?.pendingSubmissions[0].componentUses,
    ).toEqual(
      expect.arrayContaining([
        { cardUid: 1, symbolId: 153 },
        { cardUid: 1, symbolId: 104 },
        { cardUid: 5, symbolId: 90 },
      ]),
    );

    trial.setDraft("仓");
    trial.submit();
    expect(trial.state.feedback).toBe("wrong");
    expect(trial.state.phase).toBe("boss");
    expect(trial.state.boss?.pendingAnswers).toEqual([
      "茗",
      "仓",
    ]);
    expect(
      trial.state.boss?.cards.flatMap(
        (card) =>
          card.remainingComponents ??
          card.components ??
          [card.symbolId],
      ),
    ).toEqual([57, 148, 155]);

    trial.undoBossAnswer();
    expect(trial.state.boss?.pendingAnswers).toEqual([
      "茗",
    ]);
  });

  it("records both internal parts when one prefabricated card is fully consumed", () => {
    vi.useFakeTimers();
    const gameData = createMingBossData();
    const trial = new TrialSession(
      gameData,
      settings,
      () => {},
      seededRandom(44),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("prefabrication");
    trial.state.phase = "boss";
    trial.state.questionInStage = 9;
    const cards = [
      {
        uid: 1,
        symbolId: 153,
        source: "answer" as const,
        components: [153, 104],
        remainingComponents: [153, 104],
        displayGlyph: "芕",
        displayMode: "compound" as const,
      },
    ];
    trial.state.boss = {
      cards: cards.map((card) => ({
        ...card,
        remainingComponents: [...card.remainingComponents],
      })),
      initialCards: cards.map((card) => ({
        ...card,
        remainingComponents: [...card.remainingComponents],
      })),
      expectedAnswers: ["茗", "龉"],
      expectedDisplayChars: ["茗", "龉"],
      expectedPinyin: ["", ""],
      expectedWays: [
        [153, 104, 90],
        [34, 57, 90, 148, 155],
      ],
      displayWays: [
        [153, 104, 90],
        [34, 57, 90, 148, 155],
      ],
      expandedComponents: [],
      pendingAnswers: [],
      pendingSubmissions: [],
      pendingAnswer: "",
      pendingCardIds: [],
      consumedCardIds: [],
      submissionCount: 0,
    };
    trial.state.timeLimit = 90;
    trial.state.remaining = 90;

    trial.setDraft("芕");
    trial.submit();

    expect(trial.state.feedback).toBe("partial");
    expect(
      trial.state.boss?.pendingSubmissions[0].cardIds,
    ).toEqual([1]);
    expect(
      trial.state.boss?.pendingSubmissions[0].componentUses,
    ).toEqual([
      { cardUid: 1, symbolId: 153 },
      { cardUid: 1, symbolId: 104 },
    ]);
  });

  it("applies the no-lookahead boss submission flow to regular rules", () => {
    vi.useFakeTimers();
    const gameData = createMingBossData();
    const trial = new TrialSession(
      gameData,
      settings,
      () => {},
      seededRandom(42),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("unrestricted");
    trial.state.phase = "boss";
    trial.state.questionInStage = 9;
    trial.state.boss = {
      cards: [
        { uid: 1, symbolId: 153, source: "answer" },
        { uid: 2, symbolId: 104, source: "answer" },
        { uid: 3, symbolId: 90, source: "answer" },
        { uid: 4, symbolId: 55, source: "answer" },
        { uid: 5, symbolId: 34, source: "answer" },
        { uid: 6, symbolId: 57, source: "answer" },
      ],
      initialCards: [],
      expectedAnswers: ["苑", "龉"],
      expectedDisplayChars: ["苑", "龉"],
      expectedPinyin: ["", ""],
      expectedWays: [
        [153, 104, 55],
        [34, 57, 90, 148, 155],
      ],
      displayWays: [
        [153, 104, 55],
        [34, 57, 90, 148, 155],
      ],
      expandedComponents: [],
      pendingAnswers: [],
      pendingSubmissions: [],
      pendingAnswer: "",
      pendingCardIds: [],
      consumedCardIds: [],
      submissionCount: 0,
    };
    trial.state.boss.initialCards =
      trial.state.boss.cards.map((card) => ({ ...card }));
    trial.state.timeLimit = 90;
    trial.state.remaining = 90;

    trial.setDraft("茗");
    trial.submit();
    expect(trial.state.feedback).toBe("partial");

    trial.setDraft("仓");
    trial.submit();
    expect(trial.state.feedback).toBe("wrong");
    expect(trial.state.phase).toBe("boss");
    expect(trial.state.boss?.pendingAnswers).toEqual([
      "茗",
      "仓",
    ]);
    expect(trial.state.boss?.cards).toEqual([
      expect.objectContaining({ uid: 6, symbolId: 57 }),
    ]);
  });

  it("accepts composition aliases through compatibility for the same four-card bag", () => {
    vi.useFakeTimers();
    const { data, composition } =
      createCompositionFixture();
    const trial = new TrialSession(
      data,
      settings,
      () => {},
      seededRandom(60),
      false,
      () => {},
      null,
      trialRulesData,
      null,
      null,
      null,
      composition,
    );
    trial.setRuleOverride("composition");
    trial.setWordAnswerData(createWordAnswerData());
    const helpers = trial as unknown as {
      compositionCards: (recipe: number[][]) => TrialCard[];
      compositionAcceptedWords: (
        cards: TrialCard[],
        lengths: number[],
      ) => string[];
      pickCompositionNormalChoice: () => {
        composition: {
          word: string;
          recipes: number[][][];
          acceptedWords: string[];
        };
      };
      questionFor: (choice: unknown) => TrialQuestionState;
    };
    const choice = helpers.pickCompositionNormalChoice();
    const acceptedWords = choice.composition.acceptedWords;

    expect(acceptedWords).toEqual(
      expect.arrayContaining([
        "上台",
        "台上",
        "问台",
        "止丁",
      ]),
    );

    const question = helpers.questionFor(choice);
    trial.state.phase = "playing";
    trial.state.ruleId = "composition";
    trial.state.questionInStage = 1;
    trial.state.current = question;
    trial.state.timeLimit = 30;
    trial.state.remaining = 30;
    trial.setDraft("问台");
    trial.submit();

    expect(trial.state.feedback).toBe("correct");
    expect(trial.state.history[0].answer).toBe("问台");
    expect(trial.state.history[0].meta).toBe("2字词");
  });

  it("collapses only cross-character repeats for assonance and accepts inferred aliases", () => {
    vi.useFakeTimers();
    const { data, assonance } =
      createAssonanceFixture();
    const trial = new TrialSession(
      data,
      settings,
      () => {},
      seededRandom(62),
      false,
      () => {},
      null,
      trialRulesData,
      null,
      null,
      null,
      null,
      assonance,
    );
    trial.setRuleOverride("assonance");
    trial.setWordAnswerData(createWordAnswerData());
    const helpers = trial as unknown as {
      pickAssonanceNormalChoice: () => unknown;
      questionFor: (choice: unknown) => TrialQuestionState;
      assonanceCards: (recipe: number[][]) => TrialCard[];
    };
    const choice = helpers.pickAssonanceNormalChoice();
    const question = helpers.questionFor(choice);

    expect(question.accepted).toEqual(
      expect.arrayContaining(["上台", "止丁"]),
    );
    expect(
      question.displayCards.filter(
        (card) => card.displayMode === "quantity",
      ),
    ).toHaveLength(1);
    expect(question.displayCards).toHaveLength(4);

    const sameCharacterRepeat = helpers.assonanceCards([
      [5, 5],
      [2, 3],
    ]);
    expect(
      sameCharacterRepeat.filter(
        (card) => card.displayMode === "quantity",
      ),
    ).toHaveLength(0);
    expect(
      sameCharacterRepeat.filter(
        (card) => card.symbolId === 5,
      ),
    ).toHaveLength(2);

    trial.state.phase = "playing";
    trial.state.ruleId = "assonance";
    trial.state.questionInStage = 1;
    trial.state.current = question;
    trial.state.timeLimit = 30;
    trial.state.remaining = 30;
    trial.setDraft("止丁");
    trial.submit();
    expect(trial.state.feedback).toBe("correct");
  });

  it("builds assonance bosses with at least two hidden repetition cards", () => {
    vi.useFakeTimers();
    const { data, assonance } =
      createAssonanceFixture();
    const trial = new TrialSession(
      data,
      settings,
      () => {},
      seededRandom(63),
      false,
      () => {},
      null,
      trialRulesData,
      null,
      null,
      null,
      null,
      assonance,
    );
    trial.setRuleOverride("assonance");
    const helpers = trial as unknown as {
      startAssonanceBoss: (
        rule: TrialRulesData["rules"][string],
      ) => void;
    };
    helpers.startAssonanceBoss(
      trialRulesData.rules.assonance,
    );

    expect(trial.state.boss?.initialCards).toHaveLength(6);
    expect(
      trial.state.boss?.initialCards.filter(
        (card) => card.displayMode === "quantity",
      ),
    ).toHaveLength(3);
    expect(trial.state.boss?.acceptedWords).toContain(
      "甲乙丙",
    );

    trial.setDraft("甲乙丙");
    trial.submit();
    expect(trial.state.feedback).toBe("correct");
  });

  it("removes cross-character repetition cards and colors dissonance groups", () => {
    vi.useFakeTimers();
    const { data, assonance } =
      createAssonanceFixture();
    const trial = new TrialSession(
      data,
      settings,
      () => {},
      seededRandom(64),
      false,
      () => {},
      null,
      trialRulesData,
      null,
      null,
      null,
      null,
      assonance,
    );
    trial.setRuleOverride("dissonance");
    trial.setWordAnswerData(createWordAnswerData());
    const helpers = trial as unknown as {
      pickDissonanceNormalChoice: () => unknown;
      questionFor: (choice: unknown) => TrialQuestionState;
      dissonanceCards: (recipe: number[][]) => TrialCard[];
      dissonanceAcceptedWords: (
        cards: TrialCard[],
        lengths: number[],
      ) => string[];
      startDissonanceBoss: (
        rule: TrialRulesData["rules"][string],
      ) => void;
    };
    const question = helpers.questionFor(
      helpers.pickDissonanceNormalChoice(),
    );

    expect(
      question.displayCards.map((card) => ({
        symbolId: card.symbolId,
        groupColor: card.groupColor,
        displayMode: card.displayMode,
      })),
    ).toEqual(
      expect.arrayContaining([
        { symbolId: 2, groupColor: 0, displayMode: undefined },
        { symbolId: 4, groupColor: 0, displayMode: undefined },
        { symbolId: 3, groupColor: 1, displayMode: undefined },
      ]),
    );
    expect(
      question.displayCards.map((card) => card.groupColor),
    ).toEqual([0, 0, 1]);
    expect(question.accepted).toEqual(["上台"]);
    const acceptedNormalWords =
      helpers.dissonanceAcceptedWords(
        question.displayCards,
        [2],
      );
    expect(acceptedNormalWords).toContain("上台");
    expect(acceptedNormalWords).not.toContain("台上");

    const eliminatedGroupCards =
      helpers.dissonanceCards([
        [1, 1, 2, 4],
        [2, 1],
      ]);
    expect(eliminatedGroupCards).toEqual([
      expect.objectContaining({
        symbolId: 4,
        groupColor: 0,
      }),
    ]);
    const acceptedEliminatedWords =
      helpers.dissonanceAcceptedWords(
        eliminatedGroupCards,
        [2],
      );
    expect(acceptedEliminatedWords).toContain("甲丁");
    expect(acceptedEliminatedWords).not.toContain("止丁");

    trial.state.phase = "playing";
    trial.state.ruleId = "dissonance";
    trial.state.questionInStage = 1;
    trial.state.current = question;
    trial.state.timeLimit = 30;
    trial.state.remaining = 30;
    trial.setDraft("卜也");
    trial.submit();
    expect(trial.state.feedback).toBe("correct");

    const bossTrial = new TrialSession(
      data,
      settings,
      () => {},
      seededRandom(65),
      false,
      () => {},
      null,
      trialRulesData,
      null,
      null,
      null,
      null,
      assonance,
    );
    bossTrial.setRuleOverride("dissonance");
    bossTrial.setWordAnswerData(createWordAnswerData());
    const bossHelpers = bossTrial as unknown as {
      startDissonanceBoss: (
        rule: TrialRulesData["rules"][string],
      ) => void;
    };
    bossHelpers.startDissonanceBoss(
      trialRulesData.rules.dissonance,
    );
    expect(
      new Set(
        bossTrial.state.boss?.initialCards.map(
          (card) => card.groupColor,
        ),
      ).size,
    ).toBe(3);
    expect(
      bossTrial.state.boss?.initialCards.map(
        (card) => card.groupColor,
      ),
    ).toEqual([0, 1, 2]);
    expect(bossTrial.state.boss?.acceptedWords).toContain(
      "子丑寅",
    );
    bossTrial.setDraft("甲乙丙");
    bossTrial.submit();
    expect(bossTrial.state.feedback).toBe("correct");
  });

  it("accepts an unambiguous composition word through incremental BOSS submission", () => {
    vi.useFakeTimers();
    const { data, composition } =
      createCompositionFixture();
    const trial = new TrialSession(
      data,
      settings,
      () => {},
      seededRandom(61),
      false,
      () => {},
      null,
      trialRulesData,
      null,
      null,
      null,
      composition,
    );
    trial.setRuleOverride("composition");
    const helpers = trial as unknown as {
      compositionCards: (recipe: number[][]) => TrialCard[];
      compositionAcceptedWords: (
        cards: TrialCard[],
        lengths: number[],
      ) => string[];
    };
    const recipe = composition.boss[0].recipes[0];
    const cards = helpers.compositionCards(recipe);
    const acceptedWords = helpers.compositionAcceptedWords(
      cards,
      [3, 4],
    );
    expect(acceptedWords).toEqual(
      expect.arrayContaining(["计算机", "机算计"]),
    );

    trial.state.phase = "boss";
    trial.state.questionInStage = 9;
    trial.state.boss = {
      cards: cards.map((card) => ({ ...card })),
      initialCards: cards.map((card) => ({ ...card })),
      expectedAnswers: ["计", "算", "机"],
      expectedDisplayChars: ["计", "算", "机"],
      expectedPinyin: ["", "", ""],
      expectedWays: recipe.map((way) => [...way]),
      displayWays: recipe.map((way) => [...way]),
      expandedComponents: [],
      acceptedWords,
      pendingAnswers: [],
      pendingSubmissions: [],
      pendingAnswer: "",
      pendingCardIds: [],
      consumedCardIds: [],
      submissionCount: 0,
    };
    trial.state.timeLimit = 90;
    trial.state.remaining = 90;

    trial.setDraft("计");
    trial.submit();
    expect(trial.state.feedback).toBe("partial");

    trial.setDraft("算机");
    trial.submit();
    expect(trial.state.feedback).toBe("correct");
    expect(trial.state.boss?.pendingAnswer).toBe(
      "计算机",
    );
    expect(
      trial.state.history[0].answerDetails.map(
        (detail) => detail.char,
      ),
    ).toEqual(["计", "算", "机"]);
  });

  it("accepts every normal repetend consumption above one and records the submitted multiplier", () => {
    const data = createRepetendData();
    const trial = new TrialSession(
      data,
      settings,
      () => {},
      seededRandom(54),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("repetend");
    const helpers = trial as unknown as {
      questionFor: (choice: unknown) => TrialQuestionState;
      recordNormal: (
        ok: boolean,
        answer?: string,
        given?: string,
      ) => void;
    };
    const question = helpers.questionFor({
      char: "器",
      ways: [[8, 2, 2, 2, 2]],
      repetend: true,
    });

    expect(question.accepted).toEqual(
      expect.arrayContaining(["哭", "器"]),
    );
    expect(question.accepted).not.toContain("吠");
    expect(question.repetendUses?.哭).toEqual([8, 2, 2]);

    trial.state.phase = "playing";
    trial.state.ruleId = "repetend";
    trial.state.questionInStage = 1;
    trial.state.current = question;
    helpers.recordNormal(true, "哭", "哭");

    const reviewCards =
      trial.state.history[0].answerDetails[0].displayCards;
    expect(
      reviewCards.find(
        (card) => card.displayMode === "quantity",
      ),
    ).toEqual(
      expect.objectContaining({
        symbolId: 2,
        quantity: 2,
        remainingQuantity: 2,
      }),
    );
    expect(
      trial.state.history[0].answerDetails[0].answerWay,
    ).toEqual([8, 2, 2]);
  });

  it("collapses repeated components and shares a quantity card across a repetend boss", () => {
    vi.useFakeTimers();
    const data = createRepetendData();
    const trial = new TrialSession(
      data,
      settings,
      () => {},
      seededRandom(54),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("repetend");
    const helpers = trial as unknown as {
      repetendWayAllowed: (way: number[]) => boolean;
      repetendNormalWeight: (way: number[]) => number;
      repetendBossWaysAllowed: (ways: number[][]) => boolean;
      pickRepetendBossWays: (
        choices: Array<{ char: string; ways: number[][] }>,
      ) => number[][] | null;
      cardsWithRepetition: (
        components: number[],
      ) => TrialCard[];
      assignBossAnswers: (answers: string[]) =>
        | {
            remainingCards: TrialCard[];
            submissions: Array<{
              answer: string;
              cardIds: number[];
              componentUses: Array<{
                cardUid: number;
                symbolId: number;
              }>;
            }>;
          }
        | null;
    };

    expect(helpers.repetendWayAllowed([1, 1, 1])).toBe(
      false,
    );
    expect(
      helpers.repetendWayAllowed([1, 1, 1, 2, 2, 3]),
    ).toBe(true);
    expect(helpers.repetendNormalWeight([1, 1, 2])).toBe(
      0.2,
    );
    expect(
      helpers.repetendNormalWeight([1, 1, 2, 3]),
    ).toBe(1);
    expect(
      helpers.repetendBossWaysAllowed([
        [1, 1, 2, 3],
        [4, 4, 5, 6, 7],
      ]),
    ).toBe(false);
    expect(
      helpers.repetendBossWaysAllowed([
        [1, 1, 2, 3, 4],
        [1, 5, 5, 6, 7],
      ]),
    ).toBe(true);
    expect(
      helpers.repetendBossWaysAllowed([
        [1, 2, 3, 6],
        [1, 2, 4, 5, 7],
      ]),
    ).toBe(true);
    expect(
      helpers.repetendBossWaysAllowed([
        [1, 2, 3, 4, 5, 6],
        [1, 2, 7, 8, 9],
      ]),
    ).toBe(false);
    expect(
      helpers.pickRepetendBossWays([
        { char: "甲", ways: [[1, 2, 3, 6]] },
        { char: "乙", ways: [[1, 2, 4, 5, 7]] },
      ]),
    ).toEqual([
      [1, 2, 3, 6],
      [1, 2, 4, 5, 7],
    ]);

    const cards = helpers.cardsWithRepetition([
      1, 1, 2, 3, 4, 1, 5, 5, 6, 7,
    ]);
    expect(cards).toHaveLength(7);
    expect(
      cards.filter(
        (card) => card.displayMode === "quantity",
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          symbolId: 1,
          quantity: 3,
        }),
        expect.objectContaining({
          symbolId: 5,
          quantity: 2,
        }),
      ]),
    );

    trial.state.phase = "boss";
    trial.state.questionInStage = 9;
    trial.state.boss = {
      cards: cards.map((card) => ({ ...card })),
      initialCards: cards.map((card) => ({ ...card })),
      expectedAnswers: ["甲", "乙"],
      expectedDisplayChars: ["甲", "乙"],
      expectedPinyin: ["", ""],
      expectedWays: [
        [1, 1, 2, 3, 4],
        [1, 5, 5, 6, 7],
      ],
      displayWays: [
        [1, 1, 2, 3, 4],
        [1, 5, 5, 6, 7],
      ],
      expandedComponents: [],
      pendingAnswers: [],
      pendingSubmissions: [],
      pendingAnswer: "",
      pendingCardIds: [],
      consumedCardIds: [],
      submissionCount: 0,
    };
    trial.state.timeLimit = 90;
    trial.state.remaining = 90;

    trial.setDraft("甲");
    trial.submit();

    expect(trial.state.feedback).toBe("partial");
    expect(
      trial.state.boss?.cards.find(
        (card) =>
          card.displayMode === "quantity" &&
          card.symbolId === 1,
      )?.remainingQuantity,
    ).toBe(1);

    trial.setDraft("乙");
    trial.submit();

    expect(trial.state.feedback).toBe("correct");
    expect(trial.state.boss?.pendingAnswers).toEqual([
      "甲",
      "乙",
    ]);
    expect(
      trial.state.history[0].answerDetails.map(
        (detail) => detail.char,
      ),
    ).toEqual(["甲", "乙"]);
  });

  it("builds Gestalt clues from pool pairs and rejects unsafe boss partitions", () => {
    const { data, gestalt } = createGestaltFixture();
    const trial = new TrialSession(
      data,
      settings,
      () => {},
      seededRandom(56),
      false,
      () => {},
      null,
      trialRulesData,
      null,
      null,
      gestalt,
    );
    trial.setRuleOverride("gestalt");
    const helpers = trial as unknown as {
      pickGestaltNormalChoice: () => {
        gestaltPair?: { components: [number, number]; answers: Array<{ char: string }> };
      };
      questionFor: (choice: unknown) => {
        displayCards: TrialCard[];
        accepted: string[];
      };
      gestaltBossPairingIsAllowed: (
        first: GestaltData["pairs"][number],
        second: GestaltData["pairs"][number],
      ) => boolean;
    };
    const choice = helpers.pickGestaltNormalChoice();
    const question = helpers.questionFor(choice);
    expect(
      question.displayCards.map((card) => card.symbolId).sort(),
    ).toEqual([...choice.gestaltPair!.components].sort());
    expect(question.accepted.sort()).toEqual(
      choice.gestaltPair!.answers
        .map((answer) => answer.char)
        .sort(),
    );
    expect(
      helpers.gestaltBossPairingIsAllowed(
        gestalt.pairs[0],
        gestalt.pairs[1],
      ),
    ).toBe(false);
  });

  it("accepts any Gestalt answer represented by each boss clue pair", () => {
    vi.useFakeTimers();
    const { data, gestalt } = createGestaltFixture();
    const trial = new TrialSession(
      data,
      settings,
      () => {},
      seededRandom(57),
      false,
      () => {},
      null,
      trialRulesData,
      null,
      null,
      gestalt,
    );
    trial.setRuleOverride("gestalt");
    trial.state.phase = "boss";
    trial.state.questionInStage = 9;
    const cards = [
      { uid: 1, symbolId: 1, source: "answer" as const },
      { uid: 2, symbolId: 2, source: "answer" as const },
      { uid: 3, symbolId: 3, source: "answer" as const },
      { uid: 4, symbolId: 4, source: "answer" as const },
    ];
    trial.state.boss = {
      cards: cards.map((card) => ({ ...card })),
      initialCards: cards.map((card) => ({ ...card })),
      expectedAnswers: ["杏", "乐"],
      expectedDisplayChars: ["杏", "乐"],
      expectedPinyin: ["", ""],
      expectedWays: [
        [1, 2],
        [3, 4],
      ],
      displayWays: [
        [1, 2],
        [3, 4],
      ],
      expandedComponents: [],
      gestaltGroups: [
        { cardIds: [1, 2], answers: ["杏"] },
        { cardIds: [3, 4], answers: ["乐"] },
      ],
      pendingAnswers: [],
      pendingSubmissions: [],
      pendingAnswer: "",
      pendingCardIds: [],
      consumedCardIds: [],
      submissionCount: 0,
    };
    trial.state.timeLimit = 90;
    trial.state.remaining = 90;

    trial.setDraft("乐杏");
    trial.submit();

    expect(trial.state.feedback).toBe("correct");
    expect(trial.state.boss?.pendingAnswers).toEqual([
      "乐",
      "杏",
    ]);
    expect(
      trial.state.history[0].answerDetails.map(
        (detail) => detail.char,
      ),
    ).toEqual(["乐", "杏"]);
  });

  it("accepts compatibility-only Gestalt answers without adding them to the generated pool", () => {
    const { data, gestalt } =
      createGestaltCompatibilityFixture();
    const trial = new TrialSession(
      data,
      settings,
      () => {},
      seededRandom(58),
      false,
      () => {},
      null,
      trialRulesData,
      null,
      null,
      gestalt,
    );
    trial.setRuleOverride("gestalt");
    const helpers = trial as unknown as {
      questionFor: (choice: unknown) => {
        accepted: string[];
      };
    };
    const pair = gestalt.pairs[0];
    const question = helpers.questionFor({
      char: "圄",
      ways: [[1, 2, 3]],
      gestaltPair: pair,
    });

    expect(pair.answers.map((answer) => answer.char)).toEqual([
      "圄",
    ]);
    expect(question.accepted.sort()).toEqual(["圄", "晤"]);
  });

  it("assigns a compatibility-only answer to its Gestalt boss clue pair", () => {
    vi.useFakeTimers();
    const { data, gestalt } =
      createGestaltCompatibilityFixture();
    const trial = new TrialSession(
      data,
      settings,
      () => {},
      seededRandom(59),
      false,
      () => {},
      null,
      trialRulesData,
      null,
      null,
      gestalt,
    );
    trial.setRuleOverride("gestalt");
    trial.state.phase = "boss";
    trial.state.questionInStage = 9;
    const cards = [
      { uid: 1, symbolId: 1, source: "answer" as const },
      { uid: 2, symbolId: 2, source: "answer" as const },
      { uid: 3, symbolId: 6, source: "answer" as const },
      { uid: 4, symbolId: 7, source: "answer" as const },
    ];
    trial.state.boss = {
      cards: cards.map((card) => ({ ...card })),
      initialCards: cards.map((card) => ({ ...card })),
      expectedAnswers: ["圄", "杏"],
      expectedDisplayChars: ["圄", "杏"],
      expectedPinyin: ["", ""],
      expectedWays: [
        [1, 2, 3],
        [6, 7],
      ],
      displayWays: [
        [1, 2],
        [6, 7],
      ],
      expandedComponents: [],
      gestaltGroups: [
        { cardIds: [1, 2], answers: ["圄"] },
        { cardIds: [3, 4], answers: ["杏"] },
      ],
      pendingAnswers: [],
      pendingSubmissions: [],
      pendingAnswer: "",
      pendingCardIds: [],
      consumedCardIds: [],
      submissionCount: 0,
    };
    trial.state.timeLimit = 90;
    trial.state.remaining = 90;

    trial.setDraft("晤");
    trial.submit();
    expect(trial.state.feedback).toBe("partial");

    trial.setDraft("杏");
    trial.submit();
    expect(trial.state.feedback).toBe("correct");
    expect(trial.state.boss?.pendingAnswers).toEqual([
      "晤",
      "杏",
    ]);
    expect(
      trial.state.history[0].answerDetails.map(
        (detail) => detail.char,
      ),
    ).toEqual(["晤", "杏"]);
  });

  it("keeps submitted BOSS answers first in the revealed result order", () => {
    vi.useFakeTimers();
    const gameData = createNuncupationData();
    const trial = new TrialSession(
      gameData,
      settings,
      () => {},
      seededRandom(53),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("unrestricted");
    trial.state.phase = "boss";
    trial.state.questionInStage = 9;
    const cards = [
      { uid: 1, symbolId: 1, source: "answer" as const },
      { uid: 2, symbolId: 3, source: "answer" as const },
      { uid: 3, symbolId: 3, source: "answer" as const },
      { uid: 4, symbolId: 4, source: "answer" as const },
    ];
    trial.state.boss = {
      cards: cards.map((card) => ({ ...card })),
      initialCards: cards.map((card) => ({ ...card })),
      expectedAnswers: ["行", "乐"],
      expectedDisplayChars: ["行", "乐"],
      expectedPinyin: ["", ""],
      expectedWays: [
        [1, 3],
        [3, 4],
      ],
      displayWays: [
        [1, 3],
        [3, 4],
      ],
      expandedComponents: [],
      pendingAnswers: [],
      pendingSubmissions: [],
      pendingAnswer: "",
      pendingCardIds: [],
      consumedCardIds: [],
      submissionCount: 0,
    };
    trial.state.timeLimit = 90;
    trial.state.remaining = 90;

    trial.setDraft("乐");
    trial.submit();
    expect(trial.state.feedback).toBe("partial");
    trial.surrender();

    expect(
      trial.state.history[0].answerDetails.map(
        (detail) => detail.char,
      ),
    ).toEqual(["乐", "行"]);
  });

  it("keeps global BOSS reveal completion while allowing Gestalt to show only submissions", () => {
    const boss = {
      expectedAnswers: ["甲", "乙"],
      pendingSubmissions: [
        {
          answer: "丙",
          cardIds: [1, 2],
          componentUses: [],
        },
        {
          answer: "丁",
          cardIds: [3, 4],
          componentUses: [],
        },
      ],
      revealAnswers: ["丙", "丁"],
    } as unknown as Parameters<
      typeof orderedBossAnswerChars
    >[0];

    expect(orderedBossAnswerChars(boss)).toEqual([
      "丙",
      "丁",
    ]);
    expect(orderedBossAnswerChars(boss, true)).toEqual([
      "丙",
      "丁",
    ]);
  });

  it("shares the Reschedule time pool across questions and the boss, caps it, and resets per stage", async () => {
    vi.useFakeTimers();
    const trial = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(30),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("reschedule");
    trial.beginStage();

    expect(trial.state.timeLimit).toBe(90);
    expect(trial.state.remaining).toBe(90);
    await vi.advanceTimersByTimeAsync(15_200);
    trial.setDraft(trial.state.current?.char ?? "");
    trial.submit();
    const carriedAfterFirst =
      trial.state.remaining;
    expect(carriedAfterFirst).toBeGreaterThanOrEqual(75);
    expect(carriedAfterFirst).toBeLessThan(90);

    await vi.advanceTimersByTimeAsync(900);
    expect(trial.state.questionInStage).toBe(2);
    expect(trial.state.remaining).toBe(
      carriedAfterFirst,
    );
    trial.setDraft(trial.state.current?.char ?? "");
    trial.submit();
    const carriedAfterSecond =
      trial.state.remaining;
    expect(carriedAfterSecond).toBe(
      Math.min(90, carriedAfterFirst + 5),
    );

    await vi.advanceTimersByTimeAsync(900);
    trial.setDraft(trial.state.current?.char ?? "");
    trial.submit();
    expect(trial.state.remaining).toBe(90);

    await vi.advanceTimersByTimeAsync(900);
    (
      trial as unknown as { startBoss: () => void }
    ).startBoss();
    expect(trial.state.timeLimit).toBe(90);
    expect(trial.state.remaining).toBe(90);
    trial.setDraft(
      trial.state.boss?.expectedAnswers.join("") ?? "",
    );
    trial.submit();
    await vi.advanceTimersByTimeAsync(1200);
    expect(trial.state.stage).toBe(2);
    expect(trial.state.phase).toBe("stage-intro");

    trial.setRuleOverride("reschedule");
    trial.beginStage();
    expect(trial.state.timeLimit).toBe(90);
    expect(trial.state.remaining).toBe(90);
  });

  it("deducts fifteen seconds instead of halving time when pausing Reschedule", () => {
    vi.useFakeTimers();
    const trial = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(31),
      true,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("reschedule");
    trial.beginStage();
    trial.togglePause();

    expect(trial.state.paused).toBe(true);
    expect(trial.state.remaining).toBe(75);
  });

  it("generates the Inspissation eight-question progression and ten-card boss", async () => {
    vi.useFakeTimers();
    const trial = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(32),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("inspissation");
    trial.beginStage();

    const plan = trial.state.partLengthPlan;
    expect(plan).toHaveLength(8);
    expect(plan[0]).toBe(2);
    expect([7, 8]).toContain(plan.at(-1));
    for (let index = 1; index < plan.length; index += 1) {
      const step = plan[index] - plan[index - 1];
      expect(step === 0 || step === 1).toBe(true);
    }
    const endpoint = plan.at(-1) ?? 0;
    expect(
      plan.slice(1).filter((length, index) => length > plan[index])
        .length,
    ).toBe(endpoint - 2);

    for (let index = 0; index < plan.length; index += 1) {
      expect(trial.state.current?.answerWay).toHaveLength(
        plan[index],
      );
      trial.setDraft(trial.state.current?.char ?? "");
      trial.submit();
      await vi.advanceTimersByTimeAsync(900);
    }

    expect(trial.state.phase).toBe("boss");
    expect(trial.state.boss?.initialCards).toHaveLength(10);
    expect(
      trial.state.boss?.expectedWays.reduce(
        (sum, way) => sum + way.length,
        0,
      ),
    ).toBe(10);
    expect(
      trial.state.boss?.expectedWays.every(
        (way) => way.length >= 2 && way.length <= 8,
      ),
    ).toBe(true);
    expect(
      new Set(trial.state.boss?.expectedAnswers).size,
    ).toBe(2);
  });

  it("shortens the Inspissation progression to seven questions at advancement zero", () => {
    const trial = new TrialSession(
      createData(),
      settingsAtAdvancement(0),
      () => {},
      seededRandom(32),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.setRuleOverride("inspissation");
    trial.beginStage();

    const plan = trial.state.partLengthPlan;
    expect(plan).toHaveLength(7);
    expect(plan[0]).toBe(2);
    expect([7, 8]).toContain(plan.at(-1));
    for (let index = 1; index < plan.length; index += 1) {
      const step = plan[index] - plan[index - 1];
      expect(step === 0 || step === 1).toBe(true);
    }
  });

  it("weights Inspissation paths toward part counts with larger pools", () => {
    vi.useFakeTimers();
    const data = createData({
      2: 2,
      3: 2,
      4: 2,
      5: 2,
      6: 2,
      7: 2,
      8: 40,
    });
    const endpoints = new Map<number, number>();
    for (let seed = 1; seed <= 160; seed += 1) {
      const trial = new TrialSession(
        data,
        settings,
        () => {},
        seededRandom(seed),
        false,
        () => {},
        null,
        trialRulesData,
      );
      trial.setRuleOverride("inspissation");
      trial.beginStage();
      const endpoint = trial.state.partLengthPlan.at(-1) ?? 0;
      endpoints.set(
        endpoint,
        (endpoints.get(endpoint) ?? 0) + 1,
      );
      trial.destroy();
    }
    expect(endpoints.get(8) ?? 0).toBeGreaterThan(
      endpoints.get(7) ?? 0,
    );
  });

  it("avoids recently used seven- and eight-part characters across runs", () => {
    vi.useFakeTimers();
    const stored = new Map<string, string>([
      ["zigsaw.trial.inspissation.recentLongChars", "[]"],
    ]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => {
        stored.set(key, value);
      },
    });
    const seen: string[] = [];
    for (let index = 0; index < 12; index += 1) {
      const trial = new TrialSession(
        createData(),
        settings,
        () => {},
        seededRandom(100 + index),
        false,
        () => {},
        null,
        trialRulesData,
      );
      trial.setRuleOverride("inspissation");
      trial.beginStage();
      const choice = (
        trial as unknown as {
          takeNormalChoice: (length: number) => {
            char: string;
          };
        }
      ).takeNormalChoice(8);
      seen.push(choice.char);
      trial.destroy();
    }
    expect(new Set(seen).size).toBe(12);
  });

  it("applies Presto to both normal and boss time limits", () => {
    vi.useFakeTimers();
    const trial = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(21),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.state.stage = 3;
    trial.setRuleOverride("presto");
    trial.beginStage();

    expect(trial.state.ruleId).toBe("presto");
    expect(trial.state.timeLimit).toBe(20);
    expect(trial.state.remaining).toBe(20);

    (
      trial as unknown as { startBoss: () => void }
    ).startBoss();
    expect(trial.state.timeLimit).toBe(60);
    expect(trial.state.remaining).toBe(60);
  });

  it("obscures one Myopia card after two active seconds and keeps it usable for the answer", async () => {
    vi.useFakeTimers();
    const events: TrialSessionEvent[] = [];
    const trial = new TrialSession(
      createData(),
      settings,
      (_state, event) => events.push(event),
      seededRandom(25),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.state.stage = 5;
    trial.setRuleOverride("myopia");
    trial.beginStage();
    const current = trial.state.current;

    expect(trial.state.ruleId).toBe("myopia");
    expect(
      current?.displayCards.filter(
        (card) => card.obscuredAtMs === 1500,
      ),
    ).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1400);
    expect(
      current?.displayCards.some((card) => card.obscured),
    ).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(
      current?.displayCards.filter((card) => card.obscured),
    ).toHaveLength(1);
    expect(events.at(-1)).toBe("obscure");

    trial.setDraft(current?.char ?? "");
    trial.submit();
    expect(trial.state.feedback).toBe("correct");

    const bossTrial = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(29),
      false,
      () => {},
      null,
      trialRulesData,
    );
    bossTrial.state.stage = 5;
    bossTrial.setRuleOverride("myopia");
    bossTrial.beginStage();
    (
      bossTrial as unknown as { startBoss: () => void }
    ).startBoss();
    expect(
      bossTrial.state.boss?.initialCards.filter(
        (card) => card.obscuredAtMs === 1500,
      ),
    ).toHaveLength(2);
  });

  it("freezes Myopia obscuration while paused and does not restore hidden cards", async () => {
    vi.useFakeTimers();
    const trial = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(26),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.state.stage = 5;
    trial.setRuleOverride("myopia");
    trial.beginStage();
    const cards = trial.state.current?.displayCards ?? [];

    await vi.advanceTimersByTimeAsync(1000);
    trial.togglePause();
    await vi.advanceTimersByTimeAsync(5000);
    expect(cards.some((card) => card.obscured)).toBe(false);

    trial.togglePause();
    await vi.advanceTimersByTimeAsync(1100);
    expect(cards.filter((card) => card.obscured)).toHaveLength(1);
    trial.togglePause();
    trial.togglePause();
    expect(cards.filter((card) => card.obscured)).toHaveLength(1);
  });

  it("applies Anopia to all normal and boss cards at their rule delays", async () => {
    vi.useFakeTimers();
    const normal = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(27),
      false,
      () => {},
      null,
      trialRulesData,
    );
    normal.state.stage = 7;
    normal.setRuleOverride("aphantasia");
    normal.beginStage();
    const normalCards = normal.state.current?.displayCards ?? [];
    expect(
      normalCards.every((card) => card.obscuredAtMs === 1500),
    ).toBe(true);
    await vi.advanceTimersByTimeAsync(1400);
    expect(normalCards.some((card) => card.obscured)).toBe(false);
    await vi.advanceTimersByTimeAsync(300);
    expect(normalCards.every((card) => card.obscured)).toBe(true);
    normal.destroy();

    const boss = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(28),
      false,
      () => {},
      null,
      trialRulesData,
    );
    boss.state.stage = 7;
    boss.setRuleOverride("aphantasia");
    boss.beginStage();
    (
      boss as unknown as { startBoss: () => void }
    ).startBoss();
    const bossCards = boss.state.boss?.initialCards ?? [];
    expect(
      bossCards.every((card) => card.obscuredAtMs === 6000),
    ).toBe(true);
    await vi.advanceTimersByTimeAsync(5900);
    expect(bossCards.some((card) => card.obscured)).toBe(false);
    await vi.advanceTimersByTimeAsync(300);
    expect(bossCards.every((card) => card.obscured)).toBe(true);
  });

  it("applies Minimalism to normal questions and its three-answer boss", () => {
    vi.useFakeTimers();
    const trial = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(22),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.state.stage = 4;
    trial.setRuleOverride("minimalism");
    trial.beginStage();

    expect(trial.state.ruleId).toBe("minimalism");
    expect(trial.state.timeLimit).toBe(15);
    expect([2, 3]).toContain(
      trial.state.current?.answerWay.length,
    );

    (
      trial as unknown as { startBoss: () => void }
    ).startBoss();
    expect(trial.state.timeLimit).toBe(45);
    expect(trial.state.boss?.expectedAnswers).toHaveLength(3);
    expect(trial.state.boss?.initialCards).toHaveLength(6);
    expect(
      trial.state.boss?.expectedWays.map((way) => way.length),
    ).toEqual([2, 2, 2]);
    trial.setDraft(
      trial.state.boss?.expectedAnswers.join("") ?? "",
    );
    trial.submit();
    expect(trial.state.feedback).toBe("correct");
    expect(trial.state.boss?.submissionCount).toBe(3);
    expect(
      trial.state.history[0].answerDetails.map(
        (detail) => detail.char,
      ),
    ).toEqual(trial.state.boss?.expectedAnswers);
  });

  it("applies Compages to normal questions and its ten-card boss", () => {
    vi.useFakeTimers();
    const trial = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(23),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.state.stage = 6;
    trial.setRuleOverride("compages");
    trial.beginStage();

    expect(trial.state.ruleId).toBe("compages");
    expect(trial.state.timeLimit).toBe(30);
    expect(
      trial.state.current?.answerWay.length,
    ).toBeGreaterThanOrEqual(5);

    (
      trial as unknown as { startBoss: () => void }
    ).startBoss();
    expect(trial.state.timeLimit).toBe(90);
    expect(trial.state.boss?.expectedAnswers).toHaveLength(2);
    expect(trial.state.boss?.initialCards).toHaveLength(10);
    expect(
      trial.state.boss?.expectedWays.map((way) => way.length),
    ).toEqual([5, 5]);
    trial.setDraft(
      trial.state.boss?.expectedAnswers.join("") ?? "",
    );
    trial.submit();
    expect(trial.state.feedback).toBe("correct");
    expect(
      trial.state.history[0].answerDetails.map(
        (detail) => detail.answerWay.length,
      ),
    ).toEqual([5, 5]);
  });

  it("accepts an alternative five-or-more-part Compages boss answer", () => {
    vi.useFakeTimers();
    const gameData = createData();
    const trial = new TrialSession(
      gameData,
      settings,
      () => {},
      seededRandom(35),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.state.stage = 6;
    trial.setRuleOverride("compages");
    trial.beginStage();
    (
      trial as unknown as { startBoss: () => void }
    ).startBoss();
    const boss = trial.state.boss!;
    const expected = new Set(boss.expectedAnswers);
    let alternative: string | null = null;
    for (let mask = 0; mask < 1 << boss.cards.length; mask += 1) {
      const selected = boss.cards.filter(
        (_, index) => (mask & (1 << index)) !== 0,
      );
      if (selected.length !== 6) {
        continue;
      }
      alternative =
        [...gameData.accepted(
          selected.map((card) => card.symbolId),
        )].find((char) => !expected.has(char)) ?? null;
      if (alternative) {
        break;
      }
    }
    expect(alternative).toBeTruthy();

    trial.setDraft(alternative!);
    trial.submit();
    expect(trial.state.feedback).toBe("partial");
    expect(trial.state.boss?.pendingAnswers).toEqual([
      alternative,
    ]);

    trial.undoBossAnswer();
    trial.setDraft(boss.expectedAnswers.join(""));
    trial.submit();
    expect(trial.state.feedback).toBe("correct");
  });

  it("supports partial submissions in a three-answer boss", () => {
    vi.useFakeTimers();
    const trial = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(24),
      false,
      () => {},
      null,
      trialRulesData,
    );
    trial.state.stage = 4;
    trial.setRuleOverride("minimalism");
    trial.beginStage();
    (
      trial as unknown as { startBoss: () => void }
    ).startBoss();
    const expected = trial.state.boss?.expectedAnswers ?? [];

    trial.setDraft(expected[0] ?? "");
    trial.submit();
    expect(trial.state.feedback).toBe("partial");
    expect(trial.state.boss?.pendingAnswers).toEqual([expected[0]]);
    expect(trial.state.boss?.pendingSubmissions).toHaveLength(1);
    expect(
      trial.state.boss?.pendingSubmissions[0].cardIds,
    ).toHaveLength(2);
    expect(trial.state.boss?.submissionCount).toBe(1);

    trial.setDraft(expected.slice(1).join(""));
    trial.submit();
    expect(trial.state.feedback).toBe("correct");
    expect(trial.state.boss?.pendingAnswers).toEqual(expected);
    expect(trial.state.boss?.submissionCount).toBe(3);
  });

  it("uses rule-specific part-count weighting", () => {
    const data = createData();
    const minimalismCounts = new Map<number, number>();
    const compagesCounts = new Map<number, number>();
    for (let seed = 1; seed <= 120; seed += 1) {
      const minimalism = new TrialSession(
        data,
        settings,
        () => {},
        seededRandom(seed),
        false,
        () => {},
        null,
        trialRulesData,
      );
      minimalism.state.stage = 4;
      minimalism.setRuleOverride("minimalism");
      minimalism.beginStage();
      const minimalismLength =
        minimalism.state.current?.answerWay.length ?? 0;
      minimalismCounts.set(
        minimalismLength,
        (minimalismCounts.get(minimalismLength) ?? 0) + 1,
      );
      minimalism.destroy();

      const compages = new TrialSession(
        data,
        settings,
        () => {},
        seededRandom(seed + 1000),
        false,
        () => {},
        null,
        trialRulesData,
      );
      compages.state.stage = 6;
      compages.setRuleOverride("compages");
      compages.beginStage();
      const compagesLength =
        compages.state.current?.answerWay.length ?? 0;
      compagesCounts.set(
        compagesLength,
        (compagesCounts.get(compagesLength) ?? 0) + 1,
      );
      compages.destroy();
    }
    const two = minimalismCounts.get(2) ?? 0;
    const three = minimalismCounts.get(3) ?? 0;
    expect(two).toBeGreaterThan(40);
    expect(three).toBeGreaterThan(40);
    expect(Math.abs(two - three)).toBeLessThan(30);

    const five = compagesCounts.get(5) ?? 0;
    const six = compagesCounts.get(6) ?? 0;
    expect(five).toBeGreaterThan(20);
    expect(six).toBeGreaterThan(20);
  });

  it("keeps canonical answers separate from displayed cards", () => {
    const trial = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(12),
    );
    trial.beginStage();
    const current = trial.state.current;

    expect(current?.answerWay.length).toBeGreaterThanOrEqual(2);
    expect(current?.displayCards).toHaveLength(
      current?.answerWay.length ?? 0,
    );
    expect(
      current?.displayCards.map((card) => card.symbolId).sort(),
    ).toEqual([...(current?.answerWay ?? [])].sort());
    expect(
      new Set(
        current?.displayCards.map((card) => card.uid),
      ).size,
    ).toBe(current?.displayCards.length);
    expect(
      current?.displayCards.every(
        (card) => card.source === "answer",
      ),
    ).toBe(true);
    expect(current?.accepted).toContain(current?.char);

    trial.surrender();
    expect(trial.state.history[0].answerWay).toEqual(
      current?.answerWay,
    );
    expect(trial.state.history[0].displayCards).toEqual(
      current?.displayCards,
    );
    expect(trial.state.history[0].answerDetails).toHaveLength(1);
    expect(trial.state.history[0].answerDetails[0].char).toBe(
      current?.char,
    );
  });

  it("keeps 3 and 4 part questions dominant", () => {
    const probabilities = TRIAL_BASE_PART_PROBABILITIES;
    expect(probabilities.two).toBeCloseTo(0.15);
    expect(
      probabilities.three + probabilities.four,
    ).toBeCloseTo(0.65);
    expect(
      probabilities.two +
        probabilities.three +
        probabilities.four +
        probabilities.longer,
    ).toBeCloseTo(1);
  });

  it("generates a six-to-eight part two-character boss with two-to-six parts per answer", () => {
    vi.useFakeTimers();
    const bossLengths: number[] = [];
    const trial = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(2),
      false,
      (_char, way) => {
        bossLengths.push(way.length);
      },
    );
    trial.beginStage();
    bossLengths.length = 0;
    (
      trial as unknown as { startBoss: () => void }
    ).startBoss();

    expect(trial.state.phase).toBe("boss");
    expect(trial.state.remaining).toBe(TRIAL_BOSS_SECONDS);
    expect(trial.state.timeLimit).toBe(TRIAL_BOSS_SECONDS);
    expect(trial.state.boss?.initialCards.length).toBeGreaterThanOrEqual(
      TRIAL_BOSS_MIN_PARTS,
    );
    expect(trial.state.boss?.initialCards.length).toBeLessThanOrEqual(
      TRIAL_BOSS_MAX_PARTS,
    );
    expect(trial.state.boss?.submissionCount).toBe(0);
    const expected = trial.state.boss?.expectedAnswers ?? ["", ""];
    expect(expected[0]).not.toBe(expected[1]);
    expect(
      trial.state.boss?.expectedWays.map((way) => way.length),
    ).toEqual(bossLengths);
    expect(bossLengths).toHaveLength(2);
    for (const length of bossLengths) {
      expect(length).toBeGreaterThanOrEqual(
        TRIAL_BOSS_CHAR_MIN_PARTS,
      );
      expect(length).toBeLessThanOrEqual(
        TRIAL_BOSS_CHAR_MAX_PARTS,
      );
    }
    expect(bossLengths[0] + bossLengths[1]).toBeGreaterThanOrEqual(
      TRIAL_BOSS_MIN_PARTS,
    );
    expect(bossLengths[0] + bossLengths[1]).toBeLessThanOrEqual(
      TRIAL_BOSS_MAX_PARTS,
    );
  });

  it("can draw boss answers across the full two-to-six part range", () => {
    const data = createData();
    const seenLengths = new Set<number>();
    for (let seed = 1; seed <= 80; seed += 1) {
      const bossLengths: number[] = [];
      const trial = new TrialSession(
        data,
        settings,
        () => {},
        seededRandom(seed),
        false,
        (_char, way) => {
          bossLengths.push(way.length);
        },
      );
      trial.beginStage();
      bossLengths.length = 0;
      (
        trial as unknown as { startBoss: () => void }
      ).startBoss();
      bossLengths.forEach((length) => seenLengths.add(length));
      trial.destroy();
    }
    expect([...seenLengths].sort()).toEqual([2, 3, 4, 5, 6]);
  });

  it("reports rule-compatible normal and boss pools before a stage", () => {
    const trial = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(13),
    );
    const standard = trial.inspectPool();
    expect(standard.normal.sufficient).toBe(true);
    expect(standard.boss.sufficient).toBe(true);
    expect(standard.ready).toBe(true);
    expect(
      standard.normal.byLength.map((bucket) => bucket.length),
    ).toEqual([2, 3, 4, 5, 6, 7, 8]);

    const minimalismLike = trial.inspectPool({
      normalPartLengths: [2, 3],
      bossPartLengths: [2],
      bossAnswerCount: 3,
      bossTotalParts: [6, 6],
    });
    expect(minimalismLike.normal.sufficient).toBe(true);
    expect(minimalismLike.boss.lengthCombinations).toEqual([
      [2, 2, 2],
    ]);

    const independentRanges = trial.inspectPool({
      normalPartLengths: [2, 3],
      bossPartLengths: [4],
      bossAnswerCount: 1,
      bossTotalParts: [4, 4],
    });
    expect(independentRanges.normal.byLength.map((bucket) => bucket.length)).toEqual([2, 3]);
    expect(independentRanges.boss.lengthCombinations).toEqual([[4]]);

    const impossible = trial.inspectPool({
      acceptWay: () => false,
    });
    expect(impossible.normal.sufficient).toBe(false);
    expect(impossible.boss.sufficient).toBe(false);
    expect(impossible.ready).toBe(false);
  });

  it("accepts a boss pair when submitted together", async () => {
    vi.useFakeTimers();
    const trial = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(3),
    );
    trial.beginStage();
    (
      trial as unknown as { startBoss: () => void }
    ).startBoss();
    const expected =
      trial.state.boss?.expectedAnswers.join("") ?? "";
    trial.setDraft(expected);
    trial.submit();

    expect(trial.state.feedback).toBe("correct");
    expect(trial.state.revealing).toBe(true);
    expect(trial.state.boss?.submissionCount).toBe(2);
    await vi.advanceTimersByTimeAsync(1200);
    expect(trial.state.phase).toBe("stage-intro");
    expect(trial.state.stage).toBe(2);
  });

  it("supports a partial boss answer and undo without consuming cards permanently", () => {
    vi.useFakeTimers();
    const trial = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(4),
    );
    trial.beginStage();
    (
      trial as unknown as { startBoss: () => void }
    ).startBoss();
    const initialCount =
      trial.state.boss?.initialCards.length ?? 0;
    const first =
      trial.state.boss?.expectedAnswers[0] ?? "";
    trial.setDraft(first);
    trial.submit();

    expect(trial.state.feedback).toBe("partial");
    expect(trial.state.boss?.pendingAnswer).toBe(first);
    expect(trial.state.boss?.submissionCount).toBe(1);
    expect(trial.state.boss?.cards.length).toBeLessThan(
      initialCount,
    );

    trial.undoBossAnswer();
    expect(trial.state.boss?.pendingAnswer).toBe("");
    expect(trial.state.boss?.cards).toHaveLength(initialCount);
    expect(trial.state.boss?.submissionCount).toBe(0);
  });

  it("counts only successful boss answers", () => {
    vi.useFakeTimers();
    const trial = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(8),
    );
    trial.beginStage();
    (
      trial as unknown as { startBoss: () => void }
    ).startBoss();

    trial.setDraft("错错");
    trial.submit();
    expect(trial.state.feedback).toBe("wrong");
    expect(trial.state.boss?.submissionCount).toBe(0);
    trial.setDraft("");
    trial.submit();
    expect(trial.state.boss?.submissionCount).toBe(0);
  });

  it("can finish a boss after two separate submissions", async () => {
    vi.useFakeTimers();
    const gameData = createData();
    const trial = new TrialSession(
      gameData,
      settings,
      () => {},
      seededRandom(6),
    );
    trial.beginStage();
    (
      trial as unknown as { startBoss: () => void }
    ).startBoss();
    const first =
      trial.state.boss?.expectedAnswers[0] ?? "";
    trial.setDraft(first);
    trial.submit();
    expect(trial.state.feedback).toBe("partial");

    const remaining = (
      trial.state.boss?.cards ?? []
    ).map((card) => card.symbolId);
    const second = [...gameData.accepted(remaining)].find(
      (char) => char !== first,
    );
    expect(second).toBeTruthy();
    trial.setDraft(second!);
    trial.submit();
    expect(trial.state.feedback).toBe("correct");
    await vi.advanceTimersByTimeAsync(1200);
    expect(trial.state.stage).toBe(2);
  });

  it("finishes the seventh stage as a completed trial", async () => {
    vi.useFakeTimers();
    const trial = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(7),
    );
    trial.state.stage = 7;
    trial.state.phase = "boss";
    (
      trial as unknown as { startBoss: () => void }
    ).startBoss();
    trial.setDraft(
      trial.state.boss?.expectedAnswers.join("") ?? "",
    );
    trial.submit();
    await vi.advanceTimersByTimeAsync(1200);

    expect(trial.state.phase).toBe("results");
    expect(trial.state.result?.cleared).toBe(true);
    expect(trial.state.result?.title).toBe("知我梦中");
    expect(trial.state.result?.crisEarned).toBe(180);
  });

  it("uses the ordinary-success title after a skip", async () => {
    vi.useFakeTimers();
    const trial = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(71),
    );
    trial.state.stage = 7;
    trial.beginStage();
    trial.skipQuestion();
    (
      trial as unknown as { startBoss: () => void }
    ).startBoss();
    trial.setDraft(
      trial.state.boss?.expectedAnswers.join("") ?? "",
    );
    trial.submit();
    await vi.advanceTimersByTimeAsync(1200);

    expect(trial.state.phase).toBe("results");
    expect(trial.state.result?.cleared).toBe(true);
    expect(trial.state.result?.title).toBe("雾径得津");
    expect(trial.state.result?.crisEarned).toBe(150);
  });

  it("reveals the missed answer before leaving on timeout", async () => {
    vi.useFakeTimers();
    const trial = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(5),
    );
    trial.beginStage();
    await vi.advanceTimersByTimeAsync(
      (TRIAL_NORMAL_SECONDS + 1) * 1000,
    );

    expect(trial.state.phase).toBe("playing");
    expect(trial.state.revealing).toBe(true);
    expect(trial.state.feedback).toBe("wrong");
    expect(trial.state.revealAnswer).toBe(
      trial.state.current?.char,
    );
    expect(trial.state.history).toHaveLength(1);
    expect(trial.state.history[0].ok).toBe(false);
    trial.settleAfterMiss();
    expect(trial.state.phase).toBe("results");
    expect(trial.state.result?.cleared).toBe(false);
    expect(trial.state.result?.title).toBe("覆鹿遗蕉");
  });

  it("continues with the next question after a timeout", async () => {
    vi.useFakeTimers();
    const trial = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(15),
    );
    trial.beginStage();
    await vi.advanceTimersByTimeAsync(
      (TRIAL_NORMAL_SECONDS + 1) * 1000,
    );
    trial.continueAfterMiss();

    expect(trial.state.phase).toBe("playing");
    expect(trial.state.revealing).toBe(false);
    expect(trial.state.questionInStage).toBe(2);
    expect(trial.state.remaining).toBe(TRIAL_NORMAL_SECONDS);
    expect(trial.state.history).toHaveLength(1);
    expect(trial.state.history[0].ok).toBe(false);
  });

  it("continues to the next stage after a missed boss", () => {
    const trial = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(16),
    );
    trial.beginStage();
    (
      trial as unknown as { startBoss: () => void }
    ).startBoss();
    trial.surrender();
    trial.continueAfterMiss();

    expect(trial.state.phase).toBe("stage-intro");
    expect(trial.state.stage).toBe(2);
    expect(trial.state.skipsRemaining).toBe(3);
  });

  it("can settle from a later stage intro", () => {
    const trial = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(17),
    );
    trial.state.stage = 2;
    trial.settleAtStageIntro();

    expect(trial.state.phase).toBe("results");
    expect(trial.state.result?.title).toBe("临歧何反");
    expect(trial.state.result?.cleared).toBe(false);
  });

  it("reveals the answer after aborted play", () => {
    vi.useFakeTimers();
    const trial = new TrialSession(
      createData(),
      settings,
      () => {},
      seededRandom(9),
    );
    trial.beginStage();
    const answer = trial.state.current?.char;
    trial.surrender();

    expect(trial.state.phase).toBe("playing");
    expect(trial.state.revealing).toBe(true);
    expect(trial.state.feedback).toBe("wrong");
    expect(trial.state.revealAnswer).toBe(answer);
    trial.settleAfterMiss();
    expect(trial.state.phase).toBe("results");
  });
});
