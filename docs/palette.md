# Card Palette

This file is the shared reference for colors used by question and
settlement cards. Check it before introducing a new card color.

## Core UI

| Token | Color | Usage |
| --- | --- | --- |
| `--ink` | `#20231f` | Primary text |
| `--paper` | `#f2f0e9` | Page background |
| `--surface` | `#fbfaf6` | Neutral card background |
| `--accent` | `#a13730` | Error and primary accent |
| `--correct` | `#3f6946` | Correct-answer fill |

## Answer and Rarity

| Token / state | Accent | Fill | Usage |
| --- | --- | --- | --- |
| N | `#767973` | Neutral surface | Normal component rarity |
| R | `#5a8462` | `#dfeadf` | R component card |
| SR | `#5c8494` | `#dceaf0` | SR component card |
| SSR | `#785b87` | `#e7dcf0` | SSR component card |
| UR | `#ad711f` | `#fff0d4` to `#f6d985` | UR component card |
| XR | `#d8bb72` | near-black gradient | XR component card |
| EX | `#704a86` | `#eadff2` | EX answer/card accent |
| Level 2 | `#55745a` | `#dfe9df` | Second-level answer |
| Level 3 | `#527787` | `#dde9ee` | Third-level answer |

## Trial Rule Cards

| Rule | Accent | Fill |
| --- | --- | --- |
| Prefabrication | `#9b7b36` | `#f8f0d7` |
| Overlay / Repetend family | `#356767` | `#e5efed` |
| Wildcard | `#20231f` Cris mark | Neutral card surface |

## Dissonance Groups

`Dissonance` uses CSS variables so future palette changes stay centralized.
The assignment priority when an answer character has no visible component is:
blue, red, olive, silver.

| Group | Accent | Fill | Ink |
| --- | --- | --- | --- |
| Red | `#9d503f` | `#f8ebe7` | `#4f211a` |
| Blue | `#4f6598` | `#edf0f8` | `#273757` |
| Olive | `#747733` | `#f4f3e8` | `#3b3e17` |
| Silver | `#7f8589` | `#f2f3f4` | `#34383a` |

## Rules for New Card Colors

- Prefer pale fills and dark text.
- Avoid reusing an existing rarity, EX, level, prefabrication, overlay, or
  repetend accent.
- Check contrast after correct-answer green and pause black overlays.
- Add new reusable colors here and in the `:root` section of `src/styles.css`
  at the same time.
