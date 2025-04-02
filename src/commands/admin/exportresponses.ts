import { ApplicationCommandOptionData, ApplicationCommandOptionType, AttachmentBuilder, ChatInputCommandInteraction, InteractionResponse } from 'discord.js';
import { Command } from '@lib/types/Command';
import { DB } from '@root/config';
import { ADMIN_PERMS } from '@lib/permissions';
import { BotResponseLog } from '@lib/utils/responseLogger';

export default class extends Command {
    description = 'Export bot responses to a CSV file';
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
            description: 'Export responses for a specific user',
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

        // Generate CSV
        let csv = 'Timestamp,User ID,Username,Question Content,Response Content,Channel ID,Guild ID,Response Type\n';
        
        responses.forEach(response => {
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
            
            csv += `${new Date(response.timestamp).toISOString()},`;
            csv += `${response.userId},`;
            csv += `${escapeCSV(response.userName)},`;
            csv += `${escapeCSV(response.questionContent)},`;
            csv += `${escapeCSV(response.responseContent)},`;
            csv += `${response.channelId},`;
            csv += `${response.guildId},`;
            csv += `${response.responseType}\n`;
        });

        // Create buffer from CSV
        const buffer = Buffer.from(csv, 'utf-8');
        
        // Create timestamp for filename
        const date = new Date();
        const dateString = date.toISOString().split('T')[0];
        
        // Create attachment
        const attachment = new AttachmentBuilder(buffer, { 
            name: `bot_responses_${dateString}.csv`,
            description: 'Bot response data export'
        });

        return interaction.reply({
            content: `Exported ${responses.length} bot responses to CSV.`,
            files: [attachment],
            ephemeral: false
        });
    }
} 