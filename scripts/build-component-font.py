from __future__ import annotations

import json
import os
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parents[1]
SYMBOLS_PATH = ROOT / "public" / "data" / "char_sym.json"
OUTPUT_PATH = ROOT / "src" / "assets" / "fonts" / "zigsaw-components-bold.woff2"
DEFAULT_SOURCE = Path(
    os.environ.get(
        "LOCALAPPDATA",
        Path.home() / "AppData" / "Local",
    )
) / "Microsoft" / "Windows" / "Fonts" / "SourceHanSerifCN-Bold.otf"
FONT_SOURCE = Path(os.environ.get("ZIGSAW_FONT_SOURCE", DEFAULT_SOURCE))


def main() -> None:
    if not FONT_SOURCE.is_file():
        raise SystemExit(f"Source font not found: {FONT_SOURCE}")

    symbol_data = json.loads(SYMBOLS_PATH.read_text(encoding="utf-8"))
    names = {str(name) for name in symbol_data["symbols"].values()}
    display_glyphs = set(
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-!"
    )
    requested = sorted(set("".join(names)) | display_glyphs)

    source_font = TTFont(FONT_SOURCE)
    source_cmap = source_font.getBestCmap()
    covered = [char for char in requested if ord(char) in source_cmap]
    missing = [char for char in requested if ord(char) not in source_cmap]

    if not covered:
        raise SystemExit("No component characters are covered by the source font.")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = OUTPUT_PATH.with_name(f"{OUTPUT_PATH.name}.tmp")

    print(
        f"Building component font subset: {len(names)} names, "
        f"{len(covered)} covered characters, {len(missing)} missing characters"
    )

    subset.main(
        [
            str(FONT_SOURCE),
            f"--text={''.join(covered)}",
            "--flavor=woff2",
            "--layout-features=",
            "--glyph-names",
            "--symbol-cmap",
            "--legacy-cmap",
            "--notdef-glyph",
            "--notdef-outline",
            "--recommended-glyphs",
            "--name-IDs=*",
            "--name-legacy",
            "--name-languages=*",
            f"--output-file={temporary_path}",
        ]
    )

    subset_font = TTFont(temporary_path)
    renamed_names = {
        1: "Zigsaw Component Serif",
        2: "Bold",
        3: "Zigsaw Component Serif Bold; subset",
        4: "Zigsaw Component Serif Bold",
        6: "ZigsawComponentSerif-Bold",
        16: "Zigsaw Component Serif",
        17: "Bold",
    }
    for record in subset_font["name"].names:
        replacement = renamed_names.get(record.nameID)
        if replacement is not None:
            record.string = replacement

    subset_font.flavor = "woff2"
    subset_font.save(OUTPUT_PATH)
    temporary_path.unlink(missing_ok=True)

    if missing:
        missing_text = " ".join(f"{char}(U+{ord(char):04X})" for char in missing)
        print(f"Unsupported by the source font, left to fallback: {missing_text}")

    print(f"Wrote {OUTPUT_PATH.relative_to(ROOT)} ({OUTPUT_PATH.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
