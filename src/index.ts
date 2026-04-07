import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import path from 'path'
import { verifySoulIntegrity } from './cipher/soul-guard.js'
import './channels/index.js'  // registers channels via side-effect imports
import { getChannels } from './channels/registry.js'
import { addMessage, getRecentMessages } from './db.js'
import { buildSystemPrompt, buildCacheablePrefix } from './persona.js'
import { route, type Message } from './llm/router.js'
import { assessConversation } from './heartbeat/post-processor.js'
import { startPulse } from './heartbeat/pulse.js'
import { startBedrockPulse } from './heartbeat/bedrock-pulse.js'
import { log } from './logger.js'
import { SESSION_LOG_DIR } from './config.js'

async function handleMessage(text: string, imageBase64?: string): Promise<string> {
  // Store a text representation in the DB — history and post-processor work with text only
  const storedContent = imageBase64 ? (text ? `[image]\n${text}` : '[image]') : text
  addMessage('personal', 'user', storedContent)

  // Build history without the just-stored message, then append with proper content blocks
  const history = getRecentMessages('personal', 50)
  const historyMessages: Message[] = history.slice(0, -1).map(m => ({ role: m.role, content: m.content }))

  const currentContent: Message['content'] = imageBase64
    ? [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
        ...(text ? [{ type: 'text' as const, text }] : []),
      ]
    : text

  const messages: Message[] = [...historyMessages, { role: 'user', content: currentContent }]

  const cacheablePrefix = buildCacheablePrefix()
  const systemPrompt = buildSystemPrompt()

  const response = await route({
    type: 'conversation',
    containsBedrock: true,
    cacheablePrefix,
    systemPrompt,
    webSearch: true,
    hasImage: !!imageBase64,
    messages,
  })

  addMessage('personal', 'assistant', response.content)
  appendToSessionLog(storedContent, response.content)

  // Post-processor gets text-only messages — no base64 blobs in assessment
  const assessMessages: Message[] = [
    ...historyMessages,
    { role: 'user', content: storedContent },
    { role: 'assistant', content: response.content },
  ]
  assessConversation(assessMessages).catch(err => log.error({ err }, 'post-processor error'))

  return response.content
}

function appendToSessionLog(userText: string, assistantText: string): void {
  const date = new Date().toISOString().split('T')[0]
  const time = new Date().toISOString().split('T')[1].slice(0, 5)
  const filePath = path.join(SESSION_LOG_DIR, `${date}.md`)
  const entry = `\n### ${time}\n\n**Daniel:** ${userText}\n\n**Ellis:** ${assistantText}\n`
  mkdirSync(SESSION_LOG_DIR, { recursive: true })
  if (!existsSync(filePath)) writeFileSync(filePath, `# ${date}\n`, 'utf8')
  appendFileSync(filePath, entry, 'utf8')
}

verifySoulIntegrity()
log.info('famulus starting up')

for (const channel of getChannels()) {
  channel.start(handleMessage)
}

startPulse()
startBedrockPulse()

log.info('famulus ready')
