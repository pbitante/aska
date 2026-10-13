# Changelog: aska-editor

Each version's section is also its GitHub release notes (tag `aska-editor-v<version>`). Print one
with `node scripts/release-notes.mjs aska-editor <version>` from the repo root.

## Unreleased

**Fixes**
- **Flow captions** (#1): captions get their full width again instead of being cut to one or two
  characters, and the Tracks marker no longer overlaps row labels.
- **Zoom** (#7): ctrl/⌘ + wheel zooms at a gentler rate and honours the wheel's `deltaMode`, so
  trackpads and line-scrolling mice behave alike.
- **Saved judgments under a canonical name:** a judgment saved as `judgments/aska:tester.json`,
  as the panel skill now names it and most chairs already did, is recognised live and in replay.
  Before, only `judgments/tester.json` was, so the Flow skipped its collecting phase.

## 0.2.0 (2026-10-12)

The first public release of **aska-editor**: a Paseo plugin for aska.

- **A form editor** for aska's personas, units and panels, with validation, instead of editing raw
  markdown.
- **A side panel for each panel run,** beside the agent running it: the report card, the Flow
  (panelists, the files they read, the units they flagged), live activity, and captions.
  - **On a phone:** open it from the **aska run** pill in the composer, or with `/aska-run`.
- **An archive of every run,** in `~/.local/share/aska-editor/runs` (owner-only): replay how it
  unfolded, with play, a scrubber, and prev/next moments.
- **The Flow is a canvas you can pan and zoom:** drag and pinch, ctrl/⌘ + wheel on desktop, and
  −, + and Fit buttons. It fits and follows a live run until you take over.
- **Map and Tracks layouts.** Every evidence file and every quiet unit gets its own node, with no
  caps.

**Known issues:** some Flow captions are truncated, and in Tracks a unit marker overlaps the first
letter of each row label.
