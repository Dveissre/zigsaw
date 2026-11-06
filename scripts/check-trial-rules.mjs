import {
  access,
  readFile,
} from "node:fs/promises";
import { resolve } from "node:path";

const cwd = process.cwd();
const runtimePath = resolve(
  cwd,
  "public/data/trial-rules.json",
);
const archiveRoot = resolve(
  cwd,
  "docs/archive/trial-rules",
);
const registryPath = resolve(
  archiveRoot,
  "registry.json",
);
const copyReviewPath = resolve(
  cwd,
  "docs/trial-rules.csv",
);
const activeIconRoot = resolve(
  cwd,
  "public/assets/trial-rules",
);
const runtimeStylesPath = resolve(cwd, "src/styles.css");
const runtimeSourcePaths = [
  resolve(cwd, "src/main.ts"),
  resolve(cwd, "src/game/trial.ts"),
];

const errors = [];

const readJson = async (path) =>
  JSON.parse(await readFile(path, "utf8"));
const requireFile = async (path, label) => {
  try {
    await access(path);
  } catch {
    errors.push(`${label}: missing ${path}`);
  }
};

const parseCsv = (text) => {
  const rows = [];
  let fields = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      fields.push(field);
      field = "";
    } else if (
      (char === "\n" || char === "\r") &&
      !quoted
    ) {
      if (char === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      fields.push(field);
      if (fields.some((value) => value.length > 0)) {
        rows.push(fields);
      }
      fields = [];
      field = "";
    } else {
      field += char;
    }
  }
  fields.push(field);
  if (fields.some((value) => value.length > 0)) {
    rows.push(fields);
  }
  return rows;
};

const runtime = await readJson(runtimePath);
const registry = await readJson(registryPath);
const runtimeStyles = await readFile(
  runtimeStylesPath,
  "utf8",
);
const runtimeSources = await Promise.all(
  runtimeSourcePaths.map(async (path) => ({
    path,
    source: await readFile(path, "utf8"),
  })),
);
const activeIds = new Set(Object.keys(runtime.rules));
const retiredIds = new Set();

if (runtime.version !== 3) {
  errors.push("runtime: expected version 3");
}
if (
  !Array.isArray(runtime.stageStars) ||
  runtime.stageStars.length !== 7
) {
  errors.push("runtime: stageStars must contain 7 entries");
} else if (
  JSON.stringify(runtime.stageStars) !==
  JSON.stringify([
    [0],
    [1],
    [1],
    [2],
    [2],
    [2, 3],
    [3],
  ])
) {
  errors.push(
    "runtime: stageStars must be [0], [1], [1], [2], [2], [2,3], [3]",
  );
}

for (const [id, rule] of Object.entries(runtime.rules)) {
  if (rule.id !== id) {
    errors.push(
      `runtime: rule key ${id} does not match rule.id ${rule.id}`,
    );
  }
  if (typeof rule.icon !== "string" || !rule.icon) {
    errors.push(`runtime: rule ${id} has no icon`);
    continue;
  }
  await requireFile(
    resolve(activeIconRoot, rule.icon),
    `runtime rule ${id}`,
  );
  const directRuleComparison = new RegExp(
    `(?:ruleId|rule\\.id|activeRule\\(\\)\\.id)\\s*===\\s*["']${id.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    )}["']`,
  );
  for (const { path, source } of runtimeSources) {
    if (directRuleComparison.test(source)) {
      errors.push(
        `runtime: active rule ${id} is hard-coded in ${path}; use policy data instead`,
      );
    }
  }
}

if (!Array.isArray(registry.rules)) {
  errors.push("archive: registry.rules must be an array");
}
if (registry.version !== 1) {
  errors.push("archive: expected registry version 1");
}
for (const entry of registry.rules ?? []) {
  if (typeof entry.id !== "string" || !entry.id) {
    errors.push("archive: every entry needs an id");
    continue;
  }
  if (retiredIds.has(entry.id)) {
    errors.push(`archive: duplicate retired rule ${entry.id}`);
  }
  retiredIds.add(entry.id);
  if (
    typeof entry.retiredAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(entry.retiredAt)
  ) {
    errors.push(
      `archive: ${entry.id}.retiredAt must be YYYY-MM-DD`,
    );
  }
  if (typeof entry.reason !== "string" || !entry.reason) {
    errors.push(`archive: ${entry.id}.reason is required`);
  }
  if (activeIds.has(entry.id)) {
    errors.push(
      `archive: retired rule ${entry.id} is still active`,
    );
  }
  for (const key of [
    "snapshot",
    "documentation",
    "icon",
  ]) {
    if (typeof entry[key] !== "string" || !entry[key]) {
      errors.push(
        `archive: ${entry.id}.${key} must be a file name`,
      );
    }
  }
  if (entry.snapshot) {
    const snapshotPath = resolve(
      archiveRoot,
      entry.snapshot,
    );
    await requireFile(
      snapshotPath,
      `archive rule ${entry.id}`,
    );
    try {
      const snapshot = await readJson(snapshotPath);
      if (snapshot.id !== entry.id) {
        errors.push(
          `archive: ${entry.id} snapshot id is ${snapshot.id}`,
        );
      }
    } catch (error) {
      errors.push(
        `archive: invalid ${entry.id} snapshot: ${error.message}`,
      );
    }
  }
  if (entry.documentation) {
    await requireFile(
      resolve(archiveRoot, entry.documentation),
      `archive rule ${entry.id}`,
    );
  }
  if (entry.icon) {
    await requireFile(
      resolve(archiveRoot, entry.icon),
      `archive rule ${entry.id}`,
    );
    try {
      await access(
        resolve(activeIconRoot, entry.icon),
      );
      errors.push(
        `archive: ${entry.id} icon still exists in runtime assets`,
      );
    } catch {
      // Expected: retired icons are not public runtime assets.
    }
  }
  if (entry.stylesheet) {
    const stylesheetPath = resolve(
      archiveRoot,
      entry.stylesheet,
    );
    await requireFile(
      stylesheetPath,
      `archive rule ${entry.id}`,
    );
    if (runtimeStyles.includes(entry.stylesheet)) {
      errors.push(
        `archive: ${entry.id} stylesheet is referenced by runtime CSS`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error("Trial rule consistency check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  const copyRows = (
    parseCsv(
      (await readFile(copyReviewPath, "utf8")).replace(
        /^\uFEFF/,
        "",
      ),
    )
  );
  const copyHeader = [
    "中文名",
    "英文名",
    "id",
    "星级",
    "显示规则",
    "调试规则",
  ];
  if (
    copyRows[0]?.length !== copyHeader.length ||
    copyHeader.some(
      (heading, index) => copyRows[0]?.[index] !== heading,
    )
  ) {
    errors.push(
      "copy review: CSV header does not match the required six columns",
    );
  }
  const copyIds = new Set();
  for (const row of copyRows.slice(1)) {
    const id = row[2];
    if (!id || copyIds.has(id)) {
      errors.push(
        `copy review: duplicate or missing rule id ${id ?? ""}`,
      );
      continue;
    }
    copyIds.add(id);
    if (!activeIds.has(id)) {
      errors.push(
        `copy review: unknown or inactive rule ${id}`,
      );
    }
    if (row.length !== copyHeader.length || row.some((cell) => !cell.trim())) {
      errors.push(
        `copy review: ${id} must have six non-empty cells`,
      );
    }
  }
  for (const id of activeIds) {
    if (!copyIds.has(id)) {
      errors.push(`copy review: missing active rule ${id}`);
    }
  }

  if (errors.length > 0) {
    console.error(
      "Trial rule copy consistency check failed:",
    );
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
  } else {
  console.log(
    `Trial rules consistent: ${activeIds.size} active, ${retiredIds.size} retired, ${copyIds.size} copy rows.`,
  );
  }
}
