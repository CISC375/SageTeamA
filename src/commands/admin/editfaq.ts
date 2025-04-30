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
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle
} from 'discord.js';
import { DB } from '@root/config';

const userStates = new Map<string, { category: string; subcategory?: string; question?: string }>();

export default class extends Command {

	description = 'Edits existing frequently asked questions.';
	runInDM = false;
	permissions: ApplicationCommandPermissions[] = [ADMIN_PERMS];

	async run(interaction: ChatInputCommandInteraction) {
		// Set up the category handler to process category selection
		setupCategoryHandler(interaction);

		handleCategorySelection(interaction);
		return;
	}

}

export async function setupCategoryHandler(interaction) {
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
			if (interaction.customId === 'modify_qna') {
				await handleModifyQuestion(interaction);
				// Remove listener after a short delay to prevent duplicates
				setTimeout(() => {
					interaction.client.removeListener(Events.InteractionCreate, interactionListener);
				}, 1000);
			} else if (interaction.customId === 'cancel_modify') {
				await interaction.update({
					content: '',
					embeds: [new EmbedBuilder()
						.setColor('#000000')
						.setTitle('Edition canceled.')
						.setDescription(`The question has not been edited.`)],
					components: []
				});
				// Remove listener after a short delay to prevent duplicates
				setTimeout(() => {
					interaction.client.removeListener(Events.InteractionCreate, interactionListener);
				}, 1000);
			} else if (interaction.customId === 'back_to_previous') {
				const userState = userStates[userId];

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
	interaction.client.on(Events.InteractionCreate, interactionListener);
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

	// Create a button to cancel the edition process
	const cancelButton = new ButtonBuilder()
		.setCustomId('cancel_modify')
		.setLabel('Cancel')
		.setStyle(ButtonStyle.Secondary);

	// Create ction rows with the select menu and cancel button
	const categoryRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
		categorySelectMenu
	);

	const cancelRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
		cancelButton
	);

	// Send a reply with the category select menu and cancel button
	if (interaction.isButton()) {
		await interaction.update({
			content: 'Select a category to edit questions from:',
			embeds: [],
			components: [categoryRow, cancelRow]
		});
	} else {
		await interaction.reply({
			content: 'Select a category to edit questions from:',
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

		// Create a button to cancel the edition process
		const cancelButton = new ButtonBuilder()
			.setCustomId('cancel_modify')
			.setLabel('Cancel')
			.setStyle(ButtonStyle.Secondary);

		// Create action rows with the select menu and buttons
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
		.setPlaceholder('Select a question to edit')
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

	// Create a button to cancel the edition process
	const cancelButton = new ButtonBuilder()
		.setCustomId('cancel_modify')
		.setLabel('Cancel')
		.setStyle(ButtonStyle.Secondary);

	// Create actions row with the select menu and buttons
	const questionRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
		questionMenu
	);

	const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
		cancelButton,
		backButton
	);

	// Update the reply with the question select menu and cancel button
	await interaction.editReply({
		content: `Select a question to edit from **${category}**:`,
		embeds: [],
		components: [questionRow, buttonRow]
	});
}

export async function handleQuestionConfirmation(
	interaction: StringSelectMenuInteraction
) {
	const selectedQuestion = interaction.values ? interaction.values[0] : userStates[interaction.user.id].question;

	// Create an embed to confirm the question modification
	const confirmEmbed = new EmbedBuilder()
		.setColor('#FF0000')
		.setTitle('Edit Question')
		.setDescription(
			`Do you want to modify the question\n**"${selectedQuestion}"**?`
		);

	// Create buttons for confirmation and cancellation
	const backButton = new ButtonBuilder()
		.setCustomId('back_to_previous')
		.setLabel('No')
		.setStyle(ButtonStyle.Secondary);

	const confirmButton = new ButtonBuilder()
		.setCustomId('modify_qna')
		.setLabel('Yes')
		.setStyle(ButtonStyle.Danger);

	// Create an action row and add the buttons to it
	const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
		confirmButton,
		backButton
	);

	// Update the reply with the confirmation embed and buttons
	await interaction.update({
		content: 'Please confirm your action.',
		embeds: [confirmEmbed],
		components: [buttonRow]
	});
}

export async function handleModifyQuestion(interaction) {
	// Extract the selected question from the embed description
	const selectedQuestion = interaction.message.embeds[0].description.split('**')[1].replace(/^"|"$/g, '');

	// Retrieve the question data from the database
	const questionData = await interaction.client.mongo
		.collection(DB.FAQS)
		.findOne({ question: selectedQuestion });

	if (!questionData) {
		// If the question is not found, send an error message
		await interaction.reply({
			content: `The question **${selectedQuestion}** could not be found.`,
			ephemeral: true
		});
		return;
	}

	// Create a modal for editing the question
	const modal = new ModalBuilder()
		.setCustomId('modify_question_modal')
		.setTitle('Edit Question');

	// Create input fields for the modal
	const questionInput = new TextInputBuilder()
		.setCustomId('question')
		.setLabel('Question')
		.setStyle(TextInputStyle.Short)
		.setValue(questionData.question)
		.setRequired(true);

	const answerInput = new TextInputBuilder()
		.setCustomId('answer')
		.setLabel('Answer')
		.setStyle(TextInputStyle.Paragraph)
		.setValue(questionData.answer)
		.setRequired(true);

	const categoryInput = new TextInputBuilder()
		.setCustomId('category')
		.setLabel('Category')
		.setStyle(TextInputStyle.Short)
		.setValue(questionData.category)
		.setRequired(true);

	const linkInput = new TextInputBuilder()
		.setCustomId('link')
		.setLabel('Useful Link')
		.setStyle(TextInputStyle.Short)
		.setValue(questionData.link)
		.setRequired(false);

	// Add input fields to the modal
	modal.addComponents(
		new ActionRowBuilder<TextInputBuilder>().addComponents(questionInput),
		new ActionRowBuilder<TextInputBuilder>().addComponents(answerInput),
		new ActionRowBuilder<TextInputBuilder>().addComponents(categoryInput),
		new ActionRowBuilder<TextInputBuilder>().addComponents(linkInput)
	);

	// Set up the modal handler to process the modal submission
	setupModalHandler(interaction.client);

	// Show the modal to the user
	await interaction.showModal(modal);
}

export async function handleModalSubmit(interaction) {
	if (interaction.customId === 'modify_question_modal') {
		await interaction.deferUpdate();

		// Retrieve new values from the modal input fields
		const newQuestion = interaction.fields.getTextInputValue('question');
		const newAnswer = interaction.fields.getTextInputValue('answer');
		const newCategory = interaction.fields.getTextInputValue('category');
		const newLink = interaction.fields.getTextInputValue('link');

		// Extract the old question from the message embed
		const oldQuestion = interaction.message.embeds[0].description.split('**')[1].replace(/^"|"$/g, '');

		// Update the FAQ in the database with the new values
		const result = await interaction.client.mongo
			.collection(DB.FAQS)
			.updateOne(
				{ question: oldQuestion },
				{
					$set: {
						question: newQuestion,
						answer: newAnswer,
						category: newCategory,
						link: newLink
					}
				}
			);

		// Check if the update was successful
		if (result.modifiedCount === 0) {
			const errorEmbed = new EmbedBuilder()
				.setColor('#FF0000')
				.setTitle('Error')
				.setDescription(`Failed to modify the question **${oldQuestion}**.`);
			return interaction.editReply({ content: '', embeds: [errorEmbed], components: [] });
		}

		// Create an embed to show the success message
		const responseEmbed = new EmbedBuilder()
			.setColor('#00FF00')
			.setTitle('FAQ Modified!')
			.setDescription(`The question has been modified successfully.`)
			.addFields({ name: '\u200B', value: '\u200B' },
				{ name: '❓ Question', value: newQuestion },
				{ name: '💬 Answer', value: newAnswer, inline: true },
				{ name: '\u200B', value: '\u200B' },
				{ name: '📁 Category', value: newCategory},
				{ name: '🔗 Useful Link', value: newLink}
			);

		// Send the success message
		await interaction.editReply({
			content: '', embeds: [responseEmbed], components: []
		});
	}
}


export async function setupModalHandler(client) {
	client.once(Events.InteractionCreate, async (interaction) => {
		if (interaction.isModalSubmit()) {
			await handleModalSubmit(interaction);
		}
	});
}
