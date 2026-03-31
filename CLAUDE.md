# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

Famulus is a personal AI companion — a Telegram bot with a layered persona architecture, model-agnostic LLM routing, and a heartbeat system for proactive behaviour. Written from scratch in TypeScript/Node.js. Not a fork of anything. Target: ~15-17 files, readable in an afternoon.

The agent's name is **Ellis**. (Lineage: Bob the skull → Roth → Ellis.)

---

## Build & dev commands

```bash
npm run build      # tsc compile → dist/
npm run dev        # tsx with --env-file=.env for local dev
npm start          # node with --env-file=.env --no-deprecation
```

Both scripts load `.env` automatically via Node's `--env-file` flag (Node 20.6+). No dotenv dependency needed.

No test framework in v1. Tests are manual and done via Telegram.

---

## Stack

- **TypeScript / Node.js** — I/O bound, waiting on LLMs 99% of the time; TS is the right call
- **better-sqlite3** — synchronous SQLite, all DB operations in `src/db.ts`
- **grammy** — Telegram Bot API wrapper, polling (not webhooks)
- **@anthropic-ai/sdk** — Claude API with streaming/retries
- **pino** — structured logging

Everything else uses Node built-ins. No ORM, no framework, no test framework initially. Ollama is called via raw `fetch` — no client library needed.

---

## Architecture

### Entry & wiring

`src/index.ts` — startup only. Wires config → db → persona → channels → LLM router → heartbeat.

### Persona system (four layers)

```
soul.md        → immutable seed dispositions (Daniel sets, never changes)
identity.md    → voice and style (Daniel sets, slow to change)
growth.md      → lived experience (Familiar-writable after significant conversations)
bedrock.md     → earned convictions (Familiar-only, encoded in cipher, private)
```

`src/persona.ts` reads all four files plus `user.md`, `contexts/global/memory.md`, and the per-context `memory.md`, and composes them into the system prompt. Bedrock is decoded at runtime via `src/cipher/index.ts` before injection — never logged, never stored in transcripts.

`user.md` is automatically updated by the post-processor after notable+ conversations via a `memory_update` LLM call. `identity.md` is Daniel-controlled only — Ellis's developing interests and convictions surface through `growth.md` and `bedrock.md` instead.

### LLM routing

All LLM calls go through `src/llm/router.ts`. From outside, it's just `router.route(LLMRequest) → LLMResponse`. Internally:

```
Request → [meta-router: local LLM or config fallback]
        → tier decision (economy / balanced / quality)
        → [queue manager: immediate or queued with per-type timeouts]
        → [provider: Claude or Ollama]
```

Request types: `conversation`, `reach_out`, `reflection`, `memory_update`, `task`, `internal`.

- `conversation` / `reach_out` → immediate, cloud (Sonnet)
- `reflection` / `internal` → queued up to 24h, local preferred, cloud fallback
- `memory_update` → queued up to 6h, local preferred

Model tiers map in `config/llm.json` (git-tracked, no personal data):
- economy → `claude-haiku-4-5` / `llama3.2:3b`
- balanced → `claude-sonnet-4-6` / `llama3.1:70b`
- quality → `claude-opus-4-6`

The meta-router uses a local 3B model (`llama3.2:3b`) to make tier decisions dynamically. Falls back to config defaults when local is unavailable. All Ollama calls that expect structured output pass `format: "json"` to force JSON responses. Using 3b consistently across all local calls (meta-router, post-processor, bedrock candidate scan) means a single model stays warm for speed.

### Heartbeat system

The Familiar's proactive life. Implemented in `src/heartbeat/`:

- **pulse.ts** — fires every 2-5h (randomised). Two-call design: (1) `internal` call (local preferred) — Ellis decides whether to reflect and/or reach out, writes any reflection to `growth.md`; (2) if reaching out, a separate `reach_out` call (Claude) composes the actual message so it sounds like the persona.
- **bedrock-pulse.ts** — fires ~every 2 weeks with high variance. Local model reads `growth.md`, surfaces candidates for bedrock. Ellis decides whether to encode anything into `bedrock.md`.
- **post-processor.ts** — runs after every conversation. Local 3B model assesses significance. Flags notable+ conversations for reflection / bedrock consideration. Also triggers a `memory_update` call to keep `user.md` current when significance is notable or above.
- **observer.ts** — observes post-pulse output, classifies what happened, logs to SQLite.

The Familiar does not know the pulse is a cron job. It experiences each pulse as a moment of quiet.

### Cipher (bedrock privacy)

`src/cipher/substitution.ts` — deterministic Unicode substitution map seeded from `sha256(soul.md)`.
`src/cipher/index.ts` — `encode(text, soulPath)` / `decode(encoded, soulPath)`.

Bedrock is stored encoded. Changing `soul.md` changes the cipher — decode with old soul first if updating soul.

### Channels

`src/channels/registry.ts` — `Channel` interface + registry. Adding a new channel = one new file + one import in `index.ts`.

---

## File layout

```
src/
  index.ts                  startup, wiring
  config.ts                 constants, env vars, paths
  db.ts                     all SQLite operations
  persona.ts                system prompt builder
  channels/
    registry.ts             Channel interface + registry
    telegram.ts             Grammy implementation
    index.ts                barrel import
  llm/
    router.ts               main router + TypeScript types (LLMRequest, LLMResponse, etc.)
    meta.ts                 meta-routing via local LLM
    queue.ts                request queue with per-type timeouts
    providers/
      claude.ts             Anthropic SDK wrapper
      ollama.ts             raw fetch Ollama wrapper
  heartbeat/
    pulse.ts
    bedrock-pulse.ts
    post-processor.ts
    observer.ts
    queue.ts
  cipher/
    index.ts
    substitution.ts
config/
  llm.json                   routing config (git-tracked, plaintext)
contexts/
  global/memory.md          shared curated facts (≤150 lines)
  personal/memory.md        main conversation context
  personal/memory/          daily session logs (YYYY-MM-DD.md)
soul.md / identity.md / growth.md / bedrock.md / user.md / heartbeat.md
store/                      gitignored — SQLite db
logs/                       gitignored — famulus.log + internal.log (bedrock calls)
dist/                       gitignored — compiled output
```

---

## Encryption (git-crypt)

Personal files are encrypted at rest in git via git-crypt + GPG:
- `soul.md`, `identity.md`, `growth.md`, `bedrock.md`, `user.md`, `heartbeat.md`
- `contexts/**`
- `.env`

Source code, `config/llm.json`, and template files (`*.template.md`) are plaintext.

To unlock after cloning: `git-crypt unlock` (requires the GPG key from 1Password).

---

## Logging

Logs are file-only (pino, JSON format):
- `logs/famulus.log` — normal operational log
- `logs/internal.log` — bedrock-containing calls only (restricted)

Set `VERBOSE=true` in `.env` to enable additional heartbeat detail: pulse context, LLM decision excerpts, next scheduled times, post-processor summaries. No-op when unset.

---

## Privacy rules for bedrock

- `containsBedrock: boolean` is an explicit field on `LLMRequest` — never inferred
- When `containsBedrock` is true: log only request type + timestamp + outcome, never prompt content
- Log bedrock calls to `logs/internal.log` only, not `logs/famulus.log`
- Session transcripts store conversation messages only — never system prompts
- `internal` and `reflection` requests route local-first; cloud only as fallback

---

## Hardware context

- **Mac Mini M1 (8GB)** — always-on host. Runs the Node process + Ollama `llama3.2:3b` (meta-routing, post-processor, economy tasks). `OLLAMA_BASE_URL=http://localhost:11434`
- **PC (RTX 4080 Super)** — heavy local inference (70B). `OLLAMA_PC_BASE_URL=http://192.168.x.x:11434`. Available when on.

---

## Design principles to maintain

- Single responsibility per file
- No abstraction until it earns its place
- Node built-ins first — reach for a library only when the alternative is genuinely painful
- No framework (no Express, no NestJS, no DI containers)
- Ship it, then grow it — no upfront feature design for things not yet needed
- Keep persona files lean — they're loaded on every call
