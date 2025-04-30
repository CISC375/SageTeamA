import { Message, Client, TextChannel, GuildMember, EmbedBuilder } from 'discord.js';
import { handleFAQResponse, default as register } from '../../src/pieces/messageCount';
import { DB, GUILDS } from '../../config';
import { EventEmitter } from 'events';

// Mock discord.js
jest.mock('discord.js', () => {
	const original = jest.requireActual('discord.js');
	return {
		...original,
		Message: jest.fn(),
		Client: jest.fn().mockImplementation(() => {
			const client = new EventEmitter() as EventEmitter & {
				mongo: { collection: jest.Mock };
				user: { id: string };
			};
			client.mongo = { collection: jest.fn() };
			client.user = { id: 'bot123' };
			return client as unknown as Client;
		}),
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

// Mock MongoDB methods
const mockFindOne = jest.fn();
const mockFind = jest.fn();
const mockUpdateOne = jest.fn();
const mockFindOneAndUpdate = jest.fn().mockResolvedValue({});
const mockDelete = jest.fn().mockResolvedValue(undefined);
const mockSend = jest.fn().mockResolvedValue(undefined);

// Mock Message object
const mockMessage: Partial<Message> = {
	author: { bot: false, id: 'user123', username: 'TestUser', send: mockSend },
	content: 'test question',
	client: null, // Will be set in tests
	channel: { id: 'channel123', type: 0 },
	guild: { id: GUILDS.MAIN },
	member: { id: 'user123' } as GuildMember,
	reply: jest.fn().mockResolvedValue({
		react: jest.fn(),
		createReactionCollector: jest.fn(() => ({
			on: jest.fn()
		})),
		reactions: { removeAll: jest.fn() }
	}),
	delete: mockDelete
} as unknown as Message;

// Mock constants
const MAX_COMMANDS = 5;
const TIME_WINDOW = 60 * 1000;
const FAQ_COOLDOWN = 3 * 1000;

// Reset rateLimits Map before each test
beforeEach(() => {
	jest.clearAllMocks();
	mockFindOne.mockReset();
	mockFind.mockReset();
	mockUpdateOne.mockReset();
	mockFindOneAndUpdate.mockReset();
	mockDelete.mockReset();
	mockSend.mockReset();
});

beforeAll(() => {
	jest.useFakeTimers();
});

afterAll(() => {
	jest.useRealTimers();
});

describe('Rate Limiting', () => {
	it('deletes messages while rate limited', async () => {
		const client = new Client({ intents: [] });
		Object.defineProperty(mockMessage, 'client', { value: client, writable: true });
		await register(client);
		const listener = client.listeners('messageCreate')[0];

		let currentTime = 1000000;
		jest.setSystemTime(currentTime);

		(client.mongo.collection as jest.Mock).mockImplementation((name: string) => {
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
			if (name === DB.USERS) {
				return {
					findOneAndUpdate: mockFindOneAndUpdate
				};
			}
			return {};
		});

		mockFindOne.mockImplementation((query) => {
			if (query._id === 'bot123') return { disabledAutoResponseChannels: [] };
			if (query._id.startsWith('faqCooldown_')) return null;
			return null;
		});
		mockFind.mockReturnValue({
			toArray: () => Promise.resolve([{ question: 'test question', answer: 'test answer', category: 'test', _id: 'faq1', link: 'http://example.com' }])
		});
		mockUpdateOne.mockResolvedValue({});

		// Send 5 messages to reach the limit
		for (let i = 0; i < 5; i++) {
			mockMessage.content = 'test question';
			mockDelete.mockClear();
			mockSend.mockClear();
			await listener(mockMessage);
			currentTime += 10000;
			jest.setSystemTime(currentTime);
		}

		// Send additional messages while rate-limited
		mockDelete.mockClear();
		mockSend.mockClear();
		await listener(mockMessage); // 6th message
		expect(mockMessage.delete).toHaveBeenCalledTimes(1);

		currentTime += 1000;
		jest.setSystemTime(currentTime);
		mockDelete.mockClear();
		mockSend.mockClear();
		await listener(mockMessage); // 7th message
		expect(mockMessage.delete).toHaveBeenCalledTimes(1);
	});

	it('sends DM for every rate-limited message', async () => {
		const client = new Client({ intents: [] });
		Object.defineProperty(mockMessage, 'client', { value: client, writable: true });
		await register(client);
		const listener = client.listeners('messageCreate')[0];

		let currentTime = 1000000;
		jest.setSystemTime(currentTime);

		(client.mongo.collection as jest.Mock).mockImplementation((name: string) => {
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
			if (name === DB.USERS) {
				return {
					findOneAndUpdate: mockFindOneAndUpdate
				};
			}
			return {};
		});

		mockFindOne.mockImplementation((query) => {
			if (query._id === 'bot123') return { disabledAutoResponseChannels: [] };
			if (query._id.startsWith('faqCooldown_')) return null;
			return null;
		});
		mockFind.mockReturnValue({
			toArray: () => Promise.resolve([{ question: 'test question', answer: 'test answer', category: 'test', _id: 'faq1', link: 'http://example.com' }])
		});
		mockUpdateOne.mockResolvedValue({});

		for (let i = 0; i < 5; i++) {
			mockMessage.content = 'test question';
			mockDelete.mockClear();
			mockSend.mockClear();
			await listener(mockMessage);
			currentTime += 10000;
			jest.setSystemTime(currentTime);
		}

		mockDelete.mockClear();
		mockSend.mockClear();
		mockMessage.content = 'test question';
		await listener(mockMessage);
		currentTime += 1000;
		jest.setSystemTime(currentTime);
		mockDelete.mockClear();
		mockSend.mockClear();
		mockMessage.content = 'test question';
		await listener(mockMessage);

		expect(mockMessage.delete).toHaveBeenCalledTimes(1);
		expect(mockMessage.author.send).toHaveBeenCalledTimes(1);
	});
});

describe('FAQ Cooldown', () => {
	it('blocks consecutive FAQ questions within 3 seconds', async () => {
		const client = new Client({ intents: [] });
		Object.defineProperty(mockMessage, 'client', { value: client, writable: true });
		(client.mongo.collection as jest.Mock).mockImplementation((name: string) => {
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
			if (name === DB.USERS) {
				return {
					findOneAndUpdate: mockFindOneAndUpdate
				};
			}
			return {};
		});

		const now = Date.now();
		const faq = { question: 'test question', answer: 'test answer', category: 'test', _id: 'faq1', link: 'http://example.com' };

		// First FAQ question sets cooldown
		mockFindOne
			.mockResolvedValueOnce({ disabledAutoResponseChannels: [] }) // bot check
			.mockResolvedValueOnce(null); // no cooldown
		mockFind.mockReturnValueOnce({
			toArray: () => Promise.resolve([faq])
		});
		mockUpdateOne.mockResolvedValueOnce({});
		await handleFAQResponse(mockMessage as Message, now);

		// Second FAQ question within 3 seconds
		mockFindOne
			.mockResolvedValueOnce({ disabledAutoResponseChannels: [] }) // bot check
			.mockResolvedValueOnce({ value: now + FAQ_COOLDOWN }); // cooldown active
		mockFind.mockReturnValueOnce({
			toArray: () => Promise.resolve([faq])
		});
		mockUpdateOne.mockResolvedValueOnce({});
		await handleFAQResponse(mockMessage as Message, now + 1000);

		expect(mockMessage.reply).toHaveBeenCalledWith(
			"You're asking too quickly! Please wait 2 seconds before asking another question."
		);
		expect(mockMessage.delete).not.toHaveBeenCalled();
	});

	it('allows FAQ questions after 3 seconds', async () => {
		const client = new Client({ intents: [] });
		Object.defineProperty(mockMessage, 'client', { value: client, writable: true });
		(client.mongo.collection as jest.Mock).mockImplementation((name: string) => {
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
			if (name === DB.USERS) {
				return {
					findOneAndUpdate: mockFindOneAndUpdate
				};
			}
			return {};
		});

		const now = Date.now();
		const faq = { question: 'test question', answer: 'test answer', category: 'test', _id: 'faq1', link: 'http://example.com' };

		// First FAQ question sets cooldown
		mockFindOne
			.mockResolvedValueOnce({ disabledAutoResponseChannels: [] }) // bot check
			.mockResolvedValueOnce(null); // no cooldown
		mockFind.mockReturnValueOnce({
			toArray: () => Promise.resolve([faq])
		});
		mockUpdateOne.mockResolvedValueOnce({});
		await handleFAQResponse(mockMessage as Message, now);

		// Second FAQ question after 3 seconds
		mockFindOne
			.mockResolvedValueOnce({ disabledAutoResponseChannels: [] }) // bot check
			.mockResolvedValueOnce(null); // cooldown expired
		mockFind.mockReturnValueOnce({
			toArray: () => Promise.resolve([faq])
		});
		mockUpdateOne.mockResolvedValueOnce({});
		await handleFAQResponse(mockMessage as Message, now + FAQ_COOLDOWN);

		expect(mockMessage.reply).toHaveBeenCalledWith(
			expect.objectContaining({
				content: expect.stringContaining('here is the answer'),
				embeds: expect.any(Array)
			})
		);
		expect(mockMessage.delete).not.toHaveBeenCalled();
	});

	it('does not apply cooldown to non-FAQ messages', async () => {
		const client = new Client({ intents: [] });
		Object.defineProperty(mockMessage, 'client', { value: client, writable: true });
		(client.mongo.collection as jest.Mock).mockImplementation((name: string) => {
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
			if (name === DB.USERS) {
				return {
					findOneAndUpdate: mockFindOneAndUpdate
				};
			}
			return {};
		});

		const now = Date.now();

		// First FAQ question sets cooldown
		mockFindOne
			.mockResolvedValueOnce({ disabledAutoResponseChannels: [] }) // bot check
			.mockResolvedValueOnce(null); // no cooldown
		mockFind.mockReturnValueOnce({
			toArray: () => Promise.resolve([{ question: 'test question', answer: 'test answer', category: 'test', _id: 'faq1', link: 'http://example.com' }])
		});
		mockUpdateOne.mockResolvedValueOnce({});
		await handleFAQResponse(mockMessage as Message, now);

		// Non-FAQ message within 3 seconds
		mockMessage.content = 'hello';
		mockFindOne
			.mockResolvedValueOnce({ disabledAutoResponseChannels: [] }) // bot check
			.mockResolvedValueOnce({ value: now + FAQ_COOLDOWN }); // cooldown active (should be ignored)
		mockFind.mockReturnValueOnce({
			toArray: () => Promise.resolve([]) // No FAQ match
		});
		await handleFAQResponse(mockMessage as Message, now + 1000);

		expect(mockMessage.reply).not.toHaveBeenCalled();
		expect(mockMessage.delete).not.toHaveBeenCalled();
	});
});
