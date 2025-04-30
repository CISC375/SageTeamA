import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonInteraction,
	ButtonStyle,
	ChatInputCommandInteraction,
	EmbedBuilder,
	Events,
	InteractionResponse,
	ModalBuilder,
	StringSelectMenuInteraction,
	TextInputBuilder,
	TextInputStyle,
} from "discord.js";
import { Command } from "@lib/types/Command";
import { DB } from "@root/config";

export default class extends Command {
	description = "Provides list of all saved FAQs questions.";
	runInDM = false;

	async run(
		interaction: ChatInputCommandInteraction
	): Promise<InteractionResponse<boolean> | void> {
		setupCategoryHandler(interaction.client);

		const channelName = interaction.channel?.parent?.name || "";
		const isCourseChannel = channelName.startsWith("CISC");

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
			if (category === "Course") {
				if (isCourseChannel) {
					buttonRow.addComponents(
						new ButtonBuilder()
							.setCustomId(
								`faq_Course/${channelName.split("/CISC ")[1]}`
							)
							.setLabel(`${channelName}`)
							.setStyle(ButtonStyle.Secondary)
					);
				} else {
					buttonRow.addComponents(
						new ButtonBuilder()
							.setCustomId("faq_course_modal")
							.setLabel("Course")
							.setStyle(ButtonStyle.Secondary)
					);
				}
			} else {
				buttonRow.addComponents(
					new ButtonBuilder()
						.setCustomId(`faq_${category}`)
						.setLabel(category)
						.setStyle(ButtonStyle.Secondary)
				);
			}
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
				if (interaction.customId === "faq_course_modal") {
					return showCourseIdModal(interaction);
				}
				return handleButton(interaction);
			}
		} else if (interaction.isModalSubmit()) {
			if (interaction.customId === "faq_course_modal") {
				return handleModalSubmit(interaction);
			}
		}
	};
	client.on(Events.InteractionCreate, interactionListener);
}

export async function showCourseIdModal(interaction: ButtonInteraction) {
	const modal = new ModalBuilder()
		.setCustomId("faq_course_modal")
		.setTitle("Enter Course ID")
		.addComponents(
			new ActionRowBuilder<TextInputBuilder>().addComponents(
				new TextInputBuilder()
					.setCustomId("course_id_input")
					.setLabel("Course ID")
					.setPlaceholder("e.g., 367")
					.setStyle(TextInputStyle.Short)
					.setRequired(true)
			)
		);

	await interaction.showModal(modal);
}

export async function handleButton(interaction: ButtonInteraction) {
	const category = interaction.customId.replace("faq_", "");

	try {
		if (category.startsWith("Course")) {
			const channelName = interaction.channel?.name || "";
			const isCourseChannel = channelName.startsWith("CISC");

			if (category === "Course" && !isCourseChannel) {
				return await showCourseIdModal(interaction);
			} else {
				const courseCategory = `Course/${channelName}`;
				return await sendFaqEmbed(interaction, courseCategory);
			}
		}

		await sendFaqEmbed(interaction, category);
	} catch (err) {
		// DiscordAPIError[10062]: Unknown interaction
		if (err.code === 10062) {
			// silently ignore expired or already acknowledged interaction
		} else {
			console.error("handleButton error:", err);
		}
	}
}

export async function handleSelect(interaction: StringSelectMenuInteraction) {
	try {
		const selectedCategory = interaction.values[0];
		await sendFaqEmbed(interaction, selectedCategory);
	} catch (err) {
		if (err.code === 10062) {
			// silently ignore expired or already acknowledged interaction
		} else {
			console.error("handleSelect error:", err);
		}
	}
}

export async function handleModalSubmit(interaction) {
	try {
		const input = interaction.fields
			.getTextInputValue("course_id_input")
			.trim();

		const category = `Course/${input}`;
		await sendFaqEmbed(interaction, category);
	} catch (err) {
		if (err.code === 10062) {
			// silently ignore expired or already acknowledged interaction
		} else {
			console.error("handleModalSubmit error:", err);
		}
	}
}

export async function sendFaqEmbed(interaction, category) {
	const channelName = interaction.channel?.parent?.name || "";
	const isCourseChannel = channelName.startsWith("CISC");

	if (category.startsWith("Course") && isCourseChannel) {
		category = `Course/${channelName.split("CISC ")[1]}`;
	}
	const faqs = await interaction.client.mongo
		.collection(DB.FAQS)
		.find({ category: { $regex: `^${category}(/|$)` } })
		.toArray();

	var allCategories = await interaction.client.mongo
		.collection(DB.FAQS)
		.distinct("category");

	allCategories = allCategories
		.map((cat) => cat.split("/")[0])
		.filter((value, index, self) => self.indexOf(value) === index);

	const rows = [];
	let currentRow = new ActionRowBuilder<ButtonBuilder>();
	for (const [index, cat] of allCategories.entries()) {
		const topCat = cat.split("/")[0];

		if (topCat === "Course") {
			if (isCourseChannel) {
				currentRow.addComponents(
					new ButtonBuilder()
						.setCustomId(
							`faq_Course/${channelName.split("/CISC ")[1]}`
						)
						.setLabel(`${channelName}`)
						.setStyle(ButtonStyle.Secondary)
				);
			} else if (currentRow.components.find) {
				currentRow.addComponents(
					new ButtonBuilder()
						.setCustomId("faq_course_modal")
						.setLabel("Course")
						.setStyle(ButtonStyle.Secondary)
				);
			}
		} else {
			currentRow.addComponents(
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

		if ((index + 1) % 5 === 0) {
			rows.push(currentRow);
			currentRow = new ActionRowBuilder<ButtonBuilder>();
		}
	}

	if (currentRow.components.length > 0) {
		rows.push(currentRow);
	}

	if (faqs.length === 0) {
		const errorEmbed = new EmbedBuilder()
			.setColor("#FF0000")
			.setTitle("Error")
			.setDescription(`❌ No FAQs found for category: **${category}**`);
		return interaction.update({
			content: "",
			embeds: [errorEmbed],
			components: rows,
		});
	}

	const embed = new EmbedBuilder()
		.setTitle(`📁 ${category.split("/")[0]}`)
		.setDescription(
			faqs.map((f, i) => `**Q${i + 1}.** ${f.question}`).join("\n\n")
		)
		.setTimestamp();

	if (category.startsWith("Course")) {
		embed.setTitle(`📁 CISC ${category.split("/")[1]}`);
	}

	return interaction.update({
		content: `📚 **Frequently Asked Questions**\n\u200b`,
		embeds: [embed],
		components: rows,
	});
}
