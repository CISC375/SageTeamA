import { ApplicationCommandOptionData, ApplicationCommandOptionType, AttachmentBuilder, ChatInputCommandInteraction, InteractionResponse } from 'discord.js';
import { Command } from '@lib/types/Command';
import { DB } from '@root/config';
import { ADMIN_PERMS } from '@lib/permissions';

export default class extends Command {
    description = 'Export question data to a CSV file';
    permissions = [ADMIN_PERMS];
    options: ApplicationCommandOptionData[] = [
        {
            name: 'timeframe',
            description: 'Timeframe to export data for',
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
            description: 'Export questions for a specific user',
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

        // Get the questions from the database
        const questions = await interaction.client.mongo.collection(DB.BOT_RESPONSES)
            .find(query)
            .sort({ count: -1 })
            .toArray();

        if (questions.length === 0) {
            return interaction.reply({
                content: 'No questions found for the selected criteria.',
                ephemeral: true
            });
        }

        // Generate CSV
        let csv = 'Question,Count,First Asked,Response Type\n';
        
        questions.forEach(question => {
            // Escape fields that might contain commas or quotes
            const escapeCSV = (field: string) => {
                if (!field) return '';
                // Replace newlines with space
                field = field.replace(/\n/g, ' ');
                // Escape quotes
                field = field.replace(/"/g, '""');
                // If field contains commas, quotes, or newlines, wrap in quotes
                if (field.includes(',') || field.includes('"') || field.includes('\n')) {
                    field = `"${field}"`;
                }
                return field;
            };
            
            // Get formatted date or use default
            let dateStr = 'Unknown';
            try {
                if (question.firstAsked) {
                    const date = new Date(question.firstAsked);
                    if (!isNaN(date.getTime())) {
                        dateStr = date.toISOString();
                    }
                }
            } catch (e) {
                console.error('Error formatting date:', e);
            }
            
            // Ensure count is a number
            const count = typeof question.count === 'number' ? question.count : 0;
            
            csv += `${escapeCSV(question.questionContent)},`;
            csv += `${count},`;
            csv += `${dateStr},`;
            csv += `${question.responseType || 'unknown'}\n`;
        });

        // Create a second CSV for instances
        let instancesCSV = 'Question,User ID,Username,Asked At,Channel ID\n';
        let instanceCount = 0;
        
        questions.forEach(question => {
            if (question.instances && Array.isArray(question.instances)) {
                question.instances.forEach(instance => {
                    const escapeCSV = (field: string) => {
                        if (!field) return '';
                        field = field.replace(/\n/g, ' ');
                        field = field.replace(/"/g, '""');
                        if (field.includes(',') || field.includes('"') || field.includes('\n')) {
                            field = `"${field}"`;
                        }
                        return field;
                    };
                    
                    // Get formatted timestamp or use default
                    let timestampStr = 'Unknown';
                    try {
                        if (instance.timestamp) {
                            const timestamp = new Date(instance.timestamp);
                            if (!isNaN(timestamp.getTime())) {
                                timestampStr = timestamp.toISOString();
                            }
                        }
                    } catch (e) {
                        console.error('Error formatting timestamp:', e);
                    }
                    
                    instancesCSV += `${escapeCSV(question.questionContent)},`;
                    instancesCSV += `${instance.userId || 'unknown'},`;
                    instancesCSV += `${escapeCSV(instance.userName || 'unknown')},`;
                    instancesCSV += `${timestampStr},`;
                    instancesCSV += `${instance.channelId || 'unknown'}\n`;
                    instanceCount++;
                });
            }
        });

        // Create timestamp for filenames
        const date = new Date();
        const dateString = date.toISOString().split('T')[0];
        
        // Create attachments
        const questionsAttachment = new AttachmentBuilder(Buffer.from(csv, 'utf-8'), { 
            name: `questions_summary_${dateString}.csv`,
            description: 'Summary of questions asked'
        });
        
        const instancesAttachment = new AttachmentBuilder(Buffer.from(instancesCSV, 'utf-8'), { 
            name: `question_instances_${dateString}.csv`,
            description: 'Detailed instances of questions asked'
        });

        return interaction.reply({
            content: `Exported ${questions.length} questions with ${instanceCount} total instances.`,
            files: [questionsAttachment, instancesAttachment],
            ephemeral: false
        });
    }
} 