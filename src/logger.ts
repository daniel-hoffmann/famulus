import pino from 'pino'
import { LOG_PATH, INTERNAL_LOG_PATH } from './config.js'

// Normal operational log — Daniel may read this
export const log = pino({}, pino.destination(LOG_PATH))

// Restricted log — bedrock-containing calls only, never surfaced in normal workflow
export const internalLog = pino({}, pino.destination(INTERNAL_LOG_PATH))

// Verbose log — enabled via VERBOSE=true in .env, for debugging
const verbose = process.env['VERBOSE'] === 'true'
export const verboseLog = {
  info: (obj: object | string, msg?: string) => {
    if (!verbose) return
    typeof obj === 'string' ? log.info(obj) : log.info(obj, msg)
  },
}
