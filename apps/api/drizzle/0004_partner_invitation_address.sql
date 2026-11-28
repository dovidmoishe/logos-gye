ALTER TABLE "account_agreements" ALTER COLUMN "recipient" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "account_agreements" ADD COLUMN "invite_address" text;--> statement-breakpoint
UPDATE "account_agreements" AS a SET "invite_address" = u."username" FROM "accounts" AS u WHERE a."recipient" = u."id";--> statement-breakpoint
ALTER TABLE "account_agreements" ALTER COLUMN "invite_address" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "agreements_active_address" ON "account_agreements" USING btree ("owner","invite_address") WHERE "account_agreements"."status" in ('Pending','Connected');