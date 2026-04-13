import { Bot, type Context } from 'grammy'
import { env } from '../config.js'
import { log } from '../logger.js'
import { type Channel, type MessageHandler, registerChannel } from './registry.js'
import { kvGet, kvSet } from '../db.js'

// Module-level bot and chat ID — needed for proactive reach-outs from the heartbeat
const bot = new Bot(env.TELEGRAM_BOT_TOKEN)

// Restore chatId from DB so reach-outs survive restarts
const stored = kvGet('telegram_chat_id')
let chatId: number | null = stored ? parseInt(stored, 10) : null

// Telegram max message length is 4096 chars
async function sendChunked(targetChatId: number, text: string): Promise<void> {
  for (let i = 0; i < text.length; i += 4096) {
    await bot.api.sendMessage(targetChatId, text.slice(i, i + 4096))
  }
}

async function sendReply(ctx: Context, response: string): Promise<void> {
  await sendChunked(ctx.chat!.id, response)
}

async function downloadPhoto(ctx: Context): Promise<string | null> {
  if (!ctx.message?.photo) return null
  // Highest resolution is last in the array
  const photo = ctx.message.photo[ctx.message.photo.length - 1]
  const file = await ctx.api.getFile(photo.file_id)
  if (!file.file_path) return null
  const url = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`
  const res = await fetch(url)
  const buffer = await res.arrayBuffer()
  return Buffer.from(buffer).toString('base64')
}

class TelegramChannel implements Channel {
  start(handler: MessageHandler): void {
    bot.on('message:text', async (ctx) => {
      if (chatId !== ctx.chat.id) {
        chatId = ctx.chat.id
        kvSet('telegram_chat_id', String(chatId))
      }
      try {
        const response = await handler(ctx.message.text)
        await sendReply(ctx, response)
      } catch (err) {
        log.error({ err }, 'telegram handler error')
        await ctx.reply('Something went wrong. Try again in a moment.')
      }
    })

    bot.on('message:photo', async (ctx) => {
      if (chatId !== ctx.chat.id) {
        chatId = ctx.chat.id
        kvSet('telegram_chat_id', String(chatId))
      }
      try {
        const imageBase64 = await downloadPhoto(ctx)
        if (!imageBase64) {
          await ctx.reply('Could not download that image. Try again.')
          return
        }
        const caption = ctx.message.caption ?? ''
        const response = await handler(caption, imageBase64)
        await sendReply(ctx, response)
      } catch (err) {
        log.error({ err }, 'telegram photo handler error')
        await ctx.reply('Something went wrong. Try again in a moment.')
      }
    })

    bot.start()
  }
}

// Called by the heartbeat when The Familiar wants to reach out proactively
// Throws if no chat ID is known — caller's catch block handles this correctly
export async function notifyDaniel(text: string): Promise<void> {
  if (!chatId) {
    throw new Error('notifyDaniel: no chat ID yet — waiting for first message from Daniel')
  }
  await sendChunked(chatId, text)
}

registerChannel(new TelegramChannel())
