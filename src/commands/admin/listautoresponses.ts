import { ApplicationCommandPermissions, ChatInputCommandInteraction, EmbedBuilder, InteractionResponse } from 'discord.js';
import { BOTMASTER_PERMS } from '@lib/permissions';
import { DB } from '@root/config';
import { Command } from '@lib/types/Command';
import { SageData } from '@lib/types/SageData';

export default class extends Command {

	description = 'Lists all channels where auto-responses are disabled';
	permissions: ApplicationCommandPermissions[] = BOTMASTER_PERMS;

	async run(interaction: ChatInputCommandInteraction): Promise<InteractionResponse<boolean> | void> {
		// Get the current disabled channels list from the database
		const sageData: SageData = await interaction.client.mongo.collection(DB.CLIENT_DATA).findOne({ _id: interaction.client.user.id });

		// Initialize disabledAutoResponseChannels if it doesn't exist
		const disabledChannels = sageData?.disabledAutoResponseChannels || [];

		if (disabledChannels.length === 0) {
			return interaction.reply({
				content: 'Auto-responses are enabled in all channels.',
				ephemeral: true
			});
		}

		const channelList = disabledChannels.map(channelId => {
			const channel = interaction.guild.channels.cache.get(channelId);
			return channel ? `<#${channelId}> (${channel.name})` : `Unknown channel (${channelId})`;
		}).join('\n');

		const embed = new EmbedBuilder()
			.setTitle('Channels with Disabled Auto-Responses')
			.setDescription(channelList)
			.setColor('#FF0000')
			.setTimestamp();

		return interaction.reply({
			embeds: [embed],
			ephemeral: true
		});
	}

}
