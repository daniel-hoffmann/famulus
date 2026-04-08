# Famulus

A personal AI companion. Telegram interface, layered persona architecture, model-agnostic LLM routing, and a heartbeat system for proactive behaviour. Written from scratch in TypeScript/Node.js.

*Famulus* — from Latin, the attendant spirit. Etymological root of "familiar" in the magical sense.

Inspired by [NanoClaw](https://github.com/nicowillis/nanoclaw) and [OpenClaw](https://github.com/nicowillis/openclaw), but written from scratch with a different philosophy.

---

## Setup

**Requirements:** Node 22, Ollama (optional but recommended), a Telegram bot token, an Anthropic API key.

```bash
# Clone and unlock encrypted files
git clone https://github.com/daniel-hoffmann/famulus.git
cd famulus
git-crypt unlock   # requires GPG key from 1Password

# Install dependencies
npm install

# Create .env
cp .env.example .env   # then fill in your keys
```

**.env file:**
```
ANTHROPIC_API_KEY=sk-ant-...
TELEGRAM_BOT_TOKEN=...

# Optional — defaults shown
OLLAMA_BASE_URL=http://localhost:11434        # local Ollama (Mac Mini)
OLLAMA_PC_BASE_URL=http://192.168.x.x:11434  # PC Ollama for heavy inference (routing currently disabled)
DANIEL_TIMEZONE=Australia/Sydney             # IANA timezone for temporal context + quiet hours
QUIET_HOURS_START=22                         # no reach-outs after this hour
QUIET_HOURS_END=8                            # no reach-outs before this hour
```

```bash
# Run in development
npm run dev

# Build and run in production
npm run build
npm start
```

On first startup, `soul.md.sha256` is written automatically. Commit it to the repo, then run `chmod 444 soul.md` on the host to prevent accidental edits.

---

## Architecture

```
soul.md / identity.md / growth.md / bedrock.md   ← persona layers
src/persona.ts                                    ← composes system prompt + temporal context
src/llm/router.ts                                 ← routes to Claude or Ollama
src/heartbeat/                                    ← proactive pulse, reflection, bedrock
src/channels/telegram.ts                          ← Telegram via Grammy (text + images)
src/cipher/soul-guard.ts                          ← soul integrity check on startup
src/index.ts                                      ← wires everything together
```

See [`docs/walkthrough.md`](docs/walkthrough.md) for a full explanation of every file.
See [`CLAUDE.md`](CLAUDE.md) for full architecture documentation.
See [`docs/project-plan.md`](docs/project-plan.md) for the original design document.

---

## Encryption

Personal files (`soul.md`, `identity.md`, `contexts/**`, `.env`, etc.) are encrypted at rest via git-crypt + GPG. Source code, `config/llm.json`, and `soul.md.sha256` are plaintext.

To unlock after cloning: `git-crypt unlock` (requires the GPG key stored in 1Password).
