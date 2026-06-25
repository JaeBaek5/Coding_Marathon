# Mumuk

Multi-agent restaurant recommendation web app with a Svelte client and Express backend.

## Documentation

| Document | What it covers |
| --- | --- |
| [docs/CLAUDE.md](docs/CLAUDE.md) | Agent-facing behavioral guidance and repo rules. |
| [docs/DESIGN.md](docs/DESIGN.md) | UI tokens, layout system, and design constraints. |
| [docs/MAP_RUNTIME.md](docs/MAP_RUNTIME.md) | Map readiness, public config, SDK loading, and client map state. |
| [docs/MAP_DATA_FLOW.md](docs/MAP_DATA_FLOW.md) | Location search, provider adapters, route flow, and ranking inputs. |
| [docs/MAP_GROUNDING.md](docs/MAP_GROUNDING.md) | Canonical review URLs, extraction rules, and grounded reason constraints. |

## Verification commands

- `npm run lint`
- `npm run test:unit`
- `npm run test:contract`
- `npm run test:integration`
- `npm run test:e2e`
- `npm run smoke`

## Swarm observability

The backend emits structured JSON logs for:

- HTTP request lifecycle
- Orchestrator, Aleph, Bet, and Gimel agent hops
- Provider call start/success/failure
- Cache hit/miss/set/fill/expiry behavior

These logs are intended for smoke verification and failure triage without changing backend architecture.

## Environment contract

Provider credentials are optional for local verification because the repository includes fixture-backed fallbacks.

Shared OpenAI-compatible runtime variables:

- `LLM_API_KEY`
- `LLM_BASE_URL`
- `LLM_MODEL_ORCHESTRATOR`
- `LLM_MODEL_ALEPH`
- `LLM_MODEL_GIMEL`
- `LLM_MODEL_BET` (optional)
- `LLM_TIMEOUT_MS`

Compatibility rule: switching to another OpenAI-compatible endpoint should require changing environment variables only.

## Grounding and unsupported fields

Gimel may use only sanitized candidate metadata plus scraped review facts. It must not mention:

- coordinates, latitude, or longitude
- fabricated ratings or review counts
- guessed price or popularity
- unsupported provider fields that are `null` or unavailable

If scraping fails, Gimel must omit unsupported facts and use deterministic fallback wording instead.

## Smoke matrix

The smoke suite covers:

- main swarm happy path
- provider outage handling
- no-results handling
- route failure handling
- unsupported browser/geolocation failure path
