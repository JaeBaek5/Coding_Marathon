Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. Shared Agent Workflow

**Keep multi-agent work plan-backed and visible.**

- Read `.omo/plans/restaurant-recommendation-swarm-webapp.md` before implementation.
- Treat that plan as the current contract unless the user gives a newer instruction.
- Update the plan when scope, task order, verification, environment contract, or API contract changes.
- Do not use the plan as a progress diary. Put run evidence in `.omo/evidence/` and summarize it in the PR.
- If multiple agents need the same plan area, prefer a small plan-only PR first.

## 6. Git And PR Handoff

**End work by publishing state, not by leaving a hidden local branch.**

- Work on a unique branch per task, for example `codex/task-6-gimel-reviews`.
- Do not work directly on `main`.
- Stage only files you changed intentionally.
- Commit completed logical units with a conventional message.
- Add `Plan: .omo/plans/restaurant-recommendation-swarm-webapp.md` as a footer for plan implementation commits.
- Push the branch and open a draft PR when stopping, even if work is partial.

The PR body must include:

- Plan task number(s) touched
- Verification commands run and results
- Evidence files under `.omo/evidence/`
- Known conflicts, blocked items, or follow-up work

If verification cannot run, state the blocker directly. Do not present unverified work as complete.
