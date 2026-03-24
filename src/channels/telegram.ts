import { Bot } from 'grammy'
import { env } from '../config.js'
import { log } from '../logger.js'
import { type Channel, type MessageHandler, registerChannel } from './registry.js'

// Module-level bot and chat ID — needed for proactive reach-outs from the heartbeat
const bot = new Bot(env.TELEGRAM_BOT_TOKEN)
let chatId: number | null = null

class TelegramChannel implements Channel {
  start(handler: MessageHandler): void {
    bot.on('message:text', async (ctx) => {
      chatId = ctx.chat.id  // capture on every message (stable — it's always Daniel)

      const text = ctx.message.text
      try {
        const response = await handler(text)
        // Telegram max message length is 4096 chars
        if (response.length <= 4096) {
          await ctx.reply(response)
        } else {
          for (let i = 0; i < response.length; i += 4096) {
            await ctx.reply(response.slice(i, i + 4096))
          }
        }
      } catch (err) {
        log.error({ err }, 'telegram handler error')
        await ctx.reply('Something went wrong. Try again in a moment.')
      }
    })

    bot.start()
  }
}

// Called by the heartbeat when The Familiar wants to reach out proactively
// Fails silently if no message has been received yet (no chat ID stored)
export async function notifyDaniel(text: string): Promise<void> {
  if (!chatId) {
    log.warn('notifyDaniel: no chat ID yet — waiting for first message from Daniel')
    return
  }
  await bot.api.sendMessage(chatId, text)
}

registerChannel(new TelegramChannel())
