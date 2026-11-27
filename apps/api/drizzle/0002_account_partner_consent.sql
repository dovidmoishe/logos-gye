CREATE TABLE "account_agreements" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"recipient" text NOT NULL,
	"status" "partner_status" NOT NULL,
	"scope" text NOT NULL,
	"created_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_agreements" ADD CONSTRAINT "account_agreements_owner_accounts_id_fk" FOREIGN KEY ("owner") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_agreements" ADD CONSTRAINT "account_agreements_recipient_accounts_id_fk" FOREIGN KEY ("recipient") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agreements_active_pair" ON "account_agreements" USING btree ("owner","recipient") WHERE "account_agreements"."status" in ('Pending','Connected');--> statement-breakpoint
CREATE INDEX "agreements_recipient_idx" ON "account_agreements" USING btree ("recipient");