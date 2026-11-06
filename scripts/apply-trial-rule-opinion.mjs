import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

if (!process.argv[2]) {
  throw new Error(
    "Usage: npm run apply:trial-rules-opinion -- <opinion.csv>",
  );
}
const inputPath = resolve(process.cwd(), process.argv[2]);
const runtimePath = resolve(
  process.cwd(),
  "public/data/trial-rules.json",
);
const canonicalCopyPath = resolve(
  process.cwd(),
  "docs/trial-rules.csv",
);
const expectedHeader = [
  "中文名",
  "英文名",
  "id",
  "星级",
  "显示规则",
  "调试规则",
];

function parseCsv(text) {
  const rows = [];
  let row = [];
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
      row.push(field);
      field = "";
    } else if (
      (char === "\n" || char === "\r") &&
      !quoted
    ) {
      if (char === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      row.push(field);
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some((cell) => cell.length > 0)) {
    rows.push(row);
  }
  return rows;
}

const opinionText = await readFile(inputPath, "utf8");
const rows = parseCsv(opinionText.replace(/^\uFEFF/, ""));
const header = rows.shift();
if (
  !header ||
  header.length !== expectedHeader.length ||
  expectedHeader.some(
    (value, index) => header[index] !== value,
  )
) {
  throw new Error(
    `Expected CSV header: ${expectedHeader.join(",")}`,
  );
}

const runtime = JSON.parse(
  await readFile(runtimePath, "utf8"),
);
const activeRules = runtime.rules;
const activeIds = new Set(Object.keys(activeRules));
const seen = new Set();
const changes = [];

for (const row of rows) {
  if (row.length !== expectedHeader.length) {
    throw new Error(
      `Invalid copy row: ${row.join(",")}`,
    );
  }
  const [name, english, id, starsText, publicText, debugText] =
    row.map((cell) => cell.trim());
  if (!name || !english || !id || !publicText || !debugText) {
    throw new Error(`Incomplete copy row for ${id || "(missing id)"}`);
  }
  if (seen.has(id)) {
    throw new Error(`Duplicate rule id: ${id}`);
  }
  seen.add(id);
  const rule = activeRules[id];
  if (!rule) {
    throw new Error(`Unknown or inactive rule: ${id}`);
  }
  const stars = Number(starsText);
  if (
    !Number.isInteger(stars) ||
    stars < 0 ||
    stars > 3
  ) {
    throw new Error(`Invalid star rating for ${id}: ${starsText}`);
  }
  const previous = {
    name: rule.name,
    english: rule.english,
    stars: rule.stars,
    public: rule.description.public,
    debug: rule.description.debug,
  };
  rule.name = name;
  rule.english = english;
  rule.stars = stars;
  rule.description.public = publicText;
  rule.description.debug = debugText;
  const current = {
    name: rule.name,
    english: rule.english,
    stars: rule.stars,
    public: rule.description.public,
    debug: rule.description.debug,
  };
  const changedFields = Object.entries(previous)
    .filter(
      ([key, value]) => current[key] !== value,
    )
    .map(([key]) => key);
  if (changedFields.length > 0) {
    changes.push({ id, fields: changedFields });
  }
}

for (const id of activeIds) {
  if (!seen.has(id)) {
    throw new Error(`Opinion is missing active rule: ${id}`);
  }
}

if (seen.size !== activeIds.size) {
  throw new Error(
    `Opinion contains ${seen.size} rules; runtime contains ${activeIds.size}`,
  );
}

await writeFile(
  runtimePath,
  `${JSON.stringify(runtime, null, 2)}\n`,
  "utf8",
);
await writeFile(canonicalCopyPath, opinionText, "utf8");

console.log(
  `Applied ${rows.length} trial rule copy rows; ${changes.length} rules changed.`,
);
for (const change of changes) {
  console.log(`- ${change.id}: ${change.fields.join(", ")}`);
}
