import { ChatInputCommandInteraction, ChannelType, Client, Formatters } from 'discord.js';
import ToggleAutoResponse from '../../src/commands/admin/toggleautoresponse';
import { DB } from '@root/config';

// Mock dependencies
jest.mock('@lib/permissions', () => ({
	BOTMASTER_PERMS: [{ id: 'admin1', permission: true, type: 1 }]
}));

describe('ToggleAutoResponse Command', () => {
	let command: ToggleAutoResponse;
	let mockInteraction: Partial<ChatInputCommandInteraction>;
	const mockUpdateOne = jest.fn();
	const mockFindOne = jest.fn();

	beforeEach(() => {
		command = new ToggleAutoResponse();

		// Reset mocks
		mockUpdateOne.mockReset();
		mockFindOne.mockReset();

		// Create mock interaction
		mockInteraction = {
			options: {
				getChannel: jest.fn().mockReturnValue({
					id: 'channel123',
					name: 'test-channel',
					type: ChannelType.GuildText
				})
			},
			client: {
				mongo: {
					collection: jest.fn().mockReturnValue({
						findOne: mockFindOne,
						updateOne: mockUpdateOne
					})
				},
				user: { id: 'bot123' }
			},
			reply: jest.fn().mockResolvedValue(true),
			guild: {
				channels: {
					cache: new Map([
						['channel123', { id: 'channel123', name: 'test-channel', type: ChannelType.GuildText }]
					])
				}
			}
		} as unknown as ChatInputCommandInteraction;
	});

	it('should reject non-text channels', async () => {
		// Override getChannel to return a voice channel
		const mockGetChannel = mockInteraction.options.getChannel as jest.Mock;
		mockGetChannel.mockReturnValueOnce({
			id: 'voice123',
			name: 'voice-channel',
			type: ChannelType.GuildVoice
		});

		await command.run(mockInteraction as ChatInputCommandInteraction);

		expect(mockInteraction.reply).toHaveBeenCalledWith({
			content: expect.stringContaining('Auto-responses can only be toggled in text channels'),
			ephemeral: true
		});
		expect(mockFindOne).not.toHaveBeenCalled();
		expect(mockUpdateOne).not.toHaveBeenCalled();
	});

	it('should enable auto-responses if currently disabled', async () => {
		// Mock database to return the channel as disabled
		mockFindOne.mockResolvedValueOnce({
			disabledAutoResponseChannels: ['channel123', 'otherChannel']
		});

		await command.run(mockInteraction as ChatInputCommandInteraction);

		// Should update database removing this channel
		expect(mockUpdateOne).toHaveBeenCalledWith(
			{ _id: 'bot123' },
			{ $set: { disabledAutoResponseChannels: ['otherChannel'] } }
		);

		// Should respond with success message
		expect(mockInteraction.reply).toHaveBeenCalledWith(
			Formatters.codeBlock('diff', '+>>> Auto-responses ENABLED in #test-channel')
		);
	});

	it('should disable auto-responses if currently enabled', async () => {
		// Mock database to return no disabled channels
		mockFindOne.mockResolvedValueOnce({
			disabledAutoResponseChannels: ['otherChannel']
		});

		await command.run(mockInteraction as ChatInputCommandInteraction);

		// Should update database adding this channel
		expect(mockUpdateOne).toHaveBeenCalledWith(
			{ _id: 'bot123' },
			{ $set: { disabledAutoResponseChannels: ['otherChannel', 'channel123'] } }
		);

		// Should respond with success message
		expect(mockInteraction.reply).toHaveBeenCalledWith(
			Formatters.codeBlock('diff', '->>> Auto-responses DISABLED in #test-channel')
		);
	});

	it('should initialize disabledAutoResponseChannels if it does not exist', async () => {
		// Mock database to return no disabled channels array
		mockFindOne.mockResolvedValueOnce({
			// No disabledAutoResponseChannels property
		});

		await command.run(mockInteraction as ChatInputCommandInteraction);

		// Should update database initializing the array with this channel
		expect(mockUpdateOne).toHaveBeenCalledWith(
			{ _id: 'bot123' },
			{ $set: { disabledAutoResponseChannels: ['channel123'] } }
		);

		// Should respond with success message
		expect(mockInteraction.reply).toHaveBeenCalledWith(
			Formatters.codeBlock('diff', '->>> Auto-responses DISABLED in #test-channel')
		);
	});
});
