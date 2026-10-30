# Source geometry

- `eye.svg`: MesserWoland, *Eye in cross-section*, Wikimedia Commons:
  https://commons.wikimedia.org/wiki/File:Eye_in_cross-section.svg
  (CC BY-SA 3.0). The live diagram retains the main anatomical paths, omits the
  numbered annotations and axes, adapts colors and adds two English labels.
- `quill-ink.svg`: Lorc, Game-icons.net:
  https://github.com/game-icons/icons/blob/master/lorc/quill-ink.svg
  (CC BY 3.0). The live illustration removes the background and adapts stroke
  and fill colors. The original source geometry is preserved here.
- Education, people, document and institution icons are from the installed
  `lucide-react` package (ISC); they are illustrative symbols.
- Country geometry is Natural Earth 1:50m data, including the European countries
  used in the journey. Its URL and provenance are in `src/live/geography.json`.

Only vetted local vector geometry is used by the live scene. These original
files are retained for provenance; the scene imports the extracted paths in
`src/live/illustrations.json` so individual geometry can be animated.
