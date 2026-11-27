CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	CONSTRAINT "accounts_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"pairing_digest" text,
	"pairing_expires_at" bigint NOT NULL,
	"credential_digest" text,
	"last_check" text,
	"checked_at" bigint,
	CONSTRAINT "devices_pairing_digest_unique" UNIQUE("pairing_digest"),
	CONSTRAINT "devices_credential_digest_unique" UNIQUE("credential_digest")
);
--> statement-breakpoint
CREATE TABLE "account_sessions" (
	"digest" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_owner_accounts_id_fk" FOREIGN KEY ("owner") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_sessions" ADD CONSTRAINT "account_sessions_owner_accounts_id_fk" FOREIGN KEY ("owner") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "devices_owner_idx" ON "devices" USING btree ("owner");