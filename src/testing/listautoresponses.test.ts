import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import ListAutoResponses from '../../src/commands/admin/listautoresponses';
import { DB } from '@root/config';

// Mock dependencies
jest.mock('@lib/permissions', () => ({
	BOTMASTER_PERMS: [{ id: 'admin1', permission: true, type: 1 }]
}));

// Mock EmbedBuilder
const mockSetTitle = jest.fn().mockReturnThis();
const mockSetDescription = jest.fn().mockReturnThis();
const mockSetColor = jest.fn().mockReturnThis();
const mockSetTimestamp = jest.fn().mockReturnThis();

jest.mock('discord.js', () => {
	const original = jest.requireActual('discord.js');
	return {
		...original,
		EmbedBuilder: jest.fn().mockImplementation(() => ({
			setTitle: mockSetTitle,
			setDescription: mockSetDescription,
			setColor: mockSetColor,
			setTimestamp: mockSetTimestamp
		}))
	};
});

describe('ListAutoResponses Command', () => {
	let command: ListAutoResponses;
	let mockInteraction: Partial<ChatInputCommandInteraction>;
	const mockFindOne = jest.fn();

	beforeEach(() => {
		command = new ListAutoResponses();
		mockFindOne.mockReset();
		mockSetTitle.mockClear();
		mockSetDescription.mockClear();
		mockSetColor.mockClear();
		mockSetTimestamp.mockClear();

		// Create mock interaction
		mockInteraction = {
			client: {
				mongo: {
					collection: jest.fn().mockReturnValue({
						findOne: mockFindOne
					})
				},
				user: { id: 'bot123' }
			},
			reply: jest.fn().mockResolvedValue(true),
			guild: {
				channels: {
					cache: new Map([
						['channel123', { id: 'channel123', name: 'test-channel' }],
						['channel456', { id: 'channel456', name: 'another-channel' }]
					])
				}
			}
		} as unknown as ChatInputCommandInteraction;
	});

	it('should report when no channels have disabled auto-responses', async () => {
		// Mock database to return empty disabled channels array
		mockFindOne.mockResolvedValueOnce({
			disabledAutoResponseChannels: []
		});

		await command.run(mockInteraction as ChatInputCommandInteraction);

		expect(mockInteraction.reply).toHaveBeenCalledWith({
			content: 'Auto-responses are enabled in all channels.',
			ephemeral: true
		});
	});

	it('should report when disabledAutoResponseChannels property does not exist', async () => {
		// Mock database to return no disabled channels property
		mockFindOne.mockResolvedValueOnce({
			// No disabledAutoResponseChannels property
		});

		await command.run(mockInteraction as ChatInputCommandInteraction);

		expect(mockInteraction.reply).toHaveBeenCalledWith({
			content: 'Auto-responses are enabled in all channels.',
			ephemeral: true
		});
	});

	it('should list all channels with disabled auto-responses', async () => {
		// Mock database to return disabled channels
		mockFindOne.mockResolvedValueOnce({
			disabledAutoResponseChannels: ['channel123', 'channel456']
		});

		await command.run(mockInteraction as ChatInputCommandInteraction);

		// Should return an embed with both channels
		expect(mockInteraction.reply).toHaveBeenCalledWith({
			embeds: [expect.any(Object)],
			ephemeral: true
		});

		// Check that EmbedBuilder was called
		expect(EmbedBuilder).toHaveBeenCalled();

		// Check that the embed methods were called with correct arguments
		expect(mockSetTitle).toHaveBeenCalledWith('Channels with Disabled Auto-Responses');
		expect(mockSetDescription).toHaveBeenCalledWith(expect.stringContaining('channel123'));
		expect(mockSetColor).toHaveBeenCalledWith('#FF0000');
		expect(mockSetTimestamp).toHaveBeenCalled();
	});

	it('should handle unknown channel IDs gracefully', async () => {
		// Mock database to return a channel ID that doesn't exist in the cache
		mockFindOne.mockResolvedValueOnce({
			disabledAutoResponseChannels: ['channel123', 'unknown-channel']
		});

		await command.run(mockInteraction as ChatInputCommandInteraction);

		// Should create an embed with the existing channel and the unknown one
		expect(mockInteraction.reply).toHaveBeenCalledWith({
			embeds: [expect.any(Object)],
			ephemeral: true
		});

		// Check that the description includes "Unknown channel"
		expect(mockSetDescription).toHaveBeenCalledWith(
			expect.stringContaining('Unknown channel')
		);
	});
});
