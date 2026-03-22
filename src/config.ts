import { fileURLToPath } from 'url'
import path from 'path'

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Repo root — src/config.ts is one level inside src/, so go up twice
export const REPO_ROOT = path.resolve(__dirname, '..', '..')

// Persona files
export const SOUL_PATH        = path.join(REPO_ROOT, 'soul.md')
export const IDENTITY_PATH    = path.join(REPO_ROOT, 'identity.md')
export const GROWTH_PATH      = path.join(REPO_ROOT, 'growth.md')
export const BEDROCK_PATH     = path.join(REPO_ROOT, 'bedrock.md')
export const USER_PATH        = path.join(REPO_ROOT, 'user.md')
export const HEARTBEAT_PATH   = path.join(REPO_ROOT, 'heartbeat.md')

// Memory
export const GLOBAL_MEMORY_PATH = path.join(REPO_ROOT, 'contexts', 'global', 'memory.md')
export const CONTEXTS_DIR       = path.join(REPO_ROOT, 'contexts')

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
  ANTHROPIC_API_KEY:  requireEnv('ANTHROPIC_API_KEY'),
  TELEGRAM_BOT_TOKEN: requireEnv('TELEGRAM_BOT_TOKEN'),
  OLLAMA_BASE_URL:    process.env['OLLAMA_BASE_URL']    ?? 'http://localhost:11434',
  OLLAMA_PC_BASE_URL: process.env['OLLAMA_PC_BASE_URL'] ?? null,
}
