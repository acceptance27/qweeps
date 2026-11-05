# Third-party notices

QWEEPS-authored software is licensed under the PolyForm Noncommercial License
1.0.0 ([LICENSE](LICENSE)). QWEEPS-authored documentation and lesson content is
licensed under CC BY-NC 4.0 ([LICENSE-DOCUMENTATION](LICENSE-DOCUMENTATION)),
subject to the exceptions in [LICENSING.md](LICENSING.md).

This file is the notice index for third-party assets, fonts, icons, libraries
and provider outputs. The full license texts are in [LICENSES/](LICENSES/).
Third-party material remains under its own license; the QWEEPS licenses do not
relicense it.

## Assets

### Eye in cross-section

- **Author:** MesserWoland
- **Title:** *Eye in cross-section*
- **Source:** https://commons.wikimedia.org/wiki/File:Eye_in_cross-section.svg
- **License:** CC BY-SA 3.0
- **License URL:** https://creativecommons.org/licenses/by-sa/3.0/
- **Original file:** `visual-studio/public/live/assets/eye.svg`
- **Adapted geometry:** `visual-studio/src/live/illustrations.json` (`eye.paths`)
- **Changes:** the live diagram retains the main anatomical paths, omits the
  numbered annotations and axes, adapts colors, and adds two English labels
  (“Lens” and “Retina”).
- **Adaptation license:** the adapted geometry in `illustrations.json` is
  distributed under CC BY-SA 3.0. The share-alike condition applies to that
  adaptation.
- **Full text:** [LICENSES/CC-BY-SA-3.0.txt](LICENSES/CC-BY-SA-3.0.txt)

The rest of a QWEEPS lesson may remain under CC BY-NC 4.0 where the eye is a
separable component and this notice is preserved. The eye adaptation itself is
not relicensed as PolyForm Noncommercial or CC BY-NC.

### Quill and ink

- **Author:** Lorc
- **Title:** *Quill and ink*
- **Source:** https://github.com/game-icons/icons/blob/master/lorc/quill-ink.svg
- **License:** CC BY 3.0
- **License URL:** https://creativecommons.org/licenses/by/3.0/
- **Original file:** `visual-studio/public/live/assets/quill-ink.svg`
- **Adapted geometry:** `visual-studio/src/live/illustrations.json` (`quill.paths`)
- **Changes:** the live illustration removes the background and adapts stroke
  and fill colors; the source geometry is preserved.
- **Adaptation license:** the adapted quill geometry in `illustrations.json` is
  distributed under CC BY 3.0.
- **Full text:** [LICENSES/CC-BY-3.0.txt](LICENSES/CC-BY-3.0.txt)

### Teaching typeface

- **Font:** Liberation Serif Regular
- **File:** `visual-studio/public/live/teaching-serif.ttf`
- **License:** SIL Open Font License 1.1
- **Copyright:** digitized data copyright (c) 2010 Google Corporation, with
  Reserved Font Arimo, Tinos and Cousine; copyright (c) 2012 Red Hat, Inc.,
  with Reserved Font Name Liberation.
- **Full text:** [visual-studio/public/live/FONT-LICENSE.txt](visual-studio/public/live/FONT-LICENSE.txt)
  and [LICENSES/OFL-1.1.txt](LICENSES/OFL-1.1.txt)

The font file is the unmodified Liberation Serif Regular distributed by the
Liberation Fonts project. Documents and lesson recordings created with the font
are not themselves relicensed under the OFL.

### Natural Earth

- **Data:** Natural Earth 1:50m Admin 0 Countries
- **Source:** https://www.naturalearthdata.com/
- **License:** public domain
- **Provenance:** recorded in `visual-studio/src/live/geography.json`

No attribution is required by the Natural Earth terms, but the provenance note
is retained so the map data can be audited.

### Narration audio

- **Files:** `bundled-lessons/visual-narration/*.wav`
- **Provider:** Fish Audio model through OpenRouter, as configured in
  `src/assistant/config.py`
- **Status:** provider output, not QWEEPS-authored text or code

The QWEEPS CC BY-NC lesson license does not grant rights in the voice, model or
provider output. Fish Audio, OpenRouter and the applicable voice/model terms
continue to apply. Verify those terms and the voice-rights basis before
redistributing the audio or a lesson containing it.

## Software bundled in the studio

The frontend is built from the dependencies declared in
[package.json](package.json) and [visual-studio/package.json](visual-studio/package.json).
The principal runtime libraries are listed below.

### React and React DOM

- **License:** MIT
- **Copyright:** Copyright (c) Meta Platforms, Inc. and affiliates.
- **Full text:** [LICENSES/MIT.txt](LICENSES/MIT.txt)

### GSAP

- **License:** Standard “No Charge” GSAP License
- **Copyright:** Copyright (c) 2008-2026, GreenSock. All rights reserved.
  The published license text also states Copyright (c) 2025, Webflow.
- **License URL:** https://gsap.com/standard-license
- **Full text:** [LICENSES/GSAP.txt](LICENSES/GSAP.txt)

GSAP’s license permits the uses described there, including commercial use, but
prohibits the Prohibited Uses and removal of proprietary notices. The QWEEPS
noncommercial license applies to QWEEPS-authored material, not to GSAP.

### Lucide icons

- **License:** ISC, with portions of Feather under MIT
- **Copyright:** Copyright (c) for portions of Lucide are held by Cole Bemis
  2013-2023 as part of Feather (MIT). All other copyright (c) for Lucide are
  held by Lucide Contributors 2025.
- **Full text:** [LICENSES/ISC.txt](LICENSES/ISC.txt)

### opentype.js

- **License:** MIT
- **Copyright:** Copyright (c) 2020 Frederik De Bleser
- **Full text:** [LICENSES/MIT.txt](LICENSES/MIT.txt)

### Other frontend libraries

The build may also include MIT-, ISC-, BSD- or Apache-2.0-licensed transitive
dependencies of the packages above. Their package-specific license and notice
files are retained in `visual-studio/node_modules/<package>/` in a source
checkout. The full Apache-2.0 text is in
[LICENSES/Apache-2.0.txt](LICENSES/Apache-2.0.txt).

### HyperFrames

- **Packages:** `@hyperframes/core` and related packages
- **License:** Apache-2.0
- **Full text:** [LICENSES/Apache-2.0.txt](LICENSES/Apache-2.0.txt)

The current source uses HyperFrames' browser adapter and types. Retain its
Apache-2.0 license and any NOTICE content supplied by the package when
distributing that code. The Python backend does not require an Express server.

## Files with a different notice

### `visual-studio/src/App.tsx`

`visual-studio/src/App.tsx` carries this SPDX header:

```text
SPDX-License-Identifier: Apache-2.0
```

That file is distributed under Apache-2.0, not PolyForm Noncommercial. The rest
of the QWEEPS application code remains under PolyForm Noncommercial to the extent
the licensor holds the necessary rights. See
[LICENSES/Apache-2.0.txt](LICENSES/Apache-2.0.txt).

This exception should be kept in sync with [LICENSING.md](LICENSING.md). If the
header was added by mistake and the file is wholly QWEEPS-owned, remove the
header and this exception in a future release; do not attempt to revoke the
Apache-2.0 grant for copies already distributed.

## Build-only and optional dependencies

These are not part of the normal browser bundle, but they may appear in a source
checkout, server image or `node_modules` distribution:

| Component | License | Note |
|---|---|---|
| `lightningcss` | MPL-2.0 | Build-time CSS transformer. MPL obligations apply to modified MPL files, not to separate files. Text: [LICENSES/MPL-2.0.txt](LICENSES/MPL-2.0.txt). |
| `caniuse-lite` | CC BY 4.0 | Build-time browser-data dependency. Include attribution if redistributed. Text: [LICENSES/CC-BY-4.0.txt](LICENSES/CC-BY-4.0.txt). |
| `@img/sharp-libvips-linux-x64` | LGPL-3.0-or-later | Optional/server-side image library. If distributed, preserve the LGPL terms and provide the relinking/source information the LGPL requires. Text: [LICENSES/LGPL-3.0.txt](LICENSES/LGPL-3.0.txt). |
| Manim, ManimGL, NumPy, Pillow and other Python packages | permissive licenses | Relevant only if a bundled Python environment is distributed. The normal source checkout installs them separately. |

## Reporting and updates

If you add a new third-party asset, dependency or provider output:

1. Add its attribution and license to this file.
2. Add the full license text to [LICENSES/](LICENSES/) if it is not already
   present.
3. Copy the notice files into the built distribution.
4. Keep `visual-studio/public/live/assets/SOURCES.md` in sync for visual assets.

This notice file is an inventory, not legal advice. It does not replace the
full license texts or a review of provider terms.


## Pixel interface fonts and Android runtime

- **m5x7**, by Daniel Linssen: CC0 1.0. Distributed in
  `visual-studio/public/fonts/` with its license notice.
- **Alagard**, by Hewett Tsoi (Pix3M): distributed unmodified, with the requested
  author credit in `visual-studio/public/fonts/alagard-CREDIT.txt`.
- **Chaquopy**, by Chaquopy contributors: MIT license; see
  <https://github.com/chaquo/chaquopy>. The Android app uses its packaged Python
  runtime, including the runtime's upstream third-party components.
- **pypdf**, by the pypdf contributors: BSD-3-Clause. Its license is retained in
  the APK's Python requirements archive under `pypdf-6.0.0.dist-info/licenses/`.
- **Gradle Wrapper**: Apache-2.0; see <https://github.com/gradle/gradle>.
