import { ApplicationCommandOptionData, ApplicationCommandOptionType, ApplicationCommandPermissions, ChatInputCommandInteraction, EmbedBuilder, InteractionResponse } from 'discord.js';
import { Command } from '@lib/types/Command';
import { DB, CHANNELS } from '@root/config';
import { ADMIN_PERMS } from '@lib/permissions';
import { BotResponseLog } from '@lib/utils/responseLogger';

export default class extends Command {
    description = 'View statistics about bot responses to user questions';
    permissions = [ADMIN_PERMS];
    options: ApplicationCommandOptionData[] = [
        {
            name: 'timeframe',
            description: 'Timeframe to view statistics for',
            type: ApplicationCommandOptionType.String,
            required: false,
            choices: [
                {
                    name: 'Today',
                    value: 'today'
                },
                {
                    name: 'Past Week',
                    value: 'week'
                },
                {
                    name: 'Past Month',
                    value: 'month'
                },
                {
                    name: 'All Time',
                    value: 'all'
                }
            ]
        },
        {
            name: 'user',
            description: 'View responses for a specific user',
            type: ApplicationCommandOptionType.User,
            required: false
        },
        {
            name: 'type',
            description: 'Filter by response type',
            type: ApplicationCommandOptionType.String,
            required: false,
            choices: [
                {
                    name: 'FAQ',
                    value: 'faq'
                },
                {
                    name: 'Command',
                    value: 'command'
                },
                {
                    name: 'Other',
                    value: 'other'
                }
            ]
        }
    ];

    async run(interaction: ChatInputCommandInteraction): Promise<InteractionResponse<boolean> | void> {
        const timeframe = interaction.options.getString('timeframe') || 'all';
        const user = interaction.options.getUser('user');
        const type = interaction.options.getString('type');

        // Build query based on options
        const query: any = {};

        // Add timeframe filter
        if (timeframe !== 'all') {
            const now = new Date();
            let startDate = new Date();
            
            switch (timeframe) {
                case 'today':
                    startDate.setHours(0, 0, 0, 0);
                    break;
                case 'week':
                    startDate.setDate(now.getDate() - 7);
                    break;
                case 'month':
                    startDate.setMonth(now.getMonth() - 1);
                    break;
            }
            
            query.timestamp = { $gte: startDate };
        }

        // Add user filter
        if (user) {
            query.userId = user.id;
        }

        // Add type filter
        if (type) {
            query.responseType = type;
        }

        // Get the responses from the database
        const responses: BotResponseLog[] = await interaction.client.mongo.collection(DB.BOT_RESPONSES).find(query).toArray();

        if (responses.length === 0) {
            return interaction.reply({
                content: 'No bot responses found for the selected criteria.',
                ephemeral: true
            });
        }

        // Calculate statistics
        const totalResponses = responses.length;
        const uniqueUsers = new Set(responses.map(r => r.userId)).size;
        const responseTypes = {
            faq: responses.filter(r => r.responseType === 'faq').length,
            command: responses.filter(r => r.responseType === 'command').length,
            other: responses.filter(r => r.responseType === 'other').length
        };

        // Calculate response time distribution
        const responseTimeDistribution = {
            morning: 0,    // 6am - 12pm
            afternoon: 0,  // 12pm - 6pm
            evening: 0,    // 6pm - 12am
            night: 0       // 12am - 6am
        };

        responses.forEach(response => {
            const hour = new Date(response.timestamp).getHours();
            if (hour >= 6 && hour < 12) {
                responseTimeDistribution.morning++;
            } else if (hour >= 12 && hour < 18) {
                responseTimeDistribution.afternoon++;
            } else if (hour >= 18 && hour < 24) {
                responseTimeDistribution.evening++;
            } else {
                responseTimeDistribution.night++;
            }
        });

        // Create embed
        const embed = new EmbedBuilder()
            .setTitle('Bot Response Statistics')
            .setColor('#00FF00')
            .setTimestamp()
            .addFields(
                { name: 'Total Responses', value: totalResponses.toString(), inline: true },
                { name: 'Unique Users', value: uniqueUsers.toString(), inline: true },
                { name: '\u200B', value: '\u200B', inline: true }, // Empty field for formatting
                { name: 'FAQ Responses', value: responseTypes.faq.toString(), inline: true },
                { name: 'Command Responses', value: responseTypes.command.toString(), inline: true },
                { name: 'Other Responses', value: responseTypes.other.toString(), inline: true },
                { name: 'Time Distribution', value: 
                    `Morning (6am-12pm): ${responseTimeDistribution.morning}\n` +
                    `Afternoon (12pm-6pm): ${responseTimeDistribution.afternoon}\n` +
                    `Evening (6pm-12am): ${responseTimeDistribution.evening}\n` +
                    `Night (12am-6am): ${responseTimeDistribution.night}`, inline: false }
            );

        // Add timeframe information
        if (timeframe !== 'all') {
            embed.setDescription(`Statistics for ${timeframe === 'today' ? 'today' : `the past ${timeframe}`}`);
        }

        // Add user information if filtering by user
        if (user) {
            embed.setDescription((embed.data.description || '') + `\nFiltered for user: ${user.username}`);
        }

        return interaction.reply({
            embeds: [embed],
            ephemeral: false
        });
    }
} 