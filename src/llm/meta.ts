import type { ModelTier, RequestType } from './router.js'
import { callOllama, isOllamaAvailable } from './providers/ollama.js'

export async function getMetaTier(
  type: RequestType,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  metaModel: string,
  baseUrl: string
): Promise<ModelTier | null> {
  if (!await isOllamaAvailable(baseUrl)) return null

  // Give the meta model a brief window into the conversation
  const context = messages
    .slice(-3)
    .map(m => `${m.role}: ${m.content.slice(0, 200)}`)
    .join('\n')

  const prompt =
    `Route this request to the right model tier.\n\n` +
    `Request type: ${type}\n` +
    `Recent context:\n${context}\n\n` +
    `Tiers:\n` +
    `- economy: simple, routine (memory updates, short summaries)\n` +
    `- balanced: most conversations and reflections\n` +
    `- quality: complex reasoning, emotionally significant moments\n\n` +
    `JSON only: {"tier":"economy"|"balanced"|"quality"}`

  try {
    const raw = await callOllama(
      { model: metaModel, systemPrompt: '', messages: [{ role: 'user', content: prompt }] },
      baseUrl
    )
    const parsed = JSON.parse(raw) as { tier?: string }
    if (parsed.tier && ['economy', 'balanced', 'quality'].includes(parsed.tier)) {
      return parsed.tier as ModelTier
    }
    return null
  } catch {
    return null
  }
}
