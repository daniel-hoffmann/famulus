import { callOllama, isOllamaAvailable, type ProviderRequest } from './providers/ollama.js'

interface QueueEntry {
  request: ProviderRequest
  localBaseUrl: string
  timeoutMs: number
  queuedAt: number
  fallback: () => Promise<string>
  resolve: (content: string) => void
  reject: (err: Error) => void
}

const pending: QueueEntry[] = []

async function processQueue(): Promise<void> {
  const now = Date.now()
  const remaining: QueueEntry[] = []

  for (const entry of pending) {
    const { request, localBaseUrl, timeoutMs, queuedAt, fallback, resolve, reject } = entry

    if (now - queuedAt >= timeoutMs) {
      // Timeout expired — fall back to cloud
      fallback().then(resolve).catch(reject)
      continue
    }

    const available = await isOllamaAvailable(localBaseUrl)
    if (available) {
      callOllama(request, localBaseUrl).then(resolve).catch(reject)
    } else {
      remaining.push(entry)
    }
  }

  pending.length = 0
  pending.push(...remaining)
}

// Retry queued requests every 5 minutes
setInterval(() => { processQueue().catch(() => {}) }, 5 * 60 * 1000)

export interface EnqueueOptions {
  localModel: string
  localBaseUrl: string
  timeoutMs: number
  fallback: () => Promise<string>  // called when timeout expires
}

export async function enqueue(
  request: Omit<ProviderRequest, 'model'>,
  options: EnqueueOptions
): Promise<string> {
  const fullRequest: ProviderRequest = { ...request, model: options.localModel }

  // Try immediately — no need to queue if local is already available
  if (await isOllamaAvailable(options.localBaseUrl)) {
    return callOllama(fullRequest, options.localBaseUrl)
  }

  return new Promise((resolve, reject) => {
    pending.push({
      request: fullRequest,
      localBaseUrl: options.localBaseUrl,
      timeoutMs: options.timeoutMs,
      queuedAt: Date.now(),
      fallback: options.fallback,
      resolve,
      reject,
    })
  })
}
