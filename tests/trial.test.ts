import { afterEach, describe, expect, it, vi } from "vitest";
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
  TrialSession,
  type TrialSessionEvent,
} from "../src/game/trial";
import {
  parseTrialRulesData,
  type TrialRulesData,
} from "../src/game/trial-rules";

const trialRulesData =
  trialRuleDataJson as unknown as TrialRulesData;

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
};

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

describe("trial session", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("parses v2 rule data with public and internal policy text", () => {
    const parsed = parseTrialRulesData(trialRuleDataJson);
    expect(parsed.version).toBe(2);
    expect(parsed.rules.tetrarchy.description.public).toContain(
      "四部件",
    );
    expect(parsed.rules.tetrarchy.description.internal).toContain(
      "8 张卡",
    );
    expect(parsed.rules.tetrarchy.policy.answer.boss.distinct).toBe(
      true,
    );
    expect(parsed.rules.unrestricted.english).toBe("Unbound");
    expect(parsed.rules.inspissation.name).toBe("拾级");
    expect(parsed.rules.inspissation.english).toBe("Anabasis");
    expect(parsed.rules["byland-water"].english).toBe("Eagre");
    expect(parsed.rules["byland-herb"].english).toBe("Verdure");
    expect(parsed.rules["byland-mount"].english).toBe("Cairn");
    expect(parsed.rules["byland-people"].english).toBe(
      "Multitude",
    );
    expect(parsed.rules["byland-speech"].english).toBe(
      "Whobub",
    );
    expect(
      Object.values(parsed.rules).every(
        (rule) =>
          !/普通题|BOSS/.test(rule.description.public),
      ),
    ).toBe(true);
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
    trial.beginStage();

    expect(trial.state.ruleId).toBe("tetrarchy");
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
        (card) => card.obscuredAtMs === 4000,
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
    expect(trial.state.ruleId).toBe("tetrarchy");
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
      ) => boolean;
      canPartitionBossCards: (
        cards: Array<{
          uid: number;
          symbolId: number;
          source: "answer" | "decoy";
          mustIgnore?: boolean;
        }>,
        answerCount: number,
        allowedLengths: Set<number>,
        reservedChars: Set<string>,
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
      expectedWays: [
        [5, 6],
        [7, 5],
      ],
      pendingAnswers: [],
      pendingSubmissions: [],
      pendingAnswer: "",
      pendingCardIds: [],
      consumedCardIds: [],
      submissionCount: 0,
    };
    expect(
      helpers.canPartitionBossCards(
        [
          { uid: 11, symbolId: 5, source: "answer" },
          { uid: 12, symbolId: 6, source: "answer" },
          { uid: 13, symbolId: 7, source: "answer" },
          { uid: 14, symbolId: 5, source: "answer" },
          {
            uid: 15,
            symbolId: 2,
            source: "decoy",
            mustIgnore: true,
          },
        ],
        2,
        new Set([2]),
        new Set(),
      ),
    ).toBe(true);
    expect(
      helpers.assignBossAnswers(["尖"]),
    ).toBeNull();
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

    expect(trial.state.timeLimit).toBe(150);
    expect(trial.state.remaining).toBe(150);
    await vi.advanceTimersByTimeAsync(15_200);
    trial.setDraft(trial.state.current?.char ?? "");
    trial.submit();
    const carriedAfterFirst =
      trial.state.remaining;
    expect(carriedAfterFirst).toBeGreaterThan(135);
    expect(carriedAfterFirst).toBeLessThan(150);

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
      Math.min(150, carriedAfterFirst + 5),
    );

    await vi.advanceTimersByTimeAsync(900);
    trial.setDraft(trial.state.current?.char ?? "");
    trial.submit();
    expect(trial.state.remaining).toBe(150);

    await vi.advanceTimersByTimeAsync(900);
    (
      trial as unknown as { startBoss: () => void }
    ).startBoss();
    expect(trial.state.timeLimit).toBe(150);
    expect(trial.state.remaining).toBe(150);
    trial.setDraft(
      trial.state.boss?.expectedAnswers.join("") ?? "",
    );
    trial.submit();
    await vi.advanceTimersByTimeAsync(1200);
    expect(trial.state.stage).toBe(2);
    expect(trial.state.phase).toBe("stage-intro");

    trial.setRuleOverride("reschedule");
    trial.beginStage();
    expect(trial.state.timeLimit).toBe(150);
    expect(trial.state.remaining).toBe(150);
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
    expect(trial.state.remaining).toBe(135);
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
    trial.beginStage();
    const current = trial.state.current;

    expect(trial.state.ruleId).toBe("myopia");
    expect(
      current?.displayCards.filter(
        (card) => card.obscuredAtMs === 2000,
      ),
    ).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1900);
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
    bossTrial.beginStage();
    (
      bossTrial as unknown as { startBoss: () => void }
    ).startBoss();
    expect(
      bossTrial.state.boss?.initialCards.filter(
        (card) => card.obscuredAtMs === 2000,
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

  it("applies Aphantasia to all normal and boss cards at their rule delays", async () => {
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
    normal.beginStage();
    const normalCards = normal.state.current?.displayCards ?? [];
    expect(
      normalCards.every((card) => card.obscuredAtMs === 4000),
    ).toBe(true);
    await vi.advanceTimersByTimeAsync(3900);
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
    boss.beginStage();
    (
      boss as unknown as { startBoss: () => void }
    ).startBoss();
    const bossCards = boss.state.boss?.initialCards ?? [];
    expect(
      bossCards.every((card) => card.obscuredAtMs === 10000),
    ).toBe(true);
    await vi.advanceTimersByTimeAsync(9900);
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
    expect(trial.state.result?.crisEarned).toBe(0);
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
