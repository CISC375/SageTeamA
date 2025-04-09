import { ADMIN_PERMS } from '@lib/permissions';
import { Command } from '@lib/types/Command';
import { ApplicationCommandOptionData, ApplicationCommandOptionType, ApplicationCommandPermissions, 
    ChatInputCommandInteraction, EmbedBuilder, Events,
    ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuInteraction } from 'discord.js';
import { DB } from '@root/config';

export default class extends Command {

    description = 'View usage analytics for FAQs';
    runInDM = false;
    permissions: ApplicationCommandPermissions[] = [ADMIN_PERMS];

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

    // Only the showdetails option in the slash command
    options: ApplicationCommandOptionData[] = [
        {
            name: 'showdetails',
            description: 'Show detailed stats for individual FAQs',
            type: ApplicationCommandOptionType.Boolean,
            required: false
        }
    ];

    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        const showDetails = interaction.options.getBoolean('showdetails') || false;
        
        // Set up handler for category selection
        this.setupAnalyticsHandler(interaction.client);
        
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
            .setCustomId('faq_analytics_category')
            .setPlaceholder('Select a category to filter by')
            .addOptions(categoryOptions);
        
        // Create an action row with the select menu
        const row = new ActionRowBuilder<StringSelectMenuBuilder>()
            .addComponents(categorySelectMenu);
        
        // Send the initial response with the category dropdown
        await interaction.reply({
            content: 'Select a category to view analytics:',
            components: [row],
            ephemeral: true
        });
    }
    
    private setupAnalyticsHandler(client: any) {
        // Remove any existing listener with the same name to prevent duplicates
        const existingListeners = client.listeners(Events.InteractionCreate);
        for (const listener of existingListeners) {
            if (listener.name === 'faqAnalyticsHandler') {
                client.removeListener(Events.InteractionCreate, listener);
            }
        }
        
        // Create a named function so we can reference it later
        const analyticsHandler = async (interaction: any) => {
            // Only handle string select menus with our custom ID
            if (!interaction.isStringSelectMenu() || interaction.customId !== 'faq_analytics_category') {
                return;
            }
            
            // Process the category selection
            await this.handleCategorySelection(interaction);
            
            // Clean up the listener after processing
            setTimeout(() => {
                client.removeListener(Events.InteractionCreate, analyticsHandler);
            }, 1000);
        };
        
        // Name the function for identification
        Object.defineProperty(analyticsHandler, 'name', { value: 'faqAnalyticsHandler' });
        
        // Add the listener
        client.on(Events.InteractionCreate, analyticsHandler);
    }
    
    private async handleCategorySelection(interaction: StringSelectMenuInteraction) {
        await interaction.deferUpdate();
        
        const filterCategory = interaction.values[0];
        
        // Get the showdetails option from the original command
        let showDetails = false;
        if (interaction.message && interaction.message.interaction) {
            const originalInteraction = interaction.message.interaction;
            if (originalInteraction.commandName === 'faqanalytics') {
                showDetails = false; // Default value since we can't easily access the original options
            }
        }
        
        // Create the database filter
        const dbFilter = (filterCategory && filterCategory !== 'all') ? 
            { _id: { $regex: '^faq_stats_' }, category: filterCategory } : 
            { _id: { $regex: '^faq_stats_' } };
        
        // Get FAQ statistics from database
        const faqStats = await interaction.client.mongo.collection(DB.CLIENT_DATA)
            .find(dbFilter)
            .toArray();
        
        if (!faqStats || faqStats.length === 0) {
            await interaction.editReply({ 
                content: 'No FAQ usage statistics found for the selected category.',
                components: [] // No components/dropdowns in the response
            });
            return;
        }
        
        // Sort by most used
        faqStats.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
        
        // Create summary embed
        const embed = new EmbedBuilder()
            .setTitle(`FAQ Usage Analytics ${filterCategory !== 'all' ? `- ${filterCategory}` : ''}`)
            .setColor('#00AAFF')
            .setTimestamp();
        
        // Count total usage
        const totalUsage = faqStats.reduce((total, stat) => total + (stat.usageCount || 0), 0);
        embed.addFields({ name: 'Total FAQ Usage', value: `${totalUsage} times` });
        
        // Process by category
        const categoryStats = {};
        faqStats.forEach(stat => {
            if (stat.category) {
                categoryStats[stat.category] = (categoryStats[stat.category] || 0) + (stat.usageCount || 0);
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
        
        // Add feedback stats
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
        
        // If detailed view is requested, show info for each FAQ
        if (showDetails) {
            const topFaqs = faqStats.slice(0, 10); // Limit to top 10 to avoid message limit
            
            const detailedStats = topFaqs.map(stat => {
                const question = stat.question || 'Unknown Question';
                const usageCount = stat.usageCount || 0;
                const positiveFeedback = stat.feedback?.positive || 0;
                const negativeFeedback = stat.feedback?.negative || 0;
                const totalFeedback = positiveFeedback + negativeFeedback;
                
                let feedbackText = '';
                if (totalFeedback > 0) {
                    const positivePercent = Math.round((positiveFeedback / totalFeedback) * 100);
                    feedbackText = `\n👍 ${positiveFeedback} (${positivePercent}%) | 👎 ${negativeFeedback} (${100 - positivePercent}%)`;
                }
                
                const lastUsed = stat.lastUsed ? 
                    `\nLast used: <t:${Math.floor(stat.lastUsed / 1000)}:R>` : 
                    '';
                
                return `**${question}**\nUsed ${usageCount} times${feedbackText}${lastUsed}`;
            }).join('\n\n');
            
            embed.addFields({ name: 'Top FAQ Details', value: detailedStats || 'No detailed data available' });
        }
        
        await interaction.editReply({ 
            content: null,
            embeds: [embed],
            components: [] // No components/dropdowns in the response
        });
    }
} 