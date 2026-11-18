# ZIGSAW Project Rules

These rules apply to this repository and supplement any parent
workspace-level `AGENTS.md`. This file is the canonical project rule set and
must travel with the repository when it is moved.

## Start Of Work

- Work from the repository root.
- Run `git status --short` before a multi-file task and preserve every
  pre-existing change.
- Read `docs/handoff/README.md` and the relevant feature handoff before
  changing code or data contracts.
- Do not rely on remembered chat state if the files disagree with it.

## Terminal And Editing

- On Windows, every command must explicitly use PowerShell.
- Prefer `rg`, `rg --files`, and `Get-Content` for inspection.
- Use `apply_patch` for source and documentation edits.
- Do not use destructive or worktree-wide rollback commands.
- Do not commit, push, rewrite history, or discard user changes unless the
  user explicitly asks.

## Verification

- Type check: `npx tsc --noEmit`
- Full tests: `npm test`
- Trial-focused tests: `npm run test:trial`
- Production bundle without running generation pre-hooks:
  `npx vite build`
- Full build including tracked data regeneration: `npm run build`

`npm run dev` and `npm run build` run `predev`/`prebuild`, which regenerate
tracked data. For read-only investigation, use `npx vite` and
`npx vite build` when regeneration is not intended.

For UI work, verify desktop and mobile layouts. The critical compact mobile
viewport is `390x430` with the software keyboard open. Check that the answer
input remains reachable and the page does not scroll unexpectedly.

## Data And Generated Files

Manual/source data includes:

- `public/data/char_sym.json`
- `public/data/tongyong_hanzi.json`
- `public/data/component-assets.json`
- `public/component_svg/`
- `public/data/hanzi_pinyin12.json`
- `public/data/tongyong12_trad.json`
- `data-source/wordlists/`

Do not casually overwrite these files. Consult `docs/DATA_PROVENANCE.md`
before updating them.

`.gitattributes` enforces LF for text files. Source-hash generators also
normalize CRLF before hashing so generated data stays valid across Windows,
Linux, and macOS checkouts.

Generated runtime data includes:

- `public/data/component-usage.json`
- `docs/component-usage.csv`
- `public/data/component-atlas.json`
- `public/data/component-atlas/*.json`
- `public/data/composition-words.json`
- `public/data/assonance-words.json`
- `public/data/word-answers.json`
- `public/data/gestalt-pairs.json`
- `docs/reports/trial-rule-pools/`

Regeneration commands:

- Word-list copies: `npm run sync:wordlists`
- Component usage: `npm run build:component-usage`
- Atlas index and shards: `npm run build:atlas`
- Component font subset: `npm run build:component-font`
- Trial reports/pools: `npm run analyze:trial-rule-pools`
- Composition/assonance/answer pools: `npm run build:composition-pools`

After changing `char_sym.json` or component assets, rebuild usage, atlas, and
the component font when component names changed. After changing word lists,
rebuild composition pools. When changing `char_sym.json` or answer-compat
data, also regenerate Gestalt data and run the full tests.

## Save Compatibility

- `.zsave` envelope format is versioned separately from its payload.
- Current `.zsave` payload decoder accepts v0 and v1.
- Compact save code payload v1/v2/v3 must remain readable.
- Missing trial advancement fields in older saves fall back to no completed
  advancement and an empty perfect-clear mask.
- Newer save versions must be rejected by older code; newer code is
  responsible for reading older versions.
- Save import is an atomic full replacement of the keys listed in
  `src/game/save.ts`. Keep rollback behavior intact.
- Read `docs/handoff/features/save-archive.md` and
  `docs/handoff/features/save-code.md` before changing storage schemas.

## Trial Mode

- Trial rules are data-driven through `src/game/trial-rules.ts` and
  `public/data/trial-rules.json`.
- Rule display names may change, but IDs are permanent.
- Keep public wording, debug wording, internal implementation notes, icon,
  stars, timing, selection, and policies synchronized in
  `public/data/trial-rules.json` and `docs/trial-rules.csv`.
- Advancement settings are centralized in
  `src/game/trial-advancement.ts`; do not reintroduce fixed question counts,
  skip intervals, or timing multipliers in feature branches.
- Advancement 0 uses 7 normal questions plus one Actkeeper; advancement 1+
  uses 8 plus one. Advancements 5-7 are intentionally unavailable.
- Trial Cris rewards settle once at the end of a run and are back-loaded by
  completed acts to prevent early-abandon farming.
- Check `docs/handoff/features/trial-mode.md` and
  `docs/trial-rules-plan.md` before changing trial behavior.

## UI And Assets

- Card palette decisions belong in `docs/palette.md` and the `:root` tokens
  in `src/styles.css`.
- Preserve the distinction between question cards, rarity cards, EX cards,
  trial-rule cards, correct-answer green, pause black, and disabled states.
- Prefer existing components and responsive patterns over duplicating page
  structures.
- Reuse archived styles only after inspecting their documented status.

## Handoff Maintenance

- Update `docs/handoff/README.md` for every substantive feature or data
  change.
- Update the relevant `docs/handoff/features/*.md` file when behavior,
  schemas, commands, or known limitations change.
- Keep historical bug records separate from the current project snapshot.
- Document migration-sensitive assumptions in the handoff, not only in chat.
