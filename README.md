# aska

aska gives Claude Code swappable reviewer personas. A persona is built from small, reusable
concern units (rollback safety, cost, edge cases, …), each placed in a tier and tuned, so two
personas look at the same change and notice different things. A panel puts several personas in
front of one question at once and shows where and why they disagree.

This repo holds two plugins: `aska` for Claude Code, and `aska-editor`, a Paseo plugin that edits
aska's files in forms and replays its panel runs.

## What's here

| Path | What it is |
| --- | --- |
| [`panel/`](panel/README.md) | The Claude Code plugin `aska`: the skills `/aska:panel`, `/aska:author`, `/aska:operator` and `/aska:gate`, plus starter units, personas and panels. |
| [`paseo-plugin/`](paseo-plugin/README.md) | The Paseo plugin `aska-editor`: the form editor, the panel-run side panel, archived runs and the Flow replay. |
| [`panel/CHANGELOG.md`](panel/CHANGELOG.md), [`paseo-plugin/CHANGELOG.md`](paseo-plugin/CHANGELOG.md) | What changed in each release of `aska` and `aska-editor`; each version's section is its GitHub release notes. |
| [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json) | The Claude Code marketplace that lists `aska`. |

## Install

Claude Code:

```
/plugin marketplace add pbitante/aska
/plugin install aska@aska
```

Paseo (0.11 or later, with aska installed in Claude Code first):

```
paseo plugin install git:pbitante/aska:paseo-plugin
```

## Status

Personal tools shared as-is. Issues and PRs are welcome at https://github.com/pbitante/aska/issues; expect slow replies.

## Licence

GPL-3.0-or-later. See [`LICENSE`](LICENSE).
