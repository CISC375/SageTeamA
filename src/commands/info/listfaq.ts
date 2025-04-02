import { ChannelType, ChatInputCommandInteraction, EmbedBuilder, InteractionResponse } from 'discord.js';
import { Command } from '@lib/types/Command';
import { DB } from '@root/config';

export default class extends Command {

	description = 'Provides list of all saved FAQs questions.';
	runInDM = false;

	async run(interaction: ChatInputCommandInteraction): Promise<InteractionResponse<boolean> | void> {
		const questions = await interaction.client.mongo
			.collection(DB.FAQS)
			.distinct('question');

		if (questions.length === 0) {
			return interaction.reply({ content: 'No FAQs found.', ephemeral: true });
		}

		const embed = new EmbedBuilder()
			.setTitle('Frequently Asked Questions')
			.setTimestamp()
			.setDescription(questions.map((q, i) => `**Q${i + 1}.** ${q}`).join('\n\n'));
			;

		return interaction.reply({ embeds: [embed] });
	}

}
