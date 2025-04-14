import { ActivityType } from 'discord.js';

export interface SageData {
	status: {
		type: ActivityType;
		name: string;
	};
	commandSettings: Array<{ name: string, enabled: boolean }>;

	/**
	 * Array of channel IDs where auto-responses are disabled
	 */
	disabledAutoResponseChannels?: string[];
}
