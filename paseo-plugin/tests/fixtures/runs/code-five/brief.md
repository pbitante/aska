# Panel brief

**Question:** Should the aska 0.3.0 change (show/save/patch/delete authoring commands, squash commit b1511b8 on main) ship as is?

**Subject:** change

**Materials** (read these files; the repository itself is at `/home/u/project/aska` at commit b1511b8, and you may read any file in it):
- `/tmp/aska-panel-7dXmn9/commit.txt`: the commit message and file list of b1511b8.
- `/tmp/aska-panel-7dXmn9/change.diff`: the full diff, 7532256..b1511b8.
- `/tmp/aska-panel-7dXmn9/commits.txt`: `git log --reverse --stat 7532256..b1511b8`, the commit history being shipped (one squash commit).
- `/tmp/aska-panel-7dXmn9/commits-before-squash.txt`: `git log --reverse --stat` of the eight branch commits that were squashed into b1511b8 (branch `cli-authoring`, head ffbe6b4, since deleted). The tree at ffbe6b4 is identical to b1511b8.
- `/home/u/project/aska/docs/specs/2026-10-09-aska-cli-authoring-design.md`: the approved design spec for this change.

**Panel notes:** For changes to prompts or models, consider the `llm` panel as well.

**Investigation evidence** (gathered after the first round of judgments; facts only, no verdicts). Read all four files before judging. They supersede any guess in your earlier reading:
- `/tmp/aska-panel-7dXmn9/evidence/A-check.md`: `npm run check` at b1511b8 (typecheck, tests, smoke, and the bundle-vs-src drift check), and the installed copy.
- `/tmp/aska-panel-7dXmn9/evidence/B-symlinks.md`: symlink write-through, dangling links, directory links inside `personas/`, file mode, and `delete` on a link, each reproduced with the shipped bundle.
- `/tmp/aska-panel-7dXmn9/evidence/C-patch-fidelity.md`: how `patch` treats CRLF, a BOM, unindented sequences and comment spacing, including under an empty patch.
- `/tmp/aska-panel-7dXmn9/evidence/D-history.md`: the six-commit history the historian proposed, rebuilt on branch `history-rebuild` (fae22de..7e25d4b). Each commit passes `npm run check`, and the final tree is identical to b1511b8.

This is a fresh judgment of the same question. Raise, keep, lower or withdraw findings according to the evidence.
