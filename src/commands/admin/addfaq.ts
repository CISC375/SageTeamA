import { ADMIN_PERMS } from '@lib/permissions';
import { Command } from '@lib/types/Command';
import { ApplicationCommandPermissions, ChatInputCommandInteraction, ApplicationCommandOptionData, ApplicationCommandOptionType, InteractionResponse, EmbedBuilder } from 'discord.js';
import { DB } from '@root/config';

export default class extends Command {
	description = 'Adds new frequently asked questions to FAQ list.';
	runInDM = false;
	permissions: ApplicationCommandPermissions[] = [ADMIN_PERMS];

	options: ApplicationCommandOptionData[] = [{
		name: 'question',
		description: 'The question to be added to the FAQ list.',
		type: ApplicationCommandOptionType.String,
		required: true
	}, {
		name: 'answer',
		description: 'The answer to the question.',
		type: ApplicationCommandOptionType.String,
		required: true
	}, {
		name: 'category',
		description: 'The category of the question.',
		type: ApplicationCommandOptionType.String,
		required: true
	}, {
		name: 'link',
		description: 'The useful link to answer the question.',
		type: ApplicationCommandOptionType.String,
		required: true
	}]

	async run (interaction: ChatInputCommandInteraction): Promise<InteractionResponse<boolean> | void> {
		const question = interaction.options.getString('question');
		const answer = interaction.options.getString('answer');
		const category = interaction.options.getString('category');
		const link = interaction.options.getString('link');

		const newFAQ = {
			question: question,
			answer: answer,
			category: category,
			link: link
		}

		await interaction.client.mongo.collection(DB.FAQS).insertOne(newFAQ);
		
		const responseEmbed = new EmbedBuilder()
					.setColor('#000000')
					.setTitle('Adding new FAQ...')
					.setDescription(`The question has been added to the FAQ list.`)
					.addFields({ name: '\u200B', value: '\u200B' },
						{ name: 'Question', value: question },
						{ name: 'Answer', value: answer, inline: true },
						{ name: '\u200B', value: '\u200B' },
						{ name: 'Category', value: category, inline: true },
						{ name: 'Useful Link', value: link, inline: true },
					);
		return interaction.reply({ embeds: [responseEmbed] });
	}
}