# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

Famulus is a personal AI companion — a Telegram bot with a layered persona architecture, model-agnostic LLM routing, and a heartbeat system for proactive behaviour. Written from scratch in TypeScript/Node.js. Not a fork of anything. Target: ~15-17 files, readable in an afternoon.

The agent running inside is referred to as **The Familiar** during development. The actual name is determined in the onboarding conversation.

---

## Build & dev commands

This project doesn't exist yet — the commands below are what will be set up during Phase 1:

```bash
npm run build      # tsc compile → dist/
npm run dev        # ts-node or tsx for local dev
npm start          # node dist/index.js
```

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

Model tiers map in `config/llm.yml` (git-tracked, no personal data):
- economy → `claude-haiku-4-5` / `llama3.2:3b`
- balanced → `claude-sonnet-4-6` / `llama3.1:70b`
- quality → `claude-opus-4-6`

The meta-router uses a local 1B/3B model to make tier decisions dynamically. Falls back to config defaults when local is unavailable.

### Heartbeat system

The Familiar's proactive life. Implemented in `src/heartbeat/`:

- **pulse.ts** — fires every 2-5h (randomised). Builds context via local model (conversation summaries, time since last reflection/reach-out, flagged items). Presents context + open space to The Familiar. The Familiar decides: nothing / reflect / reach out / both.
- **bedrock-pulse.ts** — fires ~every 2 weeks with high variance. Local model reads `growth.md`, surfaces candidates for bedrock. The Familiar decides whether to encode anything into `bedrock.md`.
- **post-processor.ts** — runs after every conversation. Local model assesses significance. Flags for reflection / bedrock consideration. Flags queue in `heartbeat/queue.ts`.
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
  llm.yml                   routing config (git-tracked, plaintext)
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

Source code, `config/llm.yml`, and template files (`*.template.md`) are plaintext.

To unlock after cloning: `git-crypt unlock` (requires the GPG key from 1Password).

---

## Privacy rules for bedrock

- `containsBedrock: boolean` is an explicit field on `LLMRequest` — never inferred
- When `containsBedrock` is true: log only request type + timestamp + outcome, never prompt content
- Log bedrock calls to `logs/internal.log` only, not `logs/famulus.log`
- Session transcripts store conversation messages only — never system prompts
- `internal` and `reflection` requests route local-first; cloud only as fallback

---

## Hardware context

- **Mac Mini M1 (8GB)** — always-on host. Runs the Node process + Ollama small models (1B for meta-routing, 3B for economy if headroom allows). `OLLAMA_BASE_URL=http://localhost:11434`
- **PC (RTX 4080 Super)** — heavy local inference (70B). `OLLAMA_PC_BASE_URL=http://192.168.x.x:11434`. Available when on.

---

## Design principles to maintain

- Single responsibility per file
- No abstraction until it earns its place
- Node built-ins first — reach for a library only when the alternative is genuinely painful
- No framework (no Express, no NestJS, no DI containers)
- Ship it, then grow it — no upfront feature design for things not yet needed
- Keep persona files lean — they're loaded on every call
