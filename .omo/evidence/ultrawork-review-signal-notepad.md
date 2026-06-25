# Ultrawork Review Signal Notepad

Tier: HEAVY
Justification: expands recommendation domain analysis and filtering contracts that directly affect user-visible recommendations.

Skills:
- programming: JS behavior and tests will be edited.
- debugging: user reports wrong recommendation reasoning; runtime evidence required.
- review-work: HEAVY verification gate requires reviewer pass.

Manual QA scenario:
- Tool: node --input-type=module
- Invocation: run a one-shot script importing extractNaverReviews and GimelAgent with concrete synthetic review state.
- PASS observable: JSON contains reviewPhotos, inferred category signals for meat/Vietnamese-noodle reviews, DO reasons, DONT reasons, and concise reason without raw labels.

Cleanup receipt:
- No server will be started.
- Node one-shot process exits after QA.

## Evidence
- RED: `npm run -s test:unit -- server/src/unit/tools/naverReviewExtractor.test.js` failed with `Cannot read properties of undefined (reading 'categories')` for reviewSignals.
- GREEN: `npm run -s test:unit -- server/src/unit/tools/naverReviewExtractor.test.js` -> 30 passed.
- GREEN: `npm run -s test:integration -- server/src/integration/gimel.test.js` -> 5 passed.
- GREEN: `npm run -s test:contract -- server/src/contract/schemas.test.js` -> 26 passed.
- GREEN: targeted ESLint for review extractor, Gimel, tests, and schemas passed.
- Manual QA: `node .omo/evidence/ultrawork-review-signal-qa.mjs` -> PASS. Artifact: `.omo/evidence/ultrawork-review-signal-qa.json`.

## Findings
- First manual QA attempt via PowerShell pipe corrupted Korean input; reran through UTF-8 `.mjs` evidence script.
- No server/process was started. Cleanup receipt: the node QA process exited normally; persistent artifacts are evidence files only.

## Self Review Notes
- DO signals are category-agnostic rule groups, not just the user's two examples.
- DONT reasons with 2+ strong signals now force recommendation exclusion.
- ReviewSignals schema is parsed at response boundaries.
- GREEN: `npm run -s test:unit -- server/src/unit/tools/naverReviewExtractor.test.js server/src/unit/agents/bet.test.js client/src/App.test.js` -> 46 passed.
- GREEN: `npm run -s test:integration -- server/src/integration/gimel.test.js server/src/integration/api.test.js` -> 25 passed.
- GREEN: `npm run build --workspace=client` -> built successfully.
- Reviewer lane 019f00c4-da97-72e1-bd66-7ae3485dcb9a timed out twice; not counted as approval. Smaller reviewer lane 019f00c8-373b-78f2-a82a-7f1d33a900b7 spawned.

## Reviewer Fix Cycle
- REQUEST_CHANGES: first reviewer found mixed DO/DONT review text still collapsed, 칼국수/면 case missing from `doReasons`, and Gimel preservation unproven because QA resultCount was 0.
- RED: `npm run -s test:unit -- server/src/unit/tools/naverReviewExtractor.test.js` failed at the expanded recursive review test because 칼국수 evidence was absent from `doReasons`.
- GREEN: review extraction now splits contrast clauses and keeps separate DO/DONT evidence; same-label DO reasons can keep different evidence sentences.
- GREEN: `npm run -s test:unit -- server/src/unit/tools/naverReviewExtractor.test.js` -> 30 passed.
- GREEN: `npm run -s test:integration -- server/src/integration/gimel.test.js` -> 5 passed.
- GREEN: `npm run -s test:contract -- server/src/contract/schemas.test.js` -> 26 passed.
- GREEN: `npx eslint server/src/tools/naverReviewExtractor.js server/src/agents/gimel/index.js server/src/unit/tools/naverReviewExtractor.test.js server/src/integration/gimel.test.js shared/contracts/schemas.js` -> passed.
- Manual QA: `node .omo/evidence/ultrawork-review-signal-qa.mjs` -> PASS. Negative extractor excluded mixed DONT candidate; positive extractor preserved Vietnamese/noodle DO signals; Gimel resultCount was 1 with reason `쌀국수와 베트남 음식 만족도가 높습니다.`
- Cleanup receipt: no server was started; node QA process exited normally.
- Evidence caveat: `.omo/evidence/*` is ignored by git, so these artifacts require `git add -f` if they need to be committed.

## Completion Audit 2026-06-26 07:13 KST
- Requirement: infer category and venue signals from review text beyond fixed examples. Evidence: recursive review unit test covers meat, Vietnamese/noodle, western, mixed Chinese/noodle, and kalguksu/noodle evidence; extractor output includes categories `meat`, `vietnamese`, `noodle`, `western`, `chinese`.
- Requirement: split DO and DONT reasons. Evidence: mixed review `짬뽕은 새우가 없어서 아쉬웠지만 짜장면은 잘 넘어가고...` yields DONT evidence `짬뽕은 새우가 없어서 아쉬웠지만` and DO evidence `짜장면은 잘 넘어가고...`.
- Requirement: recommendation filtering uses DONT reasons. Evidence: QA artifact `negativeExtractor.shouldExcludeFromRecommendation=true` when DONT signals include material, service, and hygiene issues.
- Requirement: summaries and Gimel result preserve useful DO reasons. Evidence: QA artifact `gimel.resultCount=1`, `gimel.firstResult.reviewSignals.doReasons` includes 쌀국수, 칼국수, and 대화 evidence, and reason says `쌀국수와 베트남 음식 만족도가 높습니다.`
- Requirement: failing-first proof. Evidence: RED test failed before same-label evidence preservation fix because 칼국수 evidence was absent from `doReasons`.
- Final verification: unit review extractor 30 passed; Gimel integration 5 passed; contract schemas 26 passed; targeted ESLint passed; manual QA script passed.
- Reviewer status: `019f00d1-12c9-7072-bda0-011c5ca29c8e` timed out twice and is not counted as approval.
