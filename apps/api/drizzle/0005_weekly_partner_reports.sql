CREATE TABLE "agreement_weekly_reports" (
	"agreement_id" text NOT NULL,
	"week_start" bigint NOT NULL,
	"grouped_requests" integer NOT NULL,
	CONSTRAINT "agreement_weekly_reports_agreement_id_week_start_pk" PRIMARY KEY("agreement_id","week_start"),
	CONSTRAINT "nonnegative_grouped_requests" CHECK ("agreement_weekly_reports"."grouped_requests" >= 0)
);
--> statement-breakpoint
ALTER TABLE "account_agreements" ADD COLUMN "accepted_at" bigint;--> statement-breakpoint
ALTER TABLE "agreement_weekly_reports" ADD CONSTRAINT "agreement_weekly_reports_agreement_id_account_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."account_agreements"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Legacy agreements have no recorded acceptance time. Start their report window here.
UPDATE "account_agreements" SET "accepted_at" = floor(extract(epoch from now()) * 1000)::bigint WHERE "status" = 'Connected' AND "accepted_at" IS NULL;
