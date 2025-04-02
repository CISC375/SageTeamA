import { Client, Message, Interaction, User } from 'discord.js';
import { DB } from '@root/config';

/**
 * Interface for question tracking log entry
 */
export interface BotResponseLog {
  questionContent: string;
  userId: string;
  userName: string;
  timestamp: Date;
  channelId: string;
  guildId: string;
  responseType: 'faq' | 'command' | 'other';
}

/**
 * Logs a user question to the database for tracking
 * @param client Discord.js client with MongoDB connection
 * @param questionContent Content of the question
 * @param userId ID of the user who asked the question
 * @param userName Username of the user who asked the question
 * @param channelId ID of the channel where the question was asked
 * @param guildId ID of the guild where the question was asked
 * @param responseType Type of response (faq, command, other)
 */
export async function logQuestion(
  client: Client,
  questionContent: string,
  userId: string,
  userName: string,
  channelId: string,
  guildId: string,
  responseType: 'faq' | 'command' | 'other' = 'other'
): Promise<void> {
  try {
    // First check if this question already exists
    const existingQuestion = await client.mongo.collection(DB.BOT_RESPONSES)
      .findOne({ questionContent: questionContent });

    if (existingQuestion) {
      // If question exists, update the count and add a new timestamp
      await client.mongo.collection(DB.BOT_RESPONSES).updateOne(
        { questionContent: questionContent },
        { 
          $inc: { count: 1 },
          $push: { 
            instances: {
              userId: userId,
              userName: userName,
              timestamp: new Date(),
              channelId: channelId
            }
          } 
        }
      );
    } else {
      // If question is new, create a new entry
      const logEntry = {
        questionContent,
        count: 1,
        instances: [{
          userId,
          userName,
          timestamp: new Date(),
          channelId
        }],
        guildId,
        responseType,
        firstAsked: new Date()
      };

      await client.mongo.collection(DB.BOT_RESPONSES).insertOne(logEntry);
    }
    
    console.log(`Logged question from user ${userName} (${userId})`);
  } catch (error) {
    console.error('Error logging question:', error);
    client.emit('error', error);
  }
}

/**
 * Helper function to log questions from Message objects
 * @param message The message containing the question
 * @param responseType Type of the response
 */
export async function logMessageQuestion(
  message: Message,
  responseType: 'faq' | 'command' | 'other' = 'other'
): Promise<void> {
  if (!message.guild) return; // Skip DMs
  
  await logQuestion(
    message.client,
    message.content,
    message.author.id,
    message.author.username,
    message.channel.id,
    message.guild.id,
    responseType
  );
}

/**
 * Helper function to log questions from Interaction objects
 * @param interaction The interaction containing the question
 * @param responseType Type of the response
 */
export async function logInteractionQuestion(
  interaction: Interaction,
  responseType: 'faq' | 'command' | 'other' = 'other'
): Promise<void> {
  if (!interaction.guild) return; // Skip DMs
  if (!interaction.isCommand() && !interaction.isMessageComponent()) return; // Skip other interactions
  
  const user = interaction.user;
  const questionContent = interaction.isCommand() 
    ? `/${interaction.commandName} ${interaction.options.data.map(o => `${o.name}:${o.value}`).join(' ')}`
    : 'Message Component Interaction';
  
  await logQuestion(
    interaction.client,
    questionContent,
    user.id,
    user.username,
    interaction.channelId,
    interaction.guild.id,
    responseType
  );
} 