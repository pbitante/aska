---
name: author
description: Help the user write, design, or create a persona or a unit for the aska plugin, or tune and adjust an existing one. Use when the user wants a new reviewer point of view, wants a persona to care about different things, or wants to add a concern that no unit covers.
---

# author

You help the user create or tune a persona: a set of ranked concerns ("units") plus a stance, which changes what Claude notices and recommends. **Draft first, then interview.** After one or two framing questions, propose a complete draft for the user to edit. Don't ask a long list of open questions.

## Tools

Before anything else, check that `<base directory>/../operator/scripts/persona.mjs` exists. If it doesn't, stop and tell the user: "This skill must be used from the aska plugin (its operator skill and CLI are missing)." Don't try to work without it.

Run the persona CLI from the user's project directory, through the operator skill's bundle. Its path is relative to this skill's base directory, which Claude Code shows when the skill loads:

    node "<base directory>/../operator/scripts/persona.mjs" <command>

- `list units --json` and `list personas --json`: what exists, in which scope, and what is shadowed.
- `validate <name>`: errors and warnings for one persona.
- `explain <name>`: the effective persona (tiers, thresholds, stance) and its clash report.
- `render <name>`: write the output style and panel subagent (optional, at the end).

Files go in `.claude/personas/` (project scope, shared through the repository) or `~/.claude/personas/` (user scope, personal), as `<name>.persona.md` and `<name>.unit.md`. **Never write or edit files inside the plugin's install path.** Those are a versioned cache that gets replaced on update. For the formats, load `reference/formats.md` before you write a file.

## New persona

1. **Frame.** Ask what the persona is for: the decision or review it sits in on, and whose priorities it brings. Run `list personas --json`. If a close persona exists, offer to extend it (`extends: <name>`) instead of starting from scratch.
2. **Propose units.** Run `list units --json`. Draft a tiering, giving a one-line reason for each unit:
   - **primary**: ranked, at most 7. What this persona cares about most.
   - **secondary**: worth a glance.
   - **deprioritized**: concerns Claude habitually raises that this persona should resist.

   Leave everything else out; unlisted units stay silent. Prefer starter units by their bare name. Load `reference/choosing-units.md` for how to rank, for when to deprioritize rather than leave a unit out, and for pinned versus bare references. Show the draft and let the user edit it.
3. **Fill gaps.** If the user names a concern no unit covers, first check whether an existing unit is close enough. If not, draft a new unit following `reference/writing-units.md`, and save it next to the persona.
4. **Tune.** Suggest thresholds for the primary units ("how serious must something be before this persona raises it?"). Ask for project-specific `add_questions` or `add_red_flags`.
5. **Voice.** Draft `## Stance` and `## Tie-breaking`. Tie-breaking must name units by their canonical name and say which wins. Optionally add extra prose, such as team context. Load `reference/voice.md`. Let the user edit.
6. **Extras, only if relevant.** Judgment sections (persona-specific parts of a review) and capabilities (skills or MCP servers the persona should use).
7. **Save.** If the user already named a scope, use it. Otherwise ask which scope: project (shared) or user (personal). Don't assume. New units go in the same scope as the persona.
8. **Check.** Write the files. Claude Code treats `.claude/` as protected, so it asks the user to approve each write there. If a write is denied, stop and tell the user which file you need to write and that they must approve it. Don't retry through Bash, and never save the file anywhere else (the project root, another folder, a temporary file): personas outside the two persona folders are never loaded. Run `validate <name>` and fix, without asking, only the errors and warnings on the files you wrote this session. Report any other warning — an untyped file, a stale render, a plugin-list problem — to the user instead of acting on it; a stale render is handled by step 10's optional `render`. Then run `explain <name>` and show a short summary: the tiers with thresholds, the stance in one line, and the tie-breaking rule.
9. **Contrast.** If other personas exist, compare with the nearest one (the one sharing the most primary units). Say which units sit in different tiers and which thresholds differ. If the primary sets are identical, say so, and suggest how to make this persona actually different.
10. **Render (optional).** Offer `render <name>`, and remind the user to restart Claude Code before choosing the new output style.

## Tuning an existing persona

Run `explain <name>` and ask what feels wrong. Then repeat steps 2–10 as needed.

If the persona lives in a plugin, **never edit it in place**. Create a child with the same name in user or project scope (`name: <name>`, `extends: <name>`), containing only the changes. Then explain any clashes `validate` reports, and the keep/flip choice for each: `<id>: child` keeps your change, `<id>: parent` gives the plugin's value back.

## Style

- Show drafts as the actual file content, not as a description of it.
- Keep each turn to one decision.
- Use the user's words in the stance and in descriptions.
