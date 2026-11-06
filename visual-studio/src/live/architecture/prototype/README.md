# Supplied architecture prototype

This directory preserves the user's Google AI Studio ZIP implementation. Its original component layout and visual grammar are the source of truth. Do not replace it with generic cards or a different lesson shell.

Original ZIP SHA-256: `ec69064957bec290f7829723f10ae7edb18e340792cb8a50cbceac8aafc87a6c`.

`PrototypeWorkspace.tsx` comes from the ZIP's `App.tsx`; `components/`, `data/`, `layout/`, `timeline/` and `types/` come from its `src/` tree. QWEEPS bindings live in `PrototypePlayer.tsx`, `workspace.ts`, `usePrototypeNarration.ts`, `components/LiveQuestion.tsx`, `captureWorkspace.ts` and `prototype.css`. The supplied data modules are retained intact. `referenceValues.ts` applies the earlier numerical corrections while preserving all fields and visualization types.

Preserve compound containers, nested child blocks, ports and wires; the complete goal/input/output sidebar; every specialized inner-function illustration; minimap and resizable split; evidence and citation interaction; authored Q&A and mini-explanation; original playback and breadcrumb controls. Authored answers remain labelled locally prepared. Real user questions use QWEEPS' configured provider.

The reference's authored layout is intentional. The ELK fixed-layout call is not represented as automatic placement; only new, generated topologies use layered placement. Keep app integration changes narrow and compare actual browser views to the ZIP before claiming fidelity.
