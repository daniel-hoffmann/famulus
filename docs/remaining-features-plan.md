# Remaining Features — Implementation Plan

Features not yet implemented from the original project plan, with design notes, file changes, and sequencing.

---

## Sequencing

| Order | Feature | Complexity | Status |
|---|---|---|---|
| 1st | Templates | Small | ✅ Done |
| 2nd | Prompt caching | Small | ✅ Done |
| 3rd | Web search | Small | ✅ Done |
| 4th | Daily session logs | Small | ✅ Done |
| 5th | Conversation summarisation in pulse | Medium | ⬜ Pending |
| 6th | Self-initiating reflection | Medium | ⬜ Pending |
| 7th | `heartbeat.md` task execution | Large | ⬜ Pending |
| 8th | `launchd` service config | Small | ⬜ Pending |

---

## Feature 1: Template Files

**Complexity: Small**

Three plaintext reference files at repo root. `.gitattributes` already excludes `*.template.md` from encryption — no changes needed there.

**New files:**

`soul.template.md` — explains the four persona layers, shows the expected format of soul.md (immutable dispositions as prose), and warns that changing soul.md changes the cipher key (decode bedrock first if updating soul).

`user.template.md` — documents that this file is auto-written by the post-processor after notable conversations, not by Daniel. Shows example structure: prose paragraphs about Daniel's interests, context, communication style.

`heartbeat.template.md` — shows the task block format for Feature 7. Documents available schedule values. Notes that the file itself is git-crypt encrypted.

---

## Feature 2: Prompt Caching

**Complexity: Small**

`soul.md` and `identity.md` change rarely. The Anthropic SDK supports caching via `cache_control: { type: 'ephemeral' }` on system prompt blocks. This splits the system prompt into a cacheable stable prefix and a dynamic suffix.

**`src/llm/providers/claude.ts`**
- Extend `ProviderRequest` with optional `cacheablePrefix?: string`.
- When provided, send `system` as a content block array:
  ```
  [
    { type: 'text', text: cacheablePrefix, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: systemPrompt }  // dynamic suffix
  ]
  ```
- When absent, send `system` as a plain string (current behaviour).

**`src/llm/router.ts`**
- Extend `LLMRequest` with optional `cacheablePrefix?: string`. Thread through to `callClaude`.

**`src/persona.ts`**
- Add `buildCacheablePrefix(): string` — reads only `soul.md` and `identity.md`, returns them joined with the separator. Does not include growth, bedrock, user, or memory.
- Existing `buildSystemPrompt()` unchanged.

**`src/index.ts`**
- For `conversation` requests (the hot path), pass `buildCacheablePrefix()` as `cacheablePrefix` and the remaining layers as `systemPrompt`.

**Important:** Bedrock must never be in the cacheable prefix — it is dynamic (decoded at runtime) and private. Only soul + identity.

**Tradeoff.** Caching helps most for back-and-forth conversations within the 5-minute TTL window. One-off calls (pulses, memory updates) benefit less. Start with `conversation` requests only.

---

## Feature 3: Web Search

**Complexity: Small**

Web search via the Claude API — one tool parameter addition. Adds the capability without wiring it to any existing trigger (a future `heartbeat.md` task could use it).

**`src/llm/providers/claude.ts`**
- Extend `ProviderRequest` with optional `webSearch?: boolean`.
- When `true`, pass `tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }]` in the API call.
- **Important:** When tools are in play, `response.content[0]` is not guaranteed to be a text block. Update the content parsing to filter for `type === 'text'` blocks and join them, rather than assuming index 0.

**`src/llm/router.ts`**
- Extend `LLMRequest` with optional `webSearch?: boolean`. Thread through to `callClaude`.
- If `webSearch: true` but the request routes to Ollama, the flag is silently ignored — local models can't do web search.

**Note:** Verify the tool name `web_search_20250305` against the installed SDK version (`^0.39.0`) before implementing.

---

## Feature 4: Daily Session Logs

**Complexity: Small**

Append to `contexts/personal/memory/YYYY-MM-DD.md` on every assistant response. The directory exists but nothing currently writes to it.

**`src/config.ts`**
- Add `PERSONAL_MEMORY_DIR = path.join(REPO_ROOT, 'contexts', 'personal', 'memory')`.

**`src/index.ts`**
- Import `appendFileSync`, `existsSync`, `mkdirSync` from `fs` and `PERSONAL_MEMORY_DIR` from config.
- After `addMessage('personal', 'assistant', response.content)`, call `appendToSessionLog(text, response.content)`.
- Inline function (no new file — keeps file count down):

```typescript
function appendToSessionLog(userText: string, assistantText: string): void {
  const date = new Date().toISOString().split('T')[0]
  const filePath = path.join(PERSONAL_MEMORY_DIR, `${date}.md`)
  const time = new Date().toISOString().split('T')[1].slice(0, 5)
  const entry = `\n### ${time}\n\n**Daniel:** ${userText}\n\n**Ellis:** ${assistantText}\n`
  mkdirSync(PERSONAL_MEMORY_DIR, { recursive: true })
  if (!existsSync(filePath)) {
    writeFileSync(filePath, `# ${date}\n`, 'utf8')
  }
  appendFileSync(filePath, entry, 'utf8')
}
```

Proactive reach-outs from the heartbeat are not included — those are already logged in `pulse_log` in SQLite.

---

## Feature 5: Conversation Summarisation in Pulse Context

**Complexity: Medium**

The pulse currently only passes timing data (hours since last reflection/reach-out) and raw flag summaries. This adds a short prose summary of recent conversations so Ellis has richer context at pulse time.

**`src/heartbeat/pulse.ts`**

Add `buildConversationSummary(sinceMs: number): Promise<string | null>`:
1. Calls `getMessagesSince(sinceMs)` (already exists in `db.ts`).
2. Returns `null` if no messages.
3. Caps at last 20 messages, truncates each to 300 chars.
4. Calls `callOllama` directly (same pattern as `post-processor.ts`) — this is infrastructure, not a persona call.
5. Prompt: *"Summarise the recent conversations between Daniel and Ellis in 3–5 sentences. Focus on topics discussed, tone, anything unresolved or notable."*
6. Returns `null` on any failure — never blocks the pulse.

Update `buildContext(flags)` to be async. It gets the last reflection timestamp, passes it to `buildConversationSummary`, and includes the result in the context string when non-null.

Update `runPulse()` to `await buildContext(flags)`.

**Imports to add:** `callOllama`, `isOllamaAvailable` from `../llm/providers/ollama.js`, `getMessagesSince` from `../db.js`.

**Cap on transcript size.** Take only the last 20 messages since last reflection, truncated to 300 chars each — keeps the prompt well within 3B context.

**Tradeoff.** A richer version could also read `growth.md` to compare current stance against recent conversations. Defer — a flat summary is sufficient for now.

---

## Feature 6: Ellis Self-Initiating Reflection

**Complexity: Medium**

After a `very_significant` conversation, Ellis can reflect immediately rather than waiting for the next pulse. This is Ellis's judgment — the trigger fires the opportunity, but Ellis decides whether to write.

**`src/heartbeat/post-processor.ts`**

Add `triggerImmediateReflection(messages: Message[]): Promise<void>`:
1. Builds a short transcript excerpt (same pattern as `assessConversation`).
2. Calls `route({ type: 'internal', containsBedrock: true, systemPrompt: buildSystemPrompt(), messages: [...] })`.
3. Prompt: *"Something significant just happened in that conversation. [transcript excerpt]. If something is genuinely pressing — not just notable but actually urgent to sit with — write a reflection now: REFLECTION:\n...\n/REFLECTION\nOtherwise, let it pass."*
4. Parses for `REFLECTION:.../REFLECTION` (same regex pattern as `pulse.ts`).
5. If a reflection is produced, appends to `growth.md` with a date header (same pattern as `pulse.ts`).
6. Wrapped in `try/catch`, logs on error, never throws.

Add imports: `route` from `../llm/router.js`, `buildSystemPrompt` from `../persona.js`, `existsSync`, `readFileSync`, `writeFileSync` (already imported for `user.md`), `GROWTH_PATH` from `../config.js`.

In `assessConversation`, update the `very_significant` branch:

```typescript
} else if (result.significance === 'very_significant') {
  addFlag('reflection', result.summary)
  addFlag('bedrock', result.summary)
  triggerImmediateReflection(messages).catch(err => log.warn({ err }, 'post-processor: immediate reflection failed'))
}
```

**Only `very_significant`.** `significant` conversations flag and wait for the next pulse — that is the normal path. Immediate reflection is the exception.

**No concurrency concern.** Node is single-threaded; `writeFileSync` is synchronous. Two simultaneous `very_significant` conversations finishing at exactly the same moment is not a realistic scenario.

---

## Feature 7: `heartbeat.md` Task Execution

**Complexity: Large**

`heartbeat.md` is in the system prompt but its task definitions are never parsed or executed. Daniel defines standing tasks here; Ellis runs them on schedule.

### Task format (define before coding)

```markdown
## Task: Weekly reflection summary
Schedule: weekly
Send: true
Prompt: Write a brief summary of your growth.md entries from the past week and share it with Daniel.

## Task: Check in on project
Schedule: daily
Send: true
Prompt: Ask Daniel how his current project is progressing.
```

- `Schedule`: `daily` or `weekly`
- `Send`: optional, defaults to `false`. When `true`, the task response is sent to Daniel via Telegram.

### Changes

**`src/db.ts`**
- Add `task_log` table:
  ```sql
  CREATE TABLE IF NOT EXISTS task_log (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    task_name TEXT    NOT NULL,
    ran_at    INTEGER NOT NULL
  )
  ```
- Add `logTaskRun(taskName: string): void`
- Add `getLastTaskRun(taskName: string): number | null`

**New file: `src/heartbeat/task-runner.ts`**
- `ParsedTask` interface: `{ name: string; schedule: 'daily' | 'weekly'; send: boolean; prompt: string }`
- `parseTasks(content: string): ParsedTask[]` — regex parser for the markdown format above. Logs a warning for malformed blocks.
- `runDueTasks(tasks: ParsedTask[], systemPrompt: string): Promise<void>` — iterates tasks, checks `getLastTaskRun` against schedule interval, routes due tasks via `route({ type: 'task', ... })`, calls `notifyDaniel` if `send: true`, then calls `logTaskRun`.

**`src/heartbeat/pulse.ts`**
- After the main pulse logic (internal call + optional reach-out), read `HEARTBEAT_PATH`, parse tasks, run due ones.
- Import `parseTasks`, `runDueTasks` from `./task-runner.js` and `HEARTBEAT_PATH` from `../config.js`.
- Wrap in `try/catch` — task failures must not crash the pulse.

**Tradeoff.** Tasks piggyback on the pulse scheduler (every 2–5 hours). Daily tasks are checked on each pulse; the schedule interval determines if they actually run. This is simpler than a separate task scheduler and good enough for daily/weekly cadences.

---

## Feature 8: `launchd` Service Config

**Complexity: Small**

Run Famulus as a persistent Mac Mini service. Auto-starts on login, restarts on crash.

**New file: `launchd/com.famulus.plist`**

Plaintext, git-tracked (no personal data). Contains path placeholders that must be edited before installation:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.famulus</string>
  <key>ProgramArguments</key>
  <array>
    <string>/PATH/TO/NODE</string>
    <string>--env-file=/PATH/TO/REPO/.env</string>
    <string>--no-deprecation</string>
    <string>/PATH/TO/REPO/dist/index.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/PATH/TO/REPO</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>
```

Find the Node path with: `which node` (after `fnm use 22`).

**Installation:**
```bash
cp launchd/com.famulus.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.famulus.plist
```

**Note:** pino handles logging to files — no `StandardOutPath`/`StandardErrorPath` needed unless you want startup errors captured. Consider adding them pointing to `logs/` as a safety net.

**User agent vs system daemon.** `~/Library/LaunchAgents` runs when the user is logged in. This is correct for the Mac Mini — it's always-on but not a headless server. No `sudo` required.

---

## Pitfalls

**Summarisation transcript size (Feature 5).** Cap at 20 messages × 300 chars. Without a cap, a prolific conversation day could exceed the 3B model's effective context.

**Web search tool name (Feature 3).** Verify `web_search_20250305` against the installed `@anthropic-ai/sdk` version before implementing. The tool name includes a date and may have changed.

**Prompt caching and bedrock (Feature 2).** Bedrock is decoded at runtime and must never enter the cache. `buildCacheablePrefix()` must explicitly read only soul and identity — not call `buildSystemPrompt()` and try to split the result.

**Task idempotency (Feature 7).** If a task's `route()` call fails, `logTaskRun` is not called, so the task re-runs on the next pulse. Prefer idempotent task prompts — asking "how is your project going?" twice in a day is fine; "send a summary of growth.md" twice is also fine.

**`contexts/personal/memory/` on fresh clone (Feature 4).** Use `mkdirSync(..., { recursive: true })` defensively — the directory may not exist after a fresh `git-crypt unlock` if no logs have been committed yet.
