import { logPulse, type PulseOutcome } from '../db.js'
import { log } from '../logger.js'

export interface RegularPulseResult {
  reflected: boolean
  reachedOut: boolean
}

export function observeRegularPulse(result: RegularPulseResult): void {
  let outcome: PulseOutcome

  if (result.reflected && result.reachedOut) {
    outcome = 'reflection_and_reach_out'
  } else if (result.reflected) {
    outcome = 'reflection'
  } else if (result.reachedOut) {
    outcome = 'reach_out'
  } else {
    outcome = 'quiet'
  }

  logPulse('regular', outcome)
  log.info({ outcome }, 'heartbeat: regular pulse complete')
}

export function observeBedrockPulse(encoded: boolean): void {
  const outcome: PulseOutcome = encoded ? 'considered' : 'passed'
  logPulse('bedrock', outcome)
  log.info({ outcome }, 'heartbeat: bedrock pulse complete')
}
