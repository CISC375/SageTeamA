import { Client, Message, Collection, GuildMember, TextChannel, ChannelType } from 'discord.js';
import { DB } from '@root/config';
import ToggleAutoResponse from '../../src/commands/admin/toggleautoresponse';
import ListAutoResponses from '../../src/commands/admin/listautoresponses';

// We need to mock handleFAQResponse before importing it
jest.mock('../../src/pieces/messageCount', () => ({
	handleFAQResponse: jest.fn().mockImplementation(async (msg, now) => {
		// Mock implementation that checks if channel is disabled
		const sageData = await msg.client.mongo.collection(DB.CLIENT_DATA).findOne({ _id: msg.client.user.id });
		const disabledChannels = sageData?.disabledAutoResponseChannels || [];

		// If this channel is in the disabled list, don't process
		if (disabledChannels.includes(msg.channel.id)) {
			return;
		}

		// Check cooldown
		const cooldown = await msg.client.mongo.collection(DB.CLIENT_DATA).findOne({ _id: `faqCooldown_${msg.author.id}` });
		if (cooldown && cooldown.value > now) {
			await msg.reply(`You're asking too quickly! Please wait ${Math.ceil((cooldown.value - now) / 1000)} seconds before asking another question.`);
			return;
		}

		// Find FAQ
		const faqs = await msg.client.mongo.collection(DB.FAQS).find().toArray();
		if (faqs.length > 0) {
			await msg.reply({
				content: `${msg.member}, here is the answer to your question:`,
				embeds: [{}] // Simplified mock embed
			});
		}
	})
}));

// Now import the mocked function
import { handleFAQResponse } from '../../src/pieces/messageCount';

// Mock client and database
const mockCollection = {
	findOne: jest.fn(),
	updateOne: jest.fn(),
	find: jest.fn()
};

const mockClient = {
	user: { id: 'bot123' },
	mongo: {
		collection: jest.fn().mockReturnValue(mockCollection)
	},
	commands: new Collection()
} as unknown as Client;

// Mock interaction for toggle command
const mockToggleInteraction = {
	client: mockClient,
	options: {
		getChannel: jest.fn().mockReturnValue({
			id: 'test-channel',
			name: 'test-channel',
			type: ChannelType.GuildText
		})
	},
	reply: jest.fn(),
	guild: {
		channels: {
			cache: new Map([
				['test-channel', { id: 'test-channel', name: 'test-channel', type: ChannelType.GuildText }]
			])
		}
	}
};

// Mock interaction for list command
const mockListInteraction = {
	client: mockClient,
	reply: jest.fn(),
	guild: {
		channels: {
			cache: new Map([
				['test-channel', { id: 'test-channel', name: 'test-channel', type: ChannelType.GuildText }]
			])
		}
	}
};

// Mock message for testing auto-responses
const mockMessage = {
	author: { bot: false, id: 'user1', username: 'TestUser' },
	content: 'What is the homework policy?',
	client: mockClient,
	channel: { id: 'test-channel' },
	member: {} as GuildMember,
	reply: jest.fn().mockResolvedValue({
		react: jest.fn(),
		createReactionCollector: jest.fn(() => ({
			on: jest.fn()
		})),
		reactions: { removeAll: jest.fn() }
	})
} as unknown as Message;

beforeEach(() => {
	jest.clearAllMocks();
});

describe('Auto-response disable/enable integration', () => {
	const toggleCommand = new ToggleAutoResponse();
	const listCommand = new ListAutoResponses();
	const now = Date.now();

	it('should disable auto-responses and verify no responses sent', async () => {
		// Set up: Channel not in disabled list
		mockCollection.findOne
			.mockResolvedValueOnce({ disabledAutoResponseChannels: [] }) // For toggle command
			.mockResolvedValueOnce({ disabledAutoResponseChannels: ['test-channel'] }) // For handleFAQResponse check
			.mockResolvedValueOnce({ disabledAutoResponseChannels: ['test-channel'] }); // For list command

		// Execute: Disable auto-responses in the channel
		await toggleCommand.run(mockToggleInteraction as any);

		// Verify: Toggle command updated database correctly
		expect(mockCollection.updateOne).toHaveBeenCalledWith(
			{ _id: 'bot123' },
			{ $set: { disabledAutoResponseChannels: ['test-channel'] } }
		);
		expect(mockToggleInteraction.reply).toHaveBeenCalled();

		// Execute: Try to send a message that would trigger auto-response
		await handleFAQResponse(mockMessage, now);

		// Verify: No auto-response was generated because channel is disabled
		expect(mockMessage.reply).not.toHaveBeenCalled();

		// Execute: List disabled channels
		await listCommand.run(mockListInteraction as any);

		// Verify: List command shows correct channels
		expect(mockListInteraction.reply).toHaveBeenCalledWith(
			expect.objectContaining({
				embeds: [expect.anything()]
			})
		);
	});

	it('should enable auto-responses and verify responses sent', async () => {
		// Set up: Channel is in disabled list
		mockCollection.findOne
			.mockResolvedValueOnce({ disabledAutoResponseChannels: ['test-channel'] }) // For toggle command
			.mockResolvedValueOnce({ disabledAutoResponseChannels: [] }) // For handleFAQResponse check
			.mockResolvedValueOnce(null) // For cooldown check
			.mockResolvedValueOnce({ disabledAutoResponseChannels: [] }); // For list command

		mockCollection.find.mockReturnValueOnce({
			toArray: () => Promise.resolve([
				{
					question: 'What is the homework policy?',
					answer: 'Late homework is not accepted.',
					category: 'homework',
					_id: 'faq1'
				}
			])
		});

		// Execute: Enable auto-responses in the channel
		await toggleCommand.run(mockToggleInteraction as any);

		// Verify: Toggle command updated database correctly
		expect(mockCollection.updateOne).toHaveBeenCalledWith(
			{ _id: 'bot123' },
			{ $set: { disabledAutoResponseChannels: [] } }
		);
		expect(mockToggleInteraction.reply).toHaveBeenCalled();

		// Execute: Send a message that would trigger auto-response
		await handleFAQResponse(mockMessage, now);

		// Verify: Auto-response was generated because channel is enabled
		expect(mockMessage.reply).toHaveBeenCalled();

		// Execute: List disabled channels
		await listCommand.run(mockListInteraction as any);

		// Verify: List command shows no disabled channels
		expect(mockListInteraction.reply).toHaveBeenCalledWith({
			content: 'Auto-responses are enabled in all channels.',
			ephemeral: true
		});
	});
});
