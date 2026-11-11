CREATE TABLE "calc_configs" (
	"key" text NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"status" "rule_status" DEFAULT 'DRAFT' NOT NULL,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"change_note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calc_configs_key_version_pk" PRIMARY KEY("key","version")
);
--> statement-breakpoint
CREATE TABLE "sizing_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"template_key" text NOT NULL,
	"template_version" integer NOT NULL,
	"answers" jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calc_configs" ADD CONSTRAINT "calc_configs_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calc_configs" ADD CONSTRAINT "calc_configs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sizing_results" ADD CONSTRAINT "sizing_results_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sizing_results" ADD CONSTRAINT "sizing_results_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sizing_results_project_version_uq" ON "sizing_results" USING btree ("project_id","version");