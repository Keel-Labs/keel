# AGENTS.md

## Purpose
Use Codex in a strict human-led workflow. Codex writes and analyzes code; humans own scope, architecture, safety, review, and merge decisions.

## Team Roles
- `Driver`: defines the task, constraints, and definition of done.
- `Reviewer`: reviews diffs, challenges assumptions, runs spot checks, and approves or rejects the change.

Every non-trivial change should have a clear Driver and Reviewer.

## Branch Discipline
- Never do Codex work directly on `main`.
- Keep `main` releasable and in sync with remote.
- Use one branch per outcome.
- If scope expands, start a new branch.
- Preferred branch names:
  - `feature/<topic>`
  - `fix/<topic>`
  - `chore/<topic>`
  - `codex/<topic>` for temporary Codex-only work

Before starting work:
1. Confirm the current branch is correct.
2. Commit or stash unrelated local changes.
3. Pull or merge the latest `main` if needed.

Before opening a PR:
1. Rebase or merge from `main` when needed.
2. Resolve conflicts intentionally.
3. Re-run required checks.

## Worktree Discipline
- Prefer a separate worktree for each active Codex task when practical.
- Do not reuse a dirty worktree for unrelated work.
- If multiple people or agents are working in parallel, isolate them by branch and ideally by worktree.

## Task Framing
The Driver should provide:
1. Goal
2. Constraints
3. Definition of done
4. Likely files or subsystems to touch
5. Checks that must pass before handoff

Prefer small, reviewable tasks:
- one bug
- one feature slice
- one refactor
- one test addition

Avoid bundling feature work, refactors, and cleanup in one pass unless explicitly requested.

## Git Checkpoints
- Make a checkpoint before risky Codex changes.
- Prefer small, reversible commits over one large commit.
- Keep unrelated changes out of the same commit.

Good commit style:
- `feat: add token refresh flow for expired sessions`
- `fix: handle missing org id in audit export`
- `test: cover retry backoff edge cases`
- `refactor: split provider auth helpers from api client`

## PR Discipline
Every branch should go through a PR before merge.

PRs should include:
- clear title
- short summary
- risks or edge cases
- test evidence
- screenshots or logs when relevant

At least one human reviewer should approve before merge. Codex review can help, but it is not the only approval signal.

## Diff Review Rules
Review Codex output as a diff, not as trusted truth.

Review for:
- correctness
- scope creep
- unnecessary complexity
- missing tests
- security issues
- performance regressions
- hidden behavior changes
- weak naming or unclear abstractions

Reject changes that are difficult to explain simply.

## Testing And Verification
For non-trivial changes, Codex should:
1. add or update tests when appropriate
2. run the smallest relevant checks first
3. run broader required checks before handoff
4. report the exact checks run and the results

Default expectation:
- targeted tests for touched code
- lint, typecheck, and build when applicable

Do not claim success without reporting actual results. If checks cannot run, say so explicitly and explain why.

## Guardrails
Codex must not:
- invent requirements
- silently change public APIs without calling it out
- add dependencies unless explicitly approved
- mix unrelated cleanup into the same task
- disable tests or checks to get green results
- commit secrets, tokens, or private keys
- bypass review or merge policy

Codex should explicitly call out:
- ambiguous requirements
- data model or migration risk
- auth or permission changes
- infra or deployment impact
- backward compatibility concerns

## Refactors And Dependencies
- Refactors should preserve behavior unless behavior changes are explicitly requested.
- Separate refactor commits from behavior changes when practical.
- Major dependency adds or upgrades require explicit approval.

When proposing a new dependency, explain:
- why it is needed
- why existing code or dependencies are insufficient
- blast radius
- relevant license, security, or bundle-size impact

## When To Stop And Ask
Pause instead of guessing when:
- the change conflicts with existing conventions
- multiple architecture paths are plausible and materially different
- the task risks deleting important behavior or data
- requirements are contradictory
- the task needs secrets, production access, or policy decisions

When pausing, present:
1. the decision to make
2. 2-3 viable options
3. tradeoffs
4. the recommended option

## Definition Of Done
A task is done only when:
- the requested change is implemented
- the diff is scoped and reviewable
- relevant checks were run, or inability was clearly explained
- important risks and follow-ups were called out
- the branch is ready for PR or the PR is updated

## Suggested Codex Prompt
Use this pattern when starting work:

> Read `AGENTS.md` and follow it. Summarize the task, propose a short plan, implement in small reviewable steps, report the diff summary, run the relevant checks, and call out risks or follow-up items before suggesting commit or PR readiness.

