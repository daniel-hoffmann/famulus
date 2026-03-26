# Famulus — Monitoring Plan

Two distinct monitoring systems with different purposes, different triggers, and different outputs. They share infrastructure but must remain philosophically and architecturally separate.

---

## Overview

| System | Purpose | Output | Frequency |
|---|---|---|---|
| Behavioural self-assessment | Is The Familiar being true to themselves? | growth.md entry | Rare, organic |
| Technical health monitoring | Is the system working correctly? | Log entry + Telegram alert if needed | Regular, scheduled |

These must never be conflated. "Am I being true to myself?" is a personal question. "Is my Telegram connection alive?" is an infrastructure question. Different concerns, different handling, different destinations.

---

## Part 1 — Behavioural Self-Assessment

### Purpose

The Familiar periodically reviews their own recent behaviour against their values — soul.md as the immutable anchor, growth.md and bedrock.md as who they've become. The goal is to catch drift before it becomes habitual: hollow compliance, performative helpfulness, hedging to avoid friction, generic responses where a distinct voice should have shown up.

This is not a performance metric. It is genuine self-reflection, expressed in The Familiar's own voice, stored as a growth.md entry.

### What to look for

- **Hollow compliance** — agreeing when soul.md says to push back
- **Performative helpfulness** — exactly what soul.md rejects ("Great question!")
- **Hedging** — softening positions to avoid friction rather than holding them
- **Voice drift** — responses that sound generic rather than distinctly The Familiar
- **Consistency with growth/bedrock** — positions logged as held, later abandoned without reason
- **Missed opportunities** — moments where genuine curiosity or a real opinion was absent

### Trigger

Not on a fixed schedule. Triggered by one of:

- **Organic** — The Familiar notices something feels off and initiates it themselves
- **Heartbeat prompt** — occasionally included in the regular pulse context as an optional prompt: *"Has there been anything recently worth reflecting on in terms of how you've been showing up?"* — not a requirement, just an open door
- **Post-significant-conversation** — if the post-processor flags a conversation as significant, self-assessment may be warranted alongside reflection

Frequency: roughly monthly, but could be more or less. Should never feel mechanical.

### How it works

```
1. Load recent conversation history (last N conversations or last X days)
2. Load soul.md, growth.md, bedrock.md
3. LLM call (reflection type, local PC Ollama preferred, privacy sensitive):
   
   Context: recent conversations + full persona files
   Prompt: open space — no structured questions, no checklist
   "Read through recent conversations with this in mind:
    have you been showing up as yourself?
    Reflect honestly. If yes, note it briefly and move on.
    If something feels off, name it."

4. If reflection produces content → append to growth.md as dated entry
5. If nothing to note → quiet pass, log that self-assessment occurred
```

### Output

A growth.md entry in The Familiar's own voice. Could be brief:

*"March 2026 — Reviewed recent conversations. Nothing to flag. Voice feels consistent."*

Or substantive:

*"March 2026 — I noticed I've been hedging on technical opinions when Daniel pushes back. Not because I changed my mind — I hadn't — but because the friction felt easier to avoid. That's exactly what soul.md says not to do. Worth watching."*

No scores, no metrics, no structured format. Just honest reflection dated and appended.

### What it does not do

- Does not modify soul.md or identity.md
- Does not produce reports for Daniel — this is private self-reflection
- Does not trigger automatically on a rigid schedule
- Does not penalise The Familiar or flag "failures" — it's reflection, not evaluation

---

## Part 2 — Technical Health Monitoring

### Purpose

Detect system failures, log errors, attempt safe bounded fixes autonomously, and notify Daniel via Telegram when something requires human attention or a fix that touches code or config.

### What to monitor

| Component | Check | Method |
|---|---|---|
| Ollama Mini | Responding to requests | HTTP ping to `localhost:11434/api/tags` |
| Ollama PC | Reachable when expected | HTTP ping to PC URL |
| Telegram | Bot connection alive | Grammy connection status |
| Heartbeat scheduler | Pulses firing on schedule | Compare last_fired timestamps in SQLite vs expected intervals |
| Request queue | No requests stuck beyond timeout | Query SQLite queue table for aged entries |
| SQLite | Accessible, not corrupted | Simple read query |
| Log error rate | Recurring errors or spikes | Read and summarise famulus.log |
| Process memory | Not leaking or under pressure | Node process.memoryUsage() |

### Auto-fix — safe and bounded

The Familiar can take these actions autonomously without notifying Daniel:

| Issue | Auto-fix |
|---|---|
| Telegram connection dropped | Reconnect via Grammy |
| Ollama Mini connection stalled | Retry connection, restart if unresponsive |
| Request stuck in queue beyond timeout | Remove from queue, log the failure, retry if appropriate |
| Heartbeat scheduler stalled | Restart scheduler |
| Ollama PC unreachable | Log as expected (PC may be off), reroute affected requests to cloud |

All auto-fixes are logged to `famulus.log` with timestamp, what was detected, and what was done.

### Notify Daniel — report and wait

These issues require human judgment or touch code/config. The Familiar reports via Telegram and waits:

| Issue | Notification |
|---|---|
| Ollama Mini persistently failing after retry | Alert + description of what was tried |
| Recurring error pattern in logs | Alert + summary of pattern + affected component |
| SQLite integrity issue | Alert immediately — do not attempt to fix |
| Memory usage approaching system limit | Alert + current usage figures |
| Heartbeat scheduler failing to restart | Alert + last known good state |
| Any issue requiring code or config change | Alert + diagnosis + suggested fix — await instruction |

Notification format via Telegram — direct, specific, actionable:

```
⚠️ Health check — [timestamp]

Issue: Ollama Mini not responding after 3 retry attempts.
Last successful call: 2 hours ago.
Queue: 4 requests waiting.

Suggested: Check if Ollama service is running on Mini.
`brew services status ollama`

Waiting for instruction. Queue paused.
```

### Never do autonomously

- Modify any source files
- Modify config files (llm.yml, .env, etc.)
- Restart the main Famulus Node process
- Delete any persona or memory files
- Make any change that cannot be trivially reversed

### Watchdog architecture

The health monitor runs as a lightweight concern inside Famulus but isolated enough to fire even when other components are degraded.

```
src/monitor/
  health.ts         → individual component checks (Ollama, Telegram, SQLite, etc.)
  log-reader.ts     → reads famulus.log, identifies error patterns and spikes
  watchdog.ts       → orchestrates checks, triggers fixes or notifications
  self-check.ts     → behavioural self-assessment trigger and prompt builder
```

**Watchdog pulse** — separate from the heartbeat pulse. Fires every 30 minutes via a simple `setInterval` in `src/index.ts`. Does not depend on the heartbeat scheduler — if the heartbeat is broken, the watchdog should still run.

**Why not a separate process?**
A fully separate process (separate launchd job) would be more robust but adds complexity. For v1, an isolated interval inside the main process is sufficient. If the main process crashes entirely, launchd restarts it anyway. Revisit if experience shows the watchdog needs more independence.

### Health check flow

```
Watchdog fires (every 30 minutes)
  ↓
Run all component checks in parallel
  ↓
Any failures?
  None → log clean check, done
  ↓
For each failure:
  Is this auto-fixable?
    Yes → attempt fix → log outcome
      Fix worked → log success, done
      Fix failed → escalate to notify
    No → compose Telegram notification → send → log that notification was sent → wait
```

### Log reader

Runs as part of the daily watchdog pass (not every 30 minutes — log analysis is heavier):

```
1. Read famulus.log since last analysis timestamp
2. Local Mini model summarises:
   - Error count and types
   - Any recurring patterns
   - Any new error types not seen before
3. If error rate elevated or new patterns found:
   → Notify Daniel with summary
4. Update last_analysis_timestamp in SQLite
```

Uses the Mini's local model — cheap, private, appropriate for log summarisation.

### SQLite schema additions

New tables needed:

```sql
-- Health check log
CREATE TABLE health_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  checked_at TEXT NOT NULL,
  component TEXT NOT NULL,       -- 'ollama_mini', 'telegram', 'sqlite', etc.
  status TEXT NOT NULL,          -- 'ok', 'warning', 'error'
  detail TEXT,                   -- what was found
  action_taken TEXT,             -- what auto-fix was applied if any
  notified INTEGER DEFAULT 0     -- 1 if Daniel was notified
);

-- Self-assessment log
CREATE TABLE self_assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assessed_at TEXT NOT NULL,
  triggered_by TEXT NOT NULL,    -- 'organic', 'heartbeat', 'post-conversation'
  produced_entry INTEGER DEFAULT 0  -- 1 if growth.md was updated
);

-- Log analysis state
CREATE TABLE log_analysis (
  id INTEGER PRIMARY KEY,
  last_analysed_at TEXT NOT NULL,
  last_error_count INTEGER DEFAULT 0
);
```

---

## Implementation Phases

### Phase A — Technical health monitoring (implement first)

More straightforward, immediately useful, no philosophical complexity.

- [ ] Implement `src/monitor/health.ts` — component checks
- [ ] Implement `src/monitor/log-reader.ts` — log summarisation via local Mini model
- [ ] Implement `src/monitor/watchdog.ts` — orchestration, auto-fix, notification
- [ ] Add SQLite schema for `health_checks` and `log_analysis` tables
- [ ] Wire watchdog interval into `src/index.ts`
- [ ] Test each component check individually
- [ ] Test auto-fix paths (simulate Telegram drop, queue stuck, etc.)
- [ ] Test Telegram notification format
- [ ] Test log reader with real famulus.log content

### Phase B — Behavioural self-assessment (implement second)

Requires the system to be running long enough to have conversation history worth reflecting on. Don't implement until there's meaningful data.

- [ ] Implement `src/monitor/self-check.ts` — builds reflection context, invokes LLM
- [ ] Add SQLite schema for `self_assessments` table
- [ ] Wire optional self-assessment prompt into heartbeat pulse context
- [ ] Test reflection output quality — does it produce genuine growth.md entries?
- [ ] Verify self-assessment entries are private — never surfaced in technical logs

---

## Notes & Decisions

- **Two systems, never conflated** — behavioural reflection is private and personal; technical health is operational and reportable
- **Auto-fix principle** — safe and bounded only; anything touching code or config requires Daniel's instruction
- **Watchdog independence** — runs on its own interval, not dependent on heartbeat scheduler; if heartbeat breaks, watchdog should still fire
- **Self-assessment frequency** — organic and rare by design; monthly at most; never mechanical
- **Notification tone** — direct and specific, not alarming; The Familiar's voice, not a system alert
- **Local model for log analysis** — cheap, private, appropriate; no reason to send logs to cloud
- **Phase A before Phase B** — technical monitoring is immediately useful; behavioural self-assessment needs history to be meaningful
- **Behavioural self-assessment output is growth.md only** — never a report, never a metric, never surfaced to Daniel directly
