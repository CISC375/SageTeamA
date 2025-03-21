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
import { DB } from '@root/src/pieces/config';

export default class extends Command {

	description = 'Edits existing frequently asked questions.';
	runInDM = false;
	permissions: ApplicationCommandPermissions[] = [ADMIN_PERMS];

	async run(interaction: ChatInputCommandInteraction) {
		// Set up the category handler to process category selection
		setupCategoryHandler(interaction.client);

		// Retrieve distinct categories from the database
		const categories = await interaction.client.mongo
			.collection(DB.FAQ)
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

		// Create an action row and add the select menu to it
		const row
			= new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				categorySelectMenu
			);

		// Send a reply with the category select menu
		await interaction.reply({
			content: 'Select a category to edit questions from:',
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
			if (interaction.customId === 'modify_qna') {
				await handleModifyQuestion(interaction);
				setTimeout(() => {
					client.removeListener(Events.InteractionCreate, interactionListener);
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
				setTimeout(() => {
					client.removeListener(Events.InteractionCreate, interactionListener);
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
		.collection(DB.FAQ)
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

		// Create an action row and add the select menu to it
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
		.collection(DB.FAQ)
		.find({ category })
		.toArray();

	// If no questions are found, send a message
	if (questions.length === 0) {
		await interaction.editReply({
			content: `No questions found for **${category}**.`,
			components: []
		});
		return;
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

	// Create an action row and add the select menu to it
	const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
		questionMenu
	);

	// Update the reply with the question select menu
	await interaction.editReply({
		content: `Select a question to edit from **${category}**:`,
		components: [row]
	});
}

export async function handleQuestionSelection(
	interaction: StringSelectMenuInteraction
) {
	const selectedQuestion = interaction.values[0];

	// Create an embed to confirm the question modification
	const confirmEmbed = new EmbedBuilder()
		.setColor('#FF0000')
		.setTitle('Edit Question')
		.setDescription(
			`Do you want to modify the question\n**"${selectedQuestion}"**?`
		);

	// Create buttons for confirmation and cancellation
	const confirmButton = new ButtonBuilder()
		.setCustomId('modify_qna')
		.setLabel('Yes')
		.setStyle(ButtonStyle.Danger);

	const cancelButton = new ButtonBuilder()
		.setCustomId('cancel_modify')
		.setLabel('Cancel')
		.setStyle(ButtonStyle.Secondary);

	// Create an action row and add the buttons to it
	const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
		confirmButton,
		cancelButton
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
		.collection(DB.FAQ)
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
		.setRequired(true);

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
			.collection(DB.FAQ)
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
				{ name: 'Question', value: newQuestion },
				{ name: 'Answer', value: newAnswer, inline: true },
				{ name: '\u200B', value: '\u200B' },
				{ name: 'Category', value: newCategory, inline: true },
				{ name: 'Useful Link', value: newLink, inline: true }
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
