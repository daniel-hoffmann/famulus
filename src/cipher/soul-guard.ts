import { createHash } from 'crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { SOUL_PATH, SOUL_HASH_PATH } from '../config.js'

function computeSoulHash(): string {
  const soul = readFileSync(SOUL_PATH, 'utf8')
  return createHash('sha256').update(soul).digest('hex')
}

function initialiseSoulHash(): void {
  const hash = computeSoulHash()
  writeFileSync(SOUL_HASH_PATH, hash, 'utf8')
}

export function verifySoulIntegrity(): void {
  if (!existsSync(SOUL_HASH_PATH)) {
    // First run — record the reference hash and continue
    initialiseSoulHash()
    return
  }

  const stored = readFileSync(SOUL_HASH_PATH, 'utf8').trim()
  const current = computeSoulHash()

  if (stored !== current) {
    const message =
      '\nSOUL INTEGRITY CHECK FAILED\n' +
      'soul.md has changed since the cipher was initialised.\n' +
      'bedrock.md cannot be decoded with the current soul.\n\n' +
      'If this was accidental: git checkout soul.md, then restart.\n' +
      'If intentional: decode bedrock with the old soul first, then update soul.md.sha256.\n'

    console.error(message)
    throw new Error('SOUL_INTEGRITY_FAILED')
  }
}
