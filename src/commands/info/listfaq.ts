import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonInteraction,
	ButtonStyle,
	ChatInputCommandInteraction,
	EmbedBuilder,
	Events,
	InteractionResponse,
} from "discord.js";
import { Command } from "@lib/types/Command";
import { DB } from "@root/config";

export default class extends Command {
	description = "Provides list of all saved FAQs questions.";
	runInDM = false;

	async run(interaction: ChatInputCommandInteraction): Promise<InteractionResponse<boolean> | void> {
		setupCategoryHandler(interaction.client);

		var categories = await interaction.client.mongo
			.collection(DB.FAQS)
			.distinct("category");

		categories = categories
			.map((cat) => cat.split("/")[0])
			.filter((value, index, self) => self.indexOf(value) === index);

		if (categories.length === 0) {
			const errorEmbed = new EmbedBuilder()
				.setColor("#FF0000")
				.setTitle("Error")
				.setDescription(`❌ No FAQs found.`);
			return interaction.reply({
				content: "",
				embeds: [errorEmbed],
				components: [],
			});
		}

		const buttonRow = new ActionRowBuilder<ButtonBuilder>();
		for (const category of categories) {
			buttonRow.addComponents(
				new ButtonBuilder()
					.setCustomId(`faq_${category}`)
					.setLabel(category)
					.setStyle(ButtonStyle.Secondary)
			);
		}

		return interaction.reply({
			content: `📚 **Frequently Asked Questions**\n⠀\nChoose a category:`,
			embeds: [],
			components: [buttonRow],
		});
	}
}

export async function setupCategoryHandler(client) {
	// Listener function to handle all relevant user interactions
	const interactionListener = async (interaction) => {
		const userId = interaction.user.id;

		// Handle button interactions
		if (interaction.isButton()) {
			if (interaction.customId.startsWith("faq_")) {
				return handleButton(interaction);
			}
		}
	};
	client.on(Events.InteractionCreate, interactionListener);
}

export async function handleButton(interaction: ButtonInteraction) {
	const category = interaction.customId.replace("faq_", "");

	const faqs = await interaction.client.mongo
		.collection(DB.FAQS)
		.find({ category })
		.toArray();

	if (faqs.length === 0) {
		const errorEmbed = new EmbedBuilder()
			.setColor("#FF0000")
			.setTitle("Error")
			.setDescription(`❌ No FAQs found for category: **${category}**`);
		return interaction.update({
			content: "",
			embeds: [errorEmbed],
			components: [],
		});
	}

	const embed = new EmbedBuilder()
		.setTitle(`📁 ${category.split("/")[0]}`)
		.setDescription(
			faqs.map((f, i) => `**Q${i + 1}.** ${f.question}`).join("\n\n")
		)
		.setTimestamp();

	const allCategories = await interaction.client.mongo
		.collection(DB.FAQS)
		.distinct("category");

	const row = new ActionRowBuilder<ButtonBuilder>();
	for (const cat of allCategories) {
		const topCat = cat.split("/")[0];
		row.addComponents(
			new ButtonBuilder()
				.setCustomId(`faq_${cat}`)
				.setLabel(topCat)
				.setStyle(
					cat === category
						? ButtonStyle.Primary
						: ButtonStyle.Secondary
				)
		);
	}

	return interaction.update({
		content:`📚 **Frequently Asked Questions**\n\u200b`,
		embeds: [embed],
		components: [row],
	});
}
