import { ADMIN_PERMS } from '@lib/permissions';
import { Command } from '@lib/types/Command';
import { ApplicationCommandOptionData, ApplicationCommandOptionType, ApplicationCommandPermissions, 
    ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { DB } from '@root/config';

export default class extends Command {

    description = 'View usage analytics for FAQs';
    runInDM = false;
    permissions: ApplicationCommandPermissions[] = [ADMIN_PERMS];

    options: ApplicationCommandOptionData[] = [
        {
            name: 'filter',
            description: 'Choose a category to filter by',
            type: ApplicationCommandOptionType.String,
            required: false,
            choices: [
                { name: 'Show All FAQs', value: 'all' },
                { name: 'Job/Interview', value: 'Job/Interview' },
                { name: 'Class Registration', value: 'Class Registration' },
                { name: 'General', value: 'General' },
                { name: 'Server Questions', value: 'Server Questions' }
            ]
        },
        {
            name: 'showdetails',
            description: 'Show detailed stats for individual FAQs',
            type: ApplicationCommandOptionType.Boolean,
            required: false
        }
    ];

    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply({ ephemeral: true });
        
        const filterCategory = interaction.options.getString('filter');
        const showDetails = interaction.options.getBoolean('showdetails') || false;
        
        // Create the database filter
        const dbFilter = (filterCategory && filterCategory !== 'all') ? 
            { _id: { $regex: '^faq_stats_' }, category: filterCategory } : 
            { _id: { $regex: '^faq_stats_' } };
        
        // Get FAQ statistics from database
        const faqStats = await interaction.client.mongo.collection(DB.CLIENT_DATA)
            .find(dbFilter)
            .toArray();
        
        if (!faqStats || faqStats.length === 0) {
            await interaction.editReply({ content: 'No FAQ usage statistics found.' });
            return;
        }
        
        // Sort by most used
        faqStats.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
        
        // Create summary embed
        const embed = new EmbedBuilder()
            .setTitle('FAQ Usage Analytics')
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
        
        await interaction.editReply({ embeds: [embed] });
    }
} 