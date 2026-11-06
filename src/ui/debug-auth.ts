const SESSION_KEY = "zigsaw.debug.unlocked";
const SALT = "zigsaw.debug.access.v1";
const EXPECTED_SHA256 =
  "4c1f495952d4c0d9d11485af6b9a32d276ff4b471cb55ad1ec9110f4ce06186c";
const TRIAL_EXPECTED_SHA256 =
  "14c8fd0085490c0c61658d10640b725aee1c456202cc2ed2b93129b3ce021188";

export type DebugAccessLevel = "full" | "trial";
export type DebugAccessDecision =
  | DebugAccessLevel
  | "invalid"
  | "trial-unavailable";

export interface DebugAccessOptions {
  allowTrialScoped?: boolean;
}

let unlockedInMemory = false;

function digestToHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function passwordDigest(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(
    `${SALT}\0${password}`,
  );
  return digestToHex(
    await crypto.subtle.digest("SHA-256", bytes),
  );
}

export function isDebugUnlocked(): boolean {
  if (unlockedInMemory) {
    return true;
  }
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function debugAccessDecision(
  digest: string,
  options: DebugAccessOptions = {},
): DebugAccessDecision {
  if (digest === EXPECTED_SHA256) {
    return "full";
  }
  if (digest === TRIAL_EXPECTED_SHA256) {
    return options.allowTrialScoped
      ? "trial"
      : "trial-unavailable";
  }
  return "invalid";
}

export function revokeDebugAccess(): void {
  unlockedInMemory = false;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Access remains revoked for this page instance.
  }
}

function grantDebugAccess(): void {
  unlockedInMemory = true;
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    // Access remains enabled for this page instance.
  }
}

export function requestDebugAccess(
  options: DebugAccessOptions = {},
): Promise<DebugAccessLevel | null> {
  if (isDebugUnlocked()) {
    return Promise.resolve("full");
  }

  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "debug-auth-dialog";
    dialog.setAttribute("aria-labelledby", "debug-auth-title");
    dialog.innerHTML = `
      <form class="debug-auth-panel">
        <header class="debug-auth-header">
          <div>
            <div class="game-settings-kicker">DEBUG ACCESS</div>
            <h2 id="debug-auth-title">调试入口</h2>
          </div>
          <button class="char-detail-close game-settings-close" type="button" data-debug-cancel aria-label="取消">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 4 20 20M20 4 4 20"></path>
            </svg>
          </button>
        </header>
        <div class="debug-auth-content">
          <label class="debug-auth-field">
            <span>口令</span>
            <input type="password" name="password" autocomplete="off" required>
          </label>
          <p class="debug-auth-error" data-debug-error aria-live="polite"></p>
          <button class="primary-action" type="submit">启用</button>
        </div>
      </form>
    `;

    let settled = false;
    const finish = (
      access: DebugAccessLevel | null,
    ): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (dialog.open) {
        dialog.close();
      }
      dialog.remove();
      resolve(access);
    };
    const form = dialog.querySelector("form");
    const input = dialog.querySelector<HTMLInputElement>("input");
    const error = dialog.querySelector<HTMLElement>(
      "[data-debug-error]",
    );

    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(null);
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) {
        finish(null);
      }
    });
    dialog
      .querySelector<HTMLButtonElement>("[data-debug-cancel]")
      ?.addEventListener("click", () => finish(null));
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = input?.value.trim() ?? "";
      void passwordDigest(value)
        .then((digest) => {
          const decision = debugAccessDecision(
            digest,
            options,
          );
          if (decision === "full") {
            grantDebugAccess();
            finish("full");
            return;
          }
          if (decision === "trial") {
            finish("trial");
            return;
          }
          if (error) {
            error.textContent =
              decision === "trial-unavailable"
                ? "此口令仅在试炼模式游戏中有效"
                : "口令错误";
          }
          input?.select();
        })
        .catch(() => {
          if (error) {
            error.textContent = "当前环境无法校验口令";
          }
        });
    });

    document.body.append(dialog);
    dialog.showModal();
    input?.focus();
  });
}
