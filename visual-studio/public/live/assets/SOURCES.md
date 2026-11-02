# Source geometry and assets

Third-party visual assets used by the live studio are listed here with their
license, source and changes. The full license texts are in the repository’s
`LICENSES/` directory and, in a built site, under `/LICENSES/`. See also
[`THIRD_PARTY_NOTICES.md`](../../../../THIRD_PARTY_NOTICES.md).

## `eye.svg` and `eye.paths`

- **Author:** MesserWoland
- **Title:** *Eye in cross-section*
- **Source:** https://commons.wikimedia.org/wiki/File:Eye_in_cross-section.svg
- **License:** CC BY-SA 3.0
- **License URL:** https://creativecommons.org/licenses/by-sa/3.0/
- **Original file:** `eye.svg`
- **Adapted geometry:** `visual-studio/src/live/illustrations.json` → `eye.paths`
- **Changes:** the live diagram retains the main anatomical paths, omits the
  numbered annotations and axes, adapts colors, and adds two English labels
  (“Lens” and “Retina”).
- **Adaptation license:** the adapted geometry in `illustrations.json` is
  distributed under CC BY-SA 3.0. The share-alike condition applies to that
  adaptation.
- **Full text:** `LICENSES/CC-BY-SA-3.0.txt` (built site: `/LICENSES/CC-BY-SA-3.0.txt`)

The rest of a lesson may remain under CC BY-NC 4.0 where the eye is a separable
component and this notice is preserved. The eye adaptation itself is not
relicensed as PolyForm Noncommercial or CC BY-NC.

## `quill-ink.svg` and `quill.paths`

- **Author:** Lorc
- **Title:** *Quill and ink*
- **Source:** https://github.com/game-icons/icons/blob/master/lorc/quill-ink.svg
- **License:** CC BY 3.0
- **License URL:** https://creativecommons.org/licenses/by/3.0/
- **Original file:** `quill-ink.svg`
- **Adapted geometry:** `visual-studio/src/live/illustrations.json` → `quill.paths`
- **Changes:** the live illustration removes the background and adapts stroke
  and fill colors; the source geometry is preserved.
- **Adaptation license:** the adapted quill geometry in `illustrations.json` is
  distributed under CC BY 3.0.
- **Full text:** `LICENSES/CC-BY-3.0.txt` (built site: `/LICENSES/CC-BY-3.0.txt`)

## Icons

Education, people, document and institution icons are from the installed
`lucide-react` package (ISC, with portions of Feather under MIT). They are
illustrative symbols. See `THIRD_PARTY_NOTICES.md` and `LICENSES/ISC.txt`.

## Geography

Country geometry is Natural Earth 1:50m data, including the European countries
used in the journey. Its URL and provenance are in
`visual-studio/src/live/geography.json`. Natural Earth data is public domain; no
attribution is required, but the provenance note is retained for auditability.

## Typeface

`teaching-serif.ttf` is unmodified Liberation Serif Regular, licensed under the
SIL Open Font License 1.1. The font copyright and complete license are in
`FONT-LICENSE.txt` and `LICENSES/OFL-1.1.txt`.

## Narration audio

Narration files under `bundled-lessons/visual-narration/` are provider output
from Fish Audio through OpenRouter. They are not relicensed by QWEEPS. Provider
and voice terms apply; see `THIRD_PARTY_NOTICES.md`.
