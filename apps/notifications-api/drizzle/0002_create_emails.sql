CREATE TABLE "email_attempts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"email_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"provider" text NOT NULL,
	"smtp_code" integer,
	"provider_message_id" text,
	"detail" text,
	"duration_ms" integer NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_attempts_outcome_known" CHECK ("email_attempts"."outcome" in ('sent', 'deferred', 'rejected', 'provider_unavailable'))
);

CREATE TABLE "emails" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"producer" text NOT NULL,
	"request_id" uuid NOT NULL,
	"from_email" text NOT NULL,
	"from_name" text,
	"to_email" text NOT NULL,
	"to_name" text,
	"reply_to_email" text,
	"reply_to_name" text,
	"subject" text NOT NULL,
	"html" text,
	"text" text,
	"tags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"failure_reason" text,
	"sent_at" timestamp (3) with time zone,
	"failed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "emails_status_known" CHECK ("emails"."status" in ('queued', 'sent', 'failed')),
	CONSTRAINT "emails_failure_reason_known" CHECK ("emails"."failure_reason" is null or "emails"."failure_reason" in ('rejected', 'attempts_exhausted', 'retry_limit_reached', 'sender_forbidden'))
);

CREATE TABLE "events_outbox" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "events_outbox_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"topic" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "events_handled" (
	"consumer" text NOT NULL,
	"event_id" uuid NOT NULL,
	"handled_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_handled_consumer_event_id_pk" PRIMARY KEY("consumer","event_id")
);

ALTER TABLE "email_attempts" ADD CONSTRAINT "email_attempts_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "email_attempts_email_id_created_at_idx" ON "email_attempts" USING btree ("email_id","created_at");
CREATE UNIQUE INDEX "emails_producer_request_id_key" ON "emails" USING btree ("producer","request_id");
CREATE INDEX "events_outbox_created_at_idx" ON "events_outbox" USING btree ("created_at");
CREATE INDEX "events_handled_handled_at_idx" ON "events_handled" USING btree ("handled_at");