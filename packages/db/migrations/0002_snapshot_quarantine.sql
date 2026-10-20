ALTER TABLE "snapshots" ADD COLUMN "quarantined" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "snapshots" ADD COLUMN "quarantine_reason" text;--> statement-breakpoint
ALTER TABLE "snapshots" ADD COLUMN "supplier_note" text;--> statement-breakpoint
ALTER TABLE "snapshots" ADD COLUMN "reviewed_by" text;--> statement-breakpoint
ALTER TABLE "snapshots" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "snapshots" ADD COLUMN "rejected" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "snapshots_quarantine_idx" ON "snapshots" USING btree ("quarantined") WHERE "snapshots"."quarantined";