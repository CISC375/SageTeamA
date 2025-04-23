import { ApplicationCommandOptionData, ApplicationCommandOptionType, ChatInputCommandInteraction, EmbedBuilder, InteractionResponse, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuInteraction, Events } from 'discord.js';
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
            description: 'Filter by FAQ category (leave empty to select from a list)',
            type: ApplicationCommandOptionType.String,
            required: false,
            autocomplete: false
        },
        {
            name: 'detailed',
            description: 'Show detailed information for each FAQ',
            type: ApplicationCommandOptionType.Boolean,
            required: false,
        }
    ];

    // Static method to get categories from the database
    static async getCategories(client: any): Promise<string[]> {
        if (!client || !client.mongo) {
            return [];
        }
        
        try {
            // Fetch distinct categories from the FAQs collection
            const categories = await client.mongo.collection(DB.FAQS)
                .distinct('category');
            
            // Filter to valid string categories
            return Array.isArray(categories) 
                ? categories.filter(cat => cat && typeof cat === 'string')
                : [];
                
        } catch (error) {
            console.error('Error fetching FAQ categories:', error);
            return [];
        }
    }

    async run(interaction: ChatInputCommandInteraction): Promise<InteractionResponse<boolean> | void> {
        const timeframe = interaction.options.getString('timeframe') || 'all';
        const user = interaction.options.getUser('user');
        const categoryFilter = interaction.options.getString('category');
        const detailed = interaction.options.getBoolean('detailed') || false;
        
        if (categoryFilter) {
            // If a category is specified, handle it directly
            return this.handleFAQAnalytics(interaction, categoryFilter, timeframe, user, detailed);
        } else {
            // Otherwise, show the category selection menu
            return this.showCategorySelection(interaction, timeframe, user, detailed);
        }
    }
    
    // Show the category selection menu
    private async showCategorySelection(
        interaction: ChatInputCommandInteraction,
        timeframe: string,
        user: any,
        showDetails: boolean
    ): Promise<InteractionResponse<boolean> | void> {
        // Set up handler for category selection
        this.setupAnalyticsHandler(interaction.client, timeframe, user, showDetails);
        
        // Fetch categories from the database
        const categories = await (this.constructor as typeof Command & { getCategories: Function })
            .getCategories(interaction.client);
        
        // Create select menu options with Show All first
        const categoryOptions = [
            { label: 'Show All FAQs', value: 'all' }
        ];
        
        // Add each category as an option
        if (categories && categories.length > 0) {
            categories.forEach(category => {
                categoryOptions.push({ label: category, value: category });
            });
        }
        
        // Create a select menu for categories
        const categorySelectMenu = new StringSelectMenuBuilder()
            .setCustomId('faq_stats_category')
            .setPlaceholder('Select a category to filter by')
            .addOptions(categoryOptions);
        
        // Create an action row with the select menu
        const row = new ActionRowBuilder<StringSelectMenuBuilder>()
            .addComponents(categorySelectMenu);
        
        // Prepare timeframe description
        let timeframeDesc = '';
        if (timeframe !== 'all') {
            timeframeDesc = ` for ${timeframe === 'today' ? 'today' : `the past ${timeframe}`}`;
        }
        
        // Add user info if present
        let userDesc = '';
        if (user) {
            userDesc = ` used by ${user.username}`;
        }
        
        // Send the initial response with the category dropdown
        return interaction.reply({
            content: `Select a category to view FAQ statistics${timeframeDesc}${userDesc}:`,
            components: [row],
            ephemeral: true
        });
    }
    
    private setupAnalyticsHandler(client: any, timeframe: string, user: any, showDetails: boolean) {
        // Remove any existing listener with the same name to prevent duplicates
        const existingListeners = client.listeners(Events.InteractionCreate);
        for (const listener of existingListeners) {
            if (listener.name === 'faqStatsHandler') {
                client.removeListener(Events.InteractionCreate, listener);
            }
        }
        
        // Create a named function so we can reference it later
        const analyticsHandler = async (interaction: any) => {
            // Only handle string select menus with our custom ID
            if (!interaction.isStringSelectMenu?.() || interaction.customId !== 'faq_stats_category') {
                return;
            }
            
            // Process the category selection
            const category = interaction.values[0];
            await this.handleFAQAnalytics(interaction, category, timeframe, user, showDetails);
            
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
        user: any,
        showDetails: boolean
    ) {
        // If it's a StringSelectMenuInteraction, need to defer update
        if (interaction.isStringSelectMenu?.()) {
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
                content: 'No FAQ usage statistics found for the selected criteria.',
                components: [],
                embeds: []
            };
            
            if (interaction.isStringSelectMenu?.()) {
                await interaction.editReply(reply);
            } else {
                await interaction.reply({ ...reply, ephemeral: true });
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
            .setTitle(`FAQ Usage Statistics${category !== 'all' ? ` - ${category}` : ''}`)
            .setColor('#00AAFF')
            .setTimestamp();
        
        // Add timeframe info to description
        let description = '';
        if (timeframe !== 'all') {
            description += `Statistics for ${timeframe === 'today' ? 'today' : `the past ${timeframe}`}`;
        }
        
        // Add user filter info to description
        if (user) {
            description += description ? '\n' : '';
            description += `Filtered for user: ${user.username}`;
        }
        
        if (description) {
            embed.setDescription(description);
        }
        
        // Count total usage
        const totalUsage = user 
            ? faqStats.reduce((total, stat) => total + (stat.userCount || 0), 0)
            : faqStats.reduce((total, stat) => total + (stat.usageCount || 0), 0);
            
        embed.addFields({ 
            name: 'Total FAQ Usage', 
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
                .map(([cat, count]) => `${cat}: ${count} uses (${Math.round((count as number / totalUsage) * 100)}%)`)
                .join('\n');
            
            embed.addFields({ name: 'Usage by Category', value: categoryBreakdown });
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
                    
                embed.addFields({ name: 'Feedback Statistics', value: `${feedbackRate}\n${feedbackBreakdown}` });
            }
        }
        
        // If detailed view is requested, show info for each FAQ
        if (showDetails) {
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
                        feedbackText = `\n👍 ${positiveFeedback} (${positivePercent}%) | 👎 ${negativeFeedback} (${100 - positivePercent}%)`;
                    }
                }
                
                let lastUsedText = '';
                if (stat.lastUsed) {
                    lastUsedText = `\nLast used: <t:${Math.floor(stat.lastUsed / 1000)}:R>`;
                }
                
                // Show user-specific usage history if filtering by user
                let userHistoryText = '';
                if (user && stat.usageHistory) {
                    const userUsages = stat.usageHistory.filter(usage => usage.userId === user.id);
                    if (userUsages.length > 0) {
                        // Show the most recent usage time
                        const mostRecent = Math.max(...userUsages.map(u => u.timestamp));
                        userHistoryText = `\nLast used by ${user.username}: <t:${Math.floor(mostRecent / 1000)}:R>`;
                    }
                }
                
                return `**${question}**\nUsed ${usageCount} times${user ? ` by ${user.username}` : ''}${feedbackText}${user ? userHistoryText : lastUsedText}`;
            }).join('\n\n');
            
            embed.addFields({ name: 'Top FAQ Details', value: detailedStats || 'No detailed data available' });
        }
        
        // Send the response
        const reply = {
            content: null,
            embeds: [embed],
            components: [] // No components/dropdowns in the response
        };
        
        if (interaction.isStringSelectMenu?.()) {
            await interaction.editReply(reply);
        } else {
            await interaction.reply(reply);
        }
    }
} 