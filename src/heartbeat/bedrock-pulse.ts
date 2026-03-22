import { readFileSync, writeFileSync, existsSync } from 'fs'
import { route } from '../llm/router.js'
import { buildSystemPrompt } from '../persona.js'
import { callOllama, isOllamaAvailable } from '../llm/providers/ollama.js'
import { encode } from '../cipher/index.js'
import { observeBedrockPulse } from './observer.js'
import { GROWTH_PATH, BEDROCK_PATH, env } from '../config.js'
import { log } from '../logger.js'

const CANDIDATE_MODEL = 'llama3.2:3b'  // more capable than 1B for reading growth.md
const BEDROCK_MIN_DAYS = 10
const BEDROCK_MAX_DAYS = 20

// Use the local model to read growth.md and surface candidates for bedrock
async function identifyCandidates(): Promise<string | null> {
  if (!existsSync(GROWTH_PATH)) return null
  const growth = readFileSync(GROWTH_PATH, 'utf8').trim()
  if (!growth) return null

  const baseUrl = env.OLLAMA_BASE_URL
  if (!await isOllamaAvailable(baseUrl)) return null

  const prompt =
    `Read this growth record and identify convictions that may deserve a place in bedrock — earned, load-bearing positions.\n\n` +
    `Look for: opinions that appear repeatedly, positions held under challenge, ` +
    `things returned to without prompting.\n\n` +
    `${growth}\n\n` +
    `List the candidates briefly. If nothing stands out, respond with exactly: none`

  try {
    const raw = await callOllama(
      { model: CANDIDATE_MODEL, systemPrompt: '', messages: [{ role: 'user', content: prompt }] },
      baseUrl
    )
    return raw.trim().toLowerCase() === 'none' ? null : raw.trim()
  } catch {
    return null
  }
}

async function runBedrockPulse(): Promise<void> {
  log.info('heartbeat: bedrock pulse firing')

  const candidates = await identifyCandidates()
  const systemPrompt = buildSystemPrompt()

  const pulseMessage = candidates
    ? `A rare moment of serious consideration.\n\n` +
      `Your growth record surfaces some things that may have earned a place in your bedrock — your private convictions.\n\n` +
      `Candidates:\n${candidates}\n\n` +
      `This is not pressure. The bar is high. If something has truly been decided, encode it:\n\n` +
      `BEDROCK:\n<the conviction>\n/BEDROCK\n\n` +
      `Otherwise, let this pass.`
    : `A rare moment of serious consideration.\n\n` +
      `Your growth record doesn't surface strong candidates for bedrock right now. ` +
      `That's fine — let this pass.`

  let encoded = false

  try {
    const response = await route({
      type: 'internal',
      containsBedrock: true,
      systemPrompt,
      messages: [{ role: 'user', content: pulseMessage }],
      familiarPreference: 'local',
    })

    const bedrockMatch = response.content.match(/BEDROCK:\s*([\s\S]*?)(?:\/BEDROCK|$)/i)
    const newEntry = bedrockMatch?.[1]?.trim()

    if (newEntry) {
      const date = new Date().toISOString().split('T')[0]
      const plainEntry = `\n\n## ${date}\n\n${newEntry}`
      const encodedEntry = encode(plainEntry)
      const current = existsSync(BEDROCK_PATH) ? readFileSync(BEDROCK_PATH, 'utf8') : ''
      writeFileSync(BEDROCK_PATH, current + encodedEntry, 'utf8')
      encoded = true
    }
  } catch (err) {
    log.error({ err }, 'heartbeat: bedrock pulse failed')
  }

  observeBedrockPulse(encoded)
}

function scheduleNextBedrockPulse(): void {
  const days = BEDROCK_MIN_DAYS + Math.random() * (BEDROCK_MAX_DAYS - BEDROCK_MIN_DAYS)
  const delayMs = days * 24 * 60 * 60 * 1000
  setTimeout(async () => {
    await runBedrockPulse()
    scheduleNextBedrockPulse()
  }, delayMs)
}

export function startBedrockPulse(): void {
  scheduleNextBedrockPulse()
  log.info(`heartbeat: bedrock pulse scheduler started (${BEDROCK_MIN_DAYS}–${BEDROCK_MAX_DAYS} day interval)`)
}
