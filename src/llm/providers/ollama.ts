export interface ProviderRequest {
  model: string
  systemPrompt: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  format?: 'json'
}

export async function callOllama(req: ProviderRequest, baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: req.model,
      messages: [
        { role: 'system', content: req.systemPrompt },
        ...req.messages,
      ],
      stream: false,
      ...(req.format ? { format: req.format } : {}),
    }),
  })

  if (!response.ok) throw new Error(`Ollama error: ${response.status}`)

  const data = await response.json() as { message: { content: string } }
  return data.message.content
}

// Lightweight health check — used by queue and router to test local availability
export async function isOllamaAvailable(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}
