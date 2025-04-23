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
            name: 'detailed',
            description: 'Show detailed information for each FAQ',
            type: ApplicationCommandOptionType.Boolean,
            required: false,
        }
    ];

    async run(interaction: ChatInputCommandInteraction): Promise<InteractionResponse<boolean> | void> {
        const timeframe = interaction.options.getString('timeframe') || 'all';
        const user = interaction.options.getUser('user');
        const detailed = interaction.options.getBoolean('detailed') || false;
        
        // Always show the category selection menu
        return this.showCategorySelection(interaction, timeframe, user, detailed);
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
            { label: 'Show All FAQs', value: 'all', emoji: '📊' }
        ];
        
        // Add each category as an option
        if (categories && categories.length > 0) {
            categories.forEach(category => {
                categoryOptions.push({ 
                    label: category, 
                    value: category,
                    emoji: '📁' 
                });
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
            content: `📊 **Select a category to view FAQ statistics${timeframeDesc}${userDesc}:**`,
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
            
            try {
                // Process the category selection
                const category = interaction.values[0];
                await this.handleFAQAnalytics(interaction, category, timeframe, user, showDetails);
            } catch (error) {
                console.error('Error in analytics handler:', error);
            } finally {
                // Clean up the listener after processing
                client.removeListener(Events.InteractionCreate, analyticsHandler);
            }
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
        try {
            // If it's a StringSelectMenuInteraction, need to defer update
            if (interaction.isStringSelectMenu?.()) {
                await interaction.deferUpdate().catch(err => console.error('Defer update error:', err));
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
                const noDataEmbed = new EmbedBuilder()
                    .setTitle('❓ No FAQ Statistics Found')
                    .setDescription(`No FAQ usage statistics found for the selected criteria.`)
                    .setColor('#FF9900')
                    .setTimestamp();
                    
                if (category && category !== 'all') {
                    noDataEmbed.addFields({
                        name: '📁 Category Filter',
                        value: `No data found for category: ${category}`
                    });
                }
                
                if (timeframe !== 'all') {
                    noDataEmbed.addFields({
                        name: '📅 Time Filter',
                        value: `Timeframe: ${timeframe === 'today' ? 'Today' : `Past ${timeframe}`}`
                    });
                }
                
                if (user) {
                    noDataEmbed.addFields({
                        name: '👤 User Filter',
                        value: `User: ${user.username}`
                    });
                }
                
                noDataEmbed.addFields({
                    name: '💡 Suggestion',
                    value: 'Try selecting different filter options or choose "All" categories for a broader view.'
                });
                
                const reply = {
                    content: 'No FAQ usage statistics found for the selected criteria.',
                    embeds: [noDataEmbed],
                    components: []
                };
                
                if (interaction.isStringSelectMenu?.()) {
                    await interaction.editReply(reply).catch(err => console.error('Edit reply error:', err));
                } else {
                    await interaction.reply({ ...reply, ephemeral: true }).catch(err => console.error('Reply error:', err));
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
                
            // Add a thumbnail based on the timeframe (only if the method exists - for test compatibility)
            const thumbnailUrl = timeframe === 'today' ? 
                'https://cdn.discordapp.com/emojis/1042281048302166128.webp' : // Calendar icon
                'https://cdn.discordapp.com/emojis/1023541030455058472.webp';  // Chart icon
            if (typeof embed.setThumbnail === 'function') {
                embed.setThumbnail(thumbnailUrl);
            }
            
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
            
            // Add separator
            embed.addFields({ name: '\u200B', value: '▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬' });
            
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
                    .map(([cat, count]) => `📁 **${cat}**: ${count} uses (${Math.round((count as number / totalUsage) * 100)}%)`)
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
                    // Add separator
                    embed.addFields({ name: '\u200B', value: '▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬' });
                    
                    const totalFeedback = totalPositiveFeedback + totalNegativeFeedback;
                    const feedbackRate = totalFeedback > 0 ? 
                        `${Math.round((totalFeedback / totalUsage) * 100)}% feedback rate` : 
                        'No feedback recorded';
                    
                    const feedbackBreakdown = totalFeedback > 0 ? 
                        `👍 ${totalPositiveFeedback} (${Math.round((totalPositiveFeedback / totalFeedback) * 100)}%)\n` +
                        `👎 ${totalNegativeFeedback} (${Math.round((totalNegativeFeedback / totalFeedback) * 100)}%)` :
                        'No feedback data';
                        
                    embed.addFields({ name: '💬 Feedback Statistics', value: `${feedbackRate}\n${feedbackBreakdown}` });
                }
            }
            
            // If detailed view is requested, show info for each FAQ
            if (showDetails) {
                // Add separator
                embed.addFields({ name: '\u200B', value: '▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬' });
                
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
                        lastUsedText = `\n⏱️ Last used: <t:${Math.floor(stat.lastUsed / 1000)}:R>`;
                    }
                    
                    // Show user-specific usage history if filtering by user
                    let userHistoryText = '';
                    if (user && stat.usageHistory) {
                        const userUsages = stat.usageHistory.filter(usage => usage.userId === user.id);
                        if (userUsages.length > 0) {
                            // Show the most recent usage time
                            const mostRecent = Math.max(...userUsages.map(u => u.timestamp));
                            userHistoryText = `\n⏱️ Last used by ${user.username}: <t:${Math.floor(mostRecent / 1000)}:R>`;
                        }
                    }
                    
                    return `**📝 ${question}**\n💡 Used ${usageCount} times${user ? ` by ${user.username}` : ''}${feedbackText}${user ? userHistoryText : lastUsedText}`;
                }).join('\n\n');
                
                if (detailedStats) {
                    embed.addFields({ name: '📄 Top FAQ Details', value: detailedStats });
                } else {
                    embed.addFields({ name: '📄 Top FAQ Details', value: 'No detailed data available' });
                }
            }
            
            // Send the response
            const reply = {
                content: null,
                embeds: [embed],
                components: [] // No components/dropdowns in the response
            };
            
            if (interaction.isStringSelectMenu?.()) {
                await interaction.editReply(reply).catch(err => console.error('Final edit reply error:', err));
            } else {
                await interaction.reply(reply).catch(err => console.error('Final reply error:', err));
            }
        } catch (error) {
            console.error('Error in handleFAQAnalytics:', error);
            try {
                if (interaction.isStringSelectMenu?.()) {
                    // Only try to respond if we haven't already
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ 
                            content: 'An error occurred while processing your request.', 
                            ephemeral: true 
                        });
                    }
                }
            } catch (responseError) {
                console.error('Could not send error response:', responseError);
            }
        }
    }
} 