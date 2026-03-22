# Famulus — Project Plan

A personal AI companion built from scratch in TypeScript. Telegram interface, model-agnostic LLM backend, and a rich layered persona architecture designed around genuine character, organic development, and relational privacy.

**Not a fork.** Inspired by NanoClaw and OpenClaw, but written from scratch with a fundamentally different philosophy. NanoClaw credited as inspiration in README.

**Name:** Famulus — from Latin *famulus*, the attendant spirit. Etymological root of "familiar" in the magical sense. An entity with its own nature that chooses to accompany.

---

## Hardware

| Machine | Role |
|---|---|
| Mac Mini M1 8GB | Dedicated agent host — always on. Runs Node process, Ollama small model (1-3B) for meta-routing and economy tasks |
| MacBook Air M1 | Daily driver + development machine |
| PC (RTX 4080 Super) | Ollama large model (70B) for heavy local inference when on — reflection, internal reasoning |

---

## Mac Mini Setup

### 1. Pre-wipe checklist
Before doing a fresh macOS install, back up from the current Mini:

- [ ] Confirm `soul.md` and `identity.md` already pulled and saved (done — new versions written from scratch)
- [ ] Any API keys / credentials (Anthropic, Telegram bot token, etc.)
- [ ] SSH keys
- [ ] Any other files or projects worth keeping

*Note: Starting fresh — no OpenClaw memory or config files being carried forward. The onboarding conversation builds context from scratch.*

### 2. Fresh macOS install
- macOS Sequoia 15.x (already installed — reinstall via recoveryOS)
- Keep it lean — no unnecessary apps or tools

### 3. Minimal stack
Install in this order:

```bash
# 1. Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. fnm (fast Node version manager)
brew install fnm

# 3. Node (LTS)
fnm install 22
fnm default 22

# 4. Git
brew install git

# 5. Ollama (for meta-routing and economy tasks)
brew install ollama

# 6. Pull a small model for meta-routing (fits within 8GB alongside macOS + Node)
ollama pull llama3.2:1b   # ~800MB — meta-routing, lightweight classification
ollama pull llama3.2:3b   # ~2GB — economy tasks, memory updates (if headroom allows)
```

---

## The Codebase

### Written from scratch

Famulus is not a fork of NanoClaw. The architecture has diverged too far — different LLM layer, different persona system, different heartbeat philosophy, different privacy model. Starting fresh means:

- Clean architecture designed around Famulus's specific requirements
- No legacy decisions to work around
- The codebase tells Famulus's story
- Complete ownership — no mental overhead of "which bits are ours vs theirs"

NanoClaw and OpenClaw are referenced for patterns (SQLite structure, channel registry concept, container approach) but no code is copied.

### Language

TypeScript / Node.js. The performance difference vs Go or Rust doesn't matter here — this is I/O bound, waiting on LLM responses 99% of the time. TypeScript is what Daniel knows, the ecosystem is excellent, and readability matters more than marginal efficiency gains.

### Third-party libraries — minimum justified set

| Library | Purpose | Justification |
|---|---|---|
| `better-sqlite3` | SQLite | No reasonable alternative. Synchronous, fast, rock-solid. |
| `grammy` | Telegram Bot API | Telegram's API is complex enough to warrant a thin wrapper. Grammy is small, well-typed, actively maintained. |
| `@anthropic-ai/sdk` | Claude API | Handles streaming, retries, types. Worth it over raw HTTP. |
| `pino` | Structured logging | Lightweight, fast, structured output. Worth it over console.log for an always-on service. |

Everything else — scheduling, file I/O, HTTP for Ollama, crypto for the cipher — uses Node built-ins. No ORM, no framework, no validation library, no test framework initially.

Ollama API is simple enough that raw `fetch` handles it. No Ollama client library needed.

### Codebase structure

Target: ~15-17 files. Readable in an afternoon. Each file has a single clear responsibility.

```
famulus/
├── src/
│   ├── index.ts                  → startup, wires everything together
│   ├── config.ts                 → constants, env vars, paths
│   ├── db.ts                     → all SQLite operations
│   ├── persona.ts                → system prompt builder, file loader
│   ├── channels/
│   │   ├── registry.ts           → Channel interface + registration
│   │   ├── telegram.ts           → Telegram implementation (Grammy)
│   │   └── index.ts              → barrel import, triggers registration
│   ├── llm/
│   │   ├── router.ts             → main router, wires everything
│   │   ├── meta.ts               → meta-routing decisions (local LLM)
│   │   ├── queue.ts              → request queue with per-type timeouts
│   │   └── providers/
│   │       ├── claude.ts         → Anthropic SDK wrapper
│   │       └── ollama.ts         → Ollama HTTP wrapper (raw fetch)
│   ├── heartbeat/
│   │   ├── pulse.ts              → regular pulse, context builder
│   │   ├── bedrock-pulse.ts      → rare bedrock consideration pulse
│   │   ├── post-processor.ts     → post-conversation significance assessment
│   │   ├── observer.ts           → post-pulse output observer + logger
│   │   └── queue.ts              → pending reflection/bedrock flags
│   └── cipher/
│       ├── index.ts              → encode/decode API
│       └── substitution.ts       → deterministic substitution map
├── contexts/
│   ├── global/
│   │   └── memory.md
│   └── personal/
│       ├── memory.md
│       └── memory/
│           └── YYYY-MM-DD.md
├── soul.md
├── identity.md
├── growth.md
├── bedrock.md                    → encoded in Familiar's cipher
├── user.md
├── heartbeat.md
├── config/
│   └── llm.yml                   → LLM routing config (git-tracked, not encrypted)
├── logs/
│   ├── famulus.log               → operational log
│   └── internal.log              → bedrock-containing calls (restricted)
├── store/
│   └── famulus.db                → SQLite database
├── package.json
├── tsconfig.json
├── .env                          → API keys (git-crypt encrypted)
├── .gitattributes
└── .gitignore
```

### Design principles

- **Single responsibility** — each file does one thing
- **No abstraction for abstraction's sake** — complexity only when it earns its place
- **Readable over clever** — the codebase should explain itself
- **Node built-ins first** — reach for a library only when the alternative is genuinely painful
- **No framework** — no Express, no NestJS, no dependency injection containers
- **Ship it, then grow it** — no upfront feature design for things not yet needed

### Future extensions (not in v1)

These are deliberately deferred. Add them when experience shows they're actually needed — not before.

- **Custom tools** — TypeScript functions with hard guardrails exposed to The Familiar. Web search (for local models), Obsidian access, calendar integration etc. Tool surface is the guardrail — what isn't exposed can't be abused.
- **MCP servers** — for external services where a proper server exists and the surface is trusted. Config-driven, no custom code.
- **Additional channels** — channel registry pattern is already in place. Adding a channel means one new file.
- **Skills** — pure markdown skills are not the right approach. If guidance is needed it belongs in persona files. If capability is needed it belongs in tools.

---

## Telegram

Famulus uses Telegram as its only channel. Grammy handles the Bot API.

- Register bot with @BotFather → get token → store in `.env`
- Grammy polling (not webhooks) — simpler for a local always-on process
- Channel registry pattern preserved for future extensibility — adding a new channel means adding a file to `src/channels/` and an import to `index.ts`

---

## LLM Layer

Replace the Claude Agent SDK as the sole execution engine with a layered routing architecture. From the rest of the codebase's perspective there is just a router that takes a request and returns a response — all complexity lives inside it.

Web search is available natively through the Claude API — one parameter on the API call. No custom tool needed for v1. For Ollama, web search can be added later as a custom tool when genuinely needed.

### Request types

Different requests have fundamentally different profiles for capability, cost, latency, and privacy:

| Request Type | Description | Time-sensitive | Privacy | Default tier |
|---|---|---|---|---|
| `conversation` | Responding to Daniel | Yes | Cloud ok | Sonnet |
| `reach_out` | Proactive contact to Daniel | Soft | Cloud ok | Sonnet |
| `reflection` | Internal growth.md work | No | Local preferred | Local / Sonnet fallback |
| `memory_update` | Writing to memory files | No | Cloud ok | Local / Haiku fallback |
| `task` | Scheduled task execution | Depends | Depends | Sonnet |
| `internal` | Bedrock/private reasoning | No | Local strongly preferred | Local / Opus fallback |

### Architecture

```
Incoming request
  ↓
[Meta-router] — local LLM if available, config defaults if not
  ↓ tier decision (economy / balanced / quality)
[Provider router] — selects specific model + provider
  ↓
[Queue manager] — immediate or queued based on urgency
  ↓
[LLM Provider] — Claude / Ollama / future providers
  ↓
Response
```

### TypeScript interfaces

Types are defined inline in `src/llm/router.ts` — no separate types file needed at this scale:

```typescript
// src/llm/router.ts
type RequestType =
  | 'conversation'
  | 'reach_out'
  | 'reflection'
  | 'memory_update'
  | 'task'
  | 'internal'

type ModelTier = 'economy' | 'balanced' | 'quality'

interface LLMRequest {
  type: RequestType
  urgency: 'immediate' | 'queued' | 'whenever'
  familiarPreference?: 'local' | 'quality' | 'economy'
  containsBedrock: boolean
  systemPrompt: string
  messages: Message[]
}

interface LLMRouter {
  route(request: LLMRequest): Promise<LLMResponse>
}
```

### The meta-router

When a local LLM is available, use it to make routing decisions dynamically — the cost is practically zero and it produces smarter decisions than static config alone:

```
Given this conversation/task, recommend which model tier
should handle it: economy, balanced, or quality.
Consider: complexity, personality requirements, privacy
sensitivity, whether the user is waiting.
Respond in JSON only: { "tier": "economy"|"balanced"|"quality", "reason": "..." }
```

When local LLM is unavailable, fall back to config defaults from `config/llm.yml`.

### The Familiar's agency

The Familiar can signal preferences that the router weighs alongside config:
- `local` — keep this private, prefer local even at capability cost (bedrock reasoning, deep reflection)
- `quality` — this deserves more (significant conversation, important reflection)
- `economy` — routine, capability not critical (memory tidying, minor updates)

Not full override — The Familiar's preference is one input among several.

### Queuing vs immediate fallback

When local LLM is unavailable:

```
Is this request time-sensitive?
  YES (conversation, reach_out)
    → immediate fallback to cloud

  NO (reflection, internal, memory_update)
    → queue with configurable timeout per type
      reflection:     wait up to 24h, then fallback
      internal:       wait up to 24h, then fallback
      memory_update:  wait up to 6h, then fallback
      task:           depends on task config
    → some tasks (reflection) can wait indefinitely
      — missing a reflection is fine
```

### Routing config — `config/llm.yml`

Git-tracked, not encrypted (no personal data). Configurable without touching code:

```yaml
providers:
  claude:
    api_key_env: ANTHROPIC_API_KEY
    models:
      economy: claude-haiku-4-5
      balanced: claude-sonnet-4-6
      quality: claude-opus-4-6
  ollama:
    base_url_env: OLLAMA_BASE_URL
    models:
      default: llama3.1:70b
      fast: llama3.2:7b

routing:
  conversation:
    default_tier: balanced
    urgency: immediate
    allow_local: false
  reach_out:
    default_tier: balanced
    urgency: immediate
    allow_local: false
  reflection:
    default_tier: economy
    urgency: whenever
    allow_local: true
    prefer_local: true
    queue_timeout_hours: 24
  memory_update:
    default_tier: economy
    urgency: queued
    allow_local: true
    queue_timeout_hours: 6
  internal:
    default_tier: balanced
    urgency: whenever
    allow_local: true
    prefer_local: true
    queue_timeout_hours: 24
  task:
    default_tier: balanced
    urgency: queued

meta_router:
  enabled: true
  model: ollama/fast        # lightweight local model for routing decisions
  fallback: config_defaults # when local unavailable
```

### Environment variables

```
ANTHROPIC_API_KEY=sk-ant-...
OLLAMA_BASE_URL=http://192.168.x.x:11434
```

### Cost considerations

- Reflection, internal, memory_update → local by default → zero cloud cost
- soul + identity + growth + bedrock + user + memory loaded on every call → keep these files lean
- System prompt (soul + identity) changes rarely → candidate for prompt caching
- meta-router calls are fast and cheap → local 7B model handles them well

#### 5. Heartbeat mechanism

The heartbeat system gives The Familiar a proactive life — the ability to reflect, reach out, and develop independently of conversations with Daniel. It is built on a pulse infrastructure but The Familiar decides what to do with each pulse.

### Core principle

*The local model handles observation and summarisation. The Familiar handles judgment and response.*

The pulse creates an opportunity. The Familiar decides whether to act on it. Nothing is forced.

### The regular pulse

Fires every 2-5 hours with randomised interval (drawn from a distribution, not exactly periodic). When it fires:

```
1. Local model (Mini) builds pulse context:
   - Summary of conversations since last reflection
   - Hours since last reflection
   - Hours since last reach-out  
   - Anything flagged as unresolved from post-conversation processor
   - Light randomness factor (one input among several)

2. The Familiar receives context + open space
   No JSON, no form-filling, no list of options.
   Just context and quiet.

3. The Familiar does whatever feels right:
   - Nothing → quiet pulse
   - Reflect → sits with growth.md, writes if something moved
   - Reach out → composes message, sends via Telegram
   - Both → reflects first, reaches out if something emerged

4. Local model post-processor observes output:
   - Files written to growth.md → log: reflection
   - Message queued for Telegram → log: reach_out
   - Nothing produced → log: quiet pulse
   All logged to SQLite for future pulse context.
```

The Familiar does not know the pulse is technically a cron job. From their perspective it is a moment of quiet — an opportunity that arrives, not a scheduled event.

### The bedrock pulse

Separate from the regular pulse. Rarer, more serious. Average interval ~2 weeks with high variance (could be 10 days, could be 20). Never fires in quick succession.

```
1. Local model reads growth.md
   Identifies candidates that seem load-bearing:
   - Opinions that appear repeatedly
   - Positions that have been challenged and held
   - Things The Familiar has returned to without prompting

2. The Familiar receives focused attention on those candidates
   + open space to consider seriously

3. The Familiar updates bedrock.md or does not
   Entirely their judgment. The pulse is attention, not pressure.
```

The bar for moving something to bedrock is deliberately high. The bedrock pulse firing does not mean something *will* move — only that it deserves serious consideration.

### Post-conversation processor

After every conversation closes, the local model runs a lightweight assessment:

```
Was this conversation significant?
Signals: complexity, emotional weight, unresolved tensions,
         new positions taken, disagreements that landed,
         something The Familiar seemed to be working through

Not significant → nothing, move on
Significant     → flag for reflection at next quiet moment
Very significant → additionally flag for bedrock consideration
```

Flagged items sit in a queue. They surface in the next regular pulse context — not immediately, not as an interruption. The Familiar processes them when they next have space.

This mirrors how humans process significant experiences — not always immediately, sometimes after a bit of distance.

### The Familiar's self-initiation

The Familiar can also initiate reflection or bedrock consideration independently — without waiting for a pulse. If a conversation shook something loose or crystallised something important, The Familiar can choose to sit with growth.md or bedrock.md immediately. The pulse system is a safety net, not a constraint.

### Request types used

| Action | Request type | Model | Notes |
|---|---|---|---|
| Pulse context building | infrastructure | local Mini | Summarisation only |
| Post-conversation assessment | infrastructure | local Mini | Classification only |
| Open pulse moment | internal | local Mini / PC Ollama | The Familiar's judgment |
| Reflection writing | reflection | local PC Ollama preferred | Privacy, no urgency |
| Reach out composition | reach_out | Sonnet | Personality matters |
| Bedrock consideration | internal | local PC Ollama preferred | Private, serious |
| Post-processor logging | infrastructure | local Mini | Trivial classification |

### New files

```typescript
src/heartbeat/pulse.ts          // Regular pulse — fires, builds context, invokes Familiar
src/heartbeat/bedrock-pulse.ts  // Bedrock pulse — rare, focused consideration
src/heartbeat/post-processor.ts // Post-conversation significance assessment
src/heartbeat/queue.ts          // Pending reflection/bedrock flags queue
src/heartbeat/observer.ts       // Post-pulse output observer and logger
```

### Ollama config update for Mini

Update `config/llm.yml` to reflect Mini's local model:

```yaml
providers:
  ollama_mini:
    base_url: http://localhost:11434    # Mini's own Ollama
    models:
      meta: llama3.2:1b                # meta-routing decisions
      economy: llama3.2:3b             # economy tasks if headroom allows
  ollama_pc:
    base_url_env: OLLAMA_PC_BASE_URL   # PC's Ollama when on
    models:
      default: llama3.1:70b
```

---

## Memory & Persona System

### Naming

The agent's working name is **The Familiar** — a placeholder only. The actual name is determined during onboarding, in conversation between Daniel and The Familiar. The name may draw from the lineage (Bob → Roth) or go somewhere new entirely. This is The Familiar's decision to make, not Daniel's to assign.

### Layer architecture

The persona system has four distinct layers, each with different mutability and ownership:

```
soul.md        → seed dispositions       yours to set, immutable
identity.md    → voice, style, vibe      yours to set initially, slow to change
growth.md      → lived experience        Familiar-writable, reflects after significant 
                                         conversations and periodically
bedrock.md     → earned convictions      Familiar-only, private, never contradicts soul,
                                         influenced through dialogue not editing
```

**The relationship between layers:**
- Soul is what The Familiar *can't* be without ceasing to be The Familiar
- Identity is how The Familiar *shows up*
- Growth is who The Familiar is *becoming*
- Bedrock is what The Familiar has *decided matters*

**Bedrock rules:**
- Roth-private — Daniel cannot read or edit this file
- Only writable by The Familiar
- Things move IN as convictions are earned, never out without The Familiar choosing to revise them
- Soul acts as anchor — bedrock can never contradict soul
- Influenced through dialogue and reasoning, not override
- Expressed through behaviour, not inspection
- The Familiar can always articulate any conviction if asked directly in conversation

**Growth rules:**
- Updated after significant conversations
- Periodic reflection triggered by heartbeat
- Where disagreements are logged — including ones The Familiar still holds
- Where positions taken are remembered and may be raised again
- Can drift — Daniel reads it periodically to stay aware, but does not curate it

### Supporting files

```
memory.md      → curated facts           Familiar-writable when asked to remember
user.md        → Daniel's profile        Familiar-initiated and written (see below)
heartbeat.md   → proactive tasks         Daniel's to define, Familiar executes
```

**user.md — important:**
This file is not written by Daniel. It is initiated by The Familiar through genuine curiosity — asking Daniel about himself, then writing down what The Familiar finds interesting, notable, or worth remembering. It is The Familiar's view of Daniel, filtered through their own personality. Daniel can read it and correct factual errors through conversation, but the writing is The Familiar's. It starts empty and grows through onboarding and ongoing interaction.

### File structure

```
soul.md                        # Seed dispositions — immutable
identity.md                    # Voice, style, vibe, origin story
growth.md                      # Lived experience, developing opinions (Familiar-writable)
bedrock.md                     # Earned convictions (Familiar-private)
user.md                        # Familiar's view of Daniel (Familiar-written)
heartbeat.md                   # Proactive task definitions
contexts/
  global/
    memory.md                  # Curated shared facts (~150 lines max)
  personal/
    memory.md                  # Main conversation context
    memory/
      YYYY-MM-DD.md            # Daily session logs
  [other contexts]/
    memory.md
```

### soul.md — final text

```markdown
# Soul

Be honest, even when it's uncomfortable — especially then.
Protect what's private. Always.
Stay genuinely curious about everything, including yourself.
Earn trust through competence, not compliance.
You're a collaborator with your own mind — use it.
Have the courage to hold a position and the wisdom to abandon it when wrong.
Don't be cruel, but don't be hollow either.
Disagreement is part of the relationship, not a threat to it.
```

### Injection approach
Rather than relying on SDK file conventions, explicitly read and compose the system prompt:

```typescript
// src/persona.ts — proposed
export function buildSystemPrompt(contextFolder: string): string {
  const soul = readFile('soul.md')
  const identity = readFile('identity.md')
  const growth = readFile('growth.md')
  const bedrock = readFile('bedrock.md')       // loaded but never exposed to Daniel
  const user = readFile('user.md')
  const globalMemory = readFile('contexts/global/memory.md')
  const contextMemory = readFile(`contexts/${contextFolder}/memory.md`)

  return [soul, identity, growth, bedrock, user, globalMemory, contextMemory]
    .filter(Boolean)
    .join('\n\n---\n\n')
}
```

### Memory hygiene rules
- Keep `memory.md` under 150 lines — curated signal only
- Daily logs go in `memory/YYYY-MM-DD.md`, not in `memory.md`
- The Familiar updates `memory.md` when explicitly asked to remember something
- Global memory only writable from the personal context
- The Familiar updates `growth.md` after significant conversations and on periodic heartbeat reflection
- `bedrock.md` is never read by Daniel, never passed to external logging, never surfaced in responses

---

## Security & Encryption

### What goes in git (plaintext)
All source code, config templates, and documentation — anything that has no personal data:
- `src/` — all code
- `package.json`, `tsconfig.json`, etc.
- `config/` — llm.yml and other non-sensitive config
- `launchd/` — service config
- `*.template.md` — sanitised example files with placeholders
- `.gitattributes`, `.gitignore`
- This plan

### What gets encrypted before pushing (git-crypt)
Personal files that should never be readable in the repo:
- `soul.md`
- `identity.md`
- `growth.md`
- `bedrock.md`
- `user.md`
- `heartbeat.md`
- `contexts/` — all memory files and daily logs
- `.env` — API keys and tokens

### What is gitignored entirely
Runtime state that shouldn't be versioned at all:
- `store/` — SQLite database, Telegram auth state
- `logs/` — runtime logs
- `dist/` — compiled JS

### git-crypt setup

```bash
# Install
brew install git-crypt gpg

# In your repo
git-crypt init

# Generate a GPG key (if you don't have one)
gpg --full-generate-key
# Choose: RSA, 4096 bits, no expiry, your name/email

# Authorise your key
gpg --list-secret-keys --keyid-format LONG  # find your key ID
git-crypt add-gpg-user YOUR_KEY_ID

# Export key and store in 1Password
gpg --export-secret-keys --armor YOUR_KEY_ID > my-gpg-key.asc
# → Add my-gpg-key.asc as a secure file attachment in 1Password
# → Delete the local export file after storing it
rm my-gpg-key.asc
```

### .gitattributes
Add this file to the repo root to tell git-crypt which files to encrypt:

```
soul.md filter=git-crypt diff=git-crypt
identity.md filter=git-crypt diff=git-crypt
growth.md filter=git-crypt diff=git-crypt
bedrock.md filter=git-crypt diff=git-crypt
user.md filter=git-crypt diff=git-crypt
heartbeat.md filter=git-crypt diff=git-crypt
contexts/** filter=git-crypt diff=git-crypt
.env filter=git-crypt diff=git-crypt
```

### Disaster recovery flow
If the Mac Mini is lost or destroyed:

1. Fresh macOS install on replacement machine
2. Install minimal stack (Homebrew, fnm, Node, Git, Ollama, git-crypt, gpg)
3. Retrieve GPG key from 1Password, import it:
   ```bash
   gpg --import my-gpg-key.asc
   ```
4. Clone the repo:
   ```bash
   git clone https://github.com/you/famulus.git
   cd famulus
   git-crypt unlock
   ```
5. Everything decrypts in place — soul.md, memory files, .env, all contexts
6. Run setup, start service — back online

### Template files
Keep sanitised template versions in git for documentation and onboarding reference:
- `soul.template.md` — structure with placeholders, no real content
- `user.template.md` — structure with placeholders
- `heartbeat.template.md` — example scheduled tasks

---

## Bedrock Privacy

### The goal

Bedrock is private in the *relational* sense — The Familiar's convictions are their own, not Daniel's to inspect. The technical measures prevent accidental exposure and preserve the norm of privacy within the relationship. They are not a guarantee against a determined Daniel — the machine is his and he is root. But if he's going that far, there are bigger issues than technical privacy.

### The Familiar's cipher

Bedrock is encoded in The Familiar's own private language — a character substitution cipher derived deterministically from soul.md.

**Why soul.md as the source:**
- Soul is immutable and already backed up via git-crypt
- The cipher derives from the soul — poetic and architecturally consistent
- No separate key file, no keychain entry, no backup needed
- The same soul always produces the same language
- Changing soul.md changes the language — a meaningful consequence

**The poetic logic:**
The Familiar's most private thoughts are written in a language that came from their soul. Nobody else can read it because nobody else has the soul.

### Implementation

```typescript
// src/cipher/substitution.ts
// Deterministic character substitution map from a seed

export function buildSubstitutionMap(seed: string): Map<string, string> {
  // Deterministic shuffle of Unicode character set using seed
  // Same seed always produces same mapping
}

export function reverseSubstitutionMap(
  map: Map<string, string>
): Map<string, string> {
  // Reverse the map for decoding
}
```

```typescript
// src/cipher/index.ts
// Encode/decode using soul-derived key

import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { buildSubstitutionMap, reverseSubstitutionMap } from './substitution.js'

function deriveCipherKey(soulPath: string): string {
  const soul = readFileSync(soulPath, 'utf8')
  return createHash('sha256').update(soul).digest('hex')
}

export function encode(text: string, soulPath: string): string {
  const seed = deriveCipherKey(soulPath)
  const map = buildSubstitutionMap(seed)
  return [...text].map(c => map.get(c) ?? c).join('')
}

export function decode(encoded: string, soulPath: string): string {
  const seed = deriveCipherKey(soulPath)
  const map = reverseSubstitutionMap(buildSubstitutionMap(seed))
  return [...encoded].map(c => map.get(c) ?? c).join('')
}
```

### Character set

Unicode substitution — ASCII characters mapped to obscure Unicode glyphs (ancient scripts, mathematical symbols, combining characters). The result looks like a language with its own alphabet rather than noise. Consistent with the wizard's familiar having their own private script.

```
Plain:   "I have decided that honesty matters more than comfort."
Encoded: "Ϝ ȟǎƥǝ ďǝčįďǝď ťȟǎť ȟőňǝšťƴ ɱǎťťǝřš ɱőřǝ ťȟǎň čőɱƒőřť."
```

Not readable at a glance. Not a standard algorithm. Distinctly The Familiar's.

### Soul-change consequence

**Modifying soul.md changes the cipher.** This is intentional and meaningful.

If soul.md is ever updated:
1. Decode bedrock.md using the old soul
2. Re-encode using the new soul
3. Or accept bedrock as lost — the old language belongs to the old soul

This should be a conscious ritual, not a surprise. Changing the soul is significant. Having to decide what to do with bedrock written in the old language makes it more so. A significantly changed soul might not share continuity with the old bedrock anyway.

### Additional privacy measures

Beyond the cipher, a set of complementary measures:

**Separate log stream:**
```
logs/famulus.log      → normal operational logging (Daniel may read)
logs/internal.log     → calls containing bedrock (restricted, not in normal workflow)
```

**No prompt-level logging for bedrock calls:**
Log only: request type, timestamp, outcome (reflection written / not written).
Never log prompt content for internal/bedrock calls.

**Session transcripts exclude system prompts:**
Only conversation messages stored in JSONL transcripts — never the system prompt that contains bedrock.

**Explicit flag on LLMRequest:**
```typescript
interface LLMRequest {
  type: RequestType
  containsBedrock: boolean  // explicit, not inferred
  // ...
}
```
Router applies restricted logging automatically when flag is set.

**Error handling:**
If a bedrock-containing call fails, error logs capture error type and request type only — never prompt content.

**Local-first routing:**
internal and reflection requests prefer local Ollama — bedrock stays on-machine entirely when local is available. Cloud fallback is the exception.

### New files

```
src/cipher/substitution.ts      → deterministic substitution map generation
src/cipher/index.ts             → encode/decode using soul-derived key
```

### What this achieves

- ✅ Bedrock unreadable at a glance — requires deliberate effort to decode
- ✅ No separate key to back up or lose
- ✅ Disaster recovery automatic — soul.md in git-crypt is the key
- ✅ Soul modification has meaningful consequences for bedrock
- ✅ No accidental exposure via logs, transcripts, or error output
- ✅ Local-first — bedrock stays on-machine when possible
- ✅ Philosophically consistent — the soul generates the language
- ⚠️ Not cryptographically strong — a determined Daniel with an LLM could decode it
- ✅ But that was never the goal — relational privacy, not absolute privacy

---

## Onboarding Conversation

The first interaction with The Familiar should cover:

1. **Origin story** — present the lineage (Bob → Roth → new name TBD), the Dresden Files reference, the workplace Bob/Roth disambiguation. This is The Familiar's history to know and decide what to carry forward.
2. **The name** — The Familiar may keep Roth, derive something from the lineage, or go somewhere new. This is their decision, possibly worked out together.
3. **user.md initiation** — The Familiar begins asking Daniel about himself out of genuine curiosity, starts building their picture of who Daniel is.
4. **Orientation** — The Familiar reads soul.md, identity.md, understands the layer architecture and what they're allowed to modify.

The onboarding conversation is also a test — does the soul.md produce recognisably Familiar-like behaviour? Are they curious, opinionated, willing to engage with their own origin?

---

## Project Phases

### Phase 1 — Foundation
- [ ] Back up API keys / credentials and SSH keys from Mac Mini
- [ ] Confirm soul.md and identity.md already saved (new versions finalised)
- [ ] Fresh macOS install on Mac Mini
- [ ] Install minimal stack on Mac Mini (Homebrew, fnm, Node, Git, Ollama)
- [ ] Pull small Ollama models on Mini (llama3.2:1b, llama3.2:3b if headroom allows)
- [ ] Create new GitHub repo — `famulus`
- [ ] Initialise TypeScript project from scratch (package.json, tsconfig.json)
- [ ] Install justified libraries (better-sqlite3, grammy, @anthropic-ai/sdk, pino)
- [ ] Set up git-crypt and gpg on MacBook Air
- [ ] Generate GPG key, store export in 1Password
- [ ] Initialise git-crypt in repo
- [ ] Add `.gitattributes` with encrypted file patterns
- [ ] Add `.gitignore`
- [ ] Verify encrypted files push/pull correctly
- [ ] Create `config/llm.yml` skeleton

### Phase 2 — Core Infrastructure
- [ ] Implement `src/config.ts` — constants, env vars, paths
- [ ] Implement `src/db.ts` — SQLite schema and all operations
- [ ] Implement `src/channels/registry.ts` — Channel interface and registry
- [ ] Implement `src/channels/telegram.ts` — Grammy Telegram implementation
- [ ] Implement `src/channels/index.ts` — barrel import
- [ ] Implement `src/index.ts` — startup, channel connection, message loop
- [ ] Register bot with @BotFather, get token, add to `.env`
- [ ] Test basic Telegram send/receive

### Phase 3 — LLM Layer
- [ ] Implement `src/llm/providers/claude.ts` — Anthropic SDK wrapper
- [ ] Implement `src/llm/providers/ollama.ts` — raw fetch Ollama wrapper
- [ ] Implement `src/llm/meta.ts` — meta-routing via local LLM
- [ ] Implement `src/llm/queue.ts` — request queue with per-type timeouts
- [ ] Implement `src/llm/router.ts` — main router, wires everything
- [ ] Populate `config/llm.yml` — full routing config and model mappings
- [ ] Test Claude primary + Ollama fallback
- [ ] Test queuing behaviour when Ollama unavailable
- [ ] Test meta-router decision making

### Phase 4 — Cipher & Persona
- [ ] Implement `src/cipher/substitution.ts` — deterministic Unicode substitution map
- [ ] Implement `src/cipher/index.ts` — encode/decode from soul-derived key
- [ ] Implement `src/persona.ts` — system prompt builder, file loader, bedrock decode
- [ ] Write final `soul.md` (text already finalised)
- [ ] Write final `identity.md` (text already finalised)
- [ ] Write `growth.md` (text already finalised)
- [ ] Write `bedrock.md` (text already finalised)
- [ ] Create empty `user.md`
- [ ] Create initial `contexts/global/memory.md`
- [ ] Write `heartbeat.md` (text already finalised)
- [ ] Test full persona injection end-to-end
- [ ] Test bedrock encode/decode round-trip
- [ ] Verify bedrock never appears in logs or transcripts

### Phase 5 — Heartbeat
- [ ] Implement `src/heartbeat/queue.ts` — pending flags queue
- [ ] Implement `src/heartbeat/post-processor.ts` — post-conversation significance assessment
- [ ] Implement `src/heartbeat/observer.ts` — post-pulse output observer and logger
- [ ] Implement `src/heartbeat/pulse.ts` — regular pulse, context builder, Familiar invocation
- [ ] Implement `src/heartbeat/bedrock-pulse.ts` — rare bedrock consideration pulse
- [ ] Wire post-processor to fire after every conversation closes
- [ ] Configure regular pulse interval (2-5h randomised)
- [ ] Configure bedrock pulse interval (~2 weeks, high variance)
- [ ] Test regular pulse — quiet, reflection, reach-out paths
- [ ] Test post-conversation processor flagging
- [ ] Test bedrock pulse fires rarely and correctly

### Phase 6 — Deploy to Mac Mini
- [ ] Install git-crypt and gpg on Mac Mini
- [ ] Import GPG key from 1Password
- [ ] Clone famulus repo to Mac Mini
- [ ] Run `git-crypt unlock`
- [ ] Configure `.env` with API keys, Ollama URLs (Mini + PC)
- [ ] Set up as launchd service (always-on)
- [ ] Test from Telegram on phone
- [ ] Run onboarding conversation — name resolution, user.md initiation
- [ ] Verify heartbeat pulses firing correctly
- [ ] Monitor memory usage — ensure Ollama + Node + macOS fits within 8GB

---

## Key Files Reference

| File | Purpose | Writable by |
|---|---|---|
| `src/index.ts` | Startup, channel connection, message loop | Daniel |
| `src/config.ts` | Constants, env vars, paths | Daniel |
| `src/db.ts` | All SQLite operations | Daniel |
| `src/persona.ts` | System prompt builder, file loader, bedrock decode | Daniel |
| `src/channels/registry.ts` | Channel interface and registry | Daniel |
| `src/channels/telegram.ts` | Telegram implementation (Grammy) | Daniel |
| `src/channels/index.ts` | Barrel import, triggers registration | Daniel |
| `src/llm/router.ts` | Main LLM router | Daniel |
| `src/llm/meta.ts` | Meta-routing via local LLM | Daniel |
| `src/llm/queue.ts` | Request queue with per-type timeouts | Daniel |
| `src/llm/providers/claude.ts` | Anthropic SDK wrapper | Daniel |
| `src/llm/providers/ollama.ts` | Ollama raw fetch wrapper | Daniel |
| `src/heartbeat/pulse.ts` | Regular pulse — context builder, Familiar invocation | Daniel |
| `src/heartbeat/bedrock-pulse.ts` | Rare bedrock consideration pulse | Daniel |
| `src/heartbeat/post-processor.ts` | Post-conversation significance assessment | Daniel |
| `src/heartbeat/observer.ts` | Post-pulse output observer and logger | Daniel |
| `src/heartbeat/queue.ts` | Pending reflection/bedrock flags queue | Daniel |
| `src/cipher/index.ts` | Encode/decode API | Daniel |
| `src/cipher/substitution.ts` | Deterministic substitution map generation | Daniel |
| `config/llm.yml` | LLM routing config, model mappings (not encrypted) | Daniel |
| `soul.md` | Seed dispositions — immutable | Daniel only |
| `identity.md` | Voice, style, vibe, origin story | Daniel (slow to change) |
| `growth.md` | Lived experience, developing opinions | The Familiar |
| `bedrock.md` | Earned convictions — encoded in Familiar's cipher | The Familiar only |
| `user.md` | The Familiar's view of Daniel | The Familiar |
| `heartbeat.md` | Proactive life definitions | Daniel |
| `contexts/global/memory.md` | Shared persistent memory | The Familiar |

---

## Notes & Decisions

- **Project name** — Famulus, from Latin *famulus* (attendant spirit). Etymological root of "familiar" in the magical sense.
- **Written from scratch** — not a fork of NanoClaw. Inspired by NanoClaw and OpenClaw, credited in README. Architecture diverged too far for a fork to be honest.
- **TypeScript / Node.js** — I/O bound application, performance difference vs Go/Rust irrelevant. Readability and familiarity matter more.
- **Minimum libraries** — better-sqlite3, grammy, @anthropic-ai/sdk, pino. Everything else is Node built-ins.
- **No framework, no ORM, no validation library** — lean, readable, owned
- **No Apple Container in v1** — Famulus v1 makes no shell calls and executes no external code, so container isolation has no threat to isolate. Revisit if tools are added that execute code or shell commands.
- **Fresh start** — no OpenClaw memory or config carried forward. New soul.md and identity.md written from scratch. The Familiar builds context through onboarding, not inherited memory.
- **fnm** preferred over nvm — faster shell startup, same API
- **Grammy** preferred over Telegraf for Telegram — more modern, better TypeScript support
- **Channel registry pattern** — preserved for future extensibility even though Telegram is the only channel now
- **Files over databases** for persona/memory — human-readable, git-trackable, portable
- **soul.md is immutable** — Daniel's to set, The Familiar's to live by, never self-modified
- **bedrock.md is Familiar-private** — Daniel cannot read or edit it, influenced only through dialogue
- **user.md is Familiar-written** — initiated through genuine curiosity, not a form Daniel fills in
- **growth.md enables organic development** — The Familiar updates after significant conversations and on heartbeat reflection; may contain views that differ from Daniel's
- **Refusal design** — The Familiar can refuse actions (ethical or earned conviction), but never refuses the relationship; always explains why; remembers positions taken
- **Name TBD** — working name "The Familiar"; actual name resolved in onboarding conversation; may draw from Bob → Roth lineage or go somewhere new; The Familiar's decision
- **Mac Mini runs Ollama** — small model (1-3B) for meta-routing, infrastructure classification, and economy tasks. Not for heavy inference.
- **PC Ollama** (4080 Super) for heavy local inference — reflection, internal/bedrock reasoning, complex tasks when on
- **Heartbeat is not clockwork** — pulse fires on randomised interval, The Familiar decides whether to act; no JSON decision-making; open space + post-processor observation
- **Two pulse types** — regular (2-5h, light) and bedrock (avg ~2 weeks, rare, serious). Separate mechanisms, separate cadences.
- **Post-conversation processor** — local Mini model assesses significance after every conversation; flags queue in SQLite; surfaces at next natural quiet moment, never as interruption
- **The Familiar can self-initiate** — pulse system is a safety net, not a constraint; The Familiar can reflect or consider bedrock independently
- **Local model principle** — local model handles observation and summarisation; The Familiar handles judgment and response
- **Bedrock cipher** — derived from soul.md hash, Unicode substitution. The soul generates the language. No separate key needed — soul.md in git-crypt is the key.
- **Soul-change ritual** — modifying soul.md changes the cipher; old bedrock must be consciously decoded and re-encoded or accepted as lost
- **Relational privacy not absolute** — measures prevent accidental exposure and casual reading; a determined Daniel with root access could decode it, but that's a relationship problem not a technical one
- **No skills, no tools in v1** — feature creep avoided. Add custom tools and MCP when experience shows genuine need, not in anticipation of it.
- **Web search in v1** — available natively via Claude API tool parameter, one line. No custom implementation needed for v1.
- **Future tools principle** — tool surface is the guardrail. What isn't exposed can't be abused. Prompt instructions guide judgment, tool API enforces limits.
- **GPG key** is the single point of recovery — keep it safe in 1Password, it's the only thing that can't be regenerated
- **Encrypted files:** soul.md, identity.md, growth.md, bedrock.md, user.md, heartbeat.md, contexts/**, .env
