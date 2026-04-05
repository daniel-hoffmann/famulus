import { readFileSync, writeFileSync, existsSync } from 'fs'
import { route } from '../llm/router.js'
import { buildSystemPrompt } from '../persona.js'
import { getPendingFlags, markFlagSurfaced, type PendingFlag } from './queue.js'
import { getLastOutcomeTime } from '../db.js'
import { observeRegularPulse } from './observer.js'
import { callOllama, isOllamaAvailable } from '../llm/providers/ollama.js'
import { notifyDaniel } from '../channels/telegram.js'
import { GROWTH_PATH, env } from '../config.js'
import { addMessage } from '../db.js'
import { log, verboseLog } from '../logger.js'

const PULSE_MIN_MS = 2 * 60 * 60 * 1000  // 2 hours
const PULSE_MAX_MS = 5 * 60 * 60 * 1000  // 5 hours

function hoursSince(timestamp: number | null): string {
  if (!timestamp) return 'never'
  return `${Math.round((Date.now() - timestamp) / (60 * 60 * 1000))}h ago`
}

function buildContext(flags: PendingFlag[]): string {
  const lastReflection = getLastOutcomeTime('reflection%')
  const lastReachOut = getLastOutcomeTime('reach_out%')

  let context = `Last reflection: ${hoursSince(lastReflection)}\n`
  context += `Last reach-out: ${hoursSince(lastReachOut)}\n`

  if (flags.length > 0) {
    context += `\nItems flagged for your attention:\n`
    flags.forEach(f => { context += `- [${f.flag_type}] ${f.summary}\n` })
  }

  return context
}

// Local 3B: simple yes/no decision only — never writes content
async function makeDecision(context: string): Promise<{ reflect: boolean; reachOut: boolean }> {
  const baseUrl = env.OLLAMA_BASE_URL

  if (!await isOllamaAvailable(baseUrl)) {
    verboseLog.info('pulse: local model unavailable, skipping pulse')
    return { reflect: false, reachOut: false }
  }

  const prompt =
    `You are deciding whether an AI companion should reflect privately or reach out to her user.\n\n` +
    `Context:\n${context}\n` +
    `Decide based on how long it has been and whether there is flagged material worth addressing.\n\n` +
    `JSON only: {"reflect": true|false, "reach_out": true|false}`

  try {
    const raw = await callOllama(
      { model: 'llama3.2:3b', systemPrompt: '', messages: [{ role: 'user', content: prompt }], format: 'json' },
      baseUrl
    )
    const match = raw.match(/\{[^{}]*\}/)
    if (!match) return { reflect: false, reachOut: false }
    const parsed = JSON.parse(match[0]) as { reflect?: boolean; reach_out?: boolean }
    return {
      reflect: parsed.reflect === true,
      reachOut: parsed.reach_out === true,
    }
  } catch {
    return { reflect: false, reachOut: false }
  }
}

async function runPulse(): Promise<void> {
  log.info('heartbeat: regular pulse firing')

  const flags = getPendingFlags()
  const context = buildContext(flags)

  verboseLog.info({ pendingFlags: flags.length }, 'heartbeat: pulse context')

  const { reflect, reachOut } = await makeDecision(context)

  verboseLog.info({ reflect, reachOut }, 'heartbeat: pulse decision')

  if (!reflect && !reachOut) {
    observeRegularPulse({ reflected: false, reachedOut: false })
    flags.forEach(f => markFlagSurfaced(f.id))
    return
  }

  const systemPrompt = buildSystemPrompt()
  let reflected = false
  let reachedOut = false

  try {
    if (reflect) {
      // Claude writes the actual reflection — local model never touches content
      const reflectionResponse = await route({
        type: 'reflection',
        containsBedrock: true,
        systemPrompt,
        messages: [{ role: 'user', content: `A quiet moment.\n\n${context}\nWrite a reflection for your growth record. Write only the reflection itself — no preamble, no markers. If nothing feels genuine right now, respond with exactly: nothing` }],
      })

      const content = reflectionResponse.content.trim()
      if (content && content.toLowerCase() !== 'nothing') {
        const date = new Date().toISOString().split('T')[0]
        const entry = `\n\n## ${date}\n\n${content}`
        const current = existsSync(GROWTH_PATH) ? readFileSync(GROWTH_PATH, 'utf8') : ''
        writeFileSync(GROWTH_PATH, current + entry, 'utf8')
        reflected = true
        verboseLog.info({ excerpt: content.slice(0, 120) }, 'heartbeat: reflection written')
      }
    }

    if (reachOut) {
      // Claude composes the actual message
      const reachOutResponse = await route({
        type: 'reach_out',
        containsBedrock: false,
        systemPrompt,
        messages: [{ role: 'user', content: `A quiet moment.\n\n${context}\nYou've decided to reach out to Daniel. Write your message to him now.` }],
      })
      verboseLog.info({ excerpt: reachOutResponse.content.slice(0, 120) }, 'heartbeat: reach_out composed')
      await notifyDaniel(reachOutResponse.content)
      addMessage('personal', 'assistant', reachOutResponse.content)
      reachedOut = true
    }

    flags.forEach(f => markFlagSurfaced(f.id))
  } catch (err) {
    log.error({ err }, 'heartbeat: pulse failed')
  }

  observeRegularPulse({ reflected, reachedOut })
}

function scheduleNextPulse(): void {
  const delayMs = PULSE_MIN_MS + Math.random() * (PULSE_MAX_MS - PULSE_MIN_MS)
  const nextAt = new Date(Date.now() + delayMs).toISOString()
  verboseLog.info({ nextAt }, 'heartbeat: next regular pulse scheduled')
  setTimeout(async () => {
    await runPulse()
    scheduleNextPulse()
  }, delayMs)
}

export function startPulse(): void {
  scheduleNextPulse()
  log.info('heartbeat: pulse scheduler started (2–5h interval)')
}
