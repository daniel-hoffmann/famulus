// The heartbeat's view of the pending flag queue.
// Flags are added by the post-processor and consumed by the pulse.
export {
  addFlag,
  getPendingFlags,
  markFlagSurfaced,
  type FlagType,
  type PendingFlag,
} from '../db.js'
