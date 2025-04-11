import { ApplicationCommandOptionData, ApplicationCommandOptionType, ApplicationCommandPermissions, ChatInputCommandInteraction,
	ChannelType, Formatters, InteractionResponse } from 'discord.js';
import { BOTMASTER_PERMS } from '@lib/permissions';
import { DB } from '@root/config';
import { Command } from '@lib/types/Command';
import { SageData } from '@lib/types/SageData';

export default class extends Command {

	description = 'Toggles auto-responses in a specified channel';
	permissions: ApplicationCommandPermissions[] = BOTMASTER_PERMS;

	options: ApplicationCommandOptionData[] = [{
		name: 'channel',
		description: 'The channel to toggle auto-responses in',
		type: ApplicationCommandOptionType.Channel,
		required: true
	}]

	async run(interaction: ChatInputCommandInteraction): Promise<InteractionResponse<boolean> | void> {
		const channel = interaction.options.getChannel('channel');

		// Verify the channel is a text channel
		if (channel.type !== ChannelType.GuildText) {
			return interaction.reply({
				content: 'Auto-responses can only be toggled in text channels.',
				ephemeral: true
			});
		}

		// Get the current disabled channels list from the database
		const sageData: SageData = await interaction.client.mongo.collection(DB.CLIENT_DATA).findOne({ _id: interaction.client.user.id });

		// Initialize disabledAutoResponseChannels if it doesn't exist
		if (!sageData.disabledAutoResponseChannels) {
			sageData.disabledAutoResponseChannels = [];
		}

		// Check if the channel is already in the disabled list
		const channelIndex = sageData.disabledAutoResponseChannels.indexOf(channel.id);
		const isChannelDisabled = channelIndex !== -1;

		// Toggle the channel status
		if (isChannelDisabled) {
			// Remove from disabled list
			sageData.disabledAutoResponseChannels.splice(channelIndex, 1);
			await interaction.client.mongo.collection(DB.CLIENT_DATA).updateOne(
				{ _id: interaction.client.user.id },
				{ $set: { disabledAutoResponseChannels: sageData.disabledAutoResponseChannels } }
			);
			return interaction.reply(Formatters.codeBlock('diff', `+>>> Auto-responses ENABLED in #${channel.name}`));
		} else {
			// Add to disabled list
			sageData.disabledAutoResponseChannels.push(channel.id);
			await interaction.client.mongo.collection(DB.CLIENT_DATA).updateOne(
				{ _id: interaction.client.user.id },
				{ $set: { disabledAutoResponseChannels: sageData.disabledAutoResponseChannels } }
			);
			return interaction.reply(Formatters.codeBlock('diff', `->>> Auto-responses DISABLED in #${channel.name}`));
		}
	}

}
