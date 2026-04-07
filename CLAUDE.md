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

`src/index.ts` — startup only. Runs soul integrity check first, then wires config → db → persona → channels → LLM router → heartbeat.

### Soul protection

On every startup, `src/cipher/soul-guard.ts` computes `sha256(soul.md)` and compares it against the stored reference in `soul.md.sha256`. If they differ, it prints a clear error to console and throws — halting before bedrock is decoded or any LLM calls are made.

On first run (no `soul.md.sha256` yet), the hash is written and startup continues normally. After verifying the hash is correct, set `chmod 444 soul.md` on the host to prevent accidental edits.

`soul.md.sha256` is git-tracked and plaintext (not git-crypt encrypted — it contains no personal data, just a hash).

### Persona system (four layers)

```
soul.md        → immutable seed dispositions (Daniel sets, never changes)
identity.md    → voice and style (Daniel sets, slow to change)
growth.md      → lived experience (Familiar-writable after significant conversations)
bedrock.md     → earned convictions (Familiar-only, encoded in cipher, private)
```

`src/persona.ts` reads all four files plus `user.md`, `contexts/global/memory.md`, and the per-context `memory.md`, and composes them into the system prompt. Bedrock is decoded at runtime via `src/cipher/index.ts` before injection — never logged, never stored in transcripts.

`buildTemporalContext()` in `src/persona.ts` appends Daniel's current local time (derived from `DANIEL_TIMEZONE`) to every system prompt, so Ellis is always time-aware.

`user.md` is automatically updated by the post-processor after notable+ conversations via a `memory_update` LLM call. `identity.md` is Daniel-controlled only — Ellis's developing interests and convictions surface through `growth.md` and `bedrock.md` instead.

### LLM routing

All LLM calls go through `src/llm/router.ts`. From outside, it's just `router.route(LLMRequest) → LLMResponse`. Internally:

```
Request → [meta-router: local LLM or config fallback]
        → tier decision (economy / balanced / quality)
        → [image check: force cloud, minimum Sonnet if hasImage]
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

`Message.content` is `string | ContentBlock[]`. Messages with image content are passed through to Claude natively; Ollama-bound calls receive text-only via `toTextMessages()`.

### Vision

Ellis can receive and respond to images sent via Telegram. When a photo is received, `telegram.ts` downloads the highest-resolution version, base64-encodes it, and passes it to `handleMessage` alongside any caption text.

In `index.ts`, image messages are stored as `[image]` (+ caption if present) in SQLite for history and post-processor use. The actual Claude call receives the full content blocks. The `hasImage` flag on `LLMRequest` forces cloud routing and upgrades economy tier to balanced — Haiku vision is too weak.

Photos only in v1. Telegram documents and stickers are not handled.

### Heartbeat system

The Familiar's proactive life. Implemented in `src/heartbeat/`:

- **pulse.ts** — fires every 2-5h (randomised). Local 3B decides whether to reflect and/or reach out based on time elapsed and pending reflection flags. Reflection flags are a strong signal — if any are pending, the model defaults to reflecting. Reach-outs are suppressed during quiet hours (hard guardrail in code, not model judgment). Reflection flags are only consumed when a reflection is actually written. Bedrock flags are left for the bedrock pulse.
- **bedrock-pulse.ts** — fires every 10-20 days. Local model reads `growth.md` and any pending bedrock flags, surfaces candidates. Ellis (Claude) decides whether to encode anything into `bedrock.md`. Bedrock flags are marked surfaced after the pulse regardless of outcome.
- **post-processor.ts** — runs after every conversation. Local 3B assesses significance with a 2-3 sentence summary. Flags significant conversations for reflection, very_significant for both reflection and bedrock. Notable+ conversations trigger a `memory_update` call to keep `user.md` current.
- **observer.ts** — observes post-pulse output, classifies what happened, logs to SQLite.

The Familiar does not know the pulse is a cron job. It experiences each pulse as a moment of quiet.

Pulse context includes Daniel's current local time so Ellis knows whether it's morning, evening, or night when composing reach-out messages.

### Cipher (bedrock privacy)

`src/cipher/substitution.ts` — deterministic Unicode substitution map seeded from the first 8 hex digits of `sha256(soul.md)`, used to initialise a PRNG for a Fisher-Yates shuffle.
`src/cipher/index.ts` — `encode(text)` / `decode(encoded)`. Maps are cached module-level; soul.md doesn't change at runtime.
`src/cipher/soul-guard.ts` — startup integrity check. Halts with a clear error if soul.md has drifted from its reference hash.

Bedrock is stored encoded. soul.md must not change — it is the cipher key. If soul.md is accidentally modified, restore it with `git checkout soul.md` and restart.

### Channels

`src/channels/registry.ts` — `Channel` interface + registry. `MessageHandler` signature: `(text: string, imageBase64?: string) => Promise<string>`. Adding a new channel = one new file + one import in `index.ts`.

---

## File layout

```
src/
  index.ts                  startup, wiring, soul integrity check
  config.ts                 constants, env vars, paths
  db.ts                     all SQLite operations
  persona.ts                system prompt builder + buildTemporalContext()
  channels/
    registry.ts             Channel interface + registry
    telegram.ts             Grammy implementation, photo download
    index.ts                barrel import
  llm/
    router.ts               main router + TypeScript types (LLMRequest, LLMResponse, ContentBlock, etc.)
    meta.ts                 meta-routing via local LLM
    queue.ts                request queue with per-type timeouts
    providers/
      claude.ts             Anthropic SDK wrapper
      ollama.ts             raw fetch Ollama wrapper
  heartbeat/
    pulse.ts                regular pulse, quiet hours guard, reflection/reach-out logic
    bedrock-pulse.ts        bedrock consideration pulse, reads bedrock flags
    post-processor.ts       post-conversation assessment, flag creation, user.md updates
    observer.ts             pulse outcome logging
    queue.ts                flag queue re-exports
  cipher/
    index.ts                encode() / decode() — cached, soul-derived
    substitution.ts         substitution map builder + PRNG
    soul-guard.ts           startup soul integrity check
config/
  llm.json                   routing config (git-tracked, plaintext)
contexts/
  global/memory.md          shared curated facts (≤150 lines)
  personal/memory.md        main conversation context
  personal/memory/          daily session logs (YYYY-MM-DD.md)
soul.md / identity.md / growth.md / bedrock.md / user.md / heartbeat.md
soul.md.sha256              reference hash for soul integrity check (git-tracked, plaintext)
store/                      gitignored — SQLite db
logs/                       gitignored — famulus.log + internal.log (bedrock calls)
dist/                       gitignored — compiled output
```

---

## Environment variables

Required:
```
ANTHROPIC_API_KEY=
TELEGRAM_BOT_TOKEN=
```

Optional (with defaults):
```
OLLAMA_BASE_URL=http://localhost:11434       # Mac Mini local Ollama
OLLAMA_PC_BASE_URL=                          # PC Ollama (70B), used when on
DANIEL_TIMEZONE=Australia/Sydney             # IANA timezone for temporal context + quiet hours
QUIET_HOURS_START=22                         # Hour (0-23) — no reach-outs after this
QUIET_HOURS_END=8                            # Hour (0-23) — no reach-outs before this
VERBOSE=                                     # Set to 'true' for heartbeat detail in logs
```

---

## Encryption (git-crypt)

Personal files are encrypted at rest in git via git-crypt + GPG:
- `soul.md`, `identity.md`, `growth.md`, `bedrock.md`, `user.md`, `heartbeat.md`
- `contexts/**`
- `.env`

Source code, `config/llm.json`, and `soul.md.sha256` are plaintext.

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
