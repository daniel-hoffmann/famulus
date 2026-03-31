import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import path from 'path'
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

async function handleMessage(text: string): Promise<string> {
  addMessage('personal', 'user', text)

  const history = getRecentMessages('personal', 50)
  const messages: Message[] = history.map(m => ({ role: m.role, content: m.content }))

  const cacheablePrefix = buildCacheablePrefix()
  const systemPrompt = buildSystemPrompt()

  const response = await route({
    type: 'conversation',
    containsBedrock: true,
    cacheablePrefix,
    systemPrompt,
    webSearch: true,
    messages,
  })

  addMessage('personal', 'assistant', response.content)
  appendToSessionLog(text, response.content)

  // Assess significance asynchronously — don't block the reply
  const fullMessages: Message[] = [...messages, { role: 'assistant', content: response.content }]
  assessConversation(fullMessages).catch(err => log.error({ err }, 'post-processor error'))

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

log.info('famulus starting up')

for (const channel of getChannels()) {
  channel.start(handleMessage)
}

startPulse()
startBedrockPulse()

log.info('famulus ready')
