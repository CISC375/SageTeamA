import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ChannelType, ChatInputCommandInteraction, EmbedBuilder, Events, InteractionResponse } from 'discord.js';
import { Command } from '@lib/types/Command';
import { DB } from '@root/config';

export default class extends Command {

	description = 'Provides list of all saved FAQs questions.';
	runInDM = false;

	async run(interaction: ChatInputCommandInteraction): Promise<InteractionResponse<boolean> | void> {
		setupCategoryHandler(interaction.client);
		
		const categories = await interaction.client.mongo
			.collection(DB.FAQS)
			.distinct('category');

		if (categories.length === 0) {
			return interaction.reply({ content: 'No FAQs found.', ephemeral: true });
		}

		const buttonRow = new ActionRowBuilder<ButtonBuilder>();
		for (const category of categories) {
			buttonRow.addComponents(
				new ButtonBuilder()
					.setCustomId(`faq_${category}`)
					.setLabel(category)
					.setStyle(ButtonStyle.Secondary)
			);
		}

		return interaction.reply({
			content: 'Frequently Asked Questions\nSelect a category to view its FAQs.',
			embeds: [],
			components: [buttonRow],
			ephemeral: true });
	}
}

export async function setupCategoryHandler(client) {
	// Listener function to handle all relevant user interactions
	const interactionListener = async (interaction) => {
		const userId = interaction.user.id;

		// Handle button interactions
		if (interaction.isButton()) {
			if (interaction.customId.startsWith('faq_')) {
				const command = client.commands.get('faq');
				if (command && 'handleButton' in command) {
					return (command as any).handleButton(interaction);
				}
			}
		}
	};
	client.on(Events.InteractionCreate, interactionListener);
}

export async function handleButton(interaction: ButtonInteraction) {
	const category = interaction.customId.replace('faq_', '');

	const faqs = await interaction.client.mongo
		.collection(DB.FAQS)
		.find({ category })
		.toArray();

	console.log(faqs)

	if (faqs.length === 0) {
		return interaction.update({
			content: `❌ No FAQs found for category: **${category}**`,
			components: [],
			embeds: [],
		});
	}

	const embed = new EmbedBuilder()
		.setTitle(`FAQs – ${category}`)
		.setDescription(faqs.map((f, i) => `**Q${i + 1}.** ${f.question}`).join('\n\n'))
		.setTimestamp();

	const allCategories = await interaction.client.mongo
		.collection(DB.FAQS)
		.distinct('category');

	const row = new ActionRowBuilder<ButtonBuilder>();
	for (const cat of allCategories) {
		row.addComponents(
			new ButtonBuilder()
				.setCustomId(`faq_${cat}`)
				.setLabel(cat)
				.setStyle(cat === category ? ButtonStyle.Primary : ButtonStyle.Secondary)
		);
	}

	return interaction.update({
		embeds: [embed],
		components: [row],
		content: '',
	});
}