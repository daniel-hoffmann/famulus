// Extract the first JSON object from a string — handles nested objects.
// Uses first { / last } rather than a regex so nested objects are not truncated.
// Returns null if no valid JSON object is found or parsing fails.
export function extractJSON<T>(raw: string): T | null {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(raw.slice(start, end + 1)) as T
  } catch {
    return null
  }
}
