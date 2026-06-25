# Agent Workflow

This repo is shared by multiple AI agents. Keep work isolated, plan-backed, and visible through draft pull requests.

## Source of Truth

- Read `.omo/plans/restaurant-recommendation-swarm-webapp.md` before changing code.
- Treat that plan as the current implementation contract unless the user gives a newer instruction.
- If the implementation needs a scope or sequencing change, update the plan in the same branch before continuing.
- Keep plan edits surgical: update only the task, dependency, verification, or decision that changed.
- Store verification artifacts under `.omo/evidence/` using the plan's `task-{N}-{slug}` convention.

## Branch Discipline

- Start every task from a clean worktree.
- Create a unique branch for each agent task, for example `codex/task-6-gimel-reviews`.
- Do not work directly on `main`.
- Do not rewrite, revert, or format files changed by another agent unless the user explicitly asks.
- Before editing shared files, check current local status and open PR context if available.

## PR Handoff Automation

When the work stops, even if it is partial, publish the branch as a draft PR so other agents can see the state and avoid conflicts.

Use this handoff shape:

```bash
git status --short
npm run lint
npm run test:unit
git add <only-your-files>
git commit -m "<type>(<scope>): <imperative>"
git push -u origin <branch>
gh pr create --draft --fill --base main --head <branch>
```

If a verification command is not relevant or cannot run, explain why in the PR body. Do not hide failures.

The PR body must include:

- Plan reference: `.omo/plans/restaurant-recommendation-swarm-webapp.md`
- Plan task number(s) touched
- Verification commands run and their results
- Evidence files produced under `.omo/evidence/`
- Known conflicts, blocked items, or follow-up work

Each implementation commit should include this footer when it implements the plan:

```text
Plan: .omo/plans/restaurant-recommendation-swarm-webapp.md
```

## Updating The Plan

- Reference the plan at the start of every agent session.
- Update the plan when reality changes: API contract, task ordering, verification command, environment contract, or scope boundary.
- Do not use the plan as a progress diary. Put run evidence in `.omo/evidence/` and summarize it in the PR.
- If multiple agents need the same plan area, prefer a small plan-only PR first, then implementation PRs can rebase on it.

## Verification Minimum

- Follow the task-specific `Verify` section in the plan.
- For UI-visible work, include browser evidence.
- For API-visible work, include HTTP or integration-test evidence.
- For documentation-only changes, run `git diff --check` at minimum.
