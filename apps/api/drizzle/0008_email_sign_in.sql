CREATE TABLE "login_challenges" (
	"email" text PRIMARY KEY NOT NULL,
	"challenge_hash" text NOT NULL,
	"code_hash" text NOT NULL,
	"sent_at" bigint NOT NULL,
	"window_start" bigint NOT NULL,
	"sends" integer NOT NULL,
	"attempts" integer NOT NULL
);
