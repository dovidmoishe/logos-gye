CREATE TABLE "partner_mail" (
	"agreement_id" text NOT NULL,
	"period" bigint NOT NULL,
	"next_attempt" bigint NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "partner_mail_agreement_id_period_pk" PRIMARY KEY("agreement_id","period")
);
--> statement-breakpoint
CREATE TABLE "agreement_reporting_sources" (
	"agreement_id" text PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"registered_at" bigint NOT NULL,
	"gateway_account" text NOT NULL,
	"registration" text NOT NULL,
	"adult_policy" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "partner_mail" ADD CONSTRAINT "partner_mail_agreement_id_account_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."account_agreements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_reporting_sources" ADD CONSTRAINT "agreement_reporting_sources_agreement_id_account_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."account_agreements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_reporting_sources" ADD CONSTRAINT "agreement_reporting_sources_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "partner_mail_due" ON "partner_mail" USING btree ("next_attempt");