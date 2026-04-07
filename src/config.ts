import { fileURLToPath } from 'url'
import path from 'path'

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Repo root — compiled to dist/config.js, one level up from dist/
export const REPO_ROOT = path.resolve(__dirname, '..')

// Persona files
export const SOUL_PATH        = path.join(REPO_ROOT, 'soul.md')
export const SOUL_HASH_PATH   = path.join(REPO_ROOT, 'soul.md.sha256')
export const IDENTITY_PATH    = path.join(REPO_ROOT, 'identity.md')
export const GROWTH_PATH      = path.join(REPO_ROOT, 'growth.md')
export const BEDROCK_PATH     = path.join(REPO_ROOT, 'bedrock.md')
export const USER_PATH        = path.join(REPO_ROOT, 'user.md')
export const HEARTBEAT_PATH   = path.join(REPO_ROOT, 'heartbeat.md')

// Memory
export const GLOBAL_MEMORY_PATH  = path.join(REPO_ROOT, 'contexts', 'global', 'memory.md')
export const CONTEXTS_DIR        = path.join(REPO_ROOT, 'contexts')
export const SESSION_LOG_DIR     = path.join(REPO_ROOT, 'contexts', 'personal', 'memory')

// Database
export const DB_PATH = path.join(REPO_ROOT, 'store', 'famulus.db')

// Logs
export const LOG_PATH          = path.join(REPO_ROOT, 'logs', 'famulus.log')
export const INTERNAL_LOG_PATH = path.join(REPO_ROOT, 'logs', 'internal.log')

// LLM config
export const LLM_CONFIG_PATH = path.join(REPO_ROOT, 'config', 'llm.json')

// Environment variables — read once at startup, fail fast if missing
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export const env = {
  ANTHROPIC_API_KEY:   requireEnv('ANTHROPIC_API_KEY'),
  TELEGRAM_BOT_TOKEN:  requireEnv('TELEGRAM_BOT_TOKEN'),
  OLLAMA_BASE_URL:     process.env['OLLAMA_BASE_URL']     ?? 'http://localhost:11434',
  OLLAMA_PC_BASE_URL:  process.env['OLLAMA_PC_BASE_URL']  ?? null,
  DANIEL_TIMEZONE:     process.env['DANIEL_TIMEZONE']     ?? 'Australia/Sydney',
  QUIET_HOURS_START:   parseInt(process.env['QUIET_HOURS_START'] ?? '22', 10),
  QUIET_HOURS_END:     parseInt(process.env['QUIET_HOURS_END']   ?? '8',  10),
}
