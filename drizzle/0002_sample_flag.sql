ALTER TABLE "campaigns" ADD COLUMN "is_sample" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "is_sample" boolean DEFAULT false NOT NULL;