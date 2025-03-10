import { BOTMASTER_PERMS } from "@lib/permissions";
import { BOT } from "@root/config";
import { Command } from "@lib/types/Command";
import {
	ApplicationCommandOptionData,
	ApplicationCommandOptionType,
	ApplicationCommandPermissions,
	ChatInputCommandInteraction,
	InteractionResponse,
} from "discord.js";

export default class extends Command {
	description = "Suggest a new FAQ entry";
	permissions: ApplicationCommandPermissions[] = BOTMASTER_PERMS;

	options: ApplicationCommandOptionData[] = [
		{
			name: "question",
			description: "The question for the FAQ",
			type: ApplicationCommandOptionType.String,
			required: true,
		},
		{
			name: "answer",
			description: "The answer for the FAQ",
			type: ApplicationCommandOptionType.String,
			required: true,
		},
	];

	async run(
		interaction: ChatInputCommandInteraction
	): Promise<InteractionResponse<boolean> | void> {
		const question = interaction.options.getString("question");
		const answer = interaction.options.getString("answer");

		try {
			// Here you would implement the logic to store the FAQ suggestion
			// This could be in a database, a pending suggestions collection, etc.

			// For example, if using a database:
			// await db.collection('faqSuggestions').add({
			//   question,
			//   answer,
			//   suggestedById: interaction.user.id,
			//   suggestedAt: new Date(),
			//   status: 'pending'
			// });

			// For now, just log the suggestion
			console.log(
				`New FAQ suggestion: Q: ${question} A: ${answer} by ${interaction.user.id}`
			);

			return interaction.reply({
				content: "FAQ suggestion submitted successfully!",
				ephemeral: true,
			});
		} catch (error) {
			console.error("Error suggesting FAQ:", error);
			return interaction.reply({
				content: "There was an error submitting your FAQ suggestion.",
				ephemeral: true,
			});
		}
	}
}
