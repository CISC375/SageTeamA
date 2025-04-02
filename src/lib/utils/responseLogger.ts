import { Client, Message, Interaction, User } from 'discord.js';
import { DB } from '@root/config';

/**
 * Interface for bot response log entry
 */
export interface BotResponseLog {
  userId: string;
  userName: string;
  questionContent: string;
  responseContent: string;
  channelId: string;
  guildId: string;
  timestamp: Date;
  responseType: 'faq' | 'command' | 'other';
  metadata?: Record<string, any>;
}

/**
 * Logs a bot response to a user question in the database
 * @param client Discord.js client with MongoDB connection
 * @param userId ID of the user who asked the question
 * @param userName Username of the user who asked the question
 * @param questionContent Content of the question
 * @param responseContent Content of the bot's response
 * @param channelId ID of the channel where the interaction happened
 * @param guildId ID of the guild where the interaction happened
 * @param responseType Type of response (faq, command, other)
 * @param metadata Any additional metadata to store
 */
export async function logBotResponse(
  client: Client,
  userId: string,
  userName: string,
  questionContent: string,
  responseContent: string,
  channelId: string,
  guildId: string,
  responseType: 'faq' | 'command' | 'other' = 'other',
  metadata: Record<string, any> = {}
): Promise<void> {
  try {
    const logEntry: BotResponseLog = {
      userId,
      userName,
      questionContent,
      responseContent,
      channelId,
      guildId,
      timestamp: new Date(),
      responseType,
      metadata
    };

    await client.mongo.collection(DB.BOT_RESPONSES).insertOne(logEntry);
    console.log(`Logged bot response to user ${userName} (${userId})`);
  } catch (error) {
    console.error('Error logging bot response:', error);
    client.emit('error', error);
  }
}

/**
 * Helper function to log responses from Message objects
 * @param originalMessage The original message from the user
 * @param responseContent The content of the bot's response
 * @param responseType Type of the response
 * @param metadata Additional metadata
 */
export async function logMessageResponse(
  originalMessage: Message,
  responseContent: string,
  responseType: 'faq' | 'command' | 'other' = 'other',
  metadata: Record<string, any> = {}
): Promise<void> {
  if (!originalMessage.guild) return; // Skip DMs
  
  await logBotResponse(
    originalMessage.client,
    originalMessage.author.id,
    originalMessage.author.username,
    originalMessage.content,
    responseContent,
    originalMessage.channel.id,
    originalMessage.guild.id,
    responseType,
    metadata
  );
}

/**
 * Helper function to log responses from Interaction objects
 * @param interaction The interaction from the user
 * @param responseContent The content of the bot's response
 * @param responseType Type of the response
 * @param metadata Additional metadata
 */
export async function logInteractionResponse(
  interaction: Interaction,
  responseContent: string,
  responseType: 'faq' | 'command' | 'other' = 'other',
  metadata: Record<string, any> = {}
): Promise<void> {
  if (!interaction.guild) return; // Skip DMs
  if (!interaction.isCommand() && !interaction.isMessageComponent()) return; // Skip other interactions
  
  const user = interaction.user;
  const questionContent = interaction.isCommand() 
    ? `/${interaction.commandName} ${interaction.options.data.map(o => `${o.name}:${o.value}`).join(' ')}`
    : 'Message Component Interaction';
  
  await logBotResponse(
    interaction.client,
    user.id,
    user.username,
    questionContent,
    responseContent,
    interaction.channelId,
    interaction.guild.id,
    responseType,
    metadata
  );
} 