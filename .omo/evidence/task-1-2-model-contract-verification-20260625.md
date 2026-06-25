# Task 1-2 Model And Contract Verification - 2026-06-25

Plan: `.omo/plans/restaurant-recommendation-swarm-webapp.md`
Branch: `dev`

## Scope

- Task 1: shared LLM runtime/env contract.
- User override: all default/shared LLM model references now use `anthropic/claude-sonnet-4.6`.
- Task 2: swarm contract schemas and canonical college-student prompt fixture.

## Commands

```powershell
npm run test:unit -- --run server/src/unit/llm/config.test.js server/src/unit/llm/client.test.js
```

Result: pass, 2 files, 9 tests.

```powershell
npm run test:integration -- --run server/src/integration/api.test.js
```

Result: pass, 1 file, 18 tests.

```powershell
npm run test:contract
```

Result: pass, 3 files, 35 tests.

```powershell
npx prettier --check server/src/contract/schemas.test.js server/src/integration/api.test.js server/src/unit/llm/config.test.js shared/contracts/schemas.js shared/fixtures/canonical-college-student-prompt.json
```

Result: pass.

```powershell
rg -n "cohere/north-mini-code:free" -S . --glob "!node_modules/**" --glob "!poc/.env" --glob "!poc/streamlit.log"
```

Result: no matches.

```powershell
git diff --check
```

Result: pass; only CRLF conversion warnings from Git.

## Lint Note

`npm run lint` did not pass because the repository already has broader Prettier check failures outside this task, including docs, existing POC JSON artifacts, and server files not changed for this task. The files changed for Task 1/2 were formatted with Prettier and passed the focused Prettier check above.

## Review Note

The attempted subagent review-work lanes did not produce a usable five-lane approval because one QA lane hit account usage limits and two review lanes returned `not_found` after continuation. Treat subagent review as inconclusive, not as approval. The verification evidence above is from direct command execution on the current worktree.
