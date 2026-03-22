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
OLLAMA_BASE_URL=http://localhost:11434       # optional, defaults to this
OLLAMA_PC_BASE_URL=http://192.168.x.x:11434 # optional, PC Ollama for heavy inference
```

```bash
# Run in development
npm run dev

# Build and run in production
npm run build
npm start
```

---

## Architecture

```
soul.md / identity.md / growth.md / bedrock.md   ← persona layers
src/persona.ts                                    ← composes them into a system prompt
src/llm/router.ts                                 ← routes to Claude or Ollama
src/heartbeat/                                    ← proactive pulse system
src/channels/telegram.ts                          ← Telegram via Grammy
src/index.ts                                      ← wires everything together
```

See [`docs/walkthrough.md`](docs/walkthrough.md) for a full explanation of every file.
See [`docs/project-plan.md`](docs/project-plan.md) for the original design document.

---

## Encryption

Personal files (`soul.md`, `identity.md`, `contexts/**`, `.env`, etc.) are encrypted at rest via git-crypt + GPG. Source code and `config/llm.json` are plaintext.

To unlock after cloning: `git-crypt unlock` (requires the GPG key stored in 1Password).
