# Growth Mechanic — Known Issues & Observations

## Fixed

**Duplicate date headers in growth.md**
The appending code added `## YYYY-MM-DD` and Claude also wrote its own date header inside the reflection content, producing orphaned headers throughout the file. Fixed by adding "Do not include a title or date header" to all reflection prompts — the code handles dating.

**Immediate reflection leaving flag unsurfaced**
`triggerImmediateReflection` wrote a reflection but didn't mark the reflection flag as surfaced. The next pulse would then pick up the same flag and write another reflection about the same event. Fixed by returning the flag ID from `addFlag` and calling `markFlagSurfaced` after a successful write.

**Reflection flags unbounded per pulse**
All pending reflection flags were bundled into a single reflection prompt. With many flags, Ellis spent the reflection commenting on the volume of summaries rather than actually reflecting. Fixed by capping at 3 most recent flags per pulse.

**Pulse skipped entirely when Ollama unavailable**
`makeDecision` returned `{ reflect: false, reachOut: false }` when Ollama was unreachable — even if there were pending reflection flags. Fixed to mirror the catch-block behaviour: `{ reflect: hasFlags, reachOut: false }`.

**Wrong pronoun in `makeDecision` prompt**
The decision prompt referred to Ellis as "her user." Fixed to "their user."

---

## Open Observations

**`triggerImmediateReflection` may be too eager**
Fires for every `very_significant` assessment immediately after a conversation ends. The prompt asks Ellis to judge whether something is urgent enough to write about now vs. waiting for a quieter pulse moment — but that gate may not be strong enough. Haiku's calibration of `very_significant` is also untested since the switch from 3B. Worth monitoring whether immediate reflections are firing appropriately or too frequently.

**Immediate reflection only sees the last 6 messages**
`triggerImmediateReflection` passes only the final 6 messages as an excerpt, alongside the Haiku-generated summary. If the significant moment happened earlier in a long conversation, the excerpt misses it. The reflection is working from a description of what mattered plus only the recent tail. Not breaking — the summary helps — but the reflection may lack full context.

**No cloud fallback for reach-out decisions**
When Ollama is unavailable, `makeDecision` now correctly defaults to reflecting if flags are pending. But reach-outs are always suppressed without Ollama — there's no fallback path that allows Ellis to decide to reach out independently. If Ollama becomes unreliable long-term, reach-outs would silently stop.
