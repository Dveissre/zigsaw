const SESSION_KEY = "zigsaw.debug.unlocked";
const SALT = "zigsaw.debug.access.v1";
const EXPECTED_SHA256 =
  "4c1f495952d4c0d9d11485af6b9a32d276ff4b471cb55ad1ec9110f4ce06186c";

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

export function requestDebugAccess(): Promise<boolean> {
  if (isDebugUnlocked()) {
    return Promise.resolve(true);
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
    const finish = (allowed: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (dialog.open) {
        dialog.close();
      }
      dialog.remove();
      resolve(allowed);
    };
    const form = dialog.querySelector("form");
    const input = dialog.querySelector<HTMLInputElement>("input");
    const error = dialog.querySelector<HTMLElement>(
      "[data-debug-error]",
    );

    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(false);
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) {
        finish(false);
      }
    });
    dialog
      .querySelector<HTMLButtonElement>("[data-debug-cancel]")
      ?.addEventListener("click", () => finish(false));
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = input?.value.trim() ?? "";
      void passwordDigest(value)
        .then((digest) => {
          if (digest !== EXPECTED_SHA256) {
            if (error) {
              error.textContent = "口令错误";
            }
            input?.select();
            return;
          }
          grantDebugAccess();
          finish(true);
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
