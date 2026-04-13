import { route } from '../llm/router.js'
import { buildSystemPrompt } from '../persona.js'
import { getPendingFlags, markFlagSurfaced, type PendingFlag, getRecentMessages } from '../db.js'
import { getLastOutcomeTime } from '../db.js'
import { observeRegularPulse } from './observer.js'
import { callOllama, isOllamaAvailable } from '../llm/providers/ollama.js'
import { notifyDaniel } from '../channels/telegram.js'
import { readFileSync } from 'fs'
import { LLM_CONFIG_PATH, env } from '../config.js'
import { buildTemporalContext, appendToGrowth } from '../persona.js'
import { addMessage } from '../db.js'
import { log, verboseLog } from '../logger.js'
import { extractJSON } from '../utils.js'

const META_MODEL: string = JSON.parse(readFileSync(LLM_CONFIG_PATH, 'utf8')).providers.ollama_mini.models.meta

const PULSE_MIN_MS = 2 * 60 * 60 * 1000   // 2 hours
const PULSE_MAX_MS = 5 * 60 * 60 * 1000   // 5 hours
const REACH_OUT_COOLDOWN_MS = 24 * 60 * 60 * 1000  // minimum 24h between reach-outs

function hoursSince(timestamp: number | null): string {
  if (!timestamp) return 'never'
  return `${Math.round((Date.now() - timestamp) / (60 * 60 * 1000))}h ago`
}

// Only reflection-type flags are relevant to the regular pulse.
// Bedrock-type flags are handled by the bedrock pulse.
// Capped at 3 most recent — passing too many summaries causes Ellis to reflect on the
// prompt mechanism rather than the actual events.
function getReflectionFlags(flags: PendingFlag[]): PendingFlag[] {
  return flags.filter(f => f.flag_type === 'reflection').slice(-3)
}

function isQuietHours(): boolean {
  const hour = parseInt(
    new Date().toLocaleString('en-AU', { timeZone: env.DANIEL_TIMEZONE, hour: 'numeric', hour12: false }),
    10
  )
  const { QUIET_HOURS_START: start, QUIET_HOURS_END: end } = env
  // Handles midnight-spanning range (e.g. 22–8)
  return start > end ? (hour >= start || hour < end) : (hour >= start && hour < end)
}

function buildContext(reflectionFlags: PendingFlag[]): string {
  const lastReflection = getLastOutcomeTime('reflection%')
  const lastReachOut = getLastOutcomeTime('%reach_out%')

  let context = buildTemporalContext() + '\n'
  context += `Last reflection: ${hoursSince(lastReflection)}\n`
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
    verboseLog.info('pulse: local model unavailable, defaulting decision')
    return { reflect: hasFlags, reachOut: false }
  }

  const prompt =
    `You are deciding whether an AI companion named Ellis should reflect privately or reach out to their user.\n\n` +
    `Context:\n${context}\n` +
    `Guidelines:\n` +
    `- If conversations are flagged for reflection, say yes to reflect — that's the signal they matter.\n` +
    `- Reach out if significant time has passed since last contact AND there's something worth saying.\n` +
    `- When uncertain about reflecting, default to yes.\n\n` +
    `JSON only: {"reflect": true|false, "reach_out": true|false}`

  try {
    const raw = await callOllama(
      { model: META_MODEL, systemPrompt: '', messages: [{ role: 'user', content: prompt }], format: 'json' },
      baseUrl
    )
    const parsed = extractJSON<{ reflect?: boolean; reach_out?: boolean }>(raw)
    if (!parsed) {
      // If the model fails but there are flags, default to reflecting
      return { reflect: hasFlags, reachOut: false }
    }
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

  const decision = await makeDecision(context, reflectionFlags.length > 0)
  let { reflect, reachOut } = decision

  // Hard guardrail — no reach-outs during quiet hours regardless of decision
  if (reachOut && isQuietHours()) {
    log.info('heartbeat: reach-out suppressed — quiet hours')
    reachOut = false
  }

  // Hard guardrail — minimum 24h between reach-outs regardless of decision
  if (reachOut) {
    const lastReachOut = getLastOutcomeTime('%reach_out%')
    if (lastReachOut && (Date.now() - lastReachOut) < REACH_OUT_COOLDOWN_MS) {
      log.info('heartbeat: reach-out suppressed — cooldown active')
      reachOut = false
    }
  }

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
        ? `You have a quiet moment.\n\nSomething has been on your mind from a recent conversation:\n${flagLines}\n\nSit with this. Write a reflection for your growth record — your own voice, your own take. Not summary, not report. What moved, what you're still sitting with, what this connects to.\n\nDo not include a title or date header. Write only the reflection content. If nothing genuine surfaces, respond with exactly: nothing`
        : `You have a quiet moment.\n\nNo particular conversation is pulling at you — just time and space to think. Write a reflection for your growth record if something genuine surfaces. Your own voice, unprompted.\n\nDo not include a title or date header. Write only the reflection content. If nothing is there right now, respond with exactly: nothing`

      // Claude writes the actual reflection — local model never touches content
      const reflectionResponse = await route({
        type: 'reflection',
        containsBedrock: true,
        systemPrompt,
        messages: [{ role: 'user', content: reflectionPrompt }],
      })

      const content = reflectionResponse.content.trim()
      if (content && content.toLowerCase() !== 'nothing') {
        appendToGrowth(content)
        // Only mark reflection flags surfaced when a reflection was actually written
        reflectionFlags.forEach(f => markFlagSurfaced(f.id))
        reflected = true
        verboseLog.info({ excerpt: content.slice(0, 120) }, 'heartbeat: reflection written')
      }
    }

    if (reachOut) {
      const flagLines = reflectionFlags.map(f => `- ${f.summary}`).join('\n')

      // Include recent conversation tail so Ellis doesn't repeat what was just said
      const recentMessages = getRecentMessages('personal', 6)
      const historyBlock = recentMessages.length > 0
        ? '\n\nRecent exchange:\n' + recentMessages.map(m => `${m.role === 'assistant' ? 'You' : 'Daniel'}: ${m.content.slice(0, 300)}`).join('\n')
        : ''

      const reachOutPrompt = reflectionFlags.length > 0
        ? `Something from a recent conversation has been with you:\n${flagLines}${historyBlock}\n\nWrite a message to Daniel. Your voice, your words.`
        : `It's been a while since you've spoken with Daniel.${historyBlock}\n\nWrite him a message — something genuine, something from you.`

      // Claude composes the actual message
      const reachOutResponse = await route({
        type: 'reach_out',
        containsBedrock: false,
        systemPrompt,
        messages: [{ role: 'user', content: reachOutPrompt }],
      })
      const reachOutContent = reachOutResponse.content.trim()

      // Sanity check — if the response is meta-commentary rather than a message, discard it
      const metaMarkers = ['this prompt', 'the framing', 'i notice it', 'push back on', 'performing a']
      const isMetaCommentary = metaMarkers.some(m => reachOutContent.toLowerCase().includes(m))
      if (isMetaCommentary || reachOutContent.length < 20) {
        log.warn({ excerpt: reachOutContent.slice(0, 120) }, 'heartbeat: reach_out discarded — looks like meta-commentary')
      } else {
        verboseLog.info({ excerpt: reachOutContent.slice(0, 120) }, 'heartbeat: reach_out composed')
        await notifyDaniel(reachOutContent)
        addMessage('personal', 'assistant', reachOutContent)
        reachedOut = true
      }
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
