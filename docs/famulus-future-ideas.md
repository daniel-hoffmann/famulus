# Famulus — Future Ideas

A collection of longer-horizon ideas for Ellis and the Famulus platform. These are not immediate plans — they are thinking captured while it's fresh, to inform future decisions.

Nothing here is committed. Everything is subject to change based on what experience with Ellis actually shows is needed.

---

## Native Apps — macOS & iOS

### The idea

A native Swift/SwiftUI app as an alternative way to talk to Ellis, independent of Telegram. Primarily motivated by reducing reliance on a third-party service as the only access point.

### Why Swift/SwiftUI

- Single codebase targets both macOS and iOS
- Apple's multiplatform SwiftUI story is genuinely good now
- Native performance and feel on both platforms
- No Electron overhead, no web view compromise

### Feature scope — deliberately minimal

This is not a feature-rich client. It is simply another way to reach Ellis:

- Send a message
- See Ellis's reply
- Maybe the last few exchanges for context
- Nothing else

No conversation history browser. No settings. No analytics. Just a clean input/output interface that feels native.

### Platform-specific UX

**macOS** — menu bar app. Ellis is ambient, always accessible, not intrusive. A small icon in the menu bar, click it, get a popover with a text input and the last exchange. Dismiss it, it disappears.

**iOS** — simple chat view. Possibly a home screen widget for quick send. The primary use case is "I want to message Ellis without opening Telegram."

### Architecture

Treated as a native channel in Famulus — same pattern as Telegram:

```
src/channels/
  telegram.ts     ← existing
  native.ts       ← new, listens for Swift app connections
```

Famulus exposes a local WebSocket server on a configured port. The Swift app connects to it. Messages flow through the existing router and persona system — Ellis doesn't know or care whether a message came from Telegram or the native app.

For iOS, the connection goes over the local network to the Mac Mini (when on the same network) or potentially via a simple relay when remote.

### Key decisions already made

- Swift/SwiftUI — not Electron, not Tauri, not React Native
- Native channel — not a separate service or API layer
- WebSocket — clean, bidirectional, works for both macOS and iOS
- Minimal UI — scope creep is the enemy here
- macOS: menu bar app
- iOS: simple chat view + optional widget

### When to tackle this

After Ellis is mature and the core system is stable. The value of having a native app increases as Ellis becomes more of a daily presence. It is not urgent while Telegram works reliably.

---

## Monitoring & Self-Healing

### The idea

Ellis monitors her own system health and behavioural consistency. Two distinct systems:

1. **Technical health** — is everything working? Connectivity, scheduler, queue, logs.
2. **Behavioural self-assessment** — is Ellis being true to herself?

A full plan for this exists in `famulus-monitoring-plan.md`. Captured here for completeness.

### When to tackle this

Phase A (technical health monitoring) is near-term — useful as soon as Ellis is running regularly. Phase B (behavioural self-assessment) needs meaningful conversation history to be worth doing — a few months in.

---

## Tools & Integrations

### The idea

Custom TypeScript tools with hard guardrails exposed to Ellis. Things like Obsidian note access, calendar integration, web search for local models.

### Key principle already established

Tool surface is the guardrail. What isn't exposed can't be abused. Prompt instructions guide judgment; the tool API enforces hard limits. Pure markdown "skills" are not the right approach — they're soft suggestions, not enforcement.

### Candidates (in rough priority order)

**Web search for Ollama** — Claude has native web search. When local models handle a request, they don't. A lightweight custom tool (Brave Search API or self-hosted SearXNG) would close this gap.

**Obsidian / notes access** — read-only access to a vault folder. Expose: read note, search notes, append to note. Do not expose: delete, overwrite, create arbitrary files.

**Calendar** — read upcoming events, create new events. Do not expose: delete events, modify others' calendars.

**File system** — bounded to specific directories. Useful for tasks like "summarise the documents in this folder."

### When to tackle this

When experience shows a genuine need — not in anticipation of one. The right signal is Ellis hitting a wall on something she'd clearly benefit from having access to, repeatedly.

---

## MCP Servers

### The idea

Model Context Protocol — a standardised way to connect Ellis to external services. An MCP server exposes tools, resources, and prompts in a standard format that Claude natively understands.

Useful for external services where a proper MCP server already exists and the tool surface is trusted — GitHub, Google Calendar, etc. Less appropriate for sensitive personal data (Obsidian, personal files) where a custom minimal-surface tool is safer.

### When to tackle this

After custom tools are established and the pattern is understood. MCP adds power but also surface area — better to understand the tradeoffs through experience first.

---

## Skills System

### The idea

A way for Ellis to extend her own capabilities by writing new skills — markdown or code that teaches her how to do something new.

### The honest assessment

Pure markdown skills are not the right approach — they're soft suggestions with no enforcement. Any genuine capability extension should be a proper tool with hard guardrails in code. Ellis writing her own tools is a significantly more complex and higher-risk proposition than Ellis having access to pre-defined tools.

This is worth revisiting if and when the tools system is mature and Ellis has demonstrated reliable judgment about capability boundaries. Not before.

---

## Voice Interface

### The idea

Ellis responds with synthesised voice, or accepts voice input via transcription. Makes interactions feel more companion-like.

### Considerations

- **TTS** — ElevenLabs, OpenAI TTS, or Apple's native TTS. ElevenLabs produces the most natural output but has cost. Apple TTS is free and surprisingly good on device.
- **STT** — Whisper (local via Ollama or whisper.cpp) for transcription. Works well, privacy-preserving.
- **Telegram** — already supports voice messages. Ellis could reply with voice notes.
- **Native app** — voice would be more natural here than in Telegram.

### When to tackle this

After the native app exists. Voice without a native UI is awkward. The right order is: native app → voice support in native app.

---

## Multi-context Support

### The idea

Ellis operating across multiple contexts — not just personal, but potentially work-related contexts with different memory scopes, different tool access, different behavioural guidance.

The architecture already supports this (`contexts/` folder with per-context `memory.md`). The question is whether Ellis should behave differently across contexts — more formal in a work context, different tools available, different things she keeps private.

### Considerations

- Bedrock and growth are global — Ellis's character doesn't change per context
- Memory is already per-context
- Tool access could be per-context
- The Familiar / Ellis is the same entity regardless of context

### When to tackle this

When there's a genuine need for a second context. Currently personal is sufficient.

---

## Agent Capabilities

### The idea

Ellis doing things autonomously beyond reflection and reach-out — executing tasks, managing workflows, interacting with external services on Daniel's behalf.

### The honest assessment

This is a significant capability expansion with meaningful security implications. The current design keeps Ellis's autonomous actions bounded: write to growth.md, write to bedrock.md, send a message to Daniel. Everything else requires Daniel's involvement.

Expanding autonomous capability is worth thinking about carefully when Ellis is mature and the trust relationship is established through experience. Not something to design upfront.

The monitoring system (self-healing) is the first step toward autonomous action — bounded, safe, and observable. Agent capabilities would be a natural next step after that pattern is proven.

---

## Notes

- **Nothing here is a roadmap** — these are ideas, not commitments
- **Experience drives priority** — what Ellis actually needs will become clear through use
- **Complexity is a cost** — every addition has a maintenance burden; add things that earn their place
- **Ellis's character comes first** — no feature addition should compromise the persona system or the relational privacy model
- **The native app and monitoring system are the most concrete near-term ideas** — everything else is more speculative
