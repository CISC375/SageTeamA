import { Message, Client, TextChannel, GuildMember, EmbedBuilder } from 'discord.js';
import { handleFAQResponse } from '../pieces/messageCount';
import { DB } from '../../config';

jest.mock('discord.js', () => {
	const original = jest.requireActual('discord.js');
	return {
		...original,
		Message: jest.fn(),
		Client: jest.fn().mockImplementation(() => ({
			mongo: {
				collection: jest.fn()
			},
			user: { id: 'bot123' }
		})),
		TextChannel: jest.fn(),
		GuildMember: jest.fn(),
		EmbedBuilder: jest.fn(() => ({
			setTitle: jest.fn().mockReturnThis(),
			setDescription: jest.fn().mockReturnThis(),
			setColor: jest.fn().mockReturnThis(),
			setTimestamp: jest.fn().mockReturnThis(),
			addFields: jest.fn().mockReturnThis()
		}))
	};
});

const mockFindOne = jest.fn();
const mockFind = jest.fn();
const mockUpdateOne = jest.fn();

const mockMessage = {
	author: { bot: false, id: 'user1', username: 'TestUser' },
	content: 'Whats CS101 homework policy?',
	client: {
		user: { id: 'bot123' },
		mongo: {
			collection: jest.fn((name: string) => {
				if (name === DB.CLIENT_DATA) {
					return {
						findOne: mockFindOne,
						updateOne: mockUpdateOne
					};
				}
				if (name === DB.FAQS) {
					return {
						find: mockFind
					};
				}
				return {};
			})
		}
	},
	channel: { id: 'channel1' },
	member: '<@user1>',
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

describe('handleFAQResponse', () => {
	const now = Date.now();

	it('should skip if message author is a bot', async () => {
		const botMsg = { ...mockMessage, author: { bot: true } } as unknown as Message<boolean>;
		await handleFAQResponse(botMsg, now);
		expect(mockMessage.reply).not.toHaveBeenCalled();
	});

	it('should skip if channel is in disabled list', async () => {
		mockFindOne.mockResolvedValueOnce({ disabledAutoResponseChannels: ['channel1'] });
		await handleFAQResponse(mockMessage, now);
		expect(mockMessage.reply).not.toHaveBeenCalled();
	});

	it('should skip if user is under cooldown', async () => {
		mockFindOne
			.mockResolvedValueOnce({ disabledAutoResponseChannels: [] }) // First findOne
			.mockResolvedValueOnce({ value: now + 2000 }); // Cooldown not expired

		await handleFAQResponse(mockMessage, now);
		expect(mockMessage.reply).toHaveBeenCalledWith(expect.stringContaining('Please wait'));
	});

	it('should respond with a matching FAQ and handle feedback', async () => {
		mockFindOne
			.mockResolvedValueOnce({ disabledAutoResponseChannels: [] }) // no disabled
			.mockResolvedValueOnce(null); // no cooldown

		mockUpdateOne.mockResolvedValue({});

		mockFind.mockReturnValueOnce({
			toArray: () => Promise.resolve([
				{
					question: 'What is CS101 homework policy?',
					answer: 'Late homework is not accepted.',
					category: 'homework',
					link: 'https://example.com',
					_id: 'faq1'
				}
			])
		});

		await handleFAQResponse(mockMessage, now);

		expect(mockMessage.reply).toHaveBeenCalledWith(
			expect.objectContaining({
				content: expect.stringContaining('here is the answer')
			})
		);
		expect(mockUpdateOne).toHaveBeenCalledWith(
			{ _id: 'faq_stats_faq1' },
			expect.objectContaining({
				$inc: expect.anything(),
				$set: expect.anything(),
				$push: expect.anything()
			}),
			{ upsert: true }
		);
	});
});
