# ZIGSAW component font

`zigsaw-components-bold.woff2` is a subset of Adobe Source Han Serif CN
Bold 2.003. It contains the characters used by `public/data/char_sym.json`
and is used only for component glyphs.

Regenerate it after changing component names:

```powershell
npm run build:component-font
```

On Windows the script finds the local Source Han Serif font automatically.
Set `ZIGSAW_FONT_SOURCE` to another source OTF and `ZIGSAW_PYTHON` to a Python
executable with FontTools and Brotli installed when those paths differ.

The subset uses the CSS family name “Zigsaw Component Serif”. Font metadata
is renamed accordingly so the OFL Reserved Font Name is not reused by this
modified font.
