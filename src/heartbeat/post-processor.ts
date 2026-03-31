import { readFileSync, writeFileSync, existsSync } from 'fs'
import { callOllama, isOllamaAvailable } from '../llm/providers/ollama.js'
import { route } from '../llm/router.js'
import { addFlag } from './queue.js'
import { env, USER_PATH } from '../config.js'
import { log, verboseLog } from '../logger.js'
import type { Message } from '../llm/router.js'

const META_MODEL = 'llama3.2:3b'

export async function assessConversation(messages: Message[]): Promise<void> {
  const baseUrl = env.OLLAMA_BASE_URL

  if (!await isOllamaAvailable(baseUrl)) {
    log.info('post-processor: local model unavailable, skipping assessment')
    return
  }

  const transcript = messages
    .map(m => `${m.role}: ${m.content.slice(0, 500)}`)
    .join('\n')

  const prompt =
    `Assess this conversation for significance to an AI companion.\n\n` +
    `Transcript:\n${transcript}\n\n` +
    `Signals: emotional weight, unresolved tensions, new positions taken, ` +
    `disagreements that landed, something being worked through, complexity.\n\n` +
    `JSON only: {"significance":"none"|"notable"|"significant"|"very_significant","summary":"one sentence"}`

  try {
    const raw = await callOllama(
      { model: META_MODEL, systemPrompt: '', messages: [{ role: 'user', content: prompt }], format: 'json' },
      baseUrl
    )
    const match = raw.match(/\{[^{}]*\}/)
    if (!match) {
      log.warn('post-processor: no JSON in response')
      return
    }
    const result = JSON.parse(match[0]) as { significance: string; summary: string }

    if (result.significance === 'significant') {
      addFlag('reflection', result.summary)
    } else if (result.significance === 'very_significant') {
      addFlag('reflection', result.summary)
      addFlag('bedrock', result.summary)
    }

    log.info({ significance: result.significance }, 'post-processor: assessment complete')
    verboseLog.info({ summary: result.summary }, 'post-processor: assessment detail')

    if (['notable', 'significant', 'very_significant'].includes(result.significance)) {
      updateUserMemory(messages).catch(err => log.warn({ err }, 'post-processor: memory update failed'))
    }
  } catch (err) {
    log.warn({ err }, 'post-processor: assessment failed')
  }
}

async function updateUserMemory(messages: Message[]): Promise<void> {
  const current = existsSync(USER_PATH) ? readFileSync(USER_PATH, 'utf8').trim() : ''

  const transcript = messages
    .map(m => `${m.role}: ${m.content.slice(0, 500)}`)
    .join('\n')

  const prompt =
    `You are updating your understanding of Daniel based on a conversation you just had.\n\n` +
    `Current profile:\n${current || '(empty)'}\n\n` +
    `Recent conversation:\n${transcript}\n\n` +
    `Extract any new facts worth remembering about Daniel — his interests, context, preferences, ` +
    `what he's working on, how he communicates, things he's shared about his life. ` +
    `Merge with the existing profile, removing anything outdated.\n\n` +
    `Write the updated profile. Keep it concise — this is loaded on every conversation. ` +
    `Plain prose or light structure. Only include what's genuinely useful to know.`

  const response = await route({
    type: 'memory_update',
    containsBedrock: false,
    systemPrompt: '',
    messages: [{ role: 'user', content: prompt }],
  })

  writeFileSync(USER_PATH, response.content, 'utf8')
  log.info('post-processor: user memory updated')
}
