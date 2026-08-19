# ADR 0021 - Mirror Notion from git, and gate on drift rather than pushing automatically

**Status:** Accepted
**Date:** 2026-08-19
**Supersedes:** -
**Superseded by:** -

## Context

Notion is the stakeholder-facing view of this project, and `docs/notion-workspace.md` §1 draws the ownership line: git owns how the system works, Notion owns how the work is going. That line is clean until a diagram has two audiences. The module map, the dependency rule, the deployment topology, the principal hierarchy and the two state machines are all facts about the system, so git owns them. They are also the fastest way to explain the shape of the product to someone who will never clone a repository.

Until now the workspace resolved this by hand-copying two diagrams and calling them deliberate exceptions. Two problems surfaced immediately. Four more diagrams were never copied at all, so the Notion picture was quietly partial. Worse, the two state machines existed **only** in Notion: a domain rule that CLAUDE.md states as a ground rule, and that invariants I4 and I5 depend on, lived in a page anyone could edit, with no history a reviewer would ever see and no test that could reference it.

Copying by hand does not survive past the first week. A stale stakeholder page is worse than no page because it gets believed, and the failure is silent. Nothing in a pull request tells you that a scope change just made a Notion page wrong.

So a mechanism is needed. The obvious one, a CI job holding a Notion token that overwrites pages on merge, is the wrong shape here for three reasons:

- **Not everything mirrored is mechanically derivable.** "How the system fits together" redraws the context diagram around people instead of processes, and turns the invariants into three plain-language properties. "What we are building" reorders the scope around what a person can do. That is editorial work, and a generator would flatten it. Five of the seven mirrored pages are of this kind.
- **Notion has no revert-by-commit and no branch protection.** A bad automated write to a page a stakeholder is reading is not recoverable the way a bad commit is. Page history exists, but recovery is manual and per page.
- **This repository is public.** A workspace-write Notion token in GitHub Actions has the entire workspace as its blast radius, in exchange for automating one page.

The one thing genuinely worth automating is the diagram copy, because it is mechanical and its source of truth is unambiguous.

## Decision

`docs/notion-mirror.json` is the register of every Notion page derived from this repository. Each entry names the page, the source sections it is built from, and a hash of that source content taken when the page was last brought up to date.

Each mirror is one of two kinds, and the kind decides what a machine may do:

- **`verbatim`** - the Notion content is the same mermaid block that is in git. A machine may overwrite it.
- **`editorial`** - the Notion page is a rewrite for a non-engineering reader. A machine must never overwrite it. Drift is reported to a person, who decides whether the stakeholder version now needs to say something different.

**Gate G15** (`tools/check_notion_mirror.py`) fails a pull request when a mirrored source section changed but the manifest was not updated. It performs no network access: it compares the manifest against the working tree, so it needs no token, cannot flake, and behaves identically on a laptop and in CI.

**Pushing is a local command, never CI.** `tools/push_notion_mirror.py`, run under `infisical run` (ADR 0020), overwrites the verbatim mirrors and stamps them current. It can only replace the body of a mermaid code block that already exists on the target page: it never creates a block, never deletes one, and never touches prose, tables, or callouts. `--accept` records that a person has updated an editorial page, and deliberately refuses to stamp a verbatim one, so the manifest cannot claim a diagram is published when it is not.

Two supporting changes follow. Every ASCII box-drawing diagram in the documentation becomes mermaid, because Notion renders mermaid natively and identical content is what makes a verbatim mirror possible at all. And the lead and deal state machines are written into `architecture.md` §6, making git their owner.

## Consequences

**Positive:** the four diagrams missing from Notion are published, and the two that existed only in Notion are now versioned in git and reviewable in a diff. A scope or architecture change can no longer silently invalidate a stakeholder page. The gate costs nothing to run and needs no credential, which is what stops it being skipped. The diagrams also render properly on GitHub now, which the ASCII versions never quite did.

**Negative / cost:** the manifest is a second thing to update, and G15 will occasionally block a pull request for a documentation edit whose stakeholder impact is nil. `--accept` is one command, but it is friction, and friction is the price of the gate noticing at all. Section headings become load-bearing: renaming one breaks the manifest until it is repointed, which the gate reports as a distinct error rather than as drift. The gate cannot see an edit made directly in Notion, so an editorial page can still rot through neglect on the Notion side; only the git side is covered. Publishing the verbatim pages needs a Notion token that does not exist yet, so those two mirrors ship marked `pending`, which the gate reports without failing.

**Rejected alternatives:**

- *A CI job that pushes every mirrored page on merge.* Rejected for the three reasons in Context: most mirrored pages are editorial and would be flattened, Notion has no clean revert, and a workspace-write token in Actions on a public repository buys automation of one page at the cost of the whole workspace.
- *Keep copying by hand and rely on the update-cadence table.* This is what was in place, and it had already failed: four diagrams missing, two living only in Notion. A convention with no gate is a preference.
- *Link to GitHub instead of mirroring at all.* Correct for the engineering documents, and that is what Delivery's Engineering documents section does. It fails for diagrams specifically, because the audience that needs the picture is the audience that will not open a repository.
- *Generate the whole stakeholder page from markdown.* Notion-flavoured markdown differs from GitHub-flavoured markdown enough, particularly on tables, that the output would need hand-repair every time. It would also discard the editorial simplification that makes those pages worth reading, which is the entire value of the workspace.
- *Store Notion block identifiers in the manifest.* Needlessly brittle. The pusher locates mermaid blocks by position and asserts the count it expects, so a page restructure produces a clear refusal instead of a write to the wrong block.

## Enforcement

Gate **G15**, `python tools/check_notion_mirror.py`, in the `guardrails` job of `.github/workflows/ci.yml`. Listed in `docs/engineering-guardrails.md` §5 and in the Definition of Done.

The pusher enforces its own bounds in code: it refuses to run when a page holds fewer mermaid blocks than the manifest addresses, it writes only `code` blocks whose language is already `mermaid`, and `--accept` refuses to stamp a verbatim mirror.
