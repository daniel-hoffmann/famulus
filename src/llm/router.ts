import { readFileSync } from 'fs'
import { LLM_CONFIG_PATH, env } from '../config.js'
import { log, internalLog } from '../logger.js'
import { callClaude } from './providers/claude.js'
import { callOllama, isOllamaAvailable } from './providers/ollama.js'
import { getMetaTier } from './meta.js'
import { enqueue } from './queue.js'

// --- Types ---

export type RequestType =
  | 'conversation'
  | 'reach_out'
  | 'reflection'
  | 'memory_update'
  | 'task'
  | 'internal'

export type ModelTier = 'economy' | 'balanced' | 'quality'

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg'; data: string } }

export interface Message {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

export interface LLMRequest {
  type: RequestType
  containsBedrock: boolean
  systemPrompt: string
  cacheablePrefix?: string
  webSearch?: boolean
  hasImage?: boolean
  messages: Message[]
  familiarPreference?: 'local' | 'quality' | 'economy'
}

export interface LLMResponse {
  content: string
  model: string
  provider: 'claude' | 'ollama'
}

// --- Config types ---

interface RoutingRule {
  default_tier: ModelTier
  urgency: 'immediate' | 'queued' | 'whenever'
  allow_local?: boolean
  prefer_local?: boolean
  queue_timeout_hours?: number
}

interface LLMConfig {
  providers: {
    claude: { models: Record<ModelTier, string> }
    ollama_mini: { base_url: string; models: { meta: string; economy: string } }
    ollama_pc?: { models: { default: string } }
  }
  routing: Record<RequestType, RoutingRule>
  meta_router: { enabled: boolean; model: string }
}

function loadConfig(): LLMConfig {
  return JSON.parse(readFileSync(LLM_CONFIG_PATH, 'utf8')) as LLMConfig
}

// Ollama doesn't support images — extract plain text from messages for local routing
function toTextMessages(messages: Message[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages.map(m => ({
    role: m.role,
    content: typeof m.content === 'string'
      ? m.content
      : m.content.filter((b): b is { type: 'text'; text: string } => b.type === 'text').map(b => b.text).join(''),
  }))
}

// --- Router ---

export async function route(request: LLMRequest): Promise<LLMResponse> {
  const config = loadConfig()
  const rule = config.routing[request.type]
  const logger = request.containsBedrock ? internalLog : log

  // Tier decision: meta-router → familiar preference → config default
  let tier: ModelTier = rule.default_tier

  if (config.meta_router.enabled) {
    const metaTier = await getMetaTier(
      request.type,
      toTextMessages(request.messages),
      config.meta_router.model,
      config.providers.ollama_mini.base_url
    )
    if (metaTier) tier = metaTier
  }

  if (request.familiarPreference === 'quality') tier = 'quality'
  if (request.familiarPreference === 'economy') tier = 'economy'

  // Images require cloud — Haiku vision is too weak, minimum Sonnet
  if (request.hasImage) {
    if (tier === 'economy') tier = 'balanced'
    const model = config.providers.claude.models[tier]
    logger.info({ type: request.type, model, provider: 'claude' }, 'llm request')
    const content = await callClaude({ model, systemPrompt: request.systemPrompt, cacheablePrefix: request.cacheablePrefix, webSearch: request.webSearch, messages: request.messages })
    return { content, model, provider: 'claude' }
  }

  // Immediate or local not allowed → Claude cloud
  if (rule.urgency === 'immediate' || !rule.allow_local) {
    const model = config.providers.claude.models[tier]
    logger.info({ type: request.type, model, provider: 'claude' }, 'llm request')
    const content = await callClaude({ model, systemPrompt: request.systemPrompt, cacheablePrefix: request.cacheablePrefix, webSearch: request.webSearch, messages: request.messages })
    return { content, model, provider: 'claude' }
  }

  // Local preferred — reflection and internal will try the PC first when enabled
  const miniUrl = config.providers.ollama_mini.base_url
  const pcUrl = env.OLLAMA_PC_BASE_URL
  let localModel = config.providers.ollama_mini.models.economy
  let localBaseUrl = miniUrl

  // PC routing disabled until the PC is set up with Linux + Ollama
  // Re-enable by uncommenting the block below and setting OLLAMA_PC_BASE_URL in .env
  //
  // const wantsHighQualityLocal = rule.prefer_local &&
  //   (request.type === 'reflection' || request.type === 'internal')
  //
  // if (wantsHighQualityLocal && pcUrl && config.providers.ollama_pc) {
  //   if (await isOllamaAvailable(pcUrl)) {
  //     localModel = config.providers.ollama_pc.models.default
  //     localBaseUrl = pcUrl
  //   }
  // }

  const timeoutMs = (rule.queue_timeout_hours ?? 6) * 60 * 60 * 1000
  const cloudModel = config.providers.claude.models[tier]

  const fallback = async (): Promise<string> => {
    logger.info({ type: request.type, model: cloudModel, provider: 'claude', reason: 'queue_timeout' }, 'llm fallback')
    return callClaude({ model: cloudModel, systemPrompt: request.systemPrompt, cacheablePrefix: request.cacheablePrefix, webSearch: request.webSearch, messages: request.messages })
  }

  logger.info({ type: request.type, model: localModel, provider: 'ollama' }, 'llm request')
  const content = await enqueue(
    { systemPrompt: request.systemPrompt, messages: toTextMessages(request.messages) },
    { localModel, localBaseUrl, timeoutMs, fallback }
  )
  return { content, model: localModel, provider: 'ollama' }
}
