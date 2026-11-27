CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."feed_item_type" AS ENUM('VERSE', 'DECLARATION', 'DEVOTIONAL', 'QUOTE', 'IMAGE', 'VIDEO', 'SERMON');--> statement-breakpoint
CREATE TYPE "public"."testament" AS ENUM('OLD', 'NEW');--> statement-breakpoint
CREATE TYPE "public"."user_event_type" AS ENUM('VERSE_IMPRESSION', 'VERSE_READ', 'VERSE_LIKE', 'VERSE_UNLIKE', 'VERSE_SAVE', 'VERSE_UNSAVE', 'VERSE_SHARE', 'VERSE_SKIP', 'VERSE_REVISIT', 'SEARCH', 'SEARCH_RESULT_OPEN', 'SCRIPTURE_FINDER_QUERY', 'SCRIPTURE_FINDER_RESULT_OPEN');--> statement-breakpoint
CREATE TABLE "bible_books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(64) NOT NULL,
	"abbreviation" varchar(16) NOT NULL,
	"testament" "testament" NOT NULL,
	"book_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bible_translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(128) NOT NULL,
	"language" varchar(16) NOT NULL,
	"license" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bible_translations_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "bible_verses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"translation_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"chapter" integer NOT NULL,
	"verse" integer NOT NULL,
	"text" text NOT NULL,
	"word_count" integer NOT NULL,
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "feed_item_type" DEFAULT 'VERSE' NOT NULL,
	"verse_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"cursor" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text NOT NULL,
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topics_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "user_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"feed_item_id" uuid,
	"verse_id" uuid,
	"event_type" "user_event_type" NOT NULL,
	"request_id" uuid,
	"duration_ms" integer,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_onboarding_topics" (
	"user_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_onboarding_topics_user_id_topic_id_pk" PRIMARY KEY("user_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "user_topic_affinities" (
	"user_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"score" real DEFAULT 0 NOT NULL,
	"interaction_count" integer DEFAULT 0 NOT NULL,
	"last_interaction_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_topic_affinities_user_id_topic_id_pk" PRIMARY KEY("user_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"display_name" varchar(128),
	"avatar_url" text,
	"timezone" varchar(64),
	"xp" integer DEFAULT 0 NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"last_streak_date" date,
	"onboarding_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verse_topics" (
	"verse_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"relevance_score" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verse_topics_verse_id_topic_id_pk" PRIMARY KEY("verse_id","topic_id")
);
--> statement-breakpoint
ALTER TABLE "bible_verses" ADD CONSTRAINT "bible_verses_translation_id_bible_translations_id_fk" FOREIGN KEY ("translation_id") REFERENCES "public"."bible_translations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bible_verses" ADD CONSTRAINT "bible_verses_book_id_bible_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."bible_books"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_items" ADD CONSTRAINT "feed_items_verse_id_bible_verses_id_fk" FOREIGN KEY ("verse_id") REFERENCES "public"."bible_verses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_sessions" ADD CONSTRAINT "feed_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_events" ADD CONSTRAINT "user_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_events" ADD CONSTRAINT "user_events_feed_item_id_feed_items_id_fk" FOREIGN KEY ("feed_item_id") REFERENCES "public"."feed_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_events" ADD CONSTRAINT "user_events_verse_id_bible_verses_id_fk" FOREIGN KEY ("verse_id") REFERENCES "public"."bible_verses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_onboarding_topics" ADD CONSTRAINT "user_onboarding_topics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_onboarding_topics" ADD CONSTRAINT "user_onboarding_topics_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_topic_affinities" ADD CONSTRAINT "user_topic_affinities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_topic_affinities" ADD CONSTRAINT "user_topic_affinities_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verse_topics" ADD CONSTRAINT "verse_topics_verse_id_bible_verses_id_fk" FOREIGN KEY ("verse_id") REFERENCES "public"."bible_verses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verse_topics" ADD CONSTRAINT "verse_topics_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bible_verses_translation_book_chapter_verse_idx" ON "bible_verses" USING btree ("translation_id","book_id","chapter","verse");--> statement-breakpoint
CREATE INDEX "bible_verses_book_chapter_verse_idx" ON "bible_verses" USING btree ("book_id","chapter","verse");--> statement-breakpoint
CREATE INDEX "bible_verses_translation_id_idx" ON "bible_verses" USING btree ("translation_id");--> statement-breakpoint
CREATE INDEX "feed_items_type_verse_id_idx" ON "feed_items" USING btree ("type","verse_id");--> statement-breakpoint
CREATE UNIQUE INDEX "feed_items_verse_id_unique_idx" ON "feed_items" USING btree ("verse_id");--> statement-breakpoint
CREATE INDEX "feed_sessions_user_id_idx" ON "feed_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "feed_sessions_expires_at_idx" ON "feed_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reading_event_retry_idx" ON "user_events" USING btree ("user_id","request_id");--> statement-breakpoint
CREATE INDEX "user_events_user_created_at_idx" ON "user_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "user_events_verse_event_type_idx" ON "user_events" USING btree ("verse_id","event_type");--> statement-breakpoint
CREATE INDEX "user_events_feed_item_id_idx" ON "user_events" USING btree ("feed_item_id");--> statement-breakpoint
CREATE INDEX "user_onboarding_topics_user_id_idx" ON "user_onboarding_topics" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_topic_affinities_user_score_idx" ON "user_topic_affinities" USING btree ("user_id","score");--> statement-breakpoint
CREATE INDEX "verse_topics_topic_relevance_idx" ON "verse_topics" USING btree ("topic_id","relevance_score");--> statement-breakpoint
CREATE INDEX "verse_topics_verse_id_idx" ON "verse_topics" USING btree ("verse_id");