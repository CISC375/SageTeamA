import { ApplicationCommandOptionData, ApplicationCommandOptionType, AttachmentBuilder, ChatInputCommandInteraction, InteractionResponse } from 'discord.js';
import { Command } from '@lib/types/Command';
import { DB } from '@root/config';
import { ADMIN_PERMS } from '@lib/permissions';

export default class extends Command {
    description = 'Export FAQ usage statistics to a CSV file';
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
            description: 'Export FAQs used by a specific user',
            type: ApplicationCommandOptionType.User,
            required: false
        },
        {
            name: 'category',
            description: 'Filter by FAQ category',
            type: ApplicationCommandOptionType.String,
            required: false
        }
    ];

    async run(interaction: ChatInputCommandInteraction): Promise<InteractionResponse<boolean> | void> {
        const timeframe = interaction.options.getString('timeframe') || 'all';
        const user = interaction.options.getUser('user');
        const categoryFilter = interaction.options.getString('category');

        // Build query based on options
        let query: any = { _id: { $regex: '^faq_stats_' } };

        // Apply category filter if specified
        if (categoryFilter) {
            query.category = categoryFilter;
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
            
            query.lastUsed = { $gte: startDate.getTime() };
        }
        
        // Apply user filter if specified
        const userFilter = user ? { 'usageHistory.userId': user.id } : {};
        
        // Get FAQ statistics from database
        let faqStats = await interaction.client.mongo.collection(DB.CLIENT_DATA)
            .find({ ...query, ...userFilter })
            .toArray();
            
        // If using user filter, additional filtering may be needed
        if (user && faqStats.length > 0) {
            faqStats = faqStats.filter(stat => 
                stat.usageHistory && 
                stat.usageHistory.some(usage => usage.userId === user.id)
            );
            
            // Recalculate usage counts for this specific user
            faqStats.forEach(stat => {
                const userInstances = stat.usageHistory.filter(usage => usage.userId === user.id);
                stat.userCount = userInstances.length;
            });
        }

        if (faqStats.length === 0) {
            return interaction.reply({
                content: 'No FAQ statistics found for the selected criteria.',
                ephemeral: true
            });
        }

        // Generate FAQ summary CSV
        let faqCsv = 'FAQ Question,Total Usage,Category,Positive Feedback,Negative Feedback,Last Used\n';
        
        faqStats.forEach(stat => {
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
            
            // Format date
            let lastUsedStr = 'Unknown';
            try {
                if (stat.lastUsed) {
                    const date = new Date(stat.lastUsed);
                    if (!isNaN(date.getTime())) {
                        lastUsedStr = date.toISOString();
                    }
                }
            } catch (e) {
                console.error('Error formatting date:', e);
            }
            
            // Get usage count based on user filter
            const usageCount = user ? (stat.userCount || 0) : (stat.usageCount || 0);
            
            // Get feedback counts
            const positiveFeedback = stat.feedback?.positive || 0;
            const negativeFeedback = stat.feedback?.negative || 0;
            
            faqCsv += `${escapeCSV(stat.question || 'Unknown Question')},`;
            faqCsv += `${usageCount},`;
            faqCsv += `${escapeCSV(stat.category || 'Unknown')},`;
            faqCsv += `${positiveFeedback},`;
            faqCsv += `${negativeFeedback},`;
            faqCsv += `${lastUsedStr}\n`;
        });

        // Create a second CSV for usage history instances
        let instancesCsv = 'FAQ Question,User ID,Username,Used At\n';
        let instanceCount = 0;
        
        faqStats.forEach(stat => {
            if (stat.usageHistory && Array.isArray(stat.usageHistory)) {
                // If user filter is applied, only include instances for that user
                const relevantHistory = user 
                    ? stat.usageHistory.filter(usage => usage.userId === user.id) 
                    : stat.usageHistory;
                    
                relevantHistory.forEach(instance => {
                    const escapeCSV = (field: string) => {
                        if (!field) return '';
                        field = field.replace(/\n/g, ' ');
                        field = field.replace(/"/g, '""');
                        if (field.includes(',') || field.includes('"') || field.includes('\n')) {
                            field = `"${field}"`;
                        }
                        return field;
                    };
                    
                    // Get formatted timestamp
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
                    
                    instancesCsv += `${escapeCSV(stat.question || 'Unknown Question')},`;
                    instancesCsv += `${instance.userId || 'unknown'},`;
                    instancesCsv += `${escapeCSV(instance.username || 'unknown')},`;
                    instancesCsv += `${timestampStr}\n`;
                    instanceCount++;
                });
            }
        });

        // Create timestamp for filenames
        const date = new Date();
        const dateString = date.toISOString().split('T')[0];
        
        // Create attachments
        const faqsAttachment = new AttachmentBuilder(Buffer.from(faqCsv, 'utf-8'), { 
            name: `faq_summary_${dateString}.csv`,
            description: 'Summary of FAQ usage'
        });
        
        const instancesAttachment = new AttachmentBuilder(Buffer.from(instancesCsv, 'utf-8'), { 
            name: `faq_usage_history_${dateString}.csv`,
            description: 'Detailed history of FAQ usage'
        });

        return interaction.reply({
            content: `Exported ${faqStats.length} FAQs with ${instanceCount} total usages.`,
            files: [faqsAttachment, instancesAttachment],
            ephemeral: false
        });
    }
} 