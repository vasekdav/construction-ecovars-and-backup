CREATE TYPE "public"."rule_result" AS ENUM('GO', 'WARNING', 'NO-GO', 'NOT_EVALUATED');--> statement-breakpoint
CREATE TYPE "public"."rule_status" AS ENUM('DRAFT', 'VERIFIED');--> statement-breakpoint
CREATE TABLE "design_inputs" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"template_key" text NOT NULL,
	"template_version" integer NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "rule_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"rule_id" text NOT NULL,
	"rule_version" integer NOT NULL,
	"rule_status" "rule_status" NOT NULL,
	"result" "rule_result" NOT NULL,
	"overridden" boolean DEFAULT false NOT NULL,
	"inputs" jsonb NOT NULL,
	"params" jsonb NOT NULL,
	"details" jsonb,
	"evaluated_by" uuid NOT NULL,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rule_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"rule_id" text NOT NULL,
	"rule_version" integer NOT NULL,
	"fingerprint" text NOT NULL,
	"reason" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"revoke_reason" text
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"id" text NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"status" "rule_status" DEFAULT 'DRAFT' NOT NULL,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"change_note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rules_id_version_pk" PRIMARY KEY("id","version")
);
--> statement-breakpoint
CREATE TABLE "standards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"title_cs" text NOT NULL,
	"title_en" text NOT NULL,
	"revision" text,
	"applies_to" text[] NOT NULL,
	"notes" text,
	"status" "rule_status" DEFAULT 'DRAFT' NOT NULL,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "standards_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "design_inputs" ADD CONSTRAINT "design_inputs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_inputs" ADD CONSTRAINT "design_inputs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_evaluations" ADD CONSTRAINT "rule_evaluations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_evaluations" ADD CONSTRAINT "rule_evaluations_evaluated_by_users_id_fk" FOREIGN KEY ("evaluated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_overrides" ADD CONSTRAINT "rule_overrides_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_overrides" ADD CONSTRAINT "rule_overrides_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_overrides" ADD CONSTRAINT "rule_overrides_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standards" ADD CONSTRAINT "standards_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rule_evaluations_project_idx" ON "rule_evaluations" USING btree ("project_id","evaluated_at");--> statement-breakpoint
CREATE INDEX "rule_evaluations_run_idx" ON "rule_evaluations" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "rule_overrides_project_idx" ON "rule_overrides" USING btree ("project_id","rule_id");