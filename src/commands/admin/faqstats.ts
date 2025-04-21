import { ApplicationCommandOptionData, ApplicationCommandOptionType, ChatInputCommandInteraction, EmbedBuilder, InteractionResponse, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuInteraction, Events } from 'discord.js';
import { Command } from '@lib/types/Command';
import { DB } from '@root/config';
import { ADMIN_PERMS } from '@lib/permissions';

export default class extends Command {
    description = 'View detailed FAQ usage statistics';
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
            description: 'View FAQs used by a specific user',
            type: ApplicationCommandOptionType.User,
            required: false
        },
        {
			name: 'category',
			description: 'Filter by FAQ category',
			type: ApplicationCommandOptionType.String,
			required: false,
			choices: [
			  { name: '📁 Job/Interview', value: 'Job/Interview' },
			  { name: '📁 Class Registration', value: 'Class Registration' },
			  { name: '📁 General', value: 'General' },
			  { name: '📁 Server Questions', value: 'Server Questions' },
			  { name: '📊 All FAQs', value: 'all' }
			]
		  }
		  
    ];

    // Static method to get categories from the database
    static async getCategories(client: any): Promise<string[]> {
        // Hard coded categories from the FAQs collection
        return [
            'Job/Interview',
            'Class Registration',
            'General',
            'Server Questions'
        ];
    }

    async run(interaction: ChatInputCommandInteraction): Promise<InteractionResponse<boolean> | void> {
		const timeframe = interaction.options.getString('timeframe') || 'all';
		const user = interaction.options.getUser('user');
		const categoryFilter = interaction.options.getString('category') || 'all';
	
		return this.handleFAQAnalytics(interaction, categoryFilter, timeframe, user);
	}
	

    // Handle autocomplete for category parameter
    async autocomplete(interaction: any): Promise<void> {
        const focusedValue = interaction.options.getFocused();
        
        try {
            // Get hard coded categories
            const categories = [
                'Job/Interview',
                'Class Registration',
                'General',
                'Server Questions'
            ];
            
            // Filter categories based on user input
            const filtered = categories.filter(category => 
                category.toLowerCase().includes(focusedValue.toLowerCase())
            );
            
            // Add "All FAQs" option
            const options = [
                { name: '📊 All FAQs', value: 'all' }
            ];
            
            // Add filtered categories
            filtered.forEach(category => {
                options.push({ name: `📁 ${category}`, value: category });
            });
            
            // Limit to 25 options (Discord limit)
            const limitedOptions = options.slice(0, 25);
            
            await interaction.respond(limitedOptions);
        } catch (error) {
            console.error('Error in autocomplete:', error);
            await interaction.respond([{ name: '📊 All FAQs', value: 'all' }]);
        }
    }
    
    private setupAnalyticsHandler(client: any, timeframe: string, user: any) {
        // Remove any existing listener with the same name to prevent duplicates
        const existingListeners = client.listeners(Events.InteractionCreate);
        for (const listener of existingListeners) {
            if (listener.name === 'faqStatsHandler') {
                client.removeListener(Events.InteractionCreate, listener);
            }
        }
        
        // Create a named function so we can reference it later
        const analyticsHandler = async (interaction: any) => {
            try {
                // Handle string select menus with our custom ID
                if (interaction.isStringSelectMenu() && interaction.customId === 'faq_stats_category') {
                    const category = interaction.values[0];
                    await this.handleFAQAnalytics(interaction, category, timeframe, user);
                }
            } catch (error) {
                console.error('Error handling FAQ stats interaction:', error);
                const errorMessage = {
                    content: '❌ An error occurred while processing your request. Please try again.',
                    ephemeral: true
                };
                
                if (interaction.isStringSelectMenu()) {
                    await interaction.editReply(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
            
            // Clean up the listener after processing
            setTimeout(() => {
                client.removeListener(Events.InteractionCreate, analyticsHandler);
            }, 1000);
        };
        
        // Name the function for identification
        Object.defineProperty(analyticsHandler, 'name', { value: 'faqStatsHandler' });
        
        // Add the listener
        client.on(Events.InteractionCreate, analyticsHandler);
    }
    
    // Handle the FAQ analytics with all filters applied
    private async handleFAQAnalytics(
        interaction: any,
        category: string,
        timeframe: string, 
        user: any
    ) {
        // If it's a StringSelectMenuInteraction, need to defer update
        if (interaction.isStringSelectMenu()) {
            await interaction.deferUpdate();
        }
        
        // Create the database filter
        let dbFilter: any = { _id: { $regex: '^faq_stats_' } };
        
        // Apply category filter if specified and not 'all'
        if (category && category !== 'all') {
            dbFilter.category = category;
        }
        
        // Apply time filter if not 'all'
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
            
            dbFilter.lastUsed = { $gte: startDate.getTime() };
        }
        
        // Apply user filter if specified
        const userFilter = user ? { 'usageHistory.userId': user.id } : {};
        
        // Get FAQ statistics from database
        let faqStats = await interaction.client.mongo.collection(DB.CLIENT_DATA)
            .find({ ...dbFilter, ...userFilter })
            .toArray();
        
        // If no user filter was applied directly, we need to filter after fetching
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
        
        if (!faqStats || faqStats.length === 0) {
            const reply = {
                content: '❌ No FAQ usage statistics found for the selected criteria.',
                components: [],
                embeds: []
            };
            
            if (interaction.isStringSelectMenu()) {
                await interaction.editReply(reply);
            } else {
                await interaction.reply(reply);
            }
            return;
        }
        
        // Sort by most used
        faqStats.sort((a, b) => {
            // If filtering by user, sort by user's usage count
            if (user) {
                return (b.userCount || 0) - (a.userCount || 0);
            }
            // Otherwise, sort by total usage
            return (b.usageCount || 0) - (a.usageCount || 0);
        });
        
        // Create summary embed
        const embed = new EmbedBuilder()
            .setTitle(`📊 FAQ Usage Statistics${category !== 'all' ? ` - ${category}` : ''}`)
            .setColor('#00AAFF')
            .setTimestamp();
        
        // Add timeframe info to description
        let description = '';
        if (timeframe !== 'all') {
            description += `📅 Statistics for ${timeframe === 'today' ? 'today' : `the past ${timeframe}`}`;
        }
        
        // Add user filter info to description
        if (user) {
            description += description ? '\n' : '';
            description += `👤 Filtered for user: ${user.username}`;
        }
        
        if (description) {
            embed.setDescription(description);
        }
        
        // Count total usage
        const totalUsage = user 
            ? faqStats.reduce((total, stat) => total + (stat.userCount || 0), 0)
            : faqStats.reduce((total, stat) => total + (stat.usageCount || 0), 0);
            
        embed.addFields({ 
            name: '📈 Total FAQ Usage', 
            value: `${totalUsage} times${user ? ` by ${user.username}` : ''}` 
        });
        
        // Process by category
        const categoryStats = {};
        faqStats.forEach(stat => {
            if (stat.category) {
                const count = user ? (stat.userCount || 0) : (stat.usageCount || 0);
                categoryStats[stat.category] = (categoryStats[stat.category] || 0) + count;
            }
        });
        
        // Add category breakdown
        if (Object.keys(categoryStats).length > 0) {
            const categoryBreakdown = Object.entries(categoryStats)
                .sort((a, b) => (b[1] as number) - (a[1] as number))
                .map(([cat, count]) => `📁 ${cat}: ${count} uses (${Math.round((count as number / totalUsage) * 100)}%)`)
                .join('\n');
            
            embed.addFields({ name: '📊 Usage by Category', value: categoryBreakdown });
        }
        
        // Add feedback stats if not filtered by user (as feedback isn't user-specific)
        if (!user) {
            const totalPositiveFeedback = faqStats.reduce((total, stat) => 
                total + ((stat.feedback?.positive || 0)), 0);
            const totalNegativeFeedback = faqStats.reduce((total, stat) => 
                total + ((stat.feedback?.negative || 0)), 0);
            
            if (totalPositiveFeedback || totalNegativeFeedback) {
                const totalFeedback = totalPositiveFeedback + totalNegativeFeedback;
                const feedbackRate = totalFeedback > 0 ? 
                    `${Math.round((totalFeedback / totalUsage) * 100)}% feedback rate` : 
                    'No feedback recorded';
                
                const feedbackBreakdown = totalFeedback > 0 ? 
                    `👍 ${totalPositiveFeedback} (${Math.round((totalPositiveFeedback / totalFeedback) * 100)}%)\n` +
                    `👎 ${totalNegativeFeedback} (${Math.round((totalNegativeFeedback / totalFeedback) * 100)}%)` :
                    'No feedback data';
                    
                embed.addFields({ name: '⭐ Feedback Statistics', value: `${feedbackRate}\n${feedbackBreakdown}` });
            }
        }
        
        // Always show detailed info for each FAQ
        const topFaqs = faqStats.slice(0, 10); // Limit to top 10 to avoid message limit
        
        const detailedStats = topFaqs.map(stat => {
            const question = stat.question || 'Unknown Question';
            const usageCount = user ? (stat.userCount || 0) : (stat.usageCount || 0);
            
            let feedbackText = '';
            if (!user) { // Only show feedback if not filtering by user
                const positiveFeedback = stat.feedback?.positive || 0;
                const negativeFeedback = stat.feedback?.negative || 0;
                const totalFeedback = positiveFeedback + negativeFeedback;
                
                if (totalFeedback > 0) {
                    const positivePercent = Math.round((positiveFeedback / totalFeedback) * 100);
                    feedbackText = `\n⭐ Feedback: 👍 ${positiveFeedback} (${positivePercent}%) | 👎 ${negativeFeedback} (${100 - positivePercent}%)`;
                }
            }
            
            let lastUsedText = '';
            if (stat.lastUsed) {
                lastUsedText = `\n🕒 Last used: <t:${Math.floor(stat.lastUsed / 1000)}:R>`;
            }
            
            // Show user-specific usage history if filtering by user
            let userHistoryText = '';
            if (user && stat.usageHistory) {
                const userUsages = stat.usageHistory.filter(usage => usage.userId === user.id);
                if (userUsages.length > 0) {
                    // Show the most recent usage time
                    const mostRecent = Math.max(...userUsages.map(u => u.timestamp));
                    userHistoryText = `\n🕒 Last used by ${user.username}: <t:${Math.floor(mostRecent / 1000)}:R>`;
                }
            }
            
            return `**❓ ${question}**\n📊 Used ${usageCount} times${user ? ` by ${user.username}` : ''}${feedbackText}${user ? userHistoryText : lastUsedText}`;
        }).join('\n\n');
        
        embed.addFields({ name: '📋 Top FAQ Details', value: detailedStats || 'No detailed data available' });
        
        // Send the response
        const reply = {
            content: null,
            embeds: [embed],
            components: [] // No components in the response
        };
        
        if (interaction.isStringSelectMenu()) {
            await interaction.editReply(reply);
        } else {
            await interaction.reply(reply);
        }
    }
} 