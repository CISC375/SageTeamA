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
	ButtonStyle,
	ButtonInteraction
} from 'discord.js';
import { DB } from '@root/config';

const userStates = new Map<string, { category: string; subcategory?: string; question?: string }>();

export default class extends Command {

	description = 'Removes existing frequently asked questions from FAQ list.';
	runInDM = false;
	permissions: ApplicationCommandPermissions[] = [ADMIN_PERMS];

	async run(interaction: ChatInputCommandInteraction) {
		// Set up the category handler to process category selection
		setupCategoryHandler(interaction.client);

		handleCategorySelection(interaction);
		return;
	}

}

export async function setupCategoryHandler(client) {
	// Listener function to handle all relevant user interactions
	const interactionListener = async (interaction) => {
		const userId = interaction.user.id;

		// Handle select menu interactions
		if (interaction.isStringSelectMenu()) {
			if (interaction.customId === 'select_category') {
				userStates[userId] = { category: interaction.values[0] };
				await handleSubcategorySelection(interaction);
			} else if (interaction.customId === 'select_subcategory') {
				userStates[userId] = { ...userStates[userId], subcategory: interaction.values[0] };
				await handleQuestionSelection(interaction);
			} else if (interaction.customId === 'select_question') {
				userStates[userId] = { ...userStates[userId], question: interaction.values[0] };
				await handleQuestionConfirmation(interaction);
			}
		}
		// Handle button interactions
		else if (interaction.isButton()) {
			if (interaction.customId === 'confirm_delete') {
				await deleteQuestion(interaction);
				// Remove listener after a short delay to prevent duplicates
				setTimeout(() => {
					client.removeListener(Events.InteractionCreate, interactionListener);
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
				// Remove listener after a short delay to prevent duplicates
				setTimeout(() => {
					client.removeListener(Events.InteractionCreate, interactionListener);
				}, 1000);
			} else if (interaction.customId === 'back_to_previous') {
				const userState = userStates[userId];
				console.log(`category: ${userState.category}, subcategory: ${userState.subcategory}, question: ${userState.question}`);
			
				if (userState.question) {
					delete userState.question;
					await handleQuestionSelection(interaction);
				} else if (userState.subcategory) {
					delete userState.subcategory;
					await handleSubcategorySelection(interaction);
				} else if (userState.category) {
					delete userState.category;
					await handleCategorySelection(interaction);
				}
			}
		}
	};
	client.on(Events.InteractionCreate, interactionListener);
}

export async function handleCategorySelection(interaction) {
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

	// Create a button to cancel the deletion process
	const cancelButton = new ButtonBuilder()
		.setCustomId('cancel_delete')
		.setLabel('Cancel')
		.setStyle(ButtonStyle.Secondary);

	// Create an action row with the select menu and cancel button
	const categoryRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
		categorySelectMenu
	);

	const cancelRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
		cancelButton
	);

	// Send a reply with the category select menu and cancel button
	if (interaction.isButton()) {
		await interaction.update({
			content: 'Select a category to delete questions from:',
			embeds: [],
			components: [categoryRow, cancelRow]
		});
	} else {
		await interaction.reply({
			content: 'Select a category to delete questions from:',
			components: [categoryRow, cancelRow],
			embeds: [],
			ephemeral: true
		});
	}
}

export async function handleSubcategorySelection(
	interaction: StringSelectMenuInteraction
) {
	const selectedCategory = interaction.values ? interaction.values[0] : userStates[interaction.user.id].category;

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

		// Create a back button to return to the previous step
		const backButton = new ButtonBuilder()
		.setCustomId('back_to_previous')
		.setLabel('←')
		.setStyle(ButtonStyle.Secondary);

		// Create a button to cancel the deletion process
		const cancelButton = new ButtonBuilder()
			.setCustomId('cancel_delete')
			.setLabel('Cancel')
			.setStyle(ButtonStyle.Secondary);

		// Create an action row with the select menu
		const subCategoryRow
			= new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				subCategoryMenu
			);

		const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
				cancelButton,
				backButton
			);
		
		// Update the reply with the subcategory select menu and cancel button
		await interaction.editReply({
			content: `You selected **${selectedCategory}**. Now select a subcategory:`,
			embeds: [],
			components: [subCategoryRow, buttonRow]
		});
	} else {
		await showQuestions(interaction, selectedCategory);
	}
}

export async function handleQuestionSelection(
	interaction: StringSelectMenuInteraction
) {
	const userState = userStates[interaction.user.id]

	const selectedSubcategory =
		interaction.values?.[0] ??
		userState.subcategory ??
		userState.category;

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

	// Create a back button to return to the previous step
	const backButton = new ButtonBuilder()
		.setCustomId('back_to_previous')
		.setLabel('←')
		.setStyle(ButtonStyle.Secondary);

	// Create a button to cancel the deletion process
	const cancelButton = new ButtonBuilder()
		.setCustomId('cancel_delete')
		.setLabel('Cancel')
		.setStyle(ButtonStyle.Secondary);

	// Create an action row with the select menu and cancel button
	const questionRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
		questionMenu
	);

	const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
		cancelButton,
		backButton
	);

	// Update the reply with the question select menu
	await interaction.editReply({
		content: `Select a question to delete from **${category}**:`,
		embeds: [],
		components: [questionRow, buttonRow]
	});
}

export async function handleQuestionConfirmation(
	interaction: StringSelectMenuInteraction
) {
	const selectedQuestion = interaction.values ? interaction.values[0] : userStates[interaction.user.id].question;

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

	const backButton = new ButtonBuilder()
		.setCustomId('back_to_previous')
		.setLabel('No')
		.setStyle(ButtonStyle.Secondary);

	// Create an action row with the buttons
	const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
		confirmButton,
		backButton
	);

	// Update the interaction with the confirmation embed and buttons
	await interaction.update({
		content: 'Please confirm your action.',
		embeds: [confirmEmbed],
		components: [buttonRow]
	});
}

export async function deleteQuestion(interaction: ButtonInteraction) {
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
