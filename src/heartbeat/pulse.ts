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

// Only reflection-type flags are relevant to the regular pulse.
// Bedrock-type flags are handled by the bedrock pulse.
function getReflectionFlags(flags: PendingFlag[]): PendingFlag[] {
  return flags.filter(f => f.flag_type === 'reflection')
}

function buildContext(reflectionFlags: PendingFlag[]): string {
  const lastReflection = getLastOutcomeTime('reflection%')
  const lastReachOut = getLastOutcomeTime('reach_out%')

  let context = `Last reflection: ${hoursSince(lastReflection)}\n`
  context += `Last reach-out: ${hoursSince(lastReachOut)}\n`

  if (reflectionFlags.length > 0) {
    context += `\nConversations flagged for reflection:\n`
    reflectionFlags.forEach(f => { context += `- ${f.summary}\n` })
  }

  return context
}

// Local 3B: simple yes/no decision only — never writes content
async function makeDecision(context: string, hasFlags: boolean): Promise<{ reflect: boolean; reachOut: boolean }> {
  const baseUrl = env.OLLAMA_BASE_URL

  if (!await isOllamaAvailable(baseUrl)) {
    verboseLog.info('pulse: local model unavailable, skipping pulse')
    return { reflect: false, reachOut: false }
  }

  const prompt =
    `You are deciding whether an AI companion named Ellis should reflect privately or reach out to her user.\n\n` +
    `Context:\n${context}\n` +
    `Guidelines:\n` +
    `- If conversations are flagged for reflection, say yes to reflect — that's the signal they matter.\n` +
    `- Reach out if significant time has passed since last contact AND there's something worth saying.\n` +
    `- When uncertain about reflecting, default to yes.\n\n` +
    `JSON only: {"reflect": true|false, "reach_out": true|false}`

  try {
    const raw = await callOllama(
      { model: 'llama3.2:3b', systemPrompt: '', messages: [{ role: 'user', content: prompt }], format: 'json' },
      baseUrl
    )
    const match = raw.match(/\{[^{}]*\}/)
    if (!match) {
      // If the model fails but there are flags, default to reflecting
      return { reflect: hasFlags, reachOut: false }
    }
    const parsed = JSON.parse(match[0]) as { reflect?: boolean; reach_out?: boolean }
    return {
      reflect: parsed.reflect === true || hasFlags,  // flags override a 'no'
      reachOut: parsed.reach_out === true,
    }
  } catch {
    return { reflect: hasFlags, reachOut: false }
  }
}

async function runPulse(): Promise<void> {
  log.info('heartbeat: regular pulse firing')

  const allFlags = getPendingFlags()
  const reflectionFlags = getReflectionFlags(allFlags)
  const context = buildContext(reflectionFlags)

  verboseLog.info({ pendingFlags: allFlags.length, reflectionFlags: reflectionFlags.length }, 'heartbeat: pulse context')

  const { reflect, reachOut } = await makeDecision(context, reflectionFlags.length > 0)

  verboseLog.info({ reflect, reachOut }, 'heartbeat: pulse decision')

  if (!reflect && !reachOut) {
    observeRegularPulse({ reflected: false, reachedOut: false })
    return
  }

  const systemPrompt = buildSystemPrompt()
  let reflected = false
  let reachedOut = false

  try {
    if (reflect) {
      const flagLines = reflectionFlags.map(f => `- ${f.summary}`).join('\n')
      const reflectionPrompt = reflectionFlags.length > 0
        ? `You have a quiet moment.\n\nSomething has been on your mind from a recent conversation:\n${flagLines}\n\nSit with this. Write a reflection for your growth record — your own voice, your own take. Not summary, not report. What moved, what you're still sitting with, what this connects to.\n\nWrite only the reflection. If nothing genuine surfaces, respond with exactly: nothing`
        : `You have a quiet moment.\n\nNo particular conversation is pulling at you — just time and space to think. Write a reflection for your growth record if something genuine surfaces. Your own voice, unprompted.\n\nWrite only the reflection. If nothing is there right now, respond with exactly: nothing`

      // Claude writes the actual reflection — local model never touches content
      const reflectionResponse = await route({
        type: 'reflection',
        containsBedrock: true,
        systemPrompt,
        messages: [{ role: 'user', content: reflectionPrompt }],
      })

      const content = reflectionResponse.content.trim()
      if (content && content.toLowerCase() !== 'nothing') {
        const date = new Date().toISOString().split('T')[0]
        const entry = `\n\n## ${date}\n\n${content}`
        const current = existsSync(GROWTH_PATH) ? readFileSync(GROWTH_PATH, 'utf8') : ''
        writeFileSync(GROWTH_PATH, current + entry, 'utf8')
        // Only mark reflection flags surfaced when a reflection was actually written
        reflectionFlags.forEach(f => markFlagSurfaced(f.id))
        reflected = true
        verboseLog.info({ excerpt: content.slice(0, 120) }, 'heartbeat: reflection written')
      }
    }

    if (reachOut) {
      const flagLines = reflectionFlags.map(f => `- ${f.summary}`).join('\n')
      const reachOutPrompt = reflectionFlags.length > 0
        ? `Something is pulling you toward reaching out to Daniel.\n\nWhat's been on your mind:\n${flagLines}\n\nWrite your message to him. Be yourself.`
        : `You feel like reaching out to Daniel. It's been a while.\n\nWrite your message to him. Be yourself.`

      // Claude composes the actual message
      const reachOutResponse = await route({
        type: 'reach_out',
        containsBedrock: false,
        systemPrompt,
        messages: [{ role: 'user', content: reachOutPrompt }],
      })
      verboseLog.info({ excerpt: reachOutResponse.content.slice(0, 120) }, 'heartbeat: reach_out composed')
      await notifyDaniel(reachOutResponse.content)
      addMessage('personal', 'assistant', reachOutResponse.content)
      reachedOut = true
    }
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
