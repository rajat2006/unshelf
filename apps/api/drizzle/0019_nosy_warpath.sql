CREATE TABLE "item_provider_identities" (
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"item_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_provider_identities_user_id_provider_external_id_pk" PRIMARY KEY("user_id","provider","external_id"),
	CONSTRAINT "item_provider_identities_provider_check" CHECK ("item_provider_identities"."provider" = 'youtube')
);
--> statement-breakpoint
ALTER TABLE "item_provider_identities" ADD CONSTRAINT "item_provider_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_provider_identities" ADD CONSTRAINT "item_provider_identities_item_owner_fk" FOREIGN KEY ("item_id","user_id") REFERENCES "public"."items"("id","user_id") ON DELETE no action ON UPDATE no action;