CREATE TABLE "health_check" (
	"id" integer PRIMARY KEY NOT NULL,
	"message" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_labels" (
	"user_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"label_id" uuid NOT NULL,
	CONSTRAINT "item_labels_item_id_label_id_pk" PRIMARY KEY("item_id","label_id")
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"source" text,
	"type" text NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"target_date" date,
	"completed_at" timestamp with time zone,
	CONSTRAINT "items_id_user_id_idx" UNIQUE("id","user_id"),
	CONSTRAINT "items_type_check" CHECK ("items"."type" in ('article', 'video', 'playlist', 'course', 'book', 'other')),
	CONSTRAINT "items_status_check" CHECK ("items"."status" in ('not_started', 'in_progress', 'done'))
);
--> statement-breakpoint
CREATE TABLE "labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "labels_id_user_id_idx" UNIQUE("id","user_id")
);
--> statement-breakpoint
CREATE TABLE "stop_items" (
	"user_id" uuid NOT NULL,
	"stop_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	CONSTRAINT "stop_items_stop_id_item_id_pk" PRIMARY KEY("stop_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "stops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"trail_id" uuid NOT NULL,
	CONSTRAINT "stops_id_user_id_idx" UNIQUE("id","user_id"),
	CONSTRAINT "stops_id_trail_id_idx" UNIQUE("id","trail_id")
);
--> statement-breakpoint
CREATE TABLE "trail_edges" (
	"user_id" uuid NOT NULL,
	"from_stop_id" uuid NOT NULL,
	"to_stop_id" uuid NOT NULL,
	"trail_id" uuid NOT NULL,
	CONSTRAINT "trail_edges_user_id_from_stop_id_to_stop_id_pk" PRIMARY KEY("user_id","from_stop_id","to_stop_id"),
	CONSTRAINT "trail_edges_no_self_loop" CHECK ("trail_edges"."from_stop_id" <> "trail_edges"."to_stop_id")
);
--> statement-breakpoint
CREATE TABLE "trails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trails_id_user_id_idx" UNIQUE("id","user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
ALTER TABLE "item_labels" ADD CONSTRAINT "item_labels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_labels" ADD CONSTRAINT "item_labels_item_owner_fk" FOREIGN KEY ("item_id","user_id") REFERENCES "public"."items"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_labels" ADD CONSTRAINT "item_labels_label_owner_fk" FOREIGN KEY ("label_id","user_id") REFERENCES "public"."labels"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stop_items" ADD CONSTRAINT "stop_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stop_items" ADD CONSTRAINT "stop_items_stop_id_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."stops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stop_items" ADD CONSTRAINT "stop_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stop_items" ADD CONSTRAINT "stop_items_stop_owner_fk" FOREIGN KEY ("stop_id","user_id") REFERENCES "public"."stops"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stop_items" ADD CONSTRAINT "stop_items_item_owner_fk" FOREIGN KEY ("item_id","user_id") REFERENCES "public"."items"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stops" ADD CONSTRAINT "stops_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stops" ADD CONSTRAINT "stops_trail_owner_fk" FOREIGN KEY ("trail_id","user_id") REFERENCES "public"."trails"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trail_edges" ADD CONSTRAINT "trail_edges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trail_edges" ADD CONSTRAINT "trail_edges_from_owner_fk" FOREIGN KEY ("from_stop_id","user_id") REFERENCES "public"."stops"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trail_edges" ADD CONSTRAINT "trail_edges_to_owner_fk" FOREIGN KEY ("to_stop_id","user_id") REFERENCES "public"."stops"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trail_edges" ADD CONSTRAINT "trail_edges_from_trail_fk" FOREIGN KEY ("from_stop_id","trail_id") REFERENCES "public"."stops"("id","trail_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trail_edges" ADD CONSTRAINT "trail_edges_to_trail_fk" FOREIGN KEY ("to_stop_id","trail_id") REFERENCES "public"."stops"("id","trail_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trails" ADD CONSTRAINT "trails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_labels_label_id_idx" ON "item_labels" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX "items_user_id_idx" ON "items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "labels_user_id_idx" ON "labels" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stop_items_item_id_idx" ON "stop_items" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "stops_user_id_idx" ON "stops" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stops_trail_id_idx" ON "stops" USING btree ("trail_id");--> statement-breakpoint
CREATE INDEX "trail_edges_to_stop_id_idx" ON "trail_edges" USING btree ("user_id","to_stop_id");--> statement-breakpoint
CREATE INDEX "trail_edges_trail_id_idx" ON "trail_edges" USING btree ("user_id","trail_id");--> statement-breakpoint
CREATE INDEX "trails_user_id_idx" ON "trails" USING btree ("user_id");--> statement-breakpoint
-- Seed the health probe's single row. Hand-added below the generated DDL:
-- `drizzle-kit generate` diffs schema, not data, so it neither writes nor
-- rewrites this statement — and the `meta/` snapshot is derived from the
-- TypeScript, so editing this file cannot desynchronise a future diff.
--
-- The standing rule this sets (#106): reference data the application's
-- correctness depends on ships in the migration that creates its table; demo
-- data and per-environment fixtures do not belong in a migration at all.
-- `/api/health` reports `message: "unknown"` without this row, so it is the
-- former.
INSERT INTO "health_check" ("id", "message")
VALUES (1, 'unshelf api is alive')
ON CONFLICT ("id") DO NOTHING;
