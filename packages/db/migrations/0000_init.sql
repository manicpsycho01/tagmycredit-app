CREATE TYPE "public"."cfo_status" AS ENUM('NOMINATED', 'APPROVED', 'ACTIVE', 'REJECTED', 'ENDED');--> statement-breakpoint
CREATE TYPE "public"."closure_status" AS ENUM('OPEN', 'ACCEPTED', 'OBJECTED', 'AUTO_CLOSED');--> statement-breakpoint
CREATE TYPE "public"."company_status" AS ENUM('UNVERIFIED', 'VERIFIED', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."default_status" AS ENUM('UNDER_REVIEW', 'INFO_REQUESTED', 'UPHELD', 'REJECTED', 'RETRACTED', 'SETTLED');--> statement-breakpoint
CREATE TYPE "public"."dispute_status" AS ENUM('OPEN', 'RESPONDED', 'SUSPENDED', 'REJECTED', 'UPHELD');--> statement-breakpoint
CREATE TYPE "public"."line_status" AS ENUM('PENDING', 'ACTIVE', 'DECLINED', 'EXPIRED', 'CLOSED', 'VOIDED');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('OWNER', 'ADMIN', 'CREDIT_MANAGER', 'VIEWER');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('LINE_CONFIRMATION_REQUESTED', 'LINE_CONFIRMED', 'LINE_DECLINED', 'LINE_EXPIRED', 'LINE_CLOSED', 'LINE_VOIDED', 'AMENDMENT_REQUESTED', 'CLOSURE_REQUESTED', 'DISPUTE_OPENED', 'DISPUTE_DECIDED', 'DEFAULT_FILED', 'DEFAULT_DECIDED', 'NETWORK_ALERT', 'NETWORK_ALERT_RESOLVED', 'COMPANY_VERIFIED', 'CFO_ACTIVE', 'SCORE_RELEASED');--> statement-breakpoint
CREATE TYPE "public"."outbox_channel" AS ENUM('SMS', 'EMAIL');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('QUEUED', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."version_status" AS ENUM('PENDING', 'CONFIRMED', 'DECLINED', 'EXPIRED', 'SUPERSEDED');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" uuid,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"content" "bytea" NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachment_size" CHECK ("attachments"."size_bytes" between 1 and 5242880)
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" text,
	"company_id" uuid,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buyer_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"published" boolean NOT NULL,
	"suppressed_reason" text,
	"frozen" boolean DEFAULT false NOT NULL,
	"score" smallint,
	"band" text,
	"light" text,
	"behaviour" text,
	"confidence" text,
	"exposure_band" text,
	"supplier_band" text,
	"explanation" jsonb,
	"cohort_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cfo_designations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"mobile" text NOT NULL,
	"title" text NOT NULL,
	"authority_doc_id" uuid,
	"status" "cfo_status" DEFAULT 'NOMINATED' NOT NULL,
	"effective_at" timestamp with time zone,
	"nominated_by" text NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cfo_mobile_format" CHECK ("cfo_designations"."mobile" ~ '^\+9665[0-9]{8}$')
);
--> statement-breakpoint
CREATE TABLE "closure_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"line_id" uuid NOT NULL,
	"requested_by" text NOT NULL,
	"reason" text NOT NULL,
	"status" "closure_status" DEFAULT 'OPEN' NOT NULL,
	"respond_by" timestamp with time zone NOT NULL,
	"objection" text,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tmc_id" text NOT NULL,
	"legal_name" text NOT NULL,
	"legal_name_ar" text,
	"cr_number" text NOT NULL,
	"country" text DEFAULT 'SA' NOT NULL,
	"city" text NOT NULL,
	"sector" text NOT NULL,
	"status" "company_status" DEFAULT 'UNVERIFIED' NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_tmc_id_unique" UNIQUE("tmc_id"),
	CONSTRAINT "companies_cr_number_unique" UNIQUE("cr_number"),
	CONSTRAINT "cr_number_format" CHECK ("companies"."cr_number" ~ '^[0-9]{10}$')
);
--> statement-breakpoint
CREATE TABLE "credit_line_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"line_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"limit_halalas" bigint NOT NULL,
	"terms_days" smallint NOT NULL,
	"effective_date" date NOT NULL,
	"attestation" text NOT NULL,
	"status" "version_status" DEFAULT 'PENDING' NOT NULL,
	"proposed_by" text NOT NULL,
	"proposed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"decline_reason" text,
	"locked_until" timestamp with time zone,
	"failed_codes" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "limit_range" CHECK ("credit_line_versions"."limit_halalas" between 1000000 and 50000000000),
	CONSTRAINT "terms_allowed" CHECK ("credit_line_versions"."terms_days" in (30, 45, 60, 90, 120))
);
--> statement-breakpoint
CREATE TABLE "credit_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tcl_id" text NOT NULL,
	"supplier_company_id" uuid NOT NULL,
	"buyer_company_id" uuid NOT NULL,
	"status" "line_status" DEFAULT 'PENDING' NOT NULL,
	"current_version" integer,
	"suspended" boolean DEFAULT false NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"close_reason" text,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	CONSTRAINT "credit_lines_tcl_id_unique" UNIQUE("tcl_id"),
	CONSTRAINT "line_parties_differ" CHECK ("credit_lines"."supplier_company_id" <> "credit_lines"."buyer_company_id")
);
--> statement-breakpoint
CREATE TABLE "default_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"line_id" uuid NOT NULL,
	"reported_by" text NOT NULL,
	"amount_halalas" bigint NOT NULL,
	"oldest_due_date" date NOT NULL,
	"note" text NOT NULL,
	"status" "default_status" DEFAULT 'UNDER_REVIEW' NOT NULL,
	"buyer_reply" text,
	"buyer_reply_by" timestamp with time zone NOT NULL,
	"buyer_replied_at" timestamp with time zone,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"alert_sent" boolean,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "default_amount_positive" CHECK ("default_reports"."amount_halalas" > 0)
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"line_id" uuid NOT NULL,
	"raised_by" text NOT NULL,
	"reason" text NOT NULL,
	"status" "dispute_status" DEFAULT 'OPEN' NOT NULL,
	"respond_by" timestamp with time zone NOT NULL,
	"supplier_response" text,
	"responded_by" text,
	"responded_at" timestamp with time zone,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "member_role" NOT NULL,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"line_id" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"cfo_user_id" text NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" "outbox_channel" NOT NULL,
	"recipient" text NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"status" "outbox_status" DEFAULT 'QUEUED' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "project_links" (
	"project_id" uuid NOT NULL,
	"payer_company_id" uuid NOT NULL,
	"payee_company_id" uuid NOT NULL,
	CONSTRAINT "project_links_project_id_payer_company_id_payee_company_id_pk" PRIMARY KEY("project_id","payer_company_id","payee_company_id"),
	CONSTRAINT "link_parties_differ" CHECK ("project_links"."payer_company_id" <> "project_links"."payee_company_id")
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"project_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"tier" smallint NOT NULL,
	"role_label" text,
	CONSTRAINT "project_members_project_id_company_id_pk" PRIMARY KEY("project_id","company_id"),
	CONSTRAINT "tier_range" CHECK ("project_members"."tier" between 0 and 3)
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"location" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "score_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period" date NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"run_by" text,
	"companies_scored" integer DEFAULT 0 NOT NULL,
	"companies_suppressed" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "score_releases_period_unique" UNIQUE("period")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"line_id" uuid NOT NULL,
	"period" date NOT NULL,
	"outstanding" bigint NOT NULL,
	"not_due" bigint NOT NULL,
	"d1_30" bigint NOT NULL,
	"d31_60" bigint NOT NULL,
	"d61_90" bigint NOT NULL,
	"d90_plus" bigint NOT NULL,
	"settled_total" bigint NOT NULL,
	"settled_on_time" bigint NOT NULL,
	"submitted_by" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "snapshot_period_first_of_month" CHECK (extract(day from "snapshots"."period") = 1),
	CONSTRAINT "snapshot_non_negative" CHECK ("snapshots"."outstanding" >= 0 and "snapshots"."not_due" >= 0 and "snapshots"."d1_30" >= 0 and "snapshots"."d31_60" >= 0 and "snapshots"."d61_90" >= 0 and "snapshots"."d90_plus" >= 0 and "snapshots"."settled_total" >= 0 and "snapshots"."settled_on_time" >= 0),
	CONSTRAINT "snapshot_buckets_sum" CHECK ("snapshots"."not_due" + "snapshots"."d1_30" + "snapshots"."d31_60" + "snapshots"."d61_90" + "snapshots"."d90_plus" = "snapshots"."outstanding"),
	CONSTRAINT "snapshot_on_time_le_total" CHECK ("snapshots"."settled_on_time" <= "snapshots"."settled_total")
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"user_id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_scores" ADD CONSTRAINT "buyer_scores_release_id_score_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."score_releases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_scores" ADD CONSTRAINT "buyer_scores_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cfo_designations" ADD CONSTRAINT "cfo_designations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cfo_designations" ADD CONSTRAINT "cfo_designations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closure_requests" ADD CONSTRAINT "closure_requests_line_id_credit_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."credit_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_line_versions" ADD CONSTRAINT "credit_line_versions_line_id_credit_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."credit_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_lines" ADD CONSTRAINT "credit_lines_supplier_company_id_companies_id_fk" FOREIGN KEY ("supplier_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_lines" ADD CONSTRAINT "credit_lines_buyer_company_id_companies_id_fk" FOREIGN KEY ("buyer_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "default_reports" ADD CONSTRAINT "default_reports_line_id_credit_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."credit_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_line_id_credit_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."credit_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_version_id_credit_line_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."credit_line_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_links" ADD CONSTRAINT "project_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_links" ADD CONSTRAINT "project_links_payer_company_id_companies_id_fk" FOREIGN KEY ("payer_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_links" ADD CONSTRAINT "project_links_payee_company_id_companies_id_fk" FOREIGN KEY ("payee_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_company_id_companies_id_fk" FOREIGN KEY ("owner_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_line_id_credit_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."credit_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "attachments_owner_idx" ON "attachments" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_company_idx" ON "audit_events" USING btree ("company_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "score_release_company" ON "buyer_scores" USING btree ("release_id","company_id");--> statement-breakpoint
CREATE INDEX "scores_company_idx" ON "buyer_scores" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_cfo_per_company" ON "cfo_designations" USING btree ("company_id") WHERE "cfo_designations"."status" = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "one_open_cfo_nomination_per_company" ON "cfo_designations" USING btree ("company_id") WHERE "cfo_designations"."status" in ('NOMINATED', 'APPROVED');--> statement-breakpoint
CREATE UNIQUE INDEX "one_open_closure_per_line" ON "closure_requests" USING btree ("line_id") WHERE "closure_requests"."status" = 'OPEN';--> statement-breakpoint
CREATE UNIQUE INDEX "line_version_unique" ON "credit_line_versions" USING btree ("line_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "one_pending_version_per_line" ON "credit_line_versions" USING btree ("line_id") WHERE "credit_line_versions"."status" = 'PENDING';--> statement-breakpoint
CREATE UNIQUE INDEX "one_open_line_per_pair" ON "credit_lines" USING btree ("supplier_company_id","buyer_company_id") WHERE "credit_lines"."status" in ('PENDING', 'ACTIVE');--> statement-breakpoint
CREATE INDEX "lines_supplier_idx" ON "credit_lines" USING btree ("supplier_company_id");--> statement-breakpoint
CREATE INDEX "lines_buyer_idx" ON "credit_lines" USING btree ("buyer_company_id");--> statement-breakpoint
CREATE INDEX "defaults_line_idx" ON "default_reports" USING btree ("line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_open_dispute_per_line" ON "disputes" USING btree ("line_id") WHERE "disputes"."status" in ('OPEN', 'RESPONDED', 'SUSPENDED');--> statement-breakpoint
CREATE INDEX "memberships_company_idx" ON "memberships" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "notifications_company_idx" ON "notifications" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "otp_version_idx" ON "otp_challenges" USING btree ("version_id","created_at");--> statement-breakpoint
CREATE INDEX "outbox_created_idx" ON "outbox" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "snapshot_line_period" ON "snapshots" USING btree ("line_id","period");