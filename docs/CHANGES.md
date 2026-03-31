# Changes from Original Plan

This document tracks deviations, fixes, and additions made during initial bring-up, plus a full comparison against `docs/project-plan.md`.

---

## Plan vs. implementation

### ✅ Implemented as planned

- Full four-layer persona system (soul / identity / growth / bedrock)
- Cipher system seeded from `sha256(soul.md)` for bedrock privacy
- LLM routing architecture — meta-router → tier decision → queue → provider
- All six request types (`conversation`, `reach_out`, `reflection`, `memory_update`, `task`, `internal`)
- Queuing with per-type timeouts and cloud fallback
- Heartbeat system — regular pulse, bedrock pulse, post-processor, observer, queue
- Channel registry pattern — Telegram implemented, extensible
- SQLite via `better-sqlite3`, all operations in `src/db.ts`
- Structured logging via pino, split into `famulus.log` / `internal.log`
- git-crypt encryption of persona and context files
- File structure matches plan almost exactly (~15-17 files)
- `containsBedrock` as an explicit field, never inferred
- `OLLAMA_PC_BASE_URL` for PC inference when on

### 🔄 Implemented differently

**Config format — YAML → JSON**
Plan specified `config/llm.yml`. Implemented as `config/llm.json`. Functionally identical; JSON avoids a YAML parser dependency.

**Ollama provider structure**
Plan had a single `ollama` provider. Implementation splits it into `ollama_mini` (Mac Mini, always-on) and `ollama_pc` (PC, optional), each with their own base URL and model set. Better reflects the two-machine hardware reality.

**Local model — 1B dropped, 3B everywhere**
Plan suggested `llama3.2:1b` for meta-routing and `llama3.2:3b` for economy tasks. The 1B model proved too unreliable for structured output. All local inference now uses `llama3.2:3b` — single model stays warm, better reliability.

**`LLMRequest.urgency` moved to routing config**
Plan had `urgency` as a field on `LLMRequest` (set by the caller). Implementation puts urgency in `config/llm.json` per request type — callers don't need to know or set it. Cleaner: urgency is a routing policy, not a per-call decision.

**Pulse — single call → two-call design**
Plan described the pulse as a single open call where Ellis decides and composes everything. In practice the local model couldn't follow the persona for outgoing messages. Redesigned as two calls: `internal` (local) for the decision + reflection, `reach_out` (Claude) for composing the actual message to Daniel. See Architecture changes below.

**`user.md` — curiosity-driven → auto-updated**
Plan described `user.md` as Ellis-initiated through genuine curiosity — asking Daniel questions and writing down what she finds interesting. Implemented as automatic: the post-processor triggers a `memory_update` call after notable conversations, merging new facts into the profile. The intent is the same (Ellis's view of Daniel), the trigger is different (post-conversation rather than in-conversation curiosity).

**Meta-router prompt**
Plan included a `reason` field in the meta-router JSON response (`{ "tier": "...", "reason": "..." }`). Implementation only extracts `tier` — the reason field is unused overhead for a 3B model.

### ✅ Subsequently implemented

**Template files**
`soul.template.md`, `user.template.md`, `heartbeat.template.md` created at repo root. Plaintext, git-crypt excluded via `*.template.md` pattern already in `.gitattributes`.

**Prompt caching**
Soul + identity split into a cacheable prefix via `buildCacheablePrefix()` in `persona.ts`. Passed as a separate content block with `cache_control: { type: 'ephemeral' }` on all conversation requests. Claude caches it server-side for 5 minutes — cache hits billed at ~10% of normal input token cost.

**Web search**
`web_search_20250305` tool enabled on all `conversation` requests. Ellis decides autonomously whether to invoke it — the tool is an option, not an instruction. Required SDK upgrade from 0.39.0 → 0.80.0. Response parsing updated to filter text blocks rather than assuming `content[0]` is always text (web search returns additional block types).

**Daily session logs**
`appendToSessionLog()` added to `src/index.ts`. After every assistant reply, appends a timestamped exchange to `contexts/personal/memory/YYYY-MM-DD.md`. Directory is created if it doesn't exist. File is created with a date header on first entry of the day.

### ❌ Not yet implemented

**Conversation summarisation in pulse context**
Plan specified the local model building a summary of conversations since the last reflection as part of pulse context. Current implementation only passes timing data (hours since last reflection/reach-out) and flagged items — no conversation summary.

**Ellis self-initiating reflection**
Plan noted Ellis can choose to reflect or write to bedrock immediately after a significant conversation, without waiting for a pulse. Not implemented — the post-processor flags the conversation and it surfaces at the next pulse instead.

**`heartbeat.md` — proactive task definitions**
The file exists in the persona layer and is loaded into the system prompt, but nothing in the heartbeat system reads or parses it for scheduled tasks. Intended as Daniel's way to define standing tasks for Ellis to execute proactively.

**`launchd` service config**
Plan mentioned a `launchd/` directory for running Famulus as a Mac Mini service. Not implemented — currently run manually.

---

---

## Bug fixes

### REPO_ROOT was wrong after compilation
`src/config.ts` computed `REPO_ROOT` as `path.resolve(__dirname, '..', '..')`. The comment was written for the source path (`src/config.ts` → two levels up to root), but the compiled output sits in `dist/config.js` — only one level up. Fixed to `path.resolve(__dirname, '..')`.

### SQL clause ordering in `getMessagesSince`
`src/db.ts` had `SELECT * FROM messages ORDER BY created_at ASC WHERE created_at >= ?` — `WHERE` must come before `ORDER BY`. Fixed.

### No `.env` loading
Neither `npm start` nor `npm run dev` loaded the `.env` file. Fixed by adding Node's built-in `--env-file=.env` flag to both scripts (Node 20.6+, no dotenv dependency needed).

### `store/` and `logs/` directories missing
Both are gitignored and weren't created on first run. Created manually — better-sqlite3 throws if the directory doesn't exist.

---

## Behavioural fixes

### Telegram replies silently swallowed errors
The catch block in `src/channels/telegram.ts` caught errors without logging them, making failures invisible. Added `log.error({ err }, ...)` to the catch block.

### Telegram 4096-character limit
Long Claude responses caused `ctx.reply()` to throw. Added chunking: responses longer than 4096 characters are split into multiple messages.

### Local models not returning valid JSON
Small Ollama models (1B, 3B) wrap JSON in prose rather than returning it bare. Two fixes applied:
1. Added `format: "json"` to the Ollama API request body — forces structured output at the API level.
2. Added a regex fallback (`raw.match(/\{[^{}]*\}/)`) to extract the JSON object if present despite surrounding text.

---

## Architecture changes

### Pulse redesigned as two-call flow
The original design used a single `internal` LLM call for the entire pulse (decide + reflect + compose message). This caused reach-out messages to sound nothing like Ellis's persona, and hallucinations (fabricated quotes, invented history), because the local model doesn't follow the persona well.

**New design:**
1. `internal` call (local preferred) — Ellis decides whether to reflect and/or reach out. Writes any reflection to `growth.md`. Notes what she'd like to say in one sentence (`REACH_OUT: ... /REACH_OUT`).
2. If reaching out: separate `reach_out` call (Claude, immediate) — composes the actual message using the persona system prompt. This is what gets sent to Daniel.

This keeps the decision-making local and cheap, while ensuring outgoing messages sound like Ellis.

### `user.md` is now auto-updated
Originally `user.md` was read-only from the code's perspective — only Daniel could write to it. The post-processor now triggers a `memory_update` call after any conversation assessed as `notable` or above. The call reads the current `user.md`, the conversation transcript, and produces an updated profile of Daniel. Routed as `memory_update` (local preferred, 6h cloud fallback).

### All local inference standardised on `llama3.2:3b`
Originally the plan used `llama3.2:1b` for meta-routing and `llama3.2:3b` for economy tasks. The 1B model proved too unreliable for structured output tasks. All local calls now use `3b` — meta-router, post-processor, and bedrock candidate scan. This also means a single model stays warm in Ollama, improving response latency.

---

## Additions

### Verbose logging (`VERBOSE=true`)
Added `verboseLog` to `src/logger.ts`. When `VERBOSE=true` is set in `.env`, additional heartbeat detail is logged: pending flag count on pulse fire, parsed LLM decision with excerpts, next scheduled pulse time, post-processor summaries. No-op when unset. Intended for bring-up and debugging only.

### Prompt caching
`buildCacheablePrefix()` added to `src/persona.ts`. Reads only soul + identity. Passed as a separate field (`cacheablePrefix`) on `LLMRequest` and `ProviderRequest`, threaded through the router to `callClaude`. When present, the API call sends a two-block system prompt — stable prefix marked `ephemeral`, dynamic suffix unmarked. All conversation requests pass the prefix; other call types don't.

### Web search
`webSearch?: boolean` added to `LLMRequest` and `ProviderRequest`. When `true`, the `web_search_20250305` tool is included in the Claude API call. Ellis decides whether to invoke it. Enabled on all conversation requests. SDK updated from 0.39.0 → 0.80.0. Response parsing hardened to filter for text blocks rather than assuming `content[0]`.

### Daily session logs
`SESSION_LOG_DIR` added to `src/config.ts`. `appendToSessionLog(userText, assistantText)` added inline to `src/index.ts` — called after every assistant reply. Writes to `contexts/personal/memory/YYYY-MM-DD.md`, creating the file and directory as needed.

---

## Config format

The routing config was planned as `config/llm.yml` but was implemented as `config/llm.json`. CLAUDE.md and all references updated accordingly.

---

## Persona

Ellis's name was confirmed in the first onboarding conversation. `identity.md` updated from "Working name: The Familiar" to "Name: Ellis". CLAUDE.md updated throughout.

`growth.md` was cleared after initial bring-up — the local model had polluted it with the pulse context headers (timing data, flagged items) written verbatim as reflection content, along with fabricated quotes attributed to Daniel. The two-call pulse redesign prevents this going forward.
