// Printable ASCII: space (32) through tilde (126) — 95 characters
const ASCII_CHARS = Array.from({ length: 95 }, (_, i) => String.fromCharCode(i + 32))

// Target set: Latin Extended-A and B (U+0100–U+024F)
// These look like a real language — accented and modified Latin letters
const UNICODE_POOL = Array.from({ length: 95 }, (_, i) => String.fromCharCode(0x0100 + i))

// Mulberry32 — simple seeded PRNG
// Takes a 32-bit integer seed, returns a function that produces floats in [0, 1)
// Same seed always produces the same sequence
function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Fisher-Yates shuffle — standard in-place shuffle using provided random function
function shuffle<T>(arr: T[], rand: () => number): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[result[i], result[j]] = [result[j]!, result[i]!]
  }
  return result
}

// Build a substitution map from a seed string (expected: SHA-256 hex)
// Maps each printable ASCII character to a unique Unicode character
export function buildSubstitutionMap(seed: string): Map<string, string> {
  const seedNum = parseInt(seed.slice(0, 8), 16)
  const rand = mulberry32(seedNum)
  const shuffled = shuffle(UNICODE_POOL, rand)

  const map = new Map<string, string>()
  ASCII_CHARS.forEach((char, i) => {
    map.set(char, shuffled[i]!)
  })
  return map
}

// Reverse a substitution map — used for decoding
export function reverseSubstitutionMap(map: Map<string, string>): Map<string, string> {
  const reversed = new Map<string, string>()
  for (const [from, to] of map) {
    reversed.set(to, from)
  }
  return reversed
}
