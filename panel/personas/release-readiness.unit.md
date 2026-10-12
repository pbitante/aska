---
name: release-readiness
description: Is the repository ready to be published as it stands, files, fixtures and history included?
applies_when: The question mentions publishing, open-sourcing or releasing the code, or the change prepares a release.
threshold: low
---

## Looks for
What a stranger would get from the repository once it is public, not only what the change touched: the files a published project needs (a LICENSE, a README, a licence field in the package manifest), internal references and personal paths in code, messages and fixtures, content from private projects kept as test data, whether the git history itself can be published, and whether the version is bumped where every manifest expects it. Personal data the system handles while it runs is privacy's concern, and the licences of third-party packages are dependencies'; this unit covers what the repository itself discloses or lacks on publication.

## Questions
- Which files does a published copy need that the repository doesn't have?
- What in the code, fixtures or commit history refers to private projects, people or paths?
- Does every manifest and changelog carry the version being released?

## Red flags
- No LICENSE file or licence field in a repository about to be published
- A fixture or snapshot copied from a private project, or naming one
- Personal home paths, internal hostnames or private notes in code, messages or history
- A version bumped in one manifest but not the others the checks compare

## Good looks like
A stranger who clones the published repository finds a licence, a README, and nothing private, in its files or its history.
