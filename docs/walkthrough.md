# Famulus — Codebase Walkthrough

A running explanation of every file in the codebase, written as we build it.

---

## `package.json`

Declares the project's identity, dependencies, and scripts.

**`"type": "module"`** — switches the whole project to ESM (ES Modules), the modern Node module system. This means `import`/`export` everywhere instead of `require`/`module.exports`. A quirk of ESM in Node: import paths must end in `.js` even when the source file is `.ts`. TypeScript understands this.

**Scripts:**
- `npm run build` — runs `tsc`, compiles all TypeScript to JavaScript in `dist/`
- `npm run dev` — runs `tsx src/index.ts`, executes TypeScript directly without compiling (fast, for local development)
- `npm start` — runs the compiled output, used in production on the Mac Mini

**Dependencies** (runtime — shipped to production):
- `@anthropic-ai/sdk` — Claude API client. Handles streaming, retries, and TypeScript types.
- `better-sqlite3` — SQLite driver. Synchronous (no async/await needed for DB calls), fast, rock-solid.
- `grammy` — Telegram Bot API wrapper. Small, well-typed, actively maintained.
- `pino` — Structured JSON logging. Lightweight and fast.

**devDependencies** (development only — not on the Mini at runtime):
- `typescript` — the TypeScript compiler (`tsc`)
- `tsx` — runs `.ts` files directly during development
- `@types/node` — TypeScript types for Node built-ins (fs, crypto, etc.)
- `@types/better-sqlite3` — TypeScript types for better-sqlite3 (the package doesn't ship its own)

---

## `tsconfig.json`

Tells the TypeScript compiler how to understand and compile the code.

**`target: "ES2022"`** — the JavaScript version TypeScript compiles down to. Node 22 fully supports ES2022, so we get modern syntax (top-level await, class fields, etc.) without any downlevelling.

**`module: "NodeNext"`** — tells TypeScript to use Node's ESM module system. This is what enforces the `.js` extension requirement on imports — TypeScript mirrors how Node will actually resolve the files at runtime.

**`moduleResolution: "NodeNext"`** — paired with `module`. Tells TypeScript how to resolve import paths, matching Node's actual behaviour exactly.

**`outDir: "./dist"`** — compiled JavaScript output goes here. This directory is gitignored.

**`rootDir: "./src"`** — TypeScript only compiles files inside `src/`. Keeps the output structure clean.

**`strict: true`** — enables all strict type checks: `strictNullChecks`, `noImplicitAny`, etc. Catches a whole class of bugs at compile time rather than at runtime.

**`skipLibCheck: true`** — skips type-checking inside `node_modules`. Speeds up compilation and avoids noise from type issues in third-party packages.

**`sourceMap: true`** — generates `.map` files alongside compiled JS. When a runtime error occurs, stack traces point to the original TypeScript line numbers rather than the compiled output. Useful when debugging on the Mini.

---

## `src/config.ts`

The single source of truth for all configuration. Every other file that needs a path, an env variable, or a constant imports from here. Centralising this means changes happen in one place.

**`import.meta.url` and `fileURLToPath`** — an ESM quirk. In CommonJS, `__dirname` gave you the current file's directory. In ESM, `__dirname` doesn't exist. The replacement is `import.meta.url` (the file's URL, e.g. `file:///Users/.../famulus/src/config.ts`), which we convert to a real path with `fileURLToPath`, then get the directory with `path.dirname`. `REPO_ROOT` goes up two levels from `src/config.ts` to reach the repo root, and everything else is anchored to that.

**`requireEnv(name)`** — reads an environment variable from `process.env` and throws immediately at startup if it's missing. Fail fast, fail clearly — better than a confusing error later when the variable is actually used.

**Required vs optional env vars:**
- `ANTHROPIC_API_KEY` and `TELEGRAM_BOT_TOKEN` use `requireEnv` — the process won't start without them.
- `OLLAMA_BASE_URL` has a sensible default (`http://localhost:11434` — the Mini's local Ollama). Doesn't throw if missing.
- `OLLAMA_PC_BASE_URL` defaults to `null` (not an empty string). This lets other code check `if (env.OLLAMA_PC_BASE_URL)` to know whether the PC is configured. TypeScript types it as `string | null`, making that check explicit and safe.

---

## `src/db.ts`

Owns everything database-related. Schema creation, prepared statements, and all typed functions the rest of the codebase calls. No other file touches SQLite directly.

**`better-sqlite3` is synchronous** — unlike most Node database libraries, there's no `await`. You call a function, you get the result. This keeps the code simpler. Famulus is I/O-bound on LLM calls, not on SQLite.

**WAL mode** (`db.pragma('journal_mode = WAL')`) — switches SQLite to Write-Ahead Logging. The default mode locks the whole file on every write. WAL allows concurrent reads during writes. Important because the heartbeat and conversation handler run in the same Node process and could both touch the DB close together.

**Prepared statements** — SQL is compiled once at startup (`db.prepare(...)`), not on every call. Faster than building SQL strings each time, and protects against SQL injection (values are passed separately, never interpolated into the string).

**The schema — three tables:**
1. `messages` — every message sent and received, tagged by channel
2. `pulse_log` — records what happened at each heartbeat pulse (quiet, reflection, reach-out, etc.)
3. `pending_flags` — post-processor queue of conversations flagged for reflection or bedrock consideration, waiting to surface at the next pulse

**Unix timestamps as integers** — stored as milliseconds since epoch (`Date.now()`). Simple, sortable, no timezone complexity.

**`getRecentMessages`** fetches newest-first from SQLite (efficient — uses the index), then reverses before returning, so callers always get chronological order.

**`getLastOutcomeTime`** takes a SQL `LIKE` pattern (e.g. `'reflection%'`) so a single query matches both `'reflection'` and `'reflection_and_reach_out'` — used to answer "when did The Familiar last reflect?"

**Prepared statement generics** like `db.prepare<[string, Role, string, number]>` tell TypeScript what types `.run()` expects. Catches argument order mistakes at compile time.

---

## `src/cipher/substitution.ts`

Pure mechanics of the substitution cipher. Given a seed string, produce a deterministic character mapping.

**Source set** — the 95 printable ASCII characters (space through tilde, codes 32–126). These are all characters that will appear in `bedrock.md`.

**Target set** — 95 characters from the Latin Extended Unicode blocks (U+0100–U+024F). Accented and modified Latin letters — looks like a real language, not noise. Completely distinct from plain ASCII so encoded text is visually obvious.

**Mulberry32** — a simple seeded pseudo-random number generator (PRNG). Takes a 32-bit integer seed, returns a function producing floats in [0, 1). Same seed → same sequence every time. The seed is derived by taking the first 8 characters of the SHA-256 hex digest and parsing them as a hex integer.

**Fisher-Yates shuffle** — the standard algorithm for shuffling an array. Walks backwards, swapping each element with a randomly chosen earlier element. Using Mulberry32 as the random source makes the shuffle deterministic and reproducible.

**`buildSubstitutionMap(seed)`** — shuffles the Unicode target set using the seed, then maps each ASCII character to the corresponding shuffled Unicode character.

**`reverseSubstitutionMap(map)`** — swaps keys and values to produce the decode map.

---

## `src/cipher/index.ts`

The public API for the cipher: just `encode(text)` and `decode(encoded)`.

**Key derivation** — reads `soul.md`, hashes it with SHA-256 (Node's built-in `crypto` module), uses the hex digest as the seed. The soul is the key: the same soul always produces the same language.

**Lazy caching** — `_encodeMap` and `_decodeMap` start as `null` and are built on first use. `soul.md` doesn't change while the process is running, so there's no reason to re-derive and rebuild on every call.

**`[...text].map(...)`** — spreads the string using the string iterator rather than indexing with `text[i]`. This correctly handles Unicode — plain indexing can split multi-byte characters in half. The spread ensures each element is a full character.

**Pass-through** — characters not in the source set (e.g. non-ASCII Unicode already in the text) are returned unchanged via the `?? c` fallback.

---

## `src/persona.ts`

Reads all persona files and composes them into the system prompt string sent to the LLM on every call.

**Composition order** — `soul → identity → growth → bedrock → user → global memory → context memory`. Each layer builds on the one before. Soul is the foundation; context memory is the most recent and specific. Layers are separated by `\n\n---\n\n`.

**`readFile(path)`** — returns the file contents trimmed, or `null` if the file doesn't exist or is empty. Many files won't exist at various points (`user.md` starts empty, `growth.md` doesn't exist until The Familiar first reflects). Missing files are silently omitted from the prompt rather than crashing.

**Bedrock decoding** — `bedrock.md` is stored encoded on disk. It is decoded here, at prompt construction time, before being injected into the system prompt. It is not decoded anywhere else. The decoded content never touches disk.

**`contextFolder`** — parameter defaulting to `'personal'`. Allows different memory contexts for different channels or use cases. The context memory file is at `contexts/{contextFolder}/memory.md`.

**Type guard** — `.filter((s): s is string => s !== null)` filters out nulls and simultaneously narrows the TypeScript type from `(string | null)[]` to `string[]`. Without the `s is string` annotation, TypeScript wouldn't trust that the filtered array contains only strings.

---

## `src/logger.ts`

Not in the original file plan but earns its place — without it, every file that logs would have to initialise its own pino instance pointing to the right file path.

**Two log streams:**
- `log` → `logs/famulus.log` — normal operational logging (Daniel may read this)
- `internalLog` → `logs/internal.log` — bedrock-containing calls only, never surfaced in normal workflow

`pino.destination(filePath)` writes structured JSON logs directly to a file. During development, you can `tail -f logs/famulus.log` to watch it in real time.

---

## `src/llm/providers/claude.ts`

Anthropic SDK wrapper. Takes a request, calls the API, returns the response text as a plain string.

**SDK client initialised once** at module load, not per call. Holds the API key and a persistent HTTP connection pool.

**`max_tokens: 8192`** — Claude requires an explicit maximum. 8192 tokens is generous for conversational responses without being wasteful.

**`response.content[0]`** — Claude returns content as an array of typed blocks (text, tool use, etc.). We only use text responses, so we take the first block and assert it's `type: 'text'`. Anything else is unexpected and throws.

---

## `src/llm/providers/ollama.ts`

Raw `fetch` Ollama wrapper. No client library needed — Ollama's API is simple enough.

**`POST /api/chat`** — Ollama's chat endpoint. Unlike Claude, it doesn't have a separate `system` parameter. The system prompt is passed as the first message with `role: 'system'`.

**`stream: false`** — Ollama streams by default. We disable it to get the full response in one JSON object rather than a stream of chunks.

**`isOllamaAvailable(baseUrl)`** — health check used by the queue and router. Hits `/api/tags` (the model list endpoint) with a 3-second timeout via `AbortSignal.timeout()`. Returns `false` on any error rather than throwing — callers treat unavailability as a signal to queue or fall back, not as a crash.

---

## `src/llm/meta.ts`

Uses the local 1B model to dynamically pick a tier for each request based on actual conversation content.

**`import type`** — imports `ModelTier` and `RequestType` as type-only. These are erased before the code runs, so at runtime `meta.ts` has zero dependency on `router.ts`. This avoids a circular dependency (router imports meta, meta would import router).

**Fail safe** — every possible failure (Ollama unavailable, malformed JSON, unrecognised tier value) returns `null`. The router treats `null` as "use the config default". The meta-router never blocks a request.

**Context window** — only the last 3 messages are sent to the meta model, each truncated to 200 characters. The tier decision doesn't need the full conversation — just enough to judge complexity and tone.

---

## `src/llm/queue.ts`

Parks requests that don't need an immediate response, waits for local Ollama to become available, and falls back to cloud when the timeout expires.

**Storing `resolve` and `reject`** — a Promise's resolution callbacks can be captured outside the Promise constructor and stored. This lets us park a request in the `pending` array and complete its Promise later when the timer loop runs.

**`processQueue`** runs every 5 minutes via `setInterval`. For each pending entry: if the timeout has expired, call the cloud fallback; if Ollama is now available, call it; otherwise keep the entry in the queue.

**`pending.length = 0` then push** — the idiomatic way to replace an array's contents in place while keeping the same array reference.

**`enqueue()` tries immediately first** — if Ollama is available right now, the request goes straight through without ever touching the queue. The queue is only for when local is genuinely unavailable.

---

## `src/llm/router.ts`

The public face of the LLM layer. Everything else in the codebase calls `route(request)` and gets back a response — all routing complexity is hidden inside.

**Also defines all shared LLM types:** `LLMRequest`, `LLMResponse`, `Message`, `RequestType`, `ModelTier`. Keeping types here (not in a separate file) is intentional — at this scale a types file would just be extra indirection.

**Routing logic flow:**
1. Load config from `config/llm.json`
2. Meta-router suggests a tier (falls back to config default if unavailable or fails)
3. `familiarPreference` can override the tier up (`quality`) or down (`economy`)
4. If `urgency: immediate` or `allow_local: false` → straight to Claude cloud
5. Otherwise → try PC Ollama first for reflection/internal (70B), fall back to Mini (3B), enqueue if unavailable, fall back to cloud on timeout

**`loadConfig()` on every call** — re-reads the JSON file each time. This means editing `config/llm.json` takes effect on the next request without restarting the process. The file is tiny and OS-cached so the overhead is negligible.

**`containsBedrock` selects the logger** — when true, all logging goes to `internalLog` (the restricted stream). Request type, model, and outcome are logged. Prompt content is never logged.

---

## `config/llm.json`

Git-tracked, plaintext routing configuration. JSON rather than YAML (the plan described YAML, but JSON achieves the same goals — human-readable, editable without touching code — using Node's built-in parser with no extra library).

Each routing entry specifies the default tier, urgency, whether local is allowed, whether local is preferred, and the queue timeout. The router reads this on every call so changes take effect immediately.

---

## `src/channels/telegram.ts` (updated)

Updated from the original to support proactive reach-outs from the heartbeat.

**`bot` at module level** — moved out of the class so `notifyDaniel` can use it. The class still exists to satisfy the `Channel` interface.

**`chatId`** — captured from the first incoming message (`ctx.chat.id`) and stored in memory. Used by `notifyDaniel` for proactive messages. If a reach-out fires before Daniel has sent any message, it fails silently with a warning log. For a personal always-on bot, this is acceptable — the chat ID will be available after the first interaction.

**`notifyDaniel(text)`** — exported function called by the heartbeat when The Familiar wants to reach out. Grammy's `bot.api.sendMessage()` sends a message proactively without an incoming message to reply to.

---

## `src/heartbeat/queue.ts`

A thin re-export of the DB flag functions. Exists for separation of concerns — heartbeat files work with a domain-specific "queue" interface without needing to know they're talking to SQLite.

---

## `src/heartbeat/post-processor.ts`

Runs after every conversation closes. Uses the Mini's 1B model to classify significance and add flags for the pulse queue.

**Significance scale** — `none`, `notable`, `significant`, `very_significant`. Only the latter two produce flags. `very_significant` produces both a reflection and a bedrock flag.

**Transcript truncated** — messages are capped at 500 characters before being sent to the local model. The 1B model doesn't need (and may struggle with) full message content — the gist is enough for significance classification.

**Fail gracefully** — if local model is unavailable or the JSON parse fails, the function logs and returns without crashing. A missed assessment is fine.

---

## `src/heartbeat/observer.ts`

Classifies what actually happened during a pulse and logs it to SQLite. Future pulse contexts read this log to answer "when did The Familiar last reflect?" and "when did they last reach out?"

**Two functions** for the two pulse types because they have different outcome vocabularies: regular pulses produce `quiet/reflection/reach_out/reflection_and_reach_out`, bedrock pulses produce `considered/passed`.

---

## `src/heartbeat/pulse.ts`

The regular pulse — fires every 2–5 hours.

**Randomised `setTimeout` not `setInterval`** — `setTimeout` is rescheduled after each pulse completes. `setInterval` fires on a fixed wall-clock schedule regardless of how long work takes. `setTimeout` + reschedule means: the next interval is always relative to when the current pulse finished, and the random delay is freshly drawn each time.

**Response markers** — The Familiar uses `REFLECTION:` / `/REFLECTION` and `MESSAGE:` / `/MESSAGE` to signal intent. Everything outside the markers is ignored — The Familiar can think freely, only marked sections are acted on. Regex captures everything between the opening and closing marker (or to end of string if closing marker is absent).

**Flags fetched once** — `getPendingFlags()` runs at the start. The same slice is used to build context and to mark as surfaced at the end. Flags are only marked surfaced if the pulse succeeds — if the LLM call throws, flags stay unsurfaced and reappear at the next pulse.

**growth.md appending** — reflection entries are appended with a date header (`## YYYY-MM-DD`). The file is read, extended in memory, and written back atomically with `writeFileSync`.

---

## `src/heartbeat/bedrock-pulse.ts`

Fires roughly every 10–20 days. Rarer and more serious than the regular pulse.

**Two-phase design:**
1. Local 3B model reads `growth.md` and surfaces candidates (opinions that appear repeatedly, positions held under challenge). Uses 3B rather than 1B for better reading comprehension.
2. The Familiar receives those candidates and decides. If nothing stands out, the pulse passes silently.

**`BEDROCK:` marker** — The Familiar uses the same marker convention as the regular pulse. If the marker is present, the content is encoded and appended to `bedrock.md`.

**Encoding on append** — the cipher is character-by-character and stateless. `encode(A) + encode(B) = encode(A + B)`, so appending independently-encoded entries is safe. `persona.ts` decodes the whole file at once and recovers the full plain text correctly.

**`familiarPreference: 'local'`** — signals that this internal reasoning should stay on local Ollama if at all possible. The bedrock pulse is the most private request type.

---

## `src/index.ts`

The entry point. No logic — purely wiring. Everything has already been built in isolation; this is where it connects.

**Startup sequence:**
1. `import './channels/index.js'` — side-effect import that triggers channel registration
2. The DB is already initialised by this point (tables created when `db.ts` was first imported)
3. `handleMessage` is defined — the core conversation loop
4. `getChannels()` returns the registered channels; each is started with `handleMessage` as the handler
5. `startPulse()` and `startBedrockPulse()` begin the heartbeat schedulers

**`handleMessage`** — the conversation loop:
1. Save incoming message to DB
2. Fetch up to 50 recent messages as history
3. Build the system prompt (includes all persona layers and bedrock)
4. Route to LLM
5. Save response to DB
6. Fire post-processor asynchronously and return the response

**`assessConversation` is fire-and-forget** — not awaited. The user gets their reply immediately; significance assessment happens in the background. Errors are logged and swallowed — a failed assessment never surfaces to the user.

**`containsBedrock: true`** on all conversation calls — the system prompt always includes bedrock if `bedrock.md` has content. Since the caller can't know this without an extra file read, and restricted logging is the safe default, it's set to true unconditionally for any call using `buildSystemPrompt()`.

---

## `src/channels/registry.ts`

Defines what a channel is and keeps a list of registered channels.

**`MessageHandler`** — a function that takes incoming message text and returns The Familiar's response. This is the contract between channels and the rest of the system. Channels don't know about LLMs or personas — they receive the handler from outside (from `index.ts` at startup). Inversion of control: the channel shuttles messages, it doesn't decide what to do with them.

**`Channel` interface** — a single method `start(handler)`. Every channel must implement this. Keeps the registry generic — Telegram, a future WhatsApp implementation, a CLI test harness all look the same to the rest of the codebase.

**The registry** — a plain array. `registerChannel` pushes to it, `getChannels` returns it. No maps or IDs needed — channels don't need to be looked up individually.

---

## `src/channels/telegram.ts`

The Grammy implementation of `Channel`. The only place in the codebase that knows about Telegram.

**`Bot`** — Grammy's main class. Takes the bot token, handles all Telegram API complexity: polling for updates, parsing message types, sending replies.

**`bot.on('message:text', ...)`** — registers a handler for text messages only. Grammy's event filtering automatically ignores photos, stickers, voice messages, etc.

**`ctx.reply()`** — sends a reply to the current message. Grammy automatically uses the correct chat ID from the incoming message context.

**`bot.start()`** — begins long polling. Opens a persistent connection to Telegram and receives messages as they arrive. Doesn't return — runs for the lifetime of the process.

**Error handling** — if the LLM call throws (network error, API rate limit, etc.), we catch it and send a plain error message back rather than letting it propagate and crash the bot.

**`registerChannel(new TelegramChannel())`** at the bottom — runs when the file is imported, registering itself with the registry. No explicit registration call needed from outside.

---

## `src/channels/index.ts`

A barrel import file whose only job is to trigger the side effects of importing each channel file. Importing `telegram.ts` runs its module-level `registerChannel()` call.

`src/index.ts` imports this once and all channels are registered. Adding a new channel = one new file + one new import line here.
