import RemoveFaqCommand, {
	handleCategorySelection as removeCategorySelection,
	setupCategoryHandler as setupRemoveCategoryHandler,
	deleteQuestion,
} from "../commands/admin/removefaq";
import EditFaqCommand, {
	handleCategorySelection as editCategorySelection,
	handleModalSubmit as editModalSubmit,
	handleQuestionConfirmation,
	setupCategoryHandler as setupEditCategoryHandler,
} from "../commands/admin/editfaq";
import AddFaqCommand, {
	handleModalSubmit as addModalSubmit,
} from "../commands/admin/addfaq";
import { handleModalSubmit, handleButton as listFaqButton, sendFaqEmbed } from "../commands/info/listfaq";
import {
	StringSelectMenuInteraction,
	ButtonInteraction,
	ModalSubmitInteraction,
	ButtonStyle,
	ChatInputCommandInteraction,
	Client,
	ChannelType,
} from "discord.js";
import EventEmitter from "events";
import { runCommand } from "../pieces/commandManager";

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

		it("should cancel deletion and show a cancellation message", async () => {
			const mockClient = new EventEmitter() as EventEmitter & {
				mongo: any;
				removeListener: (...args: any[]) => void;
			};

			mockClient.mongo = { collection: mockMongoCollection };
			mockClient.removeListener = jest.fn();

			const mockInteraction = {
				...mockInteractionBase,
				customId: "cancel_delete",
				isButton: jest.fn().mockReturnValue(true),
				isStringSelectMenu: jest.fn().mockReturnValue(false),
				user: { id: "testUser" },
				client: mockClient,
				update: jest.fn(),
			} as unknown as ButtonInteraction;

			await setupRemoveCategoryHandler(mockInteraction);

			await mockClient.emit("interactionCreate", mockInteraction);

			await mockClient.emit("interactionCreate", mockInteraction);

			const updateCall = (mockInteraction.update as jest.Mock).mock
				.calls[0][0];
			const embed = updateCall.embeds[0].data;

			expect(embed.title).toBe("Deletion canceled.");
			expect(embed.description).toBe(
				"The question has not been removed."
			);
		});

		it("should go back to remove category selection when back button is clicked", async () => {
			mockMongoCollection.mockReturnValue({
				distinct: jest.fn().mockResolvedValue(["General", "Job"]),
			});

			const mockInteraction = {
				...mockInteractionBase,
				customId: "back_to_remove_category",
				isButton: jest.fn().mockReturnValue(true),
				update: jest.fn(),
			} as unknown as ButtonInteraction;

			await removeCategorySelection(mockInteraction);

			expect(mockInteraction.update).toHaveBeenCalledWith(
				expect.objectContaining({
					content: expect.stringContaining(
						"Select a category to delete"
					),
				})
			);
		});
	});

	// Test for editfaq
	describe("editfaq", () => {
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

			await editCategorySelection(mockInteraction);

			expect(mockInteraction.reply).toHaveBeenCalledWith(
				expect.objectContaining({
					content: "Select a category to edit questions from:",
				})
			);
		});

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
			expect(embed.fields).toEqual(expect.any(Array));
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

		it("should handle edition failure and send an error message", async () => {
			mockMongoCollection.mockReturnValue({
				updateOne: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
			});

			const mockInteraction = {
				...mockInteractionBase,
				customId: "modify_question_modal",
				deferUpdate: jest.fn(),
				editReply: jest.fn(),
				fields: {
					getTextInputValue: jest.fn((id) => `New ${id}`),
				},
				message: {
					embeds: [{ description: '**"Old Question"**' }],
				},
			} as unknown as ModalSubmitInteraction;

			await editModalSubmit(mockInteraction);

			const embed = (mockInteraction.editReply as jest.Mock).mock
				.calls[0][0].embeds[0].data;
			expect(embed.title).toBe("Error");
			expect(embed.description).toContain(
				"Failed to modify the question"
			);
		});

		it("should cancel edition and show a cancellation message", async () => {
			const mockClient = new EventEmitter() as EventEmitter & {
				mongo: any;
				removeListener: (...args: any[]) => void;
			};

			mockClient.mongo = {
				collection: mockMongoCollection,
			};
			mockClient.removeListener = jest.fn();

			(global as any).client = mockClient;

			const mockInteraction = {
				...mockInteractionBase,
				customId: "cancel_modify",
				user: { id: "testUser" },
				client: mockClient,
				isButton: jest.fn().mockReturnValue(true),
				isStringSelectMenu: jest.fn().mockReturnValue(false),
				update: jest.fn(),
			} as unknown as ButtonInteraction;

			await setupEditCategoryHandler(mockInteraction);
			await mockClient.emit("interactionCreate", mockInteraction);

			const updateCall = (mockInteraction.update as jest.Mock).mock
				.calls[0][0];
			const embed = updateCall.embeds[0].data;

			expect(embed.title).toBe("Edition canceled.");
			expect(embed.description).toBe("The question has not been edited.");
		});

		it("should go back to edit category selection when back button is clicked", async () => {
			mockMongoCollection.mockReturnValue({
				distinct: jest.fn().mockResolvedValue(["General", "Job"]),
			});

			const mockInteraction = {
				...mockInteractionBase,
				customId: "back_to_edit_category",
				isButton: jest.fn().mockReturnValue(true),
				update: jest.fn(),
			} as unknown as ButtonInteraction;

			await editCategorySelection(mockInteraction);

			expect(mockInteraction.update).toHaveBeenCalledWith(
				expect.objectContaining({
					content: expect.stringContaining(
						"Select a category to edit"
					),
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
		it("should highlight the selected category button", async () => {
			mockMongoCollection.mockReturnValue({
				distinct: jest
					.fn()
					.mockResolvedValue(["Category1", "Category2"]),
				find: jest.fn().mockReturnValue({
					toArray: jest
						.fn()
						.mockResolvedValue([{ question: "Sample question?" }]),
				}),
			});

			const mockInteraction = {
				...mockInteractionBase,
				customId: "faq_Category1",
				isButton: jest.fn().mockReturnValue(true),
				update: jest.fn(),
			} as unknown as ButtonInteraction;

			await listFaqButton(mockInteraction);

			const buttonRow = (mockInteraction.update as jest.Mock).mock
				.calls[0][0].components[0];
			const buttons = buttonRow.components;

			expect(
				buttons.find((btn) => btn.data.custom_id === "faq_Category1")
					.data.style
			).toBe(ButtonStyle.Primary);
			expect(
				buttons.find((btn) => btn.data.custom_id === "faq_Category2")
					.data.style
			).toBe(ButtonStyle.Secondary);
		});

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
				distinct: jest.fn().mockResolvedValue(["Category1"]),
			});

			const mockInteraction = {
				...mockInteractionBase,
				customId: "list_questions",
				isButton: jest.fn().mockReturnValue(true),
			} as unknown as ButtonInteraction;

			await sendFaqEmbed(mockInteraction, "");

			const embed = (mockInteraction.update as jest.Mock).mock.calls[0][0]
				.embeds[0].data;

			expect(embed.title).toBe("Error");
			expect(embed.description).toContain("No FAQs found");
		});
		
		it("should open course modal when Course button clicked from non-course channel", async () => {
			const mockInteraction = {
				...mockInteractionBase,
				customId: "faq_Course",
				isButton: jest.fn().mockReturnValue(true),
				showModal: jest.fn(),
				channel: {
				  name: "channel1",
				},
			  } as unknown as ButtonInteraction;
			  
	
			await listFaqButton(mockInteraction);
			expect(mockInteraction.showModal).toHaveBeenCalled();
		});

		it("should show FAQ from modal input (valid course ID)", async () => {
			mockMongoCollection.mockReturnValue({
				find: jest.fn().mockReturnValue({
					toArray: jest.fn().mockResolvedValue([{ question: "What is CS1?" }]),
				}),
				distinct: jest.fn().mockResolvedValue(["Course", "Job"]),
			});
	
			const mockInteraction = {
				...mockInteractionBase,
				customId: "faq_course_modal",
				fields: { getTextInputValue: jest.fn().mockReturnValue("CS1") },
				update: jest.fn(),
			} as any;
	
			await handleModalSubmit(mockInteraction);
	
			expect(mockInteraction.update).toHaveBeenCalledWith(
				expect.objectContaining({
					embeds: [expect.objectContaining({ data: expect.anything() })],
					components: expect.any(Array),
				})
			);
		});

		it("should show error embed if no FAQs found via modal input", async () => {
			mockMongoCollection.mockReturnValue({
				find: jest.fn().mockReturnValue({
					toArray: jest.fn().mockResolvedValue([]),
				}),
				distinct: jest.fn().mockResolvedValue(["Course"]),
			});
	
			const mockInteraction = {
				...mockInteractionBase,
				customId: "faq_course_modal",
				fields: { getTextInputValue: jest.fn().mockReturnValue("MISSING") },
				update: jest.fn(),
			} as any;
	
			await handleModalSubmit(mockInteraction);
			const embed = (mockInteraction.update as jest.Mock).mock.calls[0][0].embeds[0].data;
	
			expect(embed.title).toBe("Error");
			expect(embed.description).toContain("No FAQs found");
		});

		it("should not throw on expired interaction (code 10062)", async () => {
			const mockInteraction = {
				...mockInteractionBase,
				customId: "faq_Job",
				isButton: jest.fn().mockReturnValue(true),
				update: jest.fn(() => {
					throw { code: 10062 };
				}),
			} as unknown as ButtonInteraction;
	
			await expect(listFaqButton(mockInteraction)).resolves.not.toThrow();
		});
	});

	describe("Admin-only FAQ commands", () => {
		const createMockInteraction = (commandName: string) =>
			({
				commandName,
				channel: { type: ChannelType.GuildText },
				memberPermissions: {
					has: jest.fn().mockReturnValue(false),
				},
				user: { id: "123", username: "testUser" },
				reply: jest.fn(),
			} as unknown as ChatInputCommandInteraction);

		const expectPermissionDenied = async (
			commandName: string,
			CommandClass: any
		) => {
			const interaction = createMockInteraction(commandName);
			const mockBot = {
				commands: new Map([[commandName, new CommandClass()]]),
				emit: jest.fn(),
			} as unknown as Client;

			await runCommand(interaction, mockBot);

			const embed = (interaction.reply as jest.Mock).mock.calls[0][0].embeds[0].data;

			expect(embed.title).toBe("Error");
			expect(embed.description).toContain("You do not have permission");
		};

		it("should block addfaq from non-admins", async () => {
			await expectPermissionDenied("addfaq", AddFaqCommand);
		});

		it("should block editfaq from non-admins", async () => {
			await expectPermissionDenied("editfaq", EditFaqCommand);
		});

		it("should block removefaq from non-admins", async () => {
			await expectPermissionDenied("removefaq", RemoveFaqCommand);
		});
	});
});
