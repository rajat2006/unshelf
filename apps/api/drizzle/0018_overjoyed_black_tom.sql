CREATE TABLE "chapter_research_admission" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"dispatched" integer NOT NULL,
	"claim" uuid,
	"expires_at" timestamp with time zone,
	CONSTRAINT "chapter_research_count" CHECK ("chapter_research_admission"."dispatched" between 0 and 10),
	CONSTRAINT "chapter_research_claim" CHECK (("chapter_research_admission"."claim" is null) = ("chapter_research_admission"."expires_at" is null))
);
--> statement-breakpoint
ALTER TABLE "chapter_research_admission" ADD CONSTRAINT "chapter_research_admission_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;