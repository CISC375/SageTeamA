/* eslint-disable @typescript-eslint/no-shadow */
import { Client, TextChannel, Role, Message, EmbedBuilder, PartialMessage, ThreadChannel, ChannelType } from 'discord.js';
import { DatabaseError } from '@lib/types/errors';
import { CHANNELS, DB, ROLES, GUILDS } from '@root/src/pieces/config';
import { SageUser } from '@lib/types/SageUser';
import { calcNeededExp } from '@lib/utils/generalUtils';
import { levenshteinDistance } from '@lib/utils/levenshtein';

const startingColor = 80;
const greenIncrement = 8;
const maxGreen:[number, number, number] = [0, 255, 0];
const maxLevel = 20;
const countedChannelTypes = [
	ChannelType.GuildText,
	ChannelType.PublicThread,
	ChannelType.PrivateThread
];

// Interface for FAQ items
interface FAQItem {
	question: string;
	answer: string;
	category?: string;
	link?: string;
	[key: string]: any; // For any additional properties
}

// Interface for scored FAQ items
interface ScoredFAQItem extends FAQItem {
	score: number;
}

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

// Helper function to determine if a message is likely a question
function isQuestionLike(text: string): boolean {
	const questionWords: string[] = ['who', 'what', 'where', 'when', 'why', 'how', 'can', 'could', 'would', 'should', 'is', 'are', 'does', 'do', 'did'];
	const lowerText = text.toLowerCase();

	// Check if the message starts with a question word
	for (const word of questionWords) {
		if (lowerText.startsWith(`${word} `) || lowerText.includes(` ${word} `)) {
			return true;
		}
	}

	// Additional patterns that suggest questions
	const questionPatterns: string[] = [
		'help', 'looking for', 'need', 'trying to', 'want to know', 'unsure', 'confused',
		'assist', 'explain', 'show me', 'tell me', 'advise', 'having trouble',
		'not sure', 'anyone know', 'help me'
	];

	for (const pattern of questionPatterns) {
		if (lowerText.includes(pattern)) {
			return true;
		}
	}

	return false;
}

// Calculate text similarity between two strings (simple Jaccard similarity)
function textSimilarity(text1: string, text2: string): number {
	const set1 = new Set(text1.split(/\s+/));
	const set2 = new Set(text2.split(/\s+/));

	// Count common words
	const intersection = new Set([...set1].filter(word => set2.has(word)));
	const union = new Set([...set1, ...set2]);

	// Calculate similarity
	return intersection.size / union.size;
}

// Function to find relevant FAQs when no exact match is found
function findRelevantFAQs(query: string, faqs: FAQItem[], limit = 3): FAQItem[] {
	const normalizedQuery = query.toLowerCase().trim();

	// Score each FAQ based on relevance
	const scoredFAQs: ScoredFAQItem[] = faqs.map(faq => {
		let score = 0;

		// Score based on question similarity
		const questionSimilarity = textSimilarity(normalizedQuery, faq.question.toLowerCase());
		score += questionSimilarity * 10;

		// Score based on category match
		if (faq.category && normalizedQuery.includes(faq.category.toLowerCase())) {
			score += 5;
		}

		// Extract keywords from the question
		const keywords = faq.question.toLowerCase()
			.split(/\s+/)
			.filter(word => word.length > 3)
			.filter(word => !['what', 'where', 'when', 'why', 'how', 'can', 'could', 'would', 'is', 'are', 'the', 'and', 'for'].includes(word));

		// Score based on keyword matches
		for (const keyword of keywords) {
			if (normalizedQuery.includes(keyword)) {
				score += 2;
			}
		}

		// Score based on answer content similarity
		if (faq.answer) {
			const answerSimilarity = textSimilarity(normalizedQuery, faq.answer.toLowerCase());
			score += answerSimilarity * 3;
		}

		return { ...faq, score };
	});

	// Filter FAQs with a minimum score and sort by score
	return scoredFAQs
		.filter(faq => faq.score > 0.1) // Minimum relevance threshold
		.sort((a, b) => b.score - a.score)
		.slice(0, limit)
		.map(({ score, ...rest }) => rest as FAQItem); // Remove the score property
}

// Create an embed with relevant FAQs
function createRelevantFAQsEmbed(faqs: FAQItem[]): EmbedBuilder {
	const embed = new EmbedBuilder()
		.setTitle('📚 Related FAQs')
		.setColor('#3498db')
		.setDescription('Here are some FAQs that might help answer your question:')
		.setTimestamp();

	// Add each FAQ to the embed
	faqs.forEach((faq, index) => {
		let answerText = faq.answer;

		// Add link if available
		if (faq.link && faq.link.trim() !== '' && faq.link !== 'undefined') {
			answerText += `\n\n[More information](${faq.link})`;
		}

		// Add category if available
		const namePrefix = faq.category ? `[${faq.category}] ` : '';

		embed.addFields({
			name: `${index + 1}. ${namePrefix}${faq.question}`,
			value: answerText.substring(0, 1024) // Discord field value limit
		});
	});

	return embed;
}

async function handleFAQResponse(msg: Message): Promise<void> {
	if (msg.author.bot || msg.content.startsWith('s;')) return;

	const userQuestion = msg.content.trim();
	if (userQuestion.length < 5) return;

	// Check if the message is likely a question
	const isLikelyQuestion = userQuestion.endsWith('?') || isQuestionLike(userQuestion);
	if (!isLikelyQuestion) return;

	// Apply cooldown to prevent spam
	const cooldown = 3 * 1000;
	const cooldownKey = `faqCooldown_${msg.author.id}`;
	const now = Date.now();
	const cooldownEnd = await msg.client.mongo.collection(DB.CLIENT_DATA).findOne({ _id: cooldownKey });

	if (cooldownEnd && cooldownEnd.value > now) {
		const remainingTime = Math.ceil((cooldownEnd.value - now) / 1000);
		await msg.reply(`Please wait ${remainingTime} seconds before asking another question.`);
		return;
	}

	// Set new cooldown expiration time
	await msg.client.mongo.collection(DB.CLIENT_DATA).updateOne(
		{ _id: cooldownKey },
		{ $set: { value: now + cooldown } },
		{ upsert: true }
	);

	// Get all FAQs from the database
	const faqs = await msg.client.mongo.collection(DB.FAQ).find().toArray() as FAQItem[];
	if (!faqs || faqs.length === 0) return;

	// First, try to find an exact or very close match using Levenshtein distance
	let foundFAQ: FAQItem | null = null;
	const LEVENSHTEIN_THRESHOLD = 5; // Adjust as needed

	for (const faq of faqs) {
		const distance = levenshteinDistance(userQuestion.toLowerCase(), faq.question.toLowerCase());

		// If we find a close match, use it immediately
		if (distance < LEVENSHTEIN_THRESHOLD) {
			foundFAQ = faq;
			break;
		}
	}

	// If exact match found, respond with it
	if (foundFAQ) {
		const embed = new EmbedBuilder()
			.setTitle(foundFAQ.question)
			.setDescription(foundFAQ.answer)
			.setColor('#00FF00')
			.setTimestamp();

		if (foundFAQ.link && foundFAQ.link !== 'undefined') {
			embed.addFields(
				{ name: 'For more details', value: foundFAQ.link });
		}

		await msg.reply({
			content: `${msg.member}, here is the answer to your question:`,
			embeds: [embed]
		});
		return;
	}

	// No exact match found, search for relevant FAQs
	const relevantFAQs = findRelevantFAQs(userQuestion, faqs);

	// If relevant FAQs found, respond with them
	if (relevantFAQs.length > 0) {
		const embed = createRelevantFAQsEmbed(relevantFAQs);
		await msg.reply({
			content: `${msg.member}, I couldn't find an exact match, but here are some related FAQs that might help:`,
			embeds: [embed]
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
