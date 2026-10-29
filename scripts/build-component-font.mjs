import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const script = resolve(root, "scripts/build-component-font.py");
const configuredPython = process.env.ZIGSAW_PYTHON;
const candidates = [
  configuredPython,
  "C:\\Projects\\Python\\.venv\\Scripts\\python.exe",
  "python",
  "python3",
  "py",
].filter(Boolean);

let python = "";
for (const candidate of candidates) {
  if (
    (candidate.includes("\\") || candidate.includes("/")) &&
    !existsSync(candidate)
  ) {
    continue;
  }

  const probe = spawnSync(candidate, ["-c", "import fontTools"], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (probe.status === 0) {
    python = candidate;
    break;
  }
}

if (!python) {
  console.error(
    "Python with FontTools was not found. Set ZIGSAW_PYTHON to its executable path.",
  );
  process.exit(1);
}

const result = spawnSync(python, [script], {
  cwd: root,
  env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  stdio: "inherit",
  windowsHide: true,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
