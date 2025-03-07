import { ADMIN_PERMS } from '@lib/permissions';
import { Command } from '@lib/types/Command';
import { ApplicationCommandPermissions, ChatInputCommandInteraction, ApplicationCommandOptionData, ApplicationCommandOptionType, InteractionResponse, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType } from 'discord.js';
import { DB } from '@root/config';

export default class extends Command {
	description = 'Removes existing frequently asked questions from FAQ list.';
	runInDM = false;
	permissions: ApplicationCommandPermissions[] = [ADMIN_PERMS];

	options: ApplicationCommandOptionData[] = [{
		name: 'category1',
		description: 'Select a category.',
		type: ApplicationCommandOptionType.String,
		required: true,
		autocomplete: true,
	},
	{
		name: 'question',
		description: 'Select the question to remove.',
		type: ApplicationCommandOptionType.String,
		required: true,
		autocomplete: true,
	},
	{
		name: 'category2',
		description: 'Select a subcategory (if available).',
		type: ApplicationCommandOptionType.String,
		required: false,
		autocomplete: true,
	}]

	async autocomplete(interaction) {
		const focusedOption = interaction.options.getFocused(true);
		const allCategories = await interaction.client.mongo.collection(DB.FAQS).distinct('category');
		console.log("categories:"+allCategories)

		if (focusedOption.name === 'category1') {
			const topCategories = [...new Set(allCategories.map(cat => cat.split('/')[0]))];
			const choices = topCategories.map(category => ({ name: category, value: category }));
			return interaction.respond(choices.slice(0, 25));
		}

		if (focusedOption.name === 'category2') {
			const category1 = interaction.options.getString('category1');
			if (!category1) return interaction.respond([]);

			const subCategories = [...new Set(allCategories
				.filter(cat => cat.startsWith(`${category1}/`))
				.map(cat => cat.split('/')[1]))];

			if (subCategories.length === 0) {
				return interaction.respond([]);
			}

			const choices = subCategories.map(subCat => ({ name: `${category1}/${subCat}`, value: `${category1}/${subCat}` }));
			return interaction.respond(choices.slice(0, 25));
		}

		if (focusedOption.name === 'question') {
			const category2 = interaction.options.getString('category2');
			const category1 = interaction.options.getString('category1');

			const selectedCategory = category2 || category1;
			if (!selectedCategory) return interaction.respond([]);

			const questions = await interaction.client.mongo.collection(DB.FAQS).find({ category: selectedCategory }).toArray();
			const choices = questions.map(faq => ({ name: faq.question, value: faq.question }));
			return interaction.respond(choices.slice(0, 25));
		}
	}
	

	async run(interaction: ChatInputCommandInteraction): Promise<InteractionResponse<boolean> | void> {
		const category2 = interaction.options.getString('category2');
		const category1 = interaction.options.getString('category1');
		const question = interaction.options.getString('question');

		const selectedCategory = category2 || category1;

		const faqEntry = await interaction.client.mongo.collection(DB.FAQS).findOne({ category: selectedCategory, question });
		if (!faqEntry) {
			return interaction.reply({ content: '❌ The selected question does not exist.', ephemeral: true });
		}

		const confirmButton = new ButtonBuilder()
			.setCustomId('confirm_delete')
			.setLabel('Delete')
			.setStyle(ButtonStyle.Danger);

		const cancelButton = new ButtonBuilder()
			.setCustomId('cancel_delete')
			.setLabel('Cancel')
			.setStyle(ButtonStyle.Secondary);

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(confirmButton, cancelButton);

		const confirmationEmbed = new EmbedBuilder()
			.setColor('#FF0000')
			.setTitle('❗ Confirm Deletion')
			.setDescription(`Are you sure you want to delete the following question? This action cannot be undone.`)
			.addFields(
				{ name: 'Category', value: selectedCategory },
				{ name: 'Question', value: question }
			);

		const message = await interaction.reply({ embeds: [confirmationEmbed], components: [row], ephemeral: true });

		const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: 15000 });

		collector.on('collect', async (buttonInteraction) => {
			if (buttonInteraction.user.id !== interaction.user.id) {
				return buttonInteraction.reply({ content: '❌ You are not authorized to perform this action.', ephemeral: true });
			}

			if (buttonInteraction.customId === 'confirm_delete') {
				await interaction.client.mongo.collection(DB.FAQS).deleteOne({ category: selectedCategory, question });
				await buttonInteraction.update({ content: `✅ The question **"${question}"** has been deleted successfully.`, embeds: [], components: [] });
			} else if (buttonInteraction.customId === 'cancel_delete') {
				await buttonInteraction.update({ content: '❌ Deletion has been canceled.', embeds: [], components: [] });
			}

			collector.stop();
		});

		collector.on('end', async () => {
			await message.edit({ components: [] }).catch(() => {});
		});
	}
}