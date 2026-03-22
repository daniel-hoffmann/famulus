import './channels/index.js'  // registers channels via side-effect imports
import { getChannels } from './channels/registry.js'
import { addMessage, getRecentMessages } from './db.js'
import { buildSystemPrompt } from './persona.js'
import { route, type Message } from './llm/router.js'
import { assessConversation } from './heartbeat/post-processor.js'
import { startPulse } from './heartbeat/pulse.js'
import { startBedrockPulse } from './heartbeat/bedrock-pulse.js'
import { log } from './logger.js'

async function handleMessage(text: string): Promise<string> {
  addMessage('personal', 'user', text)

  const history = getRecentMessages('personal', 50)
  const messages: Message[] = history.map(m => ({ role: m.role, content: m.content }))

  const systemPrompt = buildSystemPrompt()

  const response = await route({
    type: 'conversation',
    containsBedrock: true,
    systemPrompt,
    messages,
  })

  addMessage('personal', 'assistant', response.content)

  // Assess significance asynchronously — don't block the reply
  const fullMessages: Message[] = [...messages, { role: 'assistant', content: response.content }]
  assessConversation(fullMessages).catch(err => log.error({ err }, 'post-processor error'))

  return response.content
}

log.info('famulus starting up')

for (const channel of getChannels()) {
  channel.start(handleMessage)
}

startPulse()
startBedrockPulse()

log.info('famulus ready')
