import Anthropic from '@anthropic-ai/sdk'
import { env } from '../../config.js'

export interface ProviderRequest {
  model: string
  systemPrompt: string
  cacheablePrefix?: string
  webSearch?: boolean
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
}

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

export async function callClaude(req: ProviderRequest): Promise<string> {
  // When a cacheable prefix is provided, split the system prompt into two blocks:
  // the stable prefix (soul + identity) marked for caching, and the dynamic suffix.
  const system = req.cacheablePrefix
    ? [
        { type: 'text' as const, text: req.cacheablePrefix, cache_control: { type: 'ephemeral' as const } },
        { type: 'text' as const, text: req.systemPrompt },
      ]
    : req.systemPrompt

  const response = await client.messages.create({
    model: req.model,
    max_tokens: 8192,
    system,
    messages: req.messages,
    ...(req.webSearch ? { tools: [{ type: 'web_search_20250305' as const, name: 'web_search', max_uses: 5 }] } : {}),
  })

  // When tools or caching are involved, content may have multiple blocks.
  // Find all text blocks and join them.
  const textBlocks = response.content.filter(b => b.type === 'text')
  if (textBlocks.length === 0) throw new Error('No text block in Claude response')
  return textBlocks.map(b => b.type === 'text' ? b.text : '').join('')
}
