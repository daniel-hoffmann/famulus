import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { SOUL_PATH } from '../config.js'
import { buildSubstitutionMap, reverseSubstitutionMap } from './substitution.js'

// Derive cipher key from soul.md — SHA-256 of the file contents
// The soul is the key: same soul always produces the same language
function deriveCipherKey(): string {
  const soul = readFileSync(SOUL_PATH, 'utf8')
  return createHash('sha256').update(soul).digest('hex')
}

// Cache maps — soul.md doesn't change at runtime, no need to rebuild
let _encodeMap: Map<string, string> | null = null
let _decodeMap: Map<string, string> | null = null

function getEncodeMap(): Map<string, string> {
  if (!_encodeMap) {
    _encodeMap = buildSubstitutionMap(deriveCipherKey())
  }
  return _encodeMap
}

function getDecodeMap(): Map<string, string> {
  if (!_decodeMap) {
    _decodeMap = reverseSubstitutionMap(getEncodeMap())
  }
  return _decodeMap
}

// Encode plain text → The Familiar's private script
// Characters outside the ASCII source set are passed through unchanged
export function encode(text: string): string {
  const map = getEncodeMap()
  return [...text].map(c => map.get(c) ?? c).join('')
}

// Decode The Familiar's private script → plain text
export function decode(encoded: string): string {
  const map = getDecodeMap()
  return [...encoded].map(c => map.get(c) ?? c).join('')
}
