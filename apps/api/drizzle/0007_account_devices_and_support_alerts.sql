CREATE TABLE "agreement_live_blocks" (
	"agreement_id" text NOT NULL,
	"domain_key" text NOT NULL,
	"occurred_at" bigint NOT NULL,
	CONSTRAINT "agreement_live_blocks_agreement_id_domain_key_occurred_at_pk" PRIMARY KEY("agreement_id","domain_key","occurred_at")
);
--> statement-breakpoint
ALTER TABLE "partner_mail" ADD COLUMN "kind" text DEFAULT 'weekly' NOT NULL;--> statement-breakpoint
UPDATE partner_mail SET kind='invitation' WHERE period=0;--> statement-breakpoint
ALTER TABLE "partner_mail" DROP CONSTRAINT "partner_mail_agreement_id_period_pk";--> statement-breakpoint
ALTER TABLE "partner_mail" ADD CONSTRAINT "partner_mail_agreement_id_kind_period_pk" PRIMARY KEY("agreement_id","kind","period");--> statement-breakpoint
ALTER TABLE "account_agreements" ADD COLUMN "owner_alerts_at" bigint;--> statement-breakpoint
ALTER TABLE "account_agreements" ADD COLUMN "partner_alerts_at" bigint;--> statement-breakpoint
ALTER TABLE "account_agreements" ADD COLUMN "last_alert_at" bigint;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "installation_id" text;--> statement-breakpoint
ALTER TABLE "agreement_live_blocks" ADD CONSTRAINT "agreement_live_blocks_agreement_id_agreement_reporting_sources_agreement_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."agreement_reporting_sources"("agreement_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "devices_owner_installation" ON "devices" USING btree ("owner","installation_id");