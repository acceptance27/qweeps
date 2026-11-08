# 8 November 2026: incomplete architecture preview

Technical report version **2.1** updates report 2.0 (6 November). This is a
research/development snapshot, not a completed architecture release. The report
version is separate from the application package version.

## Included

- Complete architecture prototype update 3 integrated into QWEEPS: procedural
  compilers, system blueprint, nested function/flowchart inspection, reactive
  previews, packet timeline, sidebar, presets, GitHub scanner and local persistence.
- Main-menu navigation by clicking the Pixel Q/QWEEPS logo.
- Architecture gap-filling and contextual tutor switched from the separate Gemini
  configuration to the shared OpenCode Go settings, currently Muse Spark 1.3
  Contributor. Original system/user prompts and response schemas are preserved.
- Updated maintained report, setup instructions and a source archive with prebuilt
  browser assets, bundled visual lessons, Android source and per-file hashes.

## Incomplete and planned

Architecture voice explanation similar to the visual lessons is planned. Speech
synthesis, measured word/cue alignment, an audio-driven packet timeline and
voice-aware nested navigation are not implemented for architecture. Existing
visual-lesson voice functionality does not imply architecture voice support.

Repository scanning is sampled (up to fourteen supported files and 1,200 lines
per file). The supplied repository compiler is template-based. Its default model
and worked-example values are teaching fixtures, not a verified whole-program
call graph or an executed trace. General design/source support and architecture
quality gates require further work. No learning-outcome advantage is claimed.

The architecture backend requires desktop Node.js and installed npm dependencies.
It is not integrated or verified in the existing Android APK; Android source in
the ZIP is not a new APK build. Linux remains the primary tested host.

## Verification and packaging

Current relevant checks: 130 frontend tests, 18 architecture/OpenCode Python
tests, host/upstream TypeScript checks and production build. Live Go tutor and
gap-filling requests succeeded on a small identity-function fixture. This is a
functional smoke check, not a quality or latency benchmark. Historical native
measurements in report 2.1 retain their original dates and evidence boundaries.

Build the current artifacts with:

```text
python scripts/build_technical_report.py
npm ci
npm test
npm run architecture:check
npm run lint
npm run build
python scripts/build_zenodo_archive.py --date 2026-11-08
```

The archive includes pending source updates and records its base Git commit,
working-tree changes and hashes in `ARCHIVE-MANIFEST.json`. These identify the
snapshot more precisely than its base commit alone. Credentials, installed
runtimes, caches, SDK paths, APKs and private app data are excluded. The package
also includes `START-HERE.md` with setup and status notes.

The new PDF and ZIP are prepared locally for a new Zenodo version. This update
does not change the public deposit, its DOI metadata, or any license grant.
