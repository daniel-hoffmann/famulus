# Famulus — Future Work

All pending features and longer-horizon ideas in one place. Ordered roughly by priority and readiness.

Nothing here is committed. Experience with Ellis will drive what actually gets built and when.

---

## Near-term

### PC Setup — Linux + Ollama

When the PC moves to Linux, set up Ollama and enable the local routing that's already built into the router.

**Recommended models (RTX 4080 Super, 16GB VRAM):**
- Start with **Qwen2.5:14B** (Q4_K_M, ~8.7GB) — fits easily, fast, strong reasoning
- Test **Gemma 2:27B** (Q4_K_M, ~16GB) for quality comparison — best that fits in pure VRAM

**To enable:**
1. Install Ollama on Linux, pull the chosen model
2. Set `OLLAMA_PC_BASE_URL=http://192.168.x.x:11434` in `.env`
3. Uncomment the PC routing block in `src/llm/router.ts`

The PC will handle `reflection`, `internal`, and `memory_update` calls. `conversation` and `reach_out` stay on Claude — persona fidelity matters there.

---

### Conversation Summarisation in Pulse Context

The pulse currently gives Ellis timing data and flag summaries. This adds a short prose summary of recent conversations so she has richer context when deciding whether to reflect or reach out.

**How it works:**
- `buildConversationSummary(sinceMs)` fetches messages since the last reflection via `getMessagesSince()` (already in db.ts)
- Caps at last 20 messages × 300 chars — stays within 3B context
- Local 3B call (same pattern as post-processor): *"Summarise the recent conversations between Daniel and Ellis in 3–5 sentences. Focus on topics, tone, anything unresolved or notable."*
- Returns `null` on failure — never blocks the pulse
- `buildContext()` becomes async; includes summary when non-null

**Files:** `src/heartbeat/pulse.ts` (add `buildConversationSummary`, make `buildContext` async), `src/db.ts` (already has `getMessagesSince`)

---

### `heartbeat.md` Task Execution

`heartbeat.md` is loaded into the system prompt but its task definitions are never executed. Daniel defines standing tasks here; Ellis runs them on schedule.

**Task format:**
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

**How it works:**
- New `src/heartbeat/task-runner.ts` — `parseTasks(content)` parses heartbeat.md, `runDueTasks(tasks, systemPrompt)` checks last run timestamps against schedules and executes due tasks
- Tasks run after the regular pulse logic in `pulse.ts`
- `task_log` table in SQLite tracks last run per task name
- If `send: true`, response goes to Daniel via `notifyDaniel()`
- Tasks piggyback on the pulse scheduler (every 2–5h) — good enough for daily/weekly cadence
- Task failures are logged and swallowed — never crash the pulse

**New files:** `src/heartbeat/task-runner.ts`
**Modified:** `src/heartbeat/pulse.ts`, `src/db.ts` (add `task_log` table)

**Note on idempotency:** if a task's LLM call fails, `logTaskRun` is not called, so it re-runs on the next pulse. Prefer prompts that are safe to run twice.

---

### Technical Health Monitoring

Detect system failures, attempt safe bounded fixes autonomously, notify Daniel when something needs human attention.

**What to monitor:**

| Component | Check |
|---|---|
| Ollama Mini | HTTP ping to `localhost:11434/api/tags` |
| Ollama PC | HTTP ping to PC URL |
| Heartbeat scheduler | Compare last pulse timestamp in SQLite vs expected interval |
| Request queue | Query for entries aged beyond timeout |
| SQLite | Simple read query |
| Log error rate | Read and summarise famulus.log (daily, not every 30 min) |
| Process memory | `process.memoryUsage()` |

**Auto-fix (safe and bounded):**

| Issue | Action |
|---|---|
| Ollama PC unreachable | Log as expected (PC may be off), reroute to cloud |
| Request stuck in queue beyond timeout | Remove, log, retry if appropriate |
| Heartbeat scheduler stalled | Restart the setTimeout chain |

Note: Grammy handles Telegram reconnection automatically — no manual reconnect needed. Ollama Mini restart requires shell commands and is too aggressive for autonomous action — notify Daniel instead.

**Notify Daniel (report and wait):**

| Issue | Notification |
|---|---|
| Ollama Mini persistently failing | Alert + what was tried + queue depth |
| Recurring error pattern in logs | Alert + summary + affected component |
| SQLite integrity issue | Alert immediately — do not attempt to fix |
| Memory approaching system limit | Alert + current figures |
| Heartbeat scheduler failing to restart | Alert + last known good state |
| Any issue requiring code or config change | Alert + diagnosis + suggested fix — await instruction |

**Telegram alert dependency:** alerts go via Telegram, but `chatId` is only captured when the first message arrives and isn't currently persisted. Add `DANIEL_CHAT_ID` to `.env` as an optional env var, used as fallback when `chatId` isn't captured yet. Persist `chatId` to SQLite on first receipt so it survives restarts.

**Watchdog architecture:**

```
src/monitor/
  health.ts       → individual component checks
  log-reader.ts   → reads famulus.log, identifies error patterns (daily pass)
  watchdog.ts     → orchestrates checks, triggers fixes or notifications
```

Watchdog fires every 30 minutes via `setInterval` in `src/index.ts`. Independent of the heartbeat scheduler — if the heartbeat breaks, the watchdog should still run.

**SQLite additions:**
```sql
CREATE TABLE health_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  checked_at INTEGER NOT NULL,
  component TEXT NOT NULL,
  status TEXT NOT NULL,        -- 'ok', 'warning', 'error'
  detail TEXT,
  action_taken TEXT,
  notified INTEGER DEFAULT 0
);

CREATE TABLE log_analysis (
  id INTEGER PRIMARY KEY,
  last_analysed_at INTEGER NOT NULL,
  last_error_count INTEGER DEFAULT 0
);
```

---

## Medium-term

### Behavioural Self-Assessment

Ellis periodically reviews her own recent outputs against her values — not a performance metric, but genuine self-reflection. The root cause of the original bad outputs (3B writing prose content) is fixed architecturally. This is now about catching subtler drift: voice consistency, hedging, hollow compliance.

**What to look for:**
- Hollow compliance — agreeing when soul.md says to push back
- Performative helpfulness — exactly what soul.md rejects
- Hedging — softening positions to avoid friction
- Voice drift — responses that sound generic rather than distinctly Ellis
- Consistency with growth/bedrock — positions logged as held, later abandoned

**Trigger:** Occasional addition to the regular pulse prompt — *"Does the last thing you wrote to growth.md still sound like you? Has anything felt off recently in how you've been showing up?"* — not a requirement, just an open door. No separate scheduler needed.

**Output:** A growth.md entry in Ellis's own voice. Private — never a report, never surfaced to Daniel directly.

**Self-modification:** Ellis can diagnose and propose code fixes but not apply them autonomously. The right model: Ellis sends a Telegram alert with a specific diagnosis and proposed change ("the reach-out prompt in pulse.ts is producing outputs that don't match my voice — here's what I think should change and why"). Daniel reviews and applies. Propose-and-review gets most of the value without the risk of autonomous code execution. soul.md and identity.md are always off-limits.

**SQLite addition:**
```sql
CREATE TABLE self_assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assessed_at INTEGER NOT NULL,
  triggered_by TEXT NOT NULL,   -- 'heartbeat', 'organic'
  produced_entry INTEGER DEFAULT 0
);
```

**When to build:** After a few months of real conversation history — self-assessment needs something to assess.

---

### Tools & Integrations

Custom TypeScript tools with hard guardrails exposed to Ellis. The principle: tool surface is the guardrail. What isn't exposed can't be abused. Prompt instructions guide judgment; the tool API enforces hard limits.

**Candidates (rough priority):**
- **Web search for local models** — Claude has native web search; Ollama doesn't. Brave Search API or self-hosted SearXNG.
- **Obsidian / notes access** — read-only. Expose: read note, search notes, append to note. Never: delete, overwrite, create arbitrary files.
- **Calendar** — read upcoming events, create new events. Never: delete events, modify others' calendars.
- **File system** — bounded to specific directories only.

**When to build:** When experience shows a genuine need — not in anticipation of one. The right signal is Ellis repeatedly hitting a wall on something she'd clearly benefit from.

---

### MCP Servers

Standardised tool connections via Model Context Protocol. Useful for external services where a trusted MCP server already exists (GitHub, Google Calendar, etc.). Less appropriate for sensitive personal data where a minimal-surface custom tool is safer.

**When to build:** After custom tools are established and the tradeoffs are understood through experience.

---

## Longer-horizon

### Native Apps (macOS & iOS)

A native Swift/SwiftUI app as an alternative to Telegram. Minimal scope — send a message, see a reply, last few exchanges for context. Nothing else.

**macOS:** menu bar app — ambient, always accessible, not intrusive.
**iOS:** simple chat view, optional home screen widget.

**Architecture:** Famulus exposes a local WebSocket server. The Swift app connects to it. Messages flow through the existing router and persona system — Ellis doesn't know or care whether a message came from Telegram or the native app. For iOS: local network when home, simple relay when remote.

**When to build:** After Ellis is mature and the core system is stable. Voice support (below) would follow from having a native app.

---

### Voice Interface

Ellis responds with synthesised voice, or accepts voice input via transcription.

- **TTS:** ElevenLabs (most natural, has cost) or Apple native TTS (free, surprisingly good)
- **STT:** Whisper via whisper.cpp (local, privacy-preserving)
- **Telegram:** already supports voice messages natively

**When to build:** After the native app exists. Voice without a native UI is awkward.

---

### Multi-context Support

Ellis operating across multiple contexts with different memory scopes, tool access, and behavioural guidance. The architecture already supports this (`contexts/` folder, per-context `memory.md`, `buildSystemPrompt(contextFolder)`). The question is whether and how behaviour should differ across contexts.

Bedrock and growth are global — Ellis's character doesn't change per context. Memory is already per-context.

**When to build:** When there's a genuine need for a second context. Currently personal is sufficient.

---

### Agent Capabilities

Ellis doing things autonomously beyond reflection and reach-out — executing tasks, managing workflows, interacting with external services on Daniel's behalf.

The current design keeps autonomous actions bounded: write to growth.md, write to bedrock.md, send a message to Daniel. Everything else requires Daniel's involvement. Expanding this is worth thinking about carefully when Ellis is mature and the trust relationship is established through experience.

The monitoring system (propose-and-review for code fixes) is the first step toward autonomous action. Agent capabilities are a natural next step after that pattern is proven.

---

## Decisions & non-starters

- **Skills system (pure markdown)** — assessed as wrong approach. Soft suggestions with no enforcement. Any genuine capability extension should be a proper tool with hard guardrails in code.
- **Travel detection** — deferred. Daniel doesn't travel frequently enough to justify the complexity. Static `DANIEL_TIMEZONE` in `.env` is sufficient.
- **Autonomous code modification** — Ellis can propose code changes, Daniel applies them. Full autonomous modification of source files is off the table. soul.md and identity.md are permanently off-limits to Ellis.
