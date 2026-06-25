# Code Quality Review: ultrawork review signals

codeQualityStatus: BLOCK
recommendation: REQUEST_CHANGES

## Scope

Reviewed current Mumuk diff for the recursive review signal fix after prior REQUEST_CHANGES.

Focused files:
- `server/src/tools/naverReviewExtractor.js`
- `server/src/agents/gimel/index.js`
- `shared/contracts/schemas.js`
- `server/src/unit/tools/naverReviewExtractor.test.js`
- `.omo/evidence/ultrawork-review-signal-notepad.md`
- `.omo/evidence/ultrawork-review-signal-qa.mjs`

Evidence artifacts inspected:
- `.omo/evidence/ultrawork-review-signal-notepad.md`
- `.omo/evidence/ultrawork-review-signal-qa.mjs`
- `.omo/evidence/ultrawork-review-signal-qa.json`

## Skill-Perspective Check

- `remove-ai-slops`: ran by reading `C:\Users\steve\.codex\plugins\cache\sisyphuslabs\omo\4.13.0\skills\remove-ai-slops\SKILL.md`. The production/test diff does not violate this perspective: the added extractor test asserts observable categories/evidence/exclusion behavior, not deletion-only behavior or implementation labels alone; the production extraction is scoped to the requested review-signal behavior.
- `programming`: ran by reading `C:\Users\steve\.codex\plugins\cache\sisyphuslabs\omo\4.13.0\skills\programming\SKILL.md` and applying its test-shape, boundary, needless-abstraction, and overfit-test review criteria. The production/test diff does not violate this perspective for the requested JavaScript changes. The remaining blocker is artifact packaging, not code/test design.

## Verification Performed

- `npm run -s test:unit -- server/src/unit/tools/naverReviewExtractor.test.js`: PASS, 30 tests.
- `npm run -s test:integration -- server/src/integration/gimel.test.js`: PASS, 5 tests.
- `npm run -s test:contract -- server/src/contract/schemas.test.js`: PASS, 26 tests.
- `npx eslint server/src/tools/naverReviewExtractor.js server/src/agents/gimel/index.js server/src/unit/tools/naverReviewExtractor.test.js server/src/integration/gimel.test.js shared/contracts/schemas.js`: PASS.
- `node .omo/evidence/ultrawork-review-signal-qa.mjs`: PASS by manual gate. Output showed `negativeExtractor.shouldExcludeFromRecommendation=true`, `positiveExtractor.shouldExcludeFromRecommendation=false`, `gimel.resultCount=1`, and Gimel `reviewSignals.doReasons` preserving both rice-noodle and kalguksu evidence.
- UTF-8 artifact probe against `.omo/evidence/ultrawork-review-signal-qa.json`: PASS, `negativeExcluded=true`, `positiveExcluded=false`, `gimelResultCount=1`, `hasRiceNoodle=true`, `hasKalguksu=true`.
- `git diff --name-status -- ...focused files...`: only the four tracked source/test files appear.
- `git status --short --ignored .omo/evidence/...`: the notepad, QA script, and QA JSON all appear as ignored (`!!`).
- `git diff --cached --name-only -- .omo/evidence/...`: empty.

Cleanup receipt: no server was started. All commands run during review exited; the QA script's expected side effect was refreshing `.omo/evidence/ultrawork-review-signal-qa.json`.

## CRITICAL

None.

## HIGH

1. Required evidence artifacts are still ignored and absent from the tracked/staged diff.
   - References: `.gitignore:5`, `.omo/evidence/ultrawork-review-signal-notepad.md`, `.omo/evidence/ultrawork-review-signal-qa.mjs`, `.omo/evidence/ultrawork-review-signal-qa.json`.
   - Evidence: `git status --short --ignored .omo/evidence/ultrawork-review-signal-notepad.md .omo/evidence/ultrawork-review-signal-qa.mjs .omo/evidence/ultrawork-review-signal-qa.json` returned all three paths as `!!`; `git diff --name-status -- ...focused files...` listed only `server/src/agents/gimel/index.js`, `server/src/tools/naverReviewExtractor.js`, `server/src/unit/tools/naverReviewExtractor.test.js`, and `shared/contracts/schemas.js`; `git diff --cached --name-only -- .omo/evidence/...` returned no paths.
   - Impact: the prior blocker "ignored evidence artifact not in diff" remains unresolved for branch/PR handoff. A reviewer who receives only the tracked diff still cannot inspect the notepad or manual QA script without out-of-band local files.
   - Must change before approval: force-add or otherwise attach the required evidence artifacts for the handoff, for example with `git add -f .omo/evidence/ultrawork-review-signal-notepad.md .omo/evidence/ultrawork-review-signal-qa.mjs .omo/evidence/ultrawork-review-signal-qa.json`, if these artifacts are meant to travel with the change.

## MEDIUM

None.

## LOW

None.

## Resolved Prior Blockers

- Mixed DO/DONT review text is now split into separate clauses before rule matching in `server/src/tools/naverReviewExtractor.js:384-452`.
- The kalguksu/noodle case is covered by `server/src/unit/tools/naverReviewExtractor.test.js:337-381` and observed in QA output.
- Gimel preservation is now proven by `node .omo/evidence/ultrawork-review-signal-qa.mjs`: result count is 1 and `firstResult.reviewSignals.doReasons` includes rice-noodle and kalguksu evidence.

## Blockers

- Force-add or otherwise attach the required ignored evidence artifacts so `.omo/evidence/ultrawork-review-signal-notepad.md`, `.omo/evidence/ultrawork-review-signal-qa.mjs`, and `.omo/evidence/ultrawork-review-signal-qa.json` are available with the handoff diff.
