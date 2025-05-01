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
		// Set up button and modal interaction handlers
		setupCategoryHandler(interaction.client);

		const channelName = interaction.channel?.parent?.name || "";
		const isCourseChannel = channelName.startsWith("CISC");

		// Fetch all unique FAQ categories from database
		var categories = await interaction.client.mongo
			.collection(DB.FAQS)
			.distinct("category");

		// Filter to top-level categories only (e.g., without subcategories)
		categories = categories
			.map((cat) => cat.split("/")[0])
			.filter((value, index, self) => self.indexOf(value) === index);

		if (categories.length === 0) {
			// If there are no FAQs at all
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
		// Create one button for each top-level category
		for (const category of categories) {
			if (category === "Course") {
				// Special handling: show course ID if in a course channel, otherwise open modal
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
				// Normal category button
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
	// Register interaction handlers for buttons and modals
	const interactionListener = async (interaction) => {

		// Handle button interactions
		if (interaction.isButton()) {
			if (interaction.customId.startsWith("faq_")) {
				if (interaction.customId === "faq_course_modal") {
					return showCourseIdModal(interaction);
				}
				return handleButton(interaction);
			}
		} else if (interaction.isModalSubmit()) {
			// Handle modal submissions
			if (interaction.customId === "faq_course_modal") {
				return handleModalSubmit(interaction);
			}
		}
	};
	client.on(Events.InteractionCreate, interactionListener);
}

// Show a modal to input the course ID
export async function showCourseIdModal(interaction: ButtonInteraction) {
	try {
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
	} catch (err) {
		// Handle expired or already acknowledged interactions
		if (err.code === 10062) {
			// silently ignore expired or already acknowledged interaction
		} else {
			console.error("showCourseIdModal error:", err);
		}
	}
}

// Handle button interactions for FAQ categories
export async function handleButton(interaction: ButtonInteraction) {
	const category = interaction.customId.replace("faq_", "");

	try {
		if (category.startsWith("Course")) {
			const channelName = interaction.channel?.name || "";
			const isCourseChannel = channelName.startsWith("CISC");

			if (category === "Course" && !isCourseChannel) {
				// Show modal if the user is not in a course channel
				return await showCourseIdModal(interaction);
			} else {
				// Handle course-specific FAQ categories
				const courseCategory = `Course/${channelName}`;
				return await sendFaqEmbed(interaction, courseCategory);
			}
		}

		await sendFaqEmbed(interaction, category);
	} catch (err) {
		// Handle expired or already acknowledged interactions
		if (err.code === 10062) {
			// silently ignore expired or already acknowledged interaction
		} else {
			console.error("handleButton error:", err);
		}
	}
}

// Handle modal submissions for course ID input
export async function handleModalSubmit(interaction) {
	try {
		const input = interaction.fields
			.getTextInputValue("course_id_input")
			.trim();

		const category = `Course/${input}`;
		await sendFaqEmbed(interaction, category);
	} catch (err) {
		// Handle expired or already acknowledged interactions
		if (err.code === 10062) {
			// silently ignore expired or already acknowledged interaction
		} else {
			console.error("handleModalSubmit error:", err);
		}
	}
}

// Send an FAQ embed for the selected category
export async function sendFaqEmbed(interaction, category) {
	const channelName = interaction.channel?.parent?.name || "";
	const isCourseChannel = channelName.startsWith("CISC");

	// Adjust category for course channels
	if (category.startsWith("Course") && isCourseChannel) {
		category = `Course/${channelName.split("CISC ")[1]}`;
	}

	const faqs = await interaction.client.mongo
		.collection(DB.FAQS)
		.find({ category: { $regex: `^${category}(/|$)` } })
		.toArray();

	// Fetch all categories for navigation buttons
	var allCategories = await interaction.client.mongo
		.collection(DB.FAQS)
		.distinct("category");

	allCategories = allCategories
		.map((cat) => cat.split("/")[0])
		.filter((value, index, self) => self.indexOf(value) === index);

	// Create navigation buttons for categories
	const rows = [];
	let currentRow = new ActionRowBuilder<ButtonBuilder>();

	for (const [index, cat] of allCategories.entries()) {
		const topCat = cat.split("/")[0];

		if (topCat === "Course") {
			if (isCourseChannel) {
				// Special handling: show course ID if in a course channel, otherwise open modal
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
			// Normal category button
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

		// Create a new row per 5 buttons (Discord buttons are limited to 5 per row)
		if ((index + 1) % 5 === 0) {
			rows.push(currentRow);
			currentRow = new ActionRowBuilder<ButtonBuilder>();
		}
	}

	if (currentRow.components.length > 0) {
		rows.push(currentRow);
	}

	// If no FAQs are found, send an error message
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

	// Create and send the FAQ embed
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
