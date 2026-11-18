# 试炼答错扣时与倒计时圆环动效归档

本文件保存曾接入进阶 4 的“答错扣除 3 秒作答时间”逻辑与倒计时圆环 `is-penalty-cut` 动效实现。该机制现已从进阶 4 取消，代码在此归档以便后续高进阶或新制限按需复用。

## 设计口径

- 配置字段：`TrialAdvancementConfig.wrongAnswerPenaltySeconds`（进阶 4 为 `3`，其余为 `0`）。
- 触发时机：普通题、守幕与构词守幕提交错误答案时触发；空输入、超时及中止不触发。
- 扣时行为：
  - 将 `this.deadline` 减去 `wrongAnswerPenaltySeconds * 1000`，重新计算 `state.remaining`。
  - 若当前规则启用 `sharedBudgetSeconds`（如“失与得”），同步更新 `this.sharedTimeRemaining = remaining`，防止通过换题跳过扣时。
  - 若扣时后 `remaining <= 0`，直接记录失败（`recordNormal(false)` / `recordBoss(false)`）并进入 `revealMiss()` 揭晓答案。
- UI 动效：
  - 通过 `TrialState.wrongPenaltySerial` 递增向视图通知本次扣时。
  - `updateTrialTimer` 复用 `.timer-ring.is-penalty-cut`（`260ms` 进度削减 + `380ms` 红色闪烁），并在 `380ms` 动画窗口内保护 `--timer-penalty-from-offset` / `--timer-penalty-to-offset` 不被每秒 `tick` 覆盖，窗口结束后移除 `.is-penalty-cut` 恢复正常圆环与 `.is-urgent` 脉冲。

## 休眠实现片段

### 1. 会话状态与扣时逻辑（`src/game/trial.ts`）

```ts
// TrialState 字段：
// wrongPenaltySerial: number;

private failWrongSubmission(): void {
  const penaltySeconds =
    this.advancement.wrongAnswerPenaltySeconds;
  if (penaltySeconds > 0) {
    this.deadline -= penaltySeconds * 1000;
    const remaining = this.remainingSeconds();
    this.state.remaining = remaining;
    this.state.wrongPenaltySerial += 1;
    if (
      this.activeRule().timing.sharedBudgetSeconds !==
      undefined
    ) {
      this.sharedTimeRemaining = remaining;
    }
    if (remaining <= 0) {
      if (this.state.phase === "playing") {
        this.recordNormal(false);
      } else if (this.state.phase === "boss") {
        this.recordBoss(false);
      }
      this.revealMiss();
      return;
    }
  }
  this.state.feedback = "wrong";
  this.emit();
}
```

### 2. 倒计时圆环扣时动画窗口（`src/main.ts`）

```ts
// 在 startTrial() 初始化、questionEnter 时重置：
// let lastWrongPenaltySerial = 0;
// let trialPenaltyUntil = 0;

const wrongPenaltyTriggered =
  state.wrongPenaltySerial !== lastWrongPenaltySerial;
lastWrongPenaltySerial = state.wrongPenaltySerial;
const now = performance.now();
if (wrongPenaltyTriggered) {
  trialPenaltyUntil = now + 380;
}
if (state.paused) {
  trialPenaltyUntil = 0;
}
const pausePenaltyTriggered =
  state.paused && previousFraction > fraction + 0.001;
const penaltyActive =
  wrongPenaltyTriggered ||
  pausePenaltyTriggered ||
  (now < trialPenaltyUntil &&
    !state.paused &&
    !state.revealing);
timerRing.classList.toggle("is-penalty-cut", penaltyActive);
if (
  wrongPenaltyTriggered ||
  pausePenaltyTriggered ||
  !penaltyActive
) {
  timerProgress.style.setProperty(
    "--timer-penalty-from-offset",
    String(circumference * (1 - previousFraction)),
  );
  timerProgress.style.setProperty(
    "--timer-penalty-to-offset",
    String(circumference * (1 - fraction)),
  );
}
if (wrongPenaltyTriggered) {
  window.setTimeout(() => {
    if (!timerRing.isConnected || trialSession?.state.paused) {
      return;
    }
    trialPenaltyUntil = 0;
    timerRing.classList.remove("is-penalty-cut");
  }, 380);
}
```
