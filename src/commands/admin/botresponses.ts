import { ApplicationCommandOptionData, ApplicationCommandOptionType, ChatInputCommandInteraction, EmbedBuilder, InteractionResponse } from 'discord.js';
import { Command } from '@lib/types/Command';
import { DB } from '@root/config';
import { ADMIN_PERMS } from '@lib/permissions';

export default class extends Command {
    description = 'View statistics about questions asked to the bot';
    permissions = [ADMIN_PERMS]; // This ensures only Admin roles can use the command
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
            description: 'View questions from a specific user',
            type: ApplicationCommandOptionType.User,
            required: false
        },
        {
            name: 'type',
            description: 'Filter by question type',
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
        },
        {
            name: 'limit',
            description: 'Limit the number of top questions shown',
            type: ApplicationCommandOptionType.Integer,
            required: false
        },
        {
            name: 'include_commands',
            description: 'Include admin command queries in results',
            type: ApplicationCommandOptionType.Boolean,
            required: false,
        }
    ];

    async run(interaction: ChatInputCommandInteraction): Promise<InteractionResponse<boolean> | void> {
        const timeframe = interaction.options.getString('timeframe') || 'all';
        const user = interaction.options.getUser('user');
        const type = interaction.options.getString('type');
        const limit = interaction.options.getInteger('limit') || 10;
        const includeCommands = interaction.options.getBoolean('include_commands') || false;

        // Build query based on options
        const query: any = {};

        // By default, exclude questions that are admin commands (those starting with "/botresponses", etc.)
        if (!includeCommands) {
            query.questionContent = { $not: /^\/(?:botresponses|exportresponses)/ };
        }

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
            
            query.firstAsked = { $gte: startDate };
        }

        // Add user filter
        if (user) {
            query['instances.userId'] = user.id;
        }

        // Add type filter
        if (type) {
            query.responseType = type;
        }

        // Get the questions from the database, sorted by count in descending order
        const questions = await interaction.client.mongo.collection(DB.BOT_RESPONSES)
            .find(query)
            .sort({ count: -1 })
            .limit(limit)
            .toArray();

        if (questions.length === 0) {
            return interaction.reply({
                content: 'No questions found for the selected criteria.',
                ephemeral: true
            });
        }

        // Calculate statistics
        let totalQuestions = 0;
        try {
            const countResult = await interaction.client.mongo.collection(DB.BOT_RESPONSES)
                .aggregate([
                    { $match: query },
                    { $count: "total" }
                ]).toArray();
            
            totalQuestions = countResult.length > 0 ? countResult[0].total : 0;
        } catch (error) {
            console.error('Error counting documents:', error);
        }
            
        // Calculate total instances (ensuring counts are numbers)
        const totalInstances = questions.reduce((sum, q) => sum + (typeof q.count === 'number' ? q.count : 0), 0);
        
        // Create a set of unique users
        const uniqueUsers = new Set();
        questions.forEach(q => {
            if (q.instances && Array.isArray(q.instances)) {
                q.instances.forEach(i => uniqueUsers.add(i.userId));
            }
        });

        // Calculate time distribution
        const timeDistribution = {
            morning: 0,    // 6am - 12pm
            afternoon: 0,  // 12pm - 6pm
            evening: 0,    // 6pm - 12am
            night: 0       // 12am - 6am
        };

        questions.forEach(question => {
            if (question.instances && Array.isArray(question.instances)) {
                question.instances.forEach(instance => {
                    // Make sure timestamp is valid
                    if (instance.timestamp) {
                        const timestamp = new Date(instance.timestamp);
                        if (!isNaN(timestamp.getTime())) {
                            const hour = timestamp.getHours();
                            if (hour >= 6 && hour < 12) {
                                timeDistribution.morning++;
                            } else if (hour >= 12 && hour < 18) {
                                timeDistribution.afternoon++;
                            } else if (hour >= 18 && hour < 24) {
                                timeDistribution.evening++;
                            } else {
                                timeDistribution.night++;
                            }
                        }
                    }
                });
            }
        });

        // Create embed
        const embed = new EmbedBuilder()
            .setTitle('Question Statistics')
            .setColor('#00FF00')
            .setTimestamp();

        // Add summary fields
        embed.addFields(
            { name: 'Total Unique Questions', value: totalQuestions.toString(), inline: true },
            { name: 'Total Question Instances', value: totalInstances.toString(), inline: true },
            { name: 'Unique Users', value: uniqueUsers.size.toString(), inline: true }
        );

        // Add time distribution
        embed.addFields({
            name: 'Time Distribution', 
            value: 
                `Morning (6am-12pm): ${timeDistribution.morning}\n` +
                `Afternoon (12pm-6pm): ${timeDistribution.afternoon}\n` +
                `Evening (6pm-12am): ${timeDistribution.evening}\n` +
                `Night (12am-6am): ${timeDistribution.night}`,
            inline: false 
        });

        // Add top questions
        let topQuestionsText = '';
        questions.forEach((q, index) => {
            // Ensure counts are valid
            const count = typeof q.count === 'number' ? q.count : 0;
            
            // Ensure firstAsked date is valid
            let dateStr = 'Unknown';
            try {
                if (q.firstAsked) {
                    const date = new Date(q.firstAsked);
                    if (!isNaN(date.getTime())) {
                        dateStr = date.toLocaleDateString();
                    }
                }
            } catch (e) {
                console.error('Error formatting date:', e);
            }
            
            topQuestionsText += `${index + 1}. "${q.questionContent.substring(0, 50)}${q.questionContent.length > 50 ? '...' : ''}" - Asked ${count} times (first: ${dateStr})\n`;
        });

        embed.addFields({
            name: `Top ${questions.length} Questions`,
            value: topQuestionsText || 'No questions found',
            inline: false
        });

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