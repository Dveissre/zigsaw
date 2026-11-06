import { describe, expect, it } from "vitest";
import { debugAccessDecision } from "../src/ui/debug-auth";

const MASTER_DIGEST =
  "4c1f495952d4c0d9d11485af6b9a32d276ff4b471cb55ad1ec9110f4ce06186c";
const TRIAL_DIGEST =
  "14c8fd0085490c0c61658d10640b725aee1c456202cc2ed2b93129b3ce021188";

describe("debug access decisions", () => {
  it("keeps the master key global", () => {
    expect(debugAccessDecision(MASTER_DIGEST)).toBe("full");
    expect(
      debugAccessDecision(MASTER_DIGEST, {
        allowTrialScoped: false,
      }),
    ).toBe("full");
  });

  it("restricts the trial key to trial gameplay", () => {
    expect(debugAccessDecision(TRIAL_DIGEST)).toBe(
      "trial-unavailable",
    );
    expect(
      debugAccessDecision(TRIAL_DIGEST, {
        allowTrialScoped: true,
      }),
    ).toBe("trial");
  });

  it("rejects unknown credentials", () => {
    expect(debugAccessDecision("")).toBe("invalid");
    expect(
      debugAccessDecision("not-a-real-digest", {
        allowTrialScoped: true,
      }),
    ).toBe("invalid");
  });
});
