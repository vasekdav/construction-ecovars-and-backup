CREATE TYPE "public"."override_kind" AS ENUM('override', 'acknowledgement');--> statement-breakpoint
ALTER TABLE "rule_overrides" ADD COLUMN "kind" "override_kind" DEFAULT 'override' NOT NULL;