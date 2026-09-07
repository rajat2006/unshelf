CREATE TABLE "part_confirmation_receipts" (
	"user_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"confirmation_key" uuid NOT NULL,
	"payload_digest" text NOT NULL,
	"committed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "part_confirmation_receipts_user_id_item_id_confirmation_key_pk" PRIMARY KEY("user_id","item_id","confirmation_key")
);
--> statement-breakpoint
ALTER TABLE "part_confirmation_receipts" ADD CONSTRAINT "part_confirmation_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_confirmation_receipts" ADD CONSTRAINT "part_confirmation_item_owner_fk" FOREIGN KEY ("item_id","user_id") REFERENCES "public"."items"("id","user_id") ON DELETE cascade ON UPDATE no action;