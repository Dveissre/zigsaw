# 失韵法·有序分组实现存档（2026-11-06）

状态：已从运行时回滚，仅保留设计记录，供之后比较。

## 题面

- 普通题仍使用半韵法共享池的 4–6 张可见卡范围。
- 卡片按答案字序连续排列，同一来源字的卡组成一组。
- 组内部件随机打乱，不表达笔顺或结构顺序。
- 颜色固定映射到答案位置：
  - 第 1 字：蓝
  - 第 2 字：红
  - 第 3 字：橄榄
  - 第 4 字：银灰
- BOSS 允许某个来源字完全消去；空位保留其颜色槽，后续来源字不重新取色。

## 出卡逻辑

```ts
const crossSymbols = symbolsPresentInAtLeastTwoCharacters(recipe);

return recipe.flatMap((way, characterIndex) =>
  shuffle(
    way.filter((symbolId) => !crossSymbols.has(symbolId)),
    random,
  ).map((symbolId) => ({
    ...makeCard(symbolId),
    groupColor: characterIndex,
  })),
);
```

## 判题逻辑

对每个候选答案的兼容层拆法，先执行同样的跨字复沓删除：

```ts
const candidateGroups = recipe.map((way) =>
  way
    .filter((symbolId) => !crossSymbols.has(symbolId))
    .sort(numeric)
    .join(","),
);
```

然后要求非空组与固定颜色槽逐位相等：

```ts
for (let characterIndex = 0; characterIndex < candidateGroups.length; characterIndex += 1) {
  const candidate = candidateGroups[characterIndex];
  if (!candidate) continue;

  const visible = cards
    .filter((card) => card.groupColor === characterIndex)
    .map((card) => card.symbolId)
    .sort(numeric)
    .join(",");

  if (candidate !== visible) return false;
}
```

## 颜色

- 蓝：`#4f6598` / 底 `#edf0f8`
- 红：`#9d503f` / 底 `#f8ebe7`
- 橄榄：`#747733` / 底 `#f4f3e8`
- 银灰：`#5d6467` / 底 `#e8eaeb`

## 保留的性能优化

普通题加载时不枚举全部接受词；提交时直接检查：

1. 输入是否存在于 `word-answers.json` 的词表中；
2. 输入是否为两个不同汉字；
3. 两个字的兼容层拆法是否与题面严格有序匹配。

该优化不依赖颜色是否表示顺序，回滚后继续保留。
