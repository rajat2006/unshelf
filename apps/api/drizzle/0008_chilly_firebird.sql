CREATE TABLE "daily_focus_items" (
	"daily_focus_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_focus_items_daily_focus_id_item_id_pk" PRIMARY KEY("daily_focus_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "daily_focuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date DEFAULT current_date NOT NULL,
	CONSTRAINT "daily_focuses_user_date_unique" UNIQUE("user_id","date"),
	CONSTRAINT "daily_focuses_id_user_id_idx" UNIQUE("id","user_id")
);
--> statement-breakpoint
ALTER TABLE "daily_focus_items" ADD CONSTRAINT "daily_focus_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_focus_items" ADD CONSTRAINT "daily_focus_items_focus_owner_fk" FOREIGN KEY ("daily_focus_id","user_id") REFERENCES "public"."daily_focuses"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_focus_items" ADD CONSTRAINT "daily_focus_items_item_owner_fk" FOREIGN KEY ("item_id","user_id") REFERENCES "public"."items"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_focuses" ADD CONSTRAINT "daily_focuses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_focus_items_user_id_idx" ON "daily_focus_items" USING btree ("user_id");