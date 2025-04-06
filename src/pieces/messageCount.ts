/* eslint-disable @typescript-eslint/no-shadow */
import { Client, TextChannel, Role, Message, EmbedBuilder, PartialMessage, ThreadChannel, ChannelType } from 'discord.js';
import { DatabaseError } from '@lib/types/errors';
import { CHANNELS, DB, ROLES, GUILDS } from '@root/config';
import { SageUser } from '@lib/types/SageUser';
import { calcNeededExp } from '@lib/utils/generalUtils';

const startingColor = 80;
const greenIncrement = 8;
const maxGreen:[number, number, number] = [0, 255, 0];
const maxLevel = 20;
const countedChannelTypes = [
	ChannelType.GuildText,
	ChannelType.PublicThread,
	ChannelType.PrivateThread
];

async function register(bot: Client): Promise<void> {
	bot.on('messageCreate', async msg => {
		countMessages(msg).catch(async error => bot.emit('error', error));
		await handleFAQResponse(msg);
	});
	bot.on('messageDelete', async msg => {
		if (msg.content && msg.content.startsWith('s;')) return;
		handleExpDetract(msg);
	});
}

async function countMessages(msg: Message): Promise<void> {
	const bot = msg.client;

	if (
		!countedChannelTypes.includes(msg.channel.type)
		|| msg.guild?.id !== GUILDS.MAIN
		|| msg.author.bot
	) {
		return;
	}

	const { channel } = msg;

	let countInc = 0;
	const validChannel = (channel instanceof TextChannel) && (!channel.topic || (channel.topic && !channel.topic.startsWith('[no message count]')));
	const validThread = (channel instanceof ThreadChannel) && channel.name.includes('private');
	if (validChannel || validThread) {
		countInc++;
	}


	bot.mongo.collection(DB.USERS).findOneAndUpdate(
		{ discordId: msg.author.id },
		{ $inc: { count: countInc, curExp: -1 } },
		(err, { value }) => handleLevelUp(err, value as SageUser, msg)
			.catch(async error => bot.emit('error', error))
	);
}

// helper functions
function getKeywordSet(text: string): Set<string> {
	return new Set(
		text
			.toLowerCase()
			.replace(/[^a-z0-9\s]/gi, '') // remove punctuation
			.split(/\s+/)
			.filter(word => word.length > 2 || /\d/.test(word)) // keep meaningful words or ones with numbers
	);
}

function getTokenSimilarity(userSet: Set<string>, faqSet: Set<string>): number {
	const intersection = new Set([...userSet].filter(word => faqSet.has(word)));
	return intersection.size / Math.max(userSet.size, faqSet.size);
}


async function handleFAQResponse(msg: Message): Promise<void> {
	if (msg.author.bot) return;

	const cooldown = 3 * 1000;
	const cooldownKey = `faqCooldown_${msg.author.id}`;
	const now = Date.now();
	const cooldownEnd = await msg.client.mongo.collection(DB.CLIENT_DATA).findOne({ _id: cooldownKey });

	if (cooldownEnd && cooldownEnd.value > now) {
		const remainingTime = Math.ceil((cooldownEnd.value - now) / 1000);
		await msg.reply(`Please wait ${remainingTime} seconds before asking another question.`);
		return;
	}

	await msg.client.mongo.collection(DB.CLIENT_DATA).updateOne(
		{ _id: cooldownKey },
		{ $set: { value: now + cooldown } },
		{ upsert: true }
	);

	const userQuestion = msg.content.trim().toLowerCase();
	const faqs = await msg.client.mongo.collection(DB.FAQS).find().toArray();

	let foundFAQ = null;
	let bestMatchScore = 0;

	const userKeywordSet = getKeywordSet(userQuestion);

	for (const faq of faqs) {
		const faqQuestion = faq.question.toLowerCase();

		// Exact Match
		if (userQuestion === faqQuestion) {
			foundFAQ = faq;
			break;
		}

		// Get Token Sets
		const faqKeywordSet = getKeywordSet(faqQuestion);

		// Filter if course codes don’t match
		const userHasCourse = [...userKeywordSet].find(word => /\d/.test(word));
		const faqHasCourse = [...faqKeywordSet].find(word => /\d/.test(word));
		if (userHasCourse && faqHasCourse && userHasCourse !== faqHasCourse) {
			continue;
		}

		// Token Similarity
		let similarity = getTokenSimilarity(userKeywordSet, faqKeywordSet);

		// Bonus if both contain course codes
		if (userHasCourse && faqHasCourse && userHasCourse === faqHasCourse) {
			similarity += 0.2;
		}

		if (similarity >= 0.5 && similarity > bestMatchScore) {
			foundFAQ = faq;
			bestMatchScore = similarity;
		}
	}

	if (foundFAQ) {
		const embed = new EmbedBuilder()
			.setTitle(foundFAQ.question)
			.setDescription(foundFAQ.answer)
			.setColor('#00FF00')
			.setTimestamp();

		if (foundFAQ.link) {
			embed.addFields({ name: 'For more details', value: foundFAQ.link });
		}

		embed.addFields({ name: 'Did you find this response helpful?', value: '👍 Yes | 👎 No' });

		const reply = await msg.reply({
			content: `${msg.member}, here is the answer to your question:`,
			embeds: [embed]
		});

		await reply.react('👍');
		await reply.react('👎');

		const filter = (reaction: any, user: any) =>
			['👍', '👎'].includes(reaction.emoji.name) && user.id === msg.author.id;
		const collector = reply.createReactionCollector({ filter, time: 60000 });

		collector.on('collect', async (reaction) => {
			if (reaction.emoji.name === '👍') {
				await msg.reply('Great! Glad you found it helpful!');
			} else if (reaction.emoji.name === '👎') {
				await msg.reply('Sorry that you didn’t find it helpful. The DevOps team will continue improving the answers to ensure satisfaction.');
			}
			await reply.reactions.removeAll();
			collector.stop();
		});
	}
}

async function handleExpDetract(msg: Message | PartialMessage) {
	const bot = msg.client;
	let user: SageUser;
	try {
		user = await msg.author.client.mongo.collection(DB.USERS).findOne({ discordId: msg.author.id });
	} catch (error) { // message deleted is a partial, cannot get user, so ignore.
		return;
	}

	if (user.curExp < user.levelExp) {
		bot.mongo.collection(DB.USERS).findOneAndUpdate(
			{ discordId: msg.author.id },
			{ $inc: { count: 0, curExp: +1 } }
		);
	} else if (user.level > 1) { // if exp for this level exceeds the max, roll back a level.
		bot.mongo.collection(DB.USERS).findOneAndUpdate(
			{ discordId: msg.author.id },
			{ $set: { curExp: 1, levelExp: calcNeededExp(user.levelExp, '-') }, $inc: { level: -1 } }
		);
	}

	if (user.count >= 1) { // it wouldn't make sense to have a negative message count (when using s;check here)
		bot.mongo.collection(DB.USERS).findOneAndUpdate(
			{ discordId: msg.author.id },
			{ $inc: { count: -1, curExp: 0 } }
		);
	}
}

async function handleLevelUp(err: Error, entry: SageUser, msg: Message): Promise<void> {
	if (err) {
		throw err;
	}

	if (!entry) {
		throw new DatabaseError(`Member ${msg.author.username} (${msg.author.id}) not in database`);
	}

	if (--entry.curExp <= 0) {
		entry.curExp = entry.levelExp = calcNeededExp(entry.levelExp, '+');
		entry.level++;
		if (entry.levelPings) {
			sendLevelPing(msg, entry);
		}
		let addRole: Role;
		if (!(addRole = msg.guild.roles.cache.find(r => r.name === `Level ${entry.level}`))
			&& entry.level <= maxLevel) { // make a new level role if it doesn't exist
			addRole = await msg.guild.roles.create({
				name: `Level ${entry.level}`,
				color: createLevelRgb(entry.level),
				position: msg.guild.roles.cache.get(ROLES.VERIFIED).position + 1,
				permissions: BigInt(0),
				reason: `${msg.author.username} is the first to get to Level ${entry.level}`
			});
		}

		if (entry.level <= maxLevel) {
			await msg.member.roles.remove(msg.member.roles.cache.find(r => r.name.startsWith('Level')), `${msg.author.username} leveled up.`);
			msg.member.roles.add(addRole, `${msg.author.username} leveled up.`);
		}

		if (entry.level > maxLevel
			&& !(addRole = msg.guild.roles.cache.find(r => r.name === `Power User`))) {
			addRole = await msg.guild.roles.create({
				name: `Power User`,
				color: maxGreen,
				position: msg.guild.roles.cache.get(ROLES.VERIFIED).position + 1,
				permissions: BigInt(0),
				reason: `${msg.author.username} is the first to become a power user!`
			});
		}
		if (entry.level > maxLevel && !msg.member.roles.cache.find(r => r.name === 'Power User')) {
			msg.member.roles.remove(msg.member.roles.cache.find(r => r.name.startsWith('Level')), `${msg.author.username} leveled up.`);
			msg.member.roles.add(addRole, `${msg.author.username} leveled up.`);
		}

		msg.client.mongo.collection(DB.USERS).updateOne({ discordId: msg.author.id }, { $set: { ...entry } });
	}
}

async function sendLevelPing(msg: Message, user: SageUser): Promise<Message> {
	let embedText: string;
	if (startingColor + (user.level * greenIncrement) >= 255 - greenIncrement) {
		embedText = `Congratulations, you have advanced to level ${user.level}!
		\nYou're about as green as you can get, but keep striving for higher levels to show off to your friends!`;
	} else {
		embedText = `Congratulations ${msg.author.username}, you have advanced to level ${user.level}!\n Keep up the great work!`;
	}
	const embed = new EmbedBuilder()
		.setThumbnail(msg.author.avatarURL())
		.setTitle('<:steve_peace:883541149032267816> Level up!')
		.setDescription(embedText)
		.addFields({ name: 'XP to next level:', value: user.levelExp.toString(), inline: true })
		.setColor(createLevelRgb(user.level))
		.setFooter({ text: 'You can turn the messages off by using the `/togglelevelpings` command' })
		.setTimestamp();

	// eslint-disable-next-line no-extra-parens
	return (msg.guild.channels.cache.get(CHANNELS.SAGE) as TextChannel).send({
		content: `${msg.member}, you have leveled up!`,
		embeds: [embed]
	});
}

function createLevelRgb(level: number): [number, number, number] {
	return [2, Math.min(startingColor + (level * greenIncrement), 255), 0];
}

export default register;
