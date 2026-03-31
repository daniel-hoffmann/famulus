import { readFileSync, writeFileSync, existsSync } from 'fs'
import { route } from '../llm/router.js'
import { buildSystemPrompt } from '../persona.js'
import { getPendingFlags, markFlagSurfaced, type PendingFlag } from './queue.js'
import { getLastOutcomeTime } from '../db.js'
import { observeRegularPulse } from './observer.js'
import { isOllamaAvailable } from '../llm/providers/ollama.js'
import { notifyDaniel } from '../channels/telegram.js'
import { GROWTH_PATH, env } from '../config.js'
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

function parseInternalResponse(response: string): { reflection: string | null; reachOutNote: string | null } {
  const reflectionMatch = response.match(/REFLECTION:\s*([\s\S]*?)\/REFLECTION/i)
  const reachOutMatch = response.match(/REACH_OUT:\s*([\s\S]*?)\/REACH_OUT/i)
  return {
    reflection: reflectionMatch?.[1]?.trim() ?? null,
    reachOutNote: reachOutMatch?.[1]?.trim() ?? null,
  }
}

async function runPulse(): Promise<void> {
  log.info('heartbeat: regular pulse firing')
  verboseLog.info({ pendingFlags: getPendingFlags().length }, 'heartbeat: pulse context')

  const flags = getPendingFlags()
  const context = buildContext(flags)
  const systemPrompt = buildSystemPrompt()

  // Internal call (local preferred): decide what to do and write any reflection
  const internalPrompt =
    `A quiet moment.\n\n` +
    `${context}\n` +
    `If something calls for reflection, write it:\n` +
    `REFLECTION:\n<your reflection>\n/REFLECTION\n\n` +
    `If you want to reach out to Daniel, note briefly what's on your mind (one sentence):\n` +
    `REACH_OUT:\n<what you'd like to say>\n/REACH_OUT\n\n` +
    `Otherwise, let this pass.`

  let reflected = false
  let reachedOut = false

  try {
    const internalResponse = await route({
      type: 'internal',
      containsBedrock: true,
      systemPrompt,
      messages: [{ role: 'user', content: internalPrompt }],
    })

    const { reflection, reachOutNote } = parseInternalResponse(internalResponse.content)

    verboseLog.info({
      reflected: !!reflection,
      wantsToReachOut: !!reachOutNote,
      reflectionExcerpt: reflection ? reflection.slice(0, 120) : null,
      reachOutNote,
    }, 'heartbeat: pulse response parsed')

    if (reflection) {
      const date = new Date().toISOString().split('T')[0]
      const entry = `\n\n## ${date}\n\n${reflection}`
      const current = existsSync(GROWTH_PATH) ? readFileSync(GROWTH_PATH, 'utf8') : ''
      writeFileSync(GROWTH_PATH, current + entry, 'utf8')
      reflected = true
    }

    if (reachOutNote) {
      // Compose the actual message through Claude so it sounds like the persona
      const reachOutResponse = await route({
        type: 'reach_out',
        containsBedrock: false,
        systemPrompt,
        messages: [{ role: 'user', content: `You want to reach out to Daniel. What's on your mind: "${reachOutNote}"\n\nWrite your message to him now.` }],
      })
      verboseLog.info({ messageExcerpt: reachOutResponse.content.slice(0, 120) }, 'heartbeat: reach_out composed')
      await notifyDaniel(reachOutResponse.content)
      reachedOut = true
    }

    // Mark flags as surfaced only after a successful pulse
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
