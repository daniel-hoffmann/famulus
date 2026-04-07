// A handler receives the incoming message text (and optional image) and returns The Familiar's response
export type MessageHandler = (text: string, imageBase64?: string) => Promise<string>

// The contract every channel must satisfy
export interface Channel {
  start(handler: MessageHandler): void
}

const channels: Channel[] = []

export function registerChannel(channel: Channel): void {
  channels.push(channel)
}

export function getChannels(): Channel[] {
  return channels
}
