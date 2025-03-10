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
	TextInputStyle,
	Component
} from 'discord.js';
import { DB } from '@root/config';

export default class extends Command {

	description = 'Edits existing frequently asked questions.';
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
		.setPlaceholder('Select a question to edit')
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
		content: `Select a question to edit from **${category}**:`,
		components: [row]
	});
}

export async function handleQuestionSelection(
	interaction: StringSelectMenuInteraction
) {
	const selectedQuestion = interaction.values[0];

	const confirmEmbed = new EmbedBuilder()
		.setColor('#FF0000')
		.setTitle('Edit Question')
		.setDescription(
			`Do you want to modify the question\n**"${selectedQuestion}"**?`
		);

	const confirmButton = new ButtonBuilder()
		.setCustomId('modify_qna')
		.setLabel('Yes')
		.setStyle(ButtonStyle.Danger);

	const cancelButton = new ButtonBuilder()
		.setCustomId('cancel_modify')
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

export async function handleModifyQuestion(interaction) {
	const selectedQuestion = interaction.message.embeds[0].description.split('**')[1].replace(/^"|"$/g, '');

	const questionData = await interaction.client.mongo
		.collection(DB.FAQS)
		.findOne({ question: selectedQuestion });

	if (!questionData) {
		await interaction.reply({
			content: `The question **${selectedQuestion}** could not be found.`,
			ephemeral: true
		});
		return;
	}

	const modal = new ModalBuilder()
		.setCustomId('modify_question_modal')
		.setTitle('Edit Question');

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

	modal.addComponents(
		new ActionRowBuilder<TextInputBuilder>().addComponents(questionInput),
		new ActionRowBuilder<TextInputBuilder>().addComponents(answerInput),
		new ActionRowBuilder<TextInputBuilder>().addComponents(categoryInput),
		new ActionRowBuilder<TextInputBuilder>().addComponents(linkInput)
	);

	setupModalHandler(interaction.client);

	await interaction.showModal(modal);
}

export async function handleModalSubmit(interaction) {
	if (interaction.customId === 'modify_question_modal') {
		await interaction.deferUpdate();

		const newQuestion = interaction.fields.getTextInputValue('question');
		const newAnswer = interaction.fields.getTextInputValue('answer');
		const newCategory = interaction.fields.getTextInputValue('category');
		const newLink = interaction.fields.getTextInputValue('link');

		const oldQuestion = interaction.message.embeds[0].description.split('**')[1].replace(/^"|"$/g, '');

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

		if (result.modifiedCount === 0) {
			await interaction.editReply({
				content: `Failed to modify the question **${oldQuestion}**.`,
				embeds: [],
				components: [],
				ephemeral: true
			});
			return;
		}
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

		await interaction.editReply({
			content: '', embeds: [responseEmbed], components: [], ephemeral: true
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
