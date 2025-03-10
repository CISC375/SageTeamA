import { ADMIN_PERMS } from '@lib/permissions';
import { Command } from '@lib/types/Command';
import {
	ActionRowBuilder,
	StringSelectMenuBuilder,
	StringSelectMenuInteraction,
	ChatInputCommandInteraction,
	EmbedBuilder,
	ApplicationCommandPermissions,
	Events,
	ButtonBuilder,
	ButtonStyle
} from 'discord.js';
import { DB } from '@root/config';

export default class extends Command {

	description = 'Removes existing frequently asked questions from FAQ list.';
	runInDM = false;
	permissions: ApplicationCommandPermissions[] = [ADMIN_PERMS];

	async run(interaction: ChatInputCommandInteraction) {
		if (interaction.replied || interaction.deferred) {
			return;
		}
		setupCategoryHandler(interaction.client);

		const categories = await interaction.client.mongo
			.collection(DB.FAQS)
			.distinct('category');

		const topCategories = categories
			.map((cat) => cat.split('/')[0])
			.filter((value, index, self) => self.indexOf(value) === index);

		const categorySelectMenu = new StringSelectMenuBuilder()
			.setCustomId('select_category')
			.setPlaceholder('Select a category')
			.addOptions(
				topCategories.map((category) => ({
					label: category,
					value: category
				}))
			);

		const row
			= new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				categorySelectMenu
			);

		await interaction.reply({
			content: 'Select a category to delete questions from:',
			components: [row],
			ephemeral: true
		});
		return;
	}

}

export async function setupCategoryHandler(client) {
	const interactionListener = async (interaction) => {
		if (interaction.isStringSelectMenu()) {
			if (interaction.customId === 'select_category') {
				await handleCategorySelection(interaction);
			} else if (interaction.customId === 'select_subcategory') {
				await handleSubcategorySelection(interaction);
			} else if (interaction.customId === 'select_question') {
				await handleQuestionSelection(interaction);
			}
		} else if (interaction.isButton()) {
			if (interaction.customId === 'confirm_delete') {
				await deleteQuestion(interaction);
				setTimeout(() => {
					client.removeListener(Events.InteractionCreate, interactionListener);
					console.log('Removed listener for category selection.');
				}, 1000);
			} else if (interaction.customId === 'cancel_delete') {
				await interaction.update({
					content: '',
					embeds: [new EmbedBuilder()
						.setColor('#000000')
						.setTitle('Deletion canceled.')
						.setDescription(`The question has not been removed.`)],
					components: []
				});
				setTimeout(() => {
					client.removeListener(Events.InteractionCreate, interactionListener);
					console.log('Removed listener for category selection.');
				}, 1000);
			}
		}
	};
	client.on(Events.InteractionCreate, interactionListener);
}

export async function handleCategorySelection(
	interaction: StringSelectMenuInteraction
) {
	const selectedCategory = interaction.values[0];

	if (interaction.replied || interaction.deferred) {
		return;
	}

	const categories = await interaction.client.mongo
		.collection(DB.FAQS)
		.distinct('category');

	const subCategories = categories
		.filter(
			(cat) =>
				cat.startsWith(`${selectedCategory}/`)
				&& cat !== selectedCategory
		)
		.map((cat) => cat.split('/')[1])
		.filter((value, index, self) => self.indexOf(value) === index);
	if (subCategories.length > 0) {
		await interaction.deferUpdate();

		const subCategoryMenu = new StringSelectMenuBuilder()
			.setCustomId('select_subcategory')
			.setPlaceholder('Select a subcategory')
			.addOptions(
				subCategories.map((sub) => ({
					label: sub,
					value: `${selectedCategory}/${sub}`
				}))
			);

		const row
			= new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				subCategoryMenu
			);

		await interaction.editReply({
			content: `You selected **${selectedCategory}**. Now select a subcategory:`,
			components: [row]
		});
	} else {
		await showQuestions(interaction, selectedCategory);
	}
}

export async function handleSubcategorySelection(
	interaction: StringSelectMenuInteraction
) {
	const selectedSubcategory = interaction.values[0];

	if (interaction.replied || interaction.deferred) {
		return;
	}

	await showQuestions(interaction, selectedSubcategory);
}

async function showQuestions(
	interaction: StringSelectMenuInteraction,
	category: string
) {
	if (interaction.replied || interaction.deferred) {
		return;
	}

	await interaction.deferUpdate();

	const questions = await interaction.client.mongo
		.collection(DB.FAQS)
		.find({ category })
		.toArray();

	if (questions.length === 0) {
		await interaction.editReply({
			content: `No questions found for **${category}**.`,
			components: []
		});
		return;
	}

	const questionMenu = new StringSelectMenuBuilder()
		.setCustomId('select_question')
		.setPlaceholder('Select a question to delete')
		.addOptions(
			questions.map((qna) => ({
				label: qna.question,
				value: qna.question
			}))
		);

	const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
		questionMenu
	);

	await interaction.editReply({
		content: `Select a question to delete from **${category}**:`,
		components: [row]
	});
}

export async function handleQuestionSelection(
	interaction: StringSelectMenuInteraction
) {
	const selectedQuestion = interaction.values[0];

	const confirmEmbed = new EmbedBuilder()
		.setColor('#FF0000')
		.setTitle('Confirm Deletion')
		.setDescription(
			`Are you sure you want to delete this question?\n\n**${selectedQuestion}**`
		);

	const confirmButton = new ButtonBuilder()
		.setCustomId('confirm_delete')
		.setLabel('Yes')
		.setStyle(ButtonStyle.Danger);

	const cancelButton = new ButtonBuilder()
		.setCustomId('cancel_delete')
		.setLabel('Cancel')
		.setStyle(ButtonStyle.Secondary);

	const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
		confirmButton,
		cancelButton
	);

	await interaction.update({
		content: 'Please confirm your action.',
		embeds: [confirmEmbed],
		components: [buttonRow]
	});
}

export async function deleteQuestion(interaction: StringSelectMenuInteraction) {
	await interaction.deferUpdate();

	const embed = interaction.message.embeds[0];
	if (!embed || !embed.description) {
		await interaction.update({
			content: 'No question found to delete.',
			components: []
		});
		return;
	}

	const removing = embed.description.split('**')[1];

	const result = await interaction.client.mongo
		.collection(DB.FAQS)
		.deleteOne({ question: removing });

	if (result.deletedCount === 0) {
		await interaction.update({
			content: ``,
			embeds: [new EmbedBuilder()
				.setColor('#FF0000')
				.setTitle('Deletion Failed')
				.setDescription(
					`Failed to delete the question\n**${removing}**.`
				)],
			components: []
		});
		return;
	}

	await interaction.client.mongo
		.collection(DB.FAQS)
		.deleteOne({ question: removing });

	const responseEmbed = new EmbedBuilder()
		.setColor('#00FF00')
		.setTitle('FAQ Removed!')
		.setDescription(`The question has been removed successfully from the FAQ list.`)
		.addFields({ name: '\u200B', value: '\u200B' },
			{ name: 'Question', value: removing });

	await interaction.editReply({
		content: '',
		embeds: [responseEmbed],
		components: []
	});
}
