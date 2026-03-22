import Anthropic from '@anthropic-ai/sdk'
import { env } from '../../config.js'

export interface ProviderRequest {
  model: string
  systemPrompt: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
}

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

export async function callClaude(req: ProviderRequest): Promise<string> {
  const response = await client.messages.create({
    model: req.model,
    max_tokens: 8192,
    system: req.systemPrompt,
    messages: req.messages,
  })

  const block = response.content[0]
  if (!block || block.type !== 'text') {
    throw new Error('Unexpected response format from Claude')
  }
  return block.text
}
