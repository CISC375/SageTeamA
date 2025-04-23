import {
	handleCategorySelection as removeCategorySelection,
	deleteQuestion,
} from "../commands/admin/removefaq";
import {
	handleModalSubmit as editModalSubmit,
	handleQuestionConfirmation,
} from "../commands/admin/editfaq";
import { handleModalSubmit as addModalSubmit } from "../commands/admin/addfaq";
import { handleButton as listFaqButton } from "../commands/info/listfaq";
import {
	StringSelectMenuInteraction,
	ButtonInteraction,
	ModalSubmitInteraction,
} from "discord.js";

jest.mock("discord.js", () => ({
	...jest.requireActual("discord.js"),
	StringSelectMenuInteraction: jest.fn(),
	ButtonInteraction: jest.fn(),
	ModalSubmitInteraction: jest.fn(),
}));

describe("FAQ Commands", () => {
	// Mock database and interaction objects
	const mockMongoCollection = jest.fn();
	const mockInteractionBase = {
		client: { mongo: { collection: mockMongoCollection } },
		reply: jest.fn(),
		editReply: jest.fn(),
		update: jest.fn(),
	};

	beforeEach(() => {
		jest.clearAllMocks();
	});

	// Test for removefaq
	describe("removefaq", () => {
		it("should handle category selection and send a reply", async () => {
			mockMongoCollection.mockReturnValue({
				distinct: jest
					.fn()
					.mockResolvedValue(["Category1", "Category2"]),
			});

			const mockInteraction = {
				...mockInteractionBase,
				values: ["Category1"],
				isButton: jest.fn().mockReturnValue(false),
				isStringSelectMenu: jest.fn().mockReturnValue(true),
			} as unknown as StringSelectMenuInteraction;

			await removeCategorySelection(mockInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith(
				expect.objectContaining({
					content: "Select a category to delete questions from:",
				})
			);
		});

		it("should delete a question and send a success message", async () => {
			mockMongoCollection.mockReturnValue({
				deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
			});

			const mockInteraction = {
				...mockInteractionBase,
				message: {
					embeds: [{ description: "**Question to delete**" }],
				},
				customId: "delete_question",
				deferUpdate: jest.fn(),
				editReply: jest.fn(),
				isButton: jest.fn().mockReturnValue(true),
			} as unknown as ButtonInteraction;

			await deleteQuestion(mockInteraction);

			const embed = (mockInteraction.editReply as jest.Mock).mock
				.calls[0][0].embeds[0].data;

			expect(embed.title).toBe("FAQ Removed!");
			expect(embed.description).toBe(
				"The question has been removed successfully from the FAQ list."
			);
			expect(embed.fields[1].name).toContain("Question");
			expect(embed.fields[1].value).toBe("Question to delete");
		});

		it("should handle deletion failure and send an error message", async () => {
			mockMongoCollection.mockReturnValue({
				deleteOne: jest.fn().mockResolvedValue({ deletedCount: 0 }),
			});

			const mockInteraction = {
				...mockInteractionBase,
				message: {
					embeds: [{ description: "**Question to delete**" }],
				},
				customId: "delete_question",
				update: jest.fn(),
				editReply: jest.fn(),
				deferUpdate: jest.fn(),
				isButton: jest.fn().mockReturnValue(true),
			} as unknown as ButtonInteraction;

			await deleteQuestion(mockInteraction);

			expect(mockInteraction.update).toHaveBeenCalled();

			const embed = (mockInteraction.update as jest.Mock).mock.calls[0][0]
				.embeds[0].data;

			expect(embed.title).toBe("Deletion Failed");
			expect(embed.description).toContain(
				"Failed to delete the question"
			);
		});
	});

	// Test for editfaq
	describe("editfaq", () => {
		it("should handle modal submission and update the FAQ", async () => {
			mockMongoCollection.mockReturnValue({
				updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
			});

			const mockInteraction = {
				...mockInteractionBase,
				fields: { getTextInputValue: jest.fn((key) => `New ${key}`) },
				message: { embeds: [{ description: "**Old Question**" }] },
				customId: "modify_question_modal",
				editReply: jest.fn(),
				deferUpdate: jest.fn(),
				isModalSubmit: jest.fn().mockReturnValue(true),
			} as unknown as ModalSubmitInteraction;

			await editModalSubmit(mockInteraction);

			expect(mockInteraction.editReply).toHaveBeenCalled();

			const embed = (mockInteraction.editReply as jest.Mock).mock
				.calls[0][0].embeds[0].data;

			expect(embed.title).toBe("FAQ Modified!");
			expect(embed.description).toBe(
				"The question has been modified successfully."
			);
			expect(embed.fields).toEqual(expect.any(Array)); // 또는 정확히 비교하고 싶으면 값 입력
		});

		it("should confirm question modification", async () => {
			const mockInteraction = {
				...mockInteractionBase,
				values: ["Question to edit"],
				isStringSelectMenu: jest.fn().mockReturnValue(true),
			} as unknown as StringSelectMenuInteraction;

			await handleQuestionConfirmation(mockInteraction);

			expect(mockInteraction.update).toHaveBeenCalledWith(
				expect.objectContaining({
					content: "Please confirm your action.",
				})
			);
		});
	});

	// Test for addfaq
	describe("addfaq", () => {
		it("should add a new FAQ to the database", async () => {
			mockMongoCollection.mockReturnValue({
				findOne: jest.fn().mockResolvedValue(null),
				insertOne: jest.fn(),
			});

			const mockInteraction = {
				...mockInteractionBase,
				fields: { getTextInputValue: jest.fn((key) => `New ${key}`) },
				customId: "add_faq_modal",
				reply: jest.fn(),
				editReply: jest.fn(),
				isModalSubmit: jest.fn().mockReturnValue(true),
			} as unknown as ModalSubmitInteraction;

			await addModalSubmit(mockInteraction);

			await addModalSubmit(mockInteraction);

			expect(mockInteraction.editReply).toHaveBeenCalled();

			const embed = (mockInteraction.editReply as jest.Mock).mock
				.calls[0][0].embeds[0].data;

			expect(embed.title).toBe("FAQ Added!");
			expect(embed.description).toContain("added to the FAQ list");
			expect(embed.fields).toEqual(expect.any(Array));
		});

		it("should handle duplicate FAQ and send an error message", async () => {
			mockMongoCollection.mockReturnValue({
				findOne: jest
					.fn()
					.mockResolvedValue({ question: "New question" }),
			});

			const mockInteraction = {
				...mockInteractionBase,
				fields: {
					getTextInputValue: jest.fn((key) => `Duplicate ${key}`),
				},
				customId: "add_faq_modal",
				reply: jest.fn(),
				editReply: jest.fn(),
				isModalSubmit: jest.fn().mockReturnValue(true),
			} as unknown as ModalSubmitInteraction;

			await addModalSubmit(mockInteraction);

			await addModalSubmit(mockInteraction);

			expect(mockInteraction.editReply).toHaveBeenCalled();

			const embed = (mockInteraction.editReply as jest.Mock).mock
				.calls[0][0].embeds[0].data;

			expect(embed.title).toBe("FAQ Already Exists!");
			expect(embed.description).toContain("already exists");
		});
	});

	// Test for listfaq
	describe("listfaq", () => {
		it("should list FAQs for a category", async () => {
			mockMongoCollection.mockReturnValue({
				distinct: jest.fn().mockResolvedValue(["Category1"]),
				find: jest.fn().mockReturnValue({
					toArray: jest
						.fn()
						.mockResolvedValue([{ question: "Question 1" }]),
				}),
			});

			const mockInteraction = {
				...mockInteractionBase,
				customId: "list_questions",
				isButton: jest.fn().mockReturnValue(true),
			} as unknown as ButtonInteraction;

			await listFaqButton(mockInteraction);

			expect(mockInteraction.update).toHaveBeenCalledWith(
				expect.objectContaining({
					content: "📚 **Frequently Asked Questions**\n\u200b",
				})
			);
		});

		it("should handle no FAQs found for a category", async () => {
			mockMongoCollection.mockReturnValue({
				find: jest.fn().mockReturnValue({
					toArray: jest.fn().mockResolvedValue([]),
				}),
			});

			const mockInteraction = {
				...mockInteractionBase,
				customId: "list_questions",
				isButton: jest.fn().mockReturnValue(true),
			} as unknown as ButtonInteraction;

			await listFaqButton(mockInteraction);

			await listFaqButton(mockInteraction);

			const embed = (mockInteraction.update as jest.Mock).mock.calls[0][0]
				.embeds[0].data;

			expect(embed.title).toBe("Error");
			expect(embed.description).toContain("No FAQs found");
		});
	});
});
