# Famulus — Supplementary Plan
## Soul Protection, Cipher Safety & Vision

---

## Part 1 — Soul Protection & Cipher Safety

### Background

The bedrock cipher is derived deterministically from `soul.md`:

```
sha256(soul.md) → cipher key → Unicode substitution map → encoded bedrock.md
```

This means `soul.md` is the single source of truth for the cipher. If `soul.md` changes — even accidentally, even by a single character — the cipher key changes, and existing bedrock.md becomes permanently unreadable without the old version of soul.md.

### Does git-crypt interfere?

No. git-crypt encrypts soul.md at rest in the repo using your GPG key, but `git-crypt unlock` decrypts it back to exact original plaintext. The sha256 of that plaintext is always identical to when the cipher was first derived.

```
soul.md plaintext → sha256 → cipher key
git-crypt unlock  → same soul.md plaintext → same sha256 → same cipher key
```

git-crypt is transparent to the cipher. No interference.

### The real risk — accidental modification

The risk is not git-crypt. It is:
- Editing soul.md in an editor that silently changes line endings (Windows CRLF)
- A stray keystroke saving an unintended change
- Any tool that touches the file and modifies whitespace or encoding

### Protection approach — two layers

#### Layer 1 — Hash verification on startup (primary)

On every startup, Famulus computes `sha256(soul.md)` and compares it against a stored reference hash in `soul.md.sha256`. If they differ, Ellis halts and alerts Daniel before doing anything else — including attempting to decode bedrock.

```typescript
// src/cipher/soul-guard.ts

import { createHash } from 'crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { SOUL_PATH, SOUL_HASH_PATH } from '../config.js'

export function computeSoulHash(): string {
  const soul = readFileSync(SOUL_PATH, 'utf8')
  return createHash('sha256').update(soul).digest('hex')
}

export function initialiseSoulHash(): void {
  // Call once when soul.md is first written — stores the reference hash
  const hash = computeSoulHash()
  writeFileSync(SOUL_HASH_PATH, hash, 'utf8')
}

export function verifySoulIntegrity(): void {
  if (!existsSync(SOUL_HASH_PATH)) {
    // First run — initialise
    initialiseSoulHash()
    return
  }

  const storedHash = readFileSync(SOUL_HASH_PATH, 'utf8').trim()
  const currentHash = computeSoulHash()

  if (storedHash !== currentHash) {
    throw new Error(
      'SOUL_INTEGRITY_FAILED: soul.md has changed since the cipher was last initialised. ' +
      'bedrock.md may be unreadable with the current soul. ' +
      'Verify the change was intentional before proceeding. ' +
      'If unintentional, restore soul.md from git.'
    )
  }
}
```

Called in `src/index.ts` before anything else:

```typescript
// src/index.ts — top of startup sequence
import { verifySoulIntegrity } from './cipher/soul-guard.js'

verifySoulIntegrity() // Halts with clear error if soul.md has drifted
```

If verification fails, Ellis sends a Telegram alert to Daniel and does not start:

```
⚠️ Startup halted — soul integrity check failed.

soul.md has changed since the cipher was initialised.
bedrock.md cannot be decoded with the current soul.

If this was intentional (you edited soul.md deliberately):
  Run: npm run soul:rekey
  This decodes bedrock with the old soul and re-encodes with the new one.
  You will need the previous soul.md content from git history.

If this was accidental:
  Restore soul.md: git checkout soul.md
  Then restart.
```

#### Layer 2 — Read-only file permissions after unlock (secondary)

Makes accidental edits harder at the OS level. Cannot be set permanently because git-crypt needs write access during `git-crypt unlock`. Applied as a post-unlock step.

Add to a setup script or document as a manual step after cloning and unlocking:

```bash
# After git-crypt unlock, protect soul.md
chmod 444 soul.md

# Before intentional edits, temporarily unlock
chmod 644 soul.md
# ... make changes ...
# run soul:rekey if bedrock exists
chmod 444 soul.md
```

This is a secondary measure — the hash verification is the real protection. Read-only prevents the most common accident (saving an unintended edit) without adding complexity to the startup flow.

### The soul:rekey script

When soul.md is intentionally changed, bedrock.md must be re-encoded with the new cipher. This is the conscious ritual we designed — changing the soul has consequences.

```typescript
// scripts/soul-rekey.ts
// Usage: npm run soul:rekey

import { decode, encode } from '../src/cipher/index.js'
import { readFileSync, writeFileSync } from 'fs'
import { BEDROCK_PATH, SOUL_PATH, SOUL_HASH_PATH } from '../src/config.js'
import * as readline from 'readline'

async function rekey() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  
  const question = (q: string) => new Promise<string>(resolve => rl.question(q, resolve))

  console.log('Soul rekey — this will re-encode bedrock.md with the new soul.')
  console.log('You need the PREVIOUS soul.md content to decode existing bedrock.')
  console.log('')

  const oldSoulPath = await question('Path to old soul.md (or press enter to skip if bedrock is empty): ')
  
  rl.close()

  const currentBedrock = readFileSync(BEDROCK_PATH, 'utf8')

  if (oldSoulPath && currentBedrock.trim()) {
    // Decode with old soul
    const decoded = decode(currentBedrock, oldSoulPath)
    // Re-encode with new soul
    const reencoded = encode(decoded, SOUL_PATH)
    writeFileSync(BEDROCK_PATH, reencoded, 'utf8')
    console.log('bedrock.md re-encoded with new soul.')
  } else {
    console.log('Skipping bedrock re-encoding (empty bedrock or no old soul provided).')
  }

  // Update stored hash
  const { initialiseSoulHash } = await import('../src/cipher/soul-guard.js')
  initialiseSoulHash()
  console.log('soul.md.sha256 updated.')
}

rekey().catch(console.error)
```

Add to `package.json`:
```json
"scripts": {
  "soul:rekey": "tsx scripts/soul-rekey.ts"
}
```

### soul.md.sha256 — git and encryption

`soul.md.sha256` is a plaintext file containing only the hex hash of soul.md. It should be:
- **Git-tracked** — so it travels with the repo
- **Not git-crypt encrypted** — it contains no personal data, just a hash
- **Not gitignored** — it must be present on every clone

Add to `.gitattributes` explicitly to ensure git-crypt does not encrypt it:
```
soul.md.sha256 !filter !diff
```

### What this achieves

- ✅ Startup halts with clear message if soul.md drifted accidentally
- ✅ Ellis never attempts to decode bedrock with a wrong cipher key
- ✅ Intentional soul changes have a clear, guided path (soul:rekey)
- ✅ Read-only permissions prevent the most common accident
- ✅ git-crypt interaction fully safe — transparent to the cipher
- ✅ git history provides recovery if soul.md is accidentally corrupted

### New files

```
src/cipher/soul-guard.ts     → hash verification on startup
scripts/soul-rekey.ts        → re-encode bedrock when soul changes intentionally
soul.md.sha256               → reference hash (git-tracked, not encrypted)
```

---

## Part 2 — Vision / Image Support

### Overview

Ellis can receive and reason about images sent via Telegram. Claude's API supports vision natively — images are passed as base64-encoded content blocks alongside text in the messages array. Ellis sees the image and can respond to it like any other message.

This is cloud-only — vision routes to Claude (Sonnet or above). Ollama vision support varies by model and is not reliable enough for v1.

### How Telegram handles images

When a user sends a photo in Telegram, Grammy receives a `message` with a `photo` array containing multiple resolutions. The highest resolution is always last. Download via Telegram's `getFile` API, convert to base64, pass to Claude.

### Implementation

#### src/channels/telegram.ts — photo handling

```typescript
// Add to existing message handler in telegram.ts

async function downloadPhoto(ctx: Context): Promise<string | null> {
  if (!ctx.message?.photo) return null

  // Highest resolution is last in the array
  const photo = ctx.message.photo[ctx.message.photo.length - 1]
  const file = await ctx.api.getFile(photo.file_id)

  if (!file.file_path) return null

  const url = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${file.file_path}`
  const response = await fetch(url)
  const buffer = await response.arrayBuffer()

  return Buffer.from(buffer).toString('base64')
}
```

#### src/index.ts — message construction

When a message contains an image, build a multi-part content array rather than a plain string:

```typescript
// src/index.ts — message building

interface UserMessage {
  role: 'user'
  content: string | ContentBlock[]
}

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }

function buildUserMessage(text: string, imageBase64?: string): UserMessage {
  if (!imageBase64) {
    return { role: 'user', content: text }
  }

  const content: ContentBlock[] = [
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',  // Telegram photos are always JPEG
        data: imageBase64
      }
    }
  ]

  if (text) {
    content.push({ type: 'text', text })
  }

  return { role: 'user', content }
}
```

#### src/llm/providers/claude.ts — vision routing

Messages containing images must route to Claude — add a guard in the provider:

```typescript
// In callClaude — no changes needed to the API call itself
// Claude's messages API handles ContentBlock[] natively

// In the router — detect image-containing messages
function containsImage(messages: Message[]): boolean {
  return messages.some(m =>
    Array.isArray(m.content) &&
    m.content.some((b: ContentBlock) => b.type === 'image')
  )
}

// In router.ts — override provider if message contains image
if (containsImage(request.messages)) {
  // Force cloud — vision requires Claude
  provider = 'claude'
  tier = tier === 'economy' ? 'balanced' : tier  // Haiku vision is weak — minimum Sonnet
}
```

### LLMRequest update

Add an `hasImage` flag to signal the router without inspecting message content:

```typescript
interface LLMRequest {
  // ... existing fields
  hasImage?: boolean   // true when message contains an image — forces cloud routing
}
```

### Supported media types

Telegram photos are always JPEG. If document/file support is added later:

| Telegram type | media_type | Notes |
|---|---|---|
| `photo` | `image/jpeg` | Always JPEG, multiple resolutions |
| `document` (image) | varies | Check MIME type from file info |
| `sticker` (WebP) | `image/webp` | Claude supports WebP |

For v1 — `photo` only. Documents and stickers deferred.

### Privacy consideration

Images sent to Claude go to Anthropic's API servers. This is the same as any conversation message — acceptable for personal use but worth being conscious of sensitive images. No special handling needed for v1 beyond awareness.

### What Ellis can do with images

Once implemented, Ellis can:
- Describe what's in an image
- Answer questions about image content
- Reason about images in context of the conversation
- Respond naturally to images the way she responds to text

No special prompting needed — vision is a native capability of the model. Ellis will use it the way she uses web search: because it's available and relevant, not because she's instructed to.

### New files / changes

| File | Change |
|---|---|
| `src/channels/telegram.ts` | Add `downloadPhoto()`, pass base64 to index |
| `src/index.ts` | Add `buildUserMessage()`, handle photo messages |
| `src/llm/router.ts` | Add image detection, force cloud routing for images |
| `src/llm/providers/claude.ts` | Verify ContentBlock[] passes through correctly (likely no change needed) |

Estimated ~60-80 lines total across the affected files.

---

## Part 3 — Temporal Awareness & Location

### Overview

Ellis currently has no reliable sense of time — she doesn't know what time it is for Daniel, what timezone he's in, or whether a given moment is appropriate for reaching out. This causes reach-outs at inappropriate hours and contextually wrong greetings ("how has your day been" at 8am).

The solution must handle travel naturally — Daniel should be able to tell Ellis he's going to Germany and have her adjust automatically, without touching any config.

### Design principles

- **Conversational, not administrative** — Daniel tells Ellis about travel the same way he'd tell anyone. Ellis handles the rest.
- **user.md is the source of truth** — location is part of Ellis's understanding of Daniel, not a system setting
- **Config timezone is fallback only** — `DANIEL_TIMEZONE` in `.env` provides the home timezone default
- **Hard guardrails plus contextual awareness** — suppress reach-out during quiet hours in code (reliable), and inject time context into prompts (for natural composition)

### What needs to work

**Quiet hours enforcement** — no reach-out between configurable hours (e.g. 10pm–8am) in Daniel's current timezone. Enforced in the pulse scheduler as a hard guardrail, not dependent on Ellis's judgment.

**Temporal context injection** — current local time injected into pulse context and reach-out composition so Ellis knows whether it's morning, evening, or night and composes messages accordingly.

**Travel handling** — when Daniel mentions travel, Ellis updates user.md with current location and return date. Temporal context derives timezone from that location. On return (date passed or Daniel says he's back), user.md reverts to home location.

### user.md location field

A structured section the post-processor maintains:

```markdown
## Current location
City: Frankfurt, Germany
Timezone: Europe/Berlin
Returning: 2026-06-15
Home city: Sydney, Australia
Home timezone: Australia/Sydney
```

When no travel is active, `City` and `Timezone` match home. When travelling, they reflect the current location. Ellis derives the timezone from the city name herself when updating — Daniel never needs to specify UTC offsets.

### buildTemporalContext()

New function in `src/persona.ts`. Reads the location field from user.md, derives current local time:

```typescript
// src/persona.ts

export function buildTemporalContext(userProfile: string): string {
  // Parse current location from user.md structured field
  // Fall back to DANIEL_TIMEZONE env var if no location field found
  // Return human-readable temporal context string

  // Example output:
  // "Daniel's current location: Frankfurt, Germany
  //  Local time: Wednesday 11 June, 2:14 PM CEST
  //  Home: Sydney, Australia"

  // Or when not travelling:
  // "Daniel's current time: Wednesday 11 June, 10:14 PM AEST (Sydney)"
}
```

Injected into:
- Pulse context (so Ellis knows whether to reach out)
- Reach-out composition prompt (so she composes appropriate greetings)
- Conversation system prompt (so she's time-aware in general conversation)

### Quiet hours guard in pulse scheduler

Hard guardrail in `src/heartbeat/pulse.ts`. Before evaluating whether to reach out, check current time against quiet hours in Daniel's current timezone:

```typescript
function isQuietHours(userProfile: string): boolean {
  // Parse current timezone from user.md
  // Get current hour in that timezone
  // Return true if between QUIET_HOURS_START and QUIET_HOURS_END
  // Default: 22:00 – 08:00
}

// In pulse execution:
if (decision.reachOut && isQuietHours(userProfile)) {
  log.info('Reach-out suppressed — quiet hours')
  // Reflection still proceeds if decision included it
  // Reach-out queued for next pulse outside quiet hours, or dropped
}
```

Configurable in `.env`:
```
DANIEL_TIMEZONE=Australia/Sydney   # fallback home timezone
QUIET_HOURS_START=22               # 10pm
QUIET_HOURS_END=8                  # 8am
```

### Travel detection in post-processor

When a conversation is assessed as notable, the post-processor already updates user.md. Travel mentions are a specific case to handle:

- Detect travel mentions in conversation ("I'm heading to Frankfurt", "back from Berlin", "just landed in Tokyo")
- Update the location field in user.md accordingly
- Set returning date if mentioned
- On the returning date (or when Daniel says he's back), revert to home location

This is part of the existing `memory_update` flow — no new infrastructure needed, just additional logic in the post-processor prompt.

### Travel awareness in heartbeat.md

Add guidance for Ellis on travel-specific behaviour:

```markdown
## Travel

When Daniel is travelling, be more conservative about reaching out —
especially in the first day or two. Travel disrupts schedules and sleep.
A message at what seems like a reasonable evening hour may catch him
mid-flight, jet-lagged, or in a meeting.

When he mentions travel, note where he is and when he's back.
Adjust your sense of his day accordingly.
```

### What changes

| File | Change |
|---|---|
| `src/persona.ts` | Add `buildTemporalContext()` |
| `src/heartbeat/pulse.ts` | Add `isQuietHours()` guard before reach-out |
| `src/heartbeat/post-processor.ts` | Add travel detection to user.md update logic |
| `src/config.ts` | Add `DANIEL_TIMEZONE`, `QUIET_HOURS_START`, `QUIET_HOURS_END` |
| `user.md` | Add structured location field |
| `heartbeat.md` | Add travel awareness guidance |
| `.env` | Add timezone and quiet hours config |

Estimated ~80-100 lines across affected files.

### Implementation Phases (updated)

### Phase C — Temporal awareness & location

- [ ] Add `DANIEL_TIMEZONE`, `QUIET_HOURS_START`, `QUIET_HOURS_END` to `src/config.ts` and `.env`
- [ ] Add structured location field to `user.md`
- [ ] Implement `buildTemporalContext()` in `src/persona.ts`
- [ ] Inject temporal context into pulse context, reach-out composition, and conversation system prompt
- [ ] Implement `isQuietHours()` in `src/heartbeat/pulse.ts`
- [ ] Wire quiet hours guard into pulse reach-out decision
- [ ] Add travel detection to post-processor user.md update logic
- [ ] Add travel awareness guidance to `heartbeat.md`
- [ ] Test: verify reach-out suppressed during quiet hours
- [ ] Test: tell Ellis you're travelling, verify user.md updates and timing adjusts
- [ ] Test: verify return date handling reverts to home timezone

---

## Implementation Phases (full summary)

### Phase A — Soul protection *(implement first)*
- [ ] Implement `src/cipher/soul-guard.ts` — hash computation and verification
- [ ] Add `verifySoulIntegrity()` call to top of `src/index.ts` startup sequence
- [ ] Add Telegram alert on integrity failure (before bot fully starts)
- [ ] Implement `scripts/soul-rekey.ts` — guided re-encoding workflow
- [ ] Add `soul:rekey` to `package.json` scripts
- [ ] Generate initial `soul.md.sha256` from current soul.md
- [ ] Add `soul.md.sha256` to `.gitattributes` with `!filter !diff` to prevent git-crypt encryption
- [ ] Commit `soul.md.sha256` to repo
- [ ] Set `chmod 444 soul.md` on Mac Mini after verifying hash is correct
- [ ] Document the soul-change ritual in README or CLAUDE.md

### Phase B — Vision support
- [ ] Add `downloadPhoto()` to `src/channels/telegram.ts`
- [ ] Add `buildUserMessage()` to `src/index.ts`
- [ ] Add `hasImage` field to `LLMRequest` interface in `src/llm/router.ts`
- [ ] Add image detection and cloud routing override in `src/llm/router.ts`
- [ ] Test photo messages end-to-end — send image in Telegram, verify Ellis responds
- [ ] Test image + text combination messages
- [ ] Verify image-only messages (no caption) handled correctly

### Phase C — Temporal awareness & location
- [ ] Add `DANIEL_TIMEZONE`, `QUIET_HOURS_START`, `QUIET_HOURS_END` to `src/config.ts` and `.env`
- [ ] Add structured location field to `user.md`
- [ ] Implement `buildTemporalContext()` in `src/persona.ts`
- [ ] Inject temporal context into pulse context, reach-out composition, and conversation system prompt
- [ ] Implement `isQuietHours()` in `src/heartbeat/pulse.ts`
- [ ] Wire quiet hours guard into pulse reach-out decision
- [ ] Add travel detection to post-processor user.md update logic
- [ ] Add travel awareness guidance to `heartbeat.md`
- [ ] Test: verify reach-out suppressed during quiet hours
- [ ] Test: tell Ellis you're travelling, verify user.md updates and timing adjusts
- [ ] Test: verify return date handling reverts to home timezone

---

## Notes & Decisions

- **Hash verification is the primary protection** — read-only permissions are secondary. The guard catches what permissions can't.
- **git-crypt and cipher are fully compatible** — transparent decryption means soul.md plaintext is always identical post-unlock
- **soul.md.sha256 is plaintext in git** — no sensitive data, just a hash. Must not be git-crypt encrypted.
- **soul:rekey requires old soul.md** — keep git history clean so old versions are recoverable via `git show`
- **Vision is cloud-only in v1** — Ollama vision too unreliable. hasImage flag forces Claude routing.
- **Minimum Sonnet for vision** — Haiku vision capability is weak, override economy tier to balanced for image requests
- **Photo only in v1** — Telegram documents and stickers deferred
- **Images go to Anthropic servers** — same as conversation text, acceptable for personal use
- **No special vision prompting** — Ellis uses vision naturally, same as web search
- **Temporal awareness is conversational** — Daniel tells Ellis about travel naturally, no config changes needed during trips
- **user.md is source of truth for location** — not a system setting, part of Ellis's understanding of Daniel
- **Config timezone is fallback only** — `DANIEL_TIMEZONE` provides home timezone default when no travel is active
- **Hard guardrails for quiet hours** — suppression in code, not dependent on model judgment
- **Travel conservatism in heartbeat.md** — guidance for Ellis to be more cautious about reach-out when Daniel is travelling
