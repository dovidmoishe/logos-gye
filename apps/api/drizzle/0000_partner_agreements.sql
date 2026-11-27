CREATE TYPE "public"."partner_status" AS ENUM('Pending', 'Connected', 'Declined', 'Revoked', 'Expired');--> statement-breakpoint
CREATE TABLE "partners" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace" text NOT NULL,
	"email" text NOT NULL,
	"status" "partner_status" NOT NULL,
	"expires_at" bigint NOT NULL,
	"sequence" serial NOT NULL
);
--> statement-breakpoint
CREATE INDEX "partners_workspace_sequence_idx" ON "partners" USING btree ("workspace","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "partners_active_email_idx" ON "partners" USING btree ("workspace","email") WHERE "partners"."status" in ('Pending','Connected');