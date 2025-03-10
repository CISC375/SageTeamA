import { ADMIN_PERMS } from '@lib/permissions';
import { Command } from '@lib/types/Command';
import { ApplicationCommandPermissions,
	ChatInputCommandInteraction,
	InteractionResponse,
	EmbedBuilder,
	TextInputStyle,
	TextInputBuilder,
	ModalBuilder,
	ActionRowBuilder,
	Events } from 'discord.js';
import { DB } from '@root/config';

export default class extends Command {

	description = 'Adds new frequently asked questions to FAQ list.';
	runInDM = false;
	permissions: ApplicationCommandPermissions[] = [ADMIN_PERMS];


	async run(interaction: ChatInputCommandInteraction): Promise<InteractionResponse<boolean> | void> {
		const modal = new ModalBuilder()
			.setCustomId('faqModal')
			.setTitle('Add New FAQ');

		const questionInput = new TextInputBuilder()
			.setCustomId('question')
			.setLabel('Question')
			.setPlaceholder('What is the question you want to add?')
			.setStyle(TextInputStyle.Short)
			.setRequired(true);

		const answerInput = new TextInputBuilder()
			.setCustomId('answer')
			.setLabel('Answer')
			.setPlaceholder('What is the answer of the question?')
			.setStyle(TextInputStyle.Paragraph)
			.setRequired(true);

		const categoryInput = new TextInputBuilder()
			.setCustomId('category')
			.setLabel('Category')
			.setPlaceholder('What is the category of the question?')
			.setStyle(TextInputStyle.Short)
			.setRequired(true);

		const linkInput = new TextInputBuilder()
			.setCustomId('link')
			.setLabel('Useful Link')
			.setPlaceholder('Add useful link to answer the question.')
			.setStyle(TextInputStyle.Short)
			.setRequired(true);

		modal.addComponents(
			new ActionRowBuilder<TextInputBuilder>().addComponents(questionInput),
			new ActionRowBuilder<TextInputBuilder>().addComponents(answerInput),
			new ActionRowBuilder<TextInputBuilder>().addComponents(categoryInput),
			new ActionRowBuilder<TextInputBuilder>().addComponents(linkInput)
		);

		setupModalHandler(interaction.client);

		await interaction.showModal(modal);

		return;
	}

}

export async function handleModalSubmit(interaction) {
	if (interaction.customId === 'faqModal') {
		await interaction.reply({ content: 'Working on it', ephemeral: true });

		const question = interaction.fields.getTextInputValue('question');
		const answer = interaction.fields.getTextInputValue('answer');
		const category = interaction.fields.getTextInputValue('category');
		const link = interaction.fields.getTextInputValue('link');

		const existingFAQ = await interaction.client.mongo.collection(DB.FAQS).findOne({ question: question });

		if (existingFAQ) {
			const errorEmbed = new EmbedBuilder()
				.setColor('#FF0000')
				.setTitle('FAQ Already Exists!')
				.setDescription(`The question "${question}" already exists in the FAQ list.`);
			return interaction.editReply({ embeds: [errorEmbed], ephemeral: true });
		} else {
			const newFAQ = {
				question: question,
				answer: answer,
				category: category,
				link: link
			};

			await interaction.client.mongo.collection(DB.FAQS).insertOne(newFAQ);

			const responseEmbed = new EmbedBuilder()
				.setColor('#00FF00')
				.setTitle('FAQ Added!')
				.setDescription(`The question has been added to the FAQ list.`)
				.addFields({ name: '\u200B', value: '\u200B' },
					{ name: 'Question', value: question },
					{ name: 'Answer', value: answer, inline: true },
					{ name: '\u200B', value: '\u200B' },
					{ name: 'Category', value: category, inline: true },
					{ name: 'Useful Link', value: link, inline: true }
				);
			return interaction.editReply({ content: '', embeds: [responseEmbed], ephemeral: true });
		}
	}
}

export async function setupModalHandler(client) {
	client.once(Events.InteractionCreate, async (interaction) => {
		if (interaction.isModalSubmit()) {
			await handleModalSubmit(interaction);
		}
	});
}
