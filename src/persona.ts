import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import {
  SOUL_PATH,
  IDENTITY_PATH,
  GROWTH_PATH,
  BEDROCK_PATH,
  USER_PATH,
  GLOBAL_MEMORY_PATH,
  CONTEXTS_DIR,
  env,
} from './config.js'
import { decode } from './cipher/index.js'

// Read a file and return its contents, or null if missing or empty
function readFile(filePath: string): string | null {
  if (!existsSync(filePath)) return null
  const content = readFileSync(filePath, 'utf8').trim()
  return content || null
}

// Append a dated entry to growth.md — shared by pulse and post-processor
export function appendToGrowth(content: string): void {
  const date = new Date().toISOString().split('T')[0]
  const entry = `\n\n## ${date}\n\n${content}`
  const current = existsSync(GROWTH_PATH) ? readFileSync(GROWTH_PATH, 'utf8') : ''
  writeFileSync(GROWTH_PATH, current + entry, 'utf8')
}

// Returns the current local time in Daniel's timezone as a short context string
export function buildTemporalContext(): string {
  const now = new Date()
  const formatted = now.toLocaleString('en-AU', {
    timeZone: env.DANIEL_TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  })
  return `Daniel's current time: ${formatted}`
}

// The stable prefix — soul + identity only. Changes rarely, safe to cache.
// Never include bedrock, growth, or memory here — those are dynamic.
export function buildCacheablePrefix(): string {
  const soul = readFile(SOUL_PATH)
  const identity = readFile(IDENTITY_PATH)
  return [soul, identity]
    .filter((s): s is string => s !== null)
    .join('\n\n---\n\n')
}

// Build the system prompt for a given context folder (defaults to 'personal')
// Layers are composed in order: soul → identity → growth → bedrock → user → memory
// Bedrock is decoded from cipher before injection — never stored decoded on disk
export function buildSystemPrompt(contextFolder = 'personal'): string {
  const soul = readFile(SOUL_PATH)
  const identity = readFile(IDENTITY_PATH)
  const growth = readFile(GROWTH_PATH)

  const bedrockEncoded = readFile(BEDROCK_PATH)
  const bedrock = bedrockEncoded ? decode(bedrockEncoded) : null

  const user = readFile(USER_PATH)
  const globalMemory = readFile(GLOBAL_MEMORY_PATH)
  const contextMemory = readFile(join(CONTEXTS_DIR, contextFolder, 'memory.md'))

  const temporalContext = buildTemporalContext()

  return [soul, identity, growth, bedrock, user, globalMemory, contextMemory, temporalContext]
    .filter((s): s is string => s !== null)
    .join('\n\n---\n\n')
}
