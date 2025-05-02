import { Command } from '@lib/types/Command';
import { ADMIN_PERMS } from '@lib/permissions';
import {
	ApplicationCommandPermissions,
	ChatInputCommandInteraction,
	InteractionResponse,
	EmbedBuilder
} from 'discord.js';
import { DB } from '@root/config';

export default class extends Command {

	description = 'Imports a .json file full of FAQs.';
	permissions: ApplicationCommandPermissions[] = [ADMIN_PERMS];

	async run(interaction: ChatInputCommandInteraction): Promise<InteractionResponse<boolean> | void> {
		await interaction.reply({
			content: 'Please upload a `.json` file with one or more FAQs (question, answer, category, link (optional)).',
			ephemeral: true
		});

		const collector = interaction.channel?.createMessageCollector({
			filter: msg => msg.author.id === interaction.user.id && msg.attachments.size > 0,
			time: 60_000,
			max: 1
		});

		collector?.on('collect', async msg => {
			const file = msg.attachments.first();
			if (!file || !file.name?.endsWith('.json')) {
				return msg.reply('❌ Please upload a valid `.json` file.');
			}

			try {
				const response = await fetch(file.url);
				const json = await response.json();

				if (!Array.isArray(json)) {
					return msg.reply('❌ The file must contain an array of FAQ objects.');
				}

				const faqCollection = interaction.client.mongo.collection(DB.FAQS);

				// check for valid faqs
				const validFAQs = json.filter(faq =>
					faq.question && faq.answer && faq.category
				);

				if (validFAQs.length === 0) {
					return msg.reply('❌ No valid FAQ entries found in the file.');
				}

				// check for duplicates
				const uniqueFAQs = [];

				for (const faq of validFAQs) {
					const duplicate = await faqCollection.findOne({
						question: faq.question,
						answer: faq.answer,
						category: faq.category
					});

					if (!duplicate) {
						uniqueFAQs.push(faq);
					}
				}

				if (uniqueFAQs.length === 0) {
					return msg.reply('⚠️ All uploaded FAQs already exist.');
				}

				const result = await faqCollection.insertMany(uniqueFAQs);

				const embed = new EmbedBuilder()
					.setColor('#00FF00')
					.setTitle('✅ FAQs Imported')
					.setDescription(`${result.insertedCount} new FAQ(s) added. Skipped ${validFAQs.length - result.insertedCount} duplicate(s).`);

				await msg.reply({ embeds: [embed] });
			} catch (err) {
				console.error(err);
				await msg.reply('❌ Failed to process the uploaded file.');
			}
		});

		collector?.on('end', collected => {
			if (collected.size === 0) {
				interaction.followUp({
					content: '⏱️ Import timed out. Please try again.',
					ephemeral: true
				});
			}
		});
	}

}
