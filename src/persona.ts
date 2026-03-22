import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import {
  SOUL_PATH,
  IDENTITY_PATH,
  GROWTH_PATH,
  BEDROCK_PATH,
  USER_PATH,
  GLOBAL_MEMORY_PATH,
  CONTEXTS_DIR,
} from './config.js'
import { decode } from './cipher/index.js'

// Read a file and return its contents, or null if missing or empty
function readFile(filePath: string): string | null {
  if (!existsSync(filePath)) return null
  const content = readFileSync(filePath, 'utf8').trim()
  return content || null
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

  return [soul, identity, growth, bedrock, user, globalMemory, contextMemory]
    .filter((s): s is string => s !== null)
    .join('\n\n---\n\n')
}
