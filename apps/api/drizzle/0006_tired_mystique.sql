CREATE TABLE "parts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	CONSTRAINT "parts_item_position_idx" UNIQUE("item_id","position"),
	CONSTRAINT "parts_id_user_id_idx" UNIQUE("id","user_id"),
	CONSTRAINT "parts_title_nonblank_check" CHECK (btrim("parts"."title") <> ''),
	CONSTRAINT "parts_position_nonnegative_check" CHECK ("parts"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "parts" ADD CONSTRAINT "parts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parts" ADD CONSTRAINT "parts_item_owner_fk" FOREIGN KEY ("item_id","user_id") REFERENCES "public"."items"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "parts_item_id_idx" ON "parts" USING btree ("item_id");