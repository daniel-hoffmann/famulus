import Database from 'better-sqlite3'
import { DB_PATH } from './config.js'

// --- Types ---

export type Role = 'user' | 'assistant'

export interface Message {
  id: number
  channel: string
  role: Role
  content: string
  created_at: number  // Unix ms
}

export type PulseType = 'regular' | 'bedrock'
export type PulseOutcome =
  | 'quiet'
  | 'reflection'
  | 'reach_out'
  | 'reflection_and_reach_out'
  | 'considered'   // bedrock pulse — something was genuinely considered
  | 'passed'       // bedrock pulse — nothing ready to move

export interface PulseLog {
  id: number
  pulse_type: PulseType
  outcome: PulseOutcome
  created_at: number
}

export type FlagType = 'reflection' | 'bedrock'

export interface PendingFlag {
  id: number
  flag_type: FlagType
  summary: string
  created_at: number
  surfaced_at: number | null
}

// --- Initialise DB ---

const db = new Database(DB_PATH)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    channel    TEXT    NOT NULL,
    role       TEXT    NOT NULL CHECK(role IN ('user', 'assistant')),
    content    TEXT    NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pulse_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    pulse_type TEXT    NOT NULL CHECK(pulse_type IN ('regular', 'bedrock')),
    outcome    TEXT    NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pending_flags (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    flag_type   TEXT    NOT NULL CHECK(flag_type IN ('reflection', 'bedrock')),
    summary     TEXT    NOT NULL,
    created_at  INTEGER NOT NULL,
    surfaced_at INTEGER
  );
`)

// --- Prepared statements ---

const stmts = {
  addMessage: db.prepare<[string, Role, string, number]>(
    'INSERT INTO messages (channel, role, content, created_at) VALUES (?, ?, ?, ?)'
  ),

  getRecentMessages: db.prepare<[string, number]>(
    'SELECT * FROM messages WHERE channel = ? ORDER BY created_at DESC LIMIT ?'
  ),

  getMessagesSince: db.prepare<[number]>(
    'SELECT * FROM messages WHERE created_at >= ? ORDER BY created_at ASC'
  ),

  logPulse: db.prepare<[PulseType, PulseOutcome, number]>(
    'INSERT INTO pulse_log (pulse_type, outcome, created_at) VALUES (?, ?, ?)'
  ),

  getLastOutcomeTime: db.prepare<[string]>(
    'SELECT created_at FROM pulse_log WHERE outcome LIKE ? ORDER BY created_at DESC LIMIT 1'
  ),

  addFlag: db.prepare<[FlagType, string, number]>(
    'INSERT INTO pending_flags (flag_type, summary, created_at) VALUES (?, ?, ?)'
  ),

  getPendingFlags: db.prepare(
    'SELECT * FROM pending_flags WHERE surfaced_at IS NULL ORDER BY created_at ASC'
  ),

  markFlagSurfaced: db.prepare<[number, number]>(
    'UPDATE pending_flags SET surfaced_at = ? WHERE id = ?'
  ),
}

// --- Messages ---

export function addMessage(channel: string, role: Role, content: string): void {
  stmts.addMessage.run(channel, role, content, Date.now())
}

export function getRecentMessages(channel: string, limit = 50): Message[] {
  const rows = stmts.getRecentMessages.all(channel, limit) as Message[]
  return rows.reverse()  // return chronological order (query fetches newest-first)
}

export function getMessagesSince(since: number): Message[] {
  return stmts.getMessagesSince.all(since) as Message[]
}

// --- Pulse log ---

export function logPulse(type: PulseType, outcome: PulseOutcome): void {
  stmts.logPulse.run(type, outcome, Date.now())
}

// Returns the timestamp of the last pulse with a matching outcome, or null
// Pass a partial string — e.g. 'reflection%' matches both 'reflection' and 'reflection_and_reach_out'
export function getLastOutcomeTime(outcomePattern: string): number | null {
  const row = stmts.getLastOutcomeTime.get(outcomePattern) as { created_at: number } | undefined
  return row?.created_at ?? null
}

// --- Pending flags ---

export function addFlag(type: FlagType, summary: string): void {
  stmts.addFlag.run(type, summary, Date.now())
}

export function getPendingFlags(): PendingFlag[] {
  return stmts.getPendingFlags.all() as PendingFlag[]
}

export function markFlagSurfaced(id: number): void {
  stmts.markFlagSurfaced.run(Date.now(), id)
}
