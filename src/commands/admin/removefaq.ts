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
import { DB } from '@root/src/pieces/config';

export default class extends Command {

	description = 'Removes existing frequently asked questions from FAQ list.';
	runInDM = false;
	permissions: ApplicationCommandPermissions[] = [ADMIN_PERMS];

	async run(interaction: ChatInputCommandInteraction) {
		// Set up the category handler to process category selection
		setupCategoryHandler(interaction.client);

		// Retrieve distinct categories from the database
		const categories = await interaction.client.mongo
			.collection(DB.FAQS)
			.distinct('category');

		// Extract top-level categories
		const topCategories = categories
			.map((cat) => cat.split('/')[0])
			.filter((value, index, self) => self.indexOf(value) === index);

		// Create a select menu for categories
		const categorySelectMenu = new StringSelectMenuBuilder()
			.setCustomId('select_category')
			.setPlaceholder('Select a category')
			.addOptions(
				topCategories.map((category) => ({
					label: category,
					value: category
				}))
			);

		// Create an action row with the select menu
		const row
			= new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				categorySelectMenu
			);

		// Send a reply with the category select menu
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

	// Retrieve distinct categories from the database
	const categories = await interaction.client.mongo
		.collection(DB.FAQS)
		.distinct('category');

	// Extract subcategories
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

		// Create a select menu for subcategories
		const subCategoryMenu = new StringSelectMenuBuilder()
			.setCustomId('select_subcategory')
			.setPlaceholder('Select a subcategory')
			.addOptions(
				subCategories.map((sub) => ({
					label: sub,
					value: `${selectedCategory}/${sub}`
				}))
			);

		// Create an action row with the select menu
		const row
			= new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				subCategoryMenu
			);

		// Update the reply with the subcategory select menu
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

	await showQuestions(interaction, selectedSubcategory);
}

async function showQuestions(
	interaction: StringSelectMenuInteraction,
	category: string
) {
	await interaction.deferUpdate();

	// Retrieve questions from the database for the selected category
	const questions = await interaction.client.mongo
		.collection(DB.FAQS)
		.find({ category })
		.toArray();

	// If no questions are found, send a message
	if (questions.length === 0) {
		const errorEmbed = new EmbedBuilder()
			.setColor('#FF0000')
			.setTitle('Error')
			.setDescription(`No questions found for **${category}**.`);
		return interaction.editReply({ content: '', embeds: [errorEmbed], components: [] });
	}

	// Create a select menu for questions
	const questionMenu = new StringSelectMenuBuilder()
		.setCustomId('select_question')
		.setPlaceholder('Select a question to delete')
		.addOptions(
			questions.map((qna) => ({
				label: qna.question,
				value: qna.question
			}))
		);

	// Create an action row with the select menu
	const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
		questionMenu
	);

	// Update the reply with the question select menu
	await interaction.editReply({
		content: `Select a question to delete from **${category}**:`,
		components: [row]
	});
}

export async function handleQuestionSelection(
	interaction: StringSelectMenuInteraction
) {
	const selectedQuestion = interaction.values[0];

	// Create an embed to confirm the question deletion
	const confirmEmbed = new EmbedBuilder()
		.setColor('#FF0000')
		.setTitle('Confirm Deletion')
		.setDescription(
			`Are you sure you want to delete this question?\n\n**${selectedQuestion}**`
		);

	// Create buttons for confirmation and cancellation
	const confirmButton = new ButtonBuilder()
		.setCustomId('confirm_delete')
		.setLabel('Yes')
		.setStyle(ButtonStyle.Danger);

	const cancelButton = new ButtonBuilder()
		.setCustomId('cancel_delete')
		.setLabel('Cancel')
		.setStyle(ButtonStyle.Secondary);

	// Create an action row with the buttons
	const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
		confirmButton,
		cancelButton
	);

	// Update the interaction with the confirmation embed and buttons
	await interaction.update({
		content: 'Please confirm your action.',
		embeds: [confirmEmbed],
		components: [buttonRow]
	});
}

export async function deleteQuestion(interaction: StringSelectMenuInteraction) {
	await interaction.deferUpdate();

	// Extract the question to be deleted from the embed description
	const embed = interaction.message.embeds[0];
	if (!embed || !embed.description) {
		const errorEmbed = new EmbedBuilder()
			.setColor('#FF0000')
			.setTitle('Error')
			.setDescription(`No question found to delete.`);
		return interaction.update({ content: '', embeds: [errorEmbed], components: [] });
	}

	const removing = embed.description.split('**')[1];

	// Delete the question from the database
	const result = await interaction.client.mongo
		.collection(DB.FAQS)
		.deleteOne({ question: removing });

	if (result.deletedCount === 0) {
		// If deletion failed, send a failure message
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

	// Remove the FAQ from the database
	await interaction.client.mongo
		.collection(DB.FAQS)
		.deleteOne({ question: removing });

	// Create an embed to show the success message
	const responseEmbed = new EmbedBuilder()
		.setColor('#00FF00')
		.setTitle('FAQ Removed!')
		.setDescription(`The question has been removed successfully from the FAQ list.`)
		.addFields({ name: '\u200B', value: '\u200B' },
			{ name: 'Question', value: removing });

	// Send the success message
	await interaction.editReply({
		content: '',
		embeds: [responseEmbed],
		components: []
	});
}
