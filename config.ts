export const BOT = {
	TOKEN: "MTM0NTA4OTEwNjE5OTE4NzQ2Ng.GMG_gJ.0ZV-95d64em9DrgY76ECuUXP2u3UW9s809eU3M", // Bot token here
	CLIENT_ID: "1345089106199187466", // Client ID here
	NAME: "NateSage", // Bot Name. NEEDS TO BE LESS THAN 11 CHARACTERS
};

export const MONGO = "";

export const DB = {
	CONNECTION:
		"mongodb+srv://natewolf:Jjgr4y5E6vMzEj1o@cluster0.j53z3.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0", // Mongo connection string here
	USERS: "users",
	PVQ: "pvQuestions",
	QTAGS: "questionTags",
	ASSIGNABLE: "assignable",
	COURSES: "courses",
	REMINDERS: "reminders",
	CLIENT_DATA: "clientData",
	POLLS: "polls",
	JOB_FORMS: "jobForms",
};

export const GUILDS = {
	// Guild IDs for each guild
	MAIN: "1339664883221790740",
	GATEWAY: "1339664883221790740",
	GATEWAY_INVITE: "1339664883221790740",
};

export const ROLES = {
	// Role IDS for each role
	ADMIN: "1340024187791872052",
	STUDENT_ADMIN: "1340024282876743711",
	STAFF: "1340024356104962119",
	VERIFIED: "1340024397137842328",
	MUTED: "1340024443279245354",
	LEVEL_ONE: "1340024472278925354",
};

export const EMAIL = {
	SENDER: "nzwolf@udel.edu", // The email address all emails should be sent from
	REPLY_TO: "nzwolf@udel.edu", // The replyto address for all emails
	REPORT_ADDRESSES: [
		// A list of all the email address to get the weekly report
		"nzwolf@udel.edu", // Add your email here
	],
};

export const CHANNELS = {
	// Channel IDs
	ERROR_LOG: "1340023711990022275",
	SERVER_LOG: "1340023728989409371",
	MEMBER_LOG: "1340023760404742305",
	MOD_LOG: "1340023787483172885",
	FEEDBACK: "1340023799587799040",
	SAGE: "1340023823248130150",
	ANNOUNCEMENTS: "1340023843691040911",
	ARCHIVE: "1340023873252360324",
	ROLE_SELECT: "1340023902960615464",
};

export const ROLE_DROPDOWNS = {
	COURSE_ROLES: "",
	ASSIGN_ROLES: "",
};

export const LEVEL_TIER_ROLES = ["", "", "", "", ""];

export const FIRST_LEVEL = 10;
export const GITHUB_TOKEN = "";
export const GITHUB_PROJECT = "";
export const PREFIX = "s;";
export const MAINTAINERS = "Nathan Wolf"; // The current maintainers of this bot
export const SEMESTER_ID = "s25"; // The current semester ID. i.e. s21
export const BLACKLIST = [];

export const APP_ID = ""; // Adzuna API app ID
export const APP_KEY = ""; // Adzuna API key
