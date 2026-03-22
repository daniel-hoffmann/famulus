import { callOllama, isOllamaAvailable } from '../llm/providers/ollama.js'
import { addFlag } from './queue.js'
import { env } from '../config.js'
import { log } from '../logger.js'
import type { Message } from '../llm/router.js'

const META_MODEL = 'llama3.2:1b'

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
      { model: META_MODEL, systemPrompt: '', messages: [{ role: 'user', content: prompt }] },
      baseUrl
    )
    const result = JSON.parse(raw) as { significance: string; summary: string }

    if (result.significance === 'significant') {
      addFlag('reflection', result.summary)
    } else if (result.significance === 'very_significant') {
      addFlag('reflection', result.summary)
      addFlag('bedrock', result.summary)
    }

    log.info({ significance: result.significance }, 'post-processor: assessment complete')
  } catch (err) {
    log.warn({ err }, 'post-processor: assessment failed')
  }
}
