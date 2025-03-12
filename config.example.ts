interface Config {
	DB_CONNECTION: string;
	BOT_NAME: string;
	BOT_TOKEN: string;
	BOT_CLIENT_ID: string;
	DB_USERS: string;
	DB_PVQ: string;
	DB_QTAGS: string;
	DB_ASSIGNABLE: string;
	DB_COURSES: string;
	DB_REMINDERS: string;
	DB_CLIENT_DATA: string;
	DB_POLLS: string;
	GUILD_MAIN: string;
	GUILD_GATEWAY: string;
	GUILD_GATEWAY_INVITE: string;
	ROLE_ADMIN: string;
	ROLE_STUDENT_ADMIN: string;
	ROLE_STAFF: string;
	ROLE_VERIFIED: string;
	ROLE_MUTED: string;
	ROLE_LEVEL_ONE: string;
	EMAIL_SENDER: string;
	EMAIL_REPLY_TO: string;
	EMAIL_REPORT_ADDRESSES: string;
	CHANNEL_ERROR_LOG: string;
	CHANNEL_SERVER_LOG: string;
	CHANNEL_MEMBER_LOG: string;
	CHANNEL_MOD_LOG: string;
	CHANNEL_FEEDBACK: string;
	CHANNEL_SAGE: string;
	CHANNEL_ANNOUNCEMENTS: string;
	CHANNEL_ARCHIVE: string;
	CHANNEL_ROLE_SELECT: string;
	ROLE_DROPDOWNS_COURSE_ROLES: string;
	ROLE_DROPDOWNS_ASSIGN_ROLES: string;
	MONGO: string;
	LEVEL_TIER_ROLES: string;
	FIRST_LEVEL: string;
	ENV_GITHUB_TOKEN: string;
	ENV_GITHUB_PROJECT: string;
	PREFIX: string;
	MAINTAINERS: string;
	SEMESTER_ID: string;
	BLACKLIST: string;
}

function getEnvVar(name: keyof Config): string {
	const value = process.env[name];
	if (value === undefined) {
		throw new Error(`Environment variable ${name} is not set`);
	}
	return value;
}

export const config: Config = {
	DB_CONNECTION: getEnvVar('DB_CONNECTION'),
	BOT_NAME: getEnvVar('BOT_NAME'),
	BOT_TOKEN: getEnvVar('BOT_TOKEN'),
	BOT_CLIENT_ID: getEnvVar('BOT_CLIENT_ID'),
	DB_USERS: getEnvVar('DB_USERS'),
	DB_PVQ: getEnvVar('DB_PVQ'),
	DB_QTAGS: getEnvVar('DB_QTAGS'),
	DB_ASSIGNABLE: getEnvVar('DB_ASSIGNABLE'),
	DB_COURSES: getEnvVar('DB_COURSES'),
	DB_REMINDERS: getEnvVar('DB_REMINDERS'),
	DB_CLIENT_DATA: getEnvVar('DB_CLIENT_DATA'),
	DB_POLLS: getEnvVar('DB_POLLS'),
	GUILD_MAIN: getEnvVar('GUILD_MAIN'),
	GUILD_GATEWAY: getEnvVar('GUILD_GATEWAY'),
	GUILD_GATEWAY_INVITE: getEnvVar('GUILD_GATEWAY_INVITE'),
	ROLE_ADMIN: getEnvVar('ROLE_ADMIN'),
	ROLE_STUDENT_ADMIN: getEnvVar('ROLE_STUDENT_ADMIN'),
	ROLE_STAFF: getEnvVar('ROLE_STAFF'),
	ROLE_VERIFIED: getEnvVar('ROLE_VERIFIED'),
	ROLE_MUTED: getEnvVar('ROLE_MUTED'),
	ROLE_LEVEL_ONE: getEnvVar('ROLE_LEVEL_ONE'),
	EMAIL_SENDER: getEnvVar('EMAIL_SENDER'),
	EMAIL_REPLY_TO: getEnvVar('EMAIL_REPLY_TO'),
	EMAIL_REPORT_ADDRESSES: getEnvVar('EMAIL_REPORT_ADDRESSES'),
	CHANNEL_ERROR_LOG: getEnvVar('CHANNEL_ERROR_LOG'),
	CHANNEL_SERVER_LOG: getEnvVar('CHANNEL_SERVER_LOG'),
	CHANNEL_MEMBER_LOG: getEnvVar('CHANNEL_MEMBER_LOG'),
	CHANNEL_MOD_LOG: getEnvVar('CHANNEL_MOD_LOG'),
	CHANNEL_FEEDBACK: getEnvVar('CHANNEL_FEEDBACK'),
	CHANNEL_SAGE: getEnvVar('CHANNEL_SAGE'),
	CHANNEL_ANNOUNCEMENTS: getEnvVar('CHANNEL_ANNOUNCEMENTS'),
	CHANNEL_ARCHIVE: getEnvVar('CHANNEL_ARCHIVE'),
	CHANNEL_ROLE_SELECT: getEnvVar('CHANNEL_ROLE_SELECT'),
	ROLE_DROPDOWNS_COURSE_ROLES: getEnvVar('ROLE_DROPDOWNS_COURSE_ROLES'),
	ROLE_DROPDOWNS_ASSIGN_ROLES: getEnvVar('ROLE_DROPDOWNS_ASSIGN_ROLES'),
	MONGO: getEnvVar('MONGO'),
	LEVEL_TIER_ROLES: getEnvVar('LEVEL_TIER_ROLES'),
	FIRST_LEVEL: getEnvVar('FIRST_LEVEL'),
	ENV_GITHUB_TOKEN: getEnvVar('ENV_GITHUB_TOKEN'),
	ENV_GITHUB_PROJECT: getEnvVar('ENV_GITHUB_PROJECT'),
	PREFIX: getEnvVar('PREFIX'),
	MAINTAINERS: getEnvVar('MAINTAINERS'),
	SEMESTER_ID: getEnvVar('SEMESTER_ID'),
	BLACKLIST: getEnvVar('BLACKLIST')
};
/*
export const { DB_CONNECTION } = process.env.DB_CONNECTION;
export const { BOT_NAME } = process.env;
export const { BOT_TOKEN } = process.env;
export const { BOT_CLIENT_ID } = process.env;
export const { DB_USERS } = process.env;
export const { DB_PVQ } = process.env;
export const { DB_QTAGS } = process.env;
export const { DB_ASSIGNABLE } = process.env;
export const { DB_COURSES } = process.env;
export const { DB_REMINDERS } = process.env;
export const { DB_CLIENT_DATA } = process.env;
export const { DB_POLLS } = process.env;
export const { GUILD_MAIN } = process.env;
export const { GUILD_GATEWAY } = process.env;
export const { GUILD_GATEWAY_INVITE } = process.env;
export const { ROLE_ADMIN } = process.env;
export const { ROLE_STUDENT_ADMIN } = process.env;
export const { ROLE_STAFF } = process.env;
export const { ROLE_VERIFIED } = process.env;
export const { ROLE_MUTED } = process.env;
export const { ROLE_LEVEL_ONE } = process.env;
export const { EMAIL_SENDER } = process.env;
export const { EMAIL_REPLY_TO } = process.env;
export const { EMAIL_REPORT_ADDRESSES } = process.env;
export const { CHANNEL_ERROR_LOG } = process.env;
export const { CHANNEL_SERVER_LOG } = process.env;
export const { CHANNEL_MEMBER_LOG } = process.env;
export const { CHANNEL_MOD_LOG } = process.env;
export const { CHANNEL_FEEDBACK } = process.env;
export const { CHANNEL_SAGE } = process.env;
export const { CHANNEL_ANNOUNCEMENTS } = process.env;
export const { CHANNEL_ARCHIVE } = process.env;
export const { CHANNEL_ROLE_SELECT } = process.env;
export const { ROLE_DROPDOWNS_COURSE_ROLES } = process.env;
export const { ROLE_DROPDOWNS_ASSIGN_ROLES } = process.env;
*/

export const BOT = {
	TOKEN: config.BOT_TOKEN,
	CLIENT_ID: config.BOT_CLIENT_ID,
	NAME: config.BOT_NAME
};

export const DB = {
	CONNECTION: config.DB_CONNECTION,
	USERS: config.DB_USERS,
	PVQ: config.DB_PVQ,
	QTAGS: config.DB_QTAGS,
	ASSIGNABLE: config.DB_ASSIGNABLE,
	COURSES: config.DB_COURSES,
	REMINDERS: config.DB_REMINDERS,
	CLIENT_DATA: config.DB_CLIENT_DATA,
	POLLS: config.DB_POLLS
};

export const GUILDS = {
	MAIN: config.GUILD_MAIN,
	GATEWAY: config.GUILD_GATEWAY,
	GATEWAY_INVITE: config.GUILD_GATEWAY_INVITE
};

export const ROLES = {
	ADMIN: config.ROLE_ADMIN,
	STUDENT_ADMIN: config.ROLE_STUDENT_ADMIN,
	STAFF: config.ROLE_STAFF,
	VERIFIED: config.ROLE_VERIFIED,
	MUTED: config.ROLE_MUTED,
	LEVEL_ONE: config.ROLE_LEVEL_ONE
};

export const EMAIL = {
	SENDER: config.EMAIL_SENDER,
	REPLY_TO: config.EMAIL_REPLY_TO,
	REPORT_ADDRESSES: config.EMAIL_REPORT_ADDRESSES
};

export const CHANNELS = {
	ERROR_LOG: config.CHANNEL_ERROR_LOG,
	SERVER_LOG: config.CHANNEL_SERVER_LOG,
	MEMBER_LOG: config.CHANNEL_MEMBER_LOG,
	MOD_LOG: config.CHANNEL_MOD_LOG,
	FEEDBACK: config.CHANNEL_FEEDBACK,
	SAGE: config.CHANNEL_SAGE,
	ANNOUNCEMENTS: config.CHANNEL_ANNOUNCEMENTS,
	ARCHIVE: config.CHANNEL_ARCHIVE,
	ROLE_SELECT: config.CHANNEL_ROLE_SELECT
};

export const ROLE_DROPDOWNS = {
	COURSE_ROLES: config.ROLE_DROPDOWNS_COURSE_ROLES,
	ASSIGN_ROLES: config.ROLE_DROPDOWNS_ASSIGN_ROLES
};

export const GITHUB_PROJECT = config.ENV_GITHUB_PROJECT;

// eslint-disable-next-line prefer-destructuring
export const SEMESTER_ID = config.SEMESTER_ID;

export const FIRST_LEVEL = 10;

export const LEVEL_TIER_ROLES = [config.LEVEL_TIER_ROLES];

// eslint-disable-next-line prefer-destructuring
export const MAINTAINERS = config.MAINTAINERS;

// eslint-disable-next-line prefer-destructuring
export const PREFIX = config.PREFIX;

export const BLACKLIST = [config.BLACKLIST];

export const GITHUB_TOKEN = config.ENV_GITHUB_TOKEN;

// eslint-disable-next-line prefer-destructuring
export const MONGO = config.MONGO;
