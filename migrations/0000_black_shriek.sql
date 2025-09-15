CREATE TABLE "check_ins" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"store_id" integer NOT NULL,
	"latitude" numeric(10, 8),
	"longitude" numeric(11, 8),
	"checked_in_at" timestamp DEFAULT now(),
	"checked_out_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"data" jsonb,
	"is_read" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" text PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"store_id" integer NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"phone" text,
	"timezone" text DEFAULT 'UTC',
	"latitude" numeric(10, 8),
	"longitude" numeric(11, 8),
	"geofence_radius" integer DEFAULT 100,
	"qr_code" text,
	"qr_code_secret" text,
	"qr_code_expires_at" timestamp,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "task_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"template_id" integer,
	"title" text NOT NULL,
	"description" text,
	"is_completed" boolean DEFAULT false,
	"photo_required" boolean DEFAULT false,
	"photo_url" text,
	"completed_by" integer,
	"completed_by_name" text,
	"completed_by_role" text,
	"completed_at" timestamp,
	"sort_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "task_lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_by" integer NOT NULL,
	"created_by_name" text,
	"created_by_role" text,
	"recurrence_type" text,
	"recurrence_pattern" text,
	"assignee_type" text DEFAULT 'store_wide' NOT NULL,
	"assignee_id" integer,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "task_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"task_item_id" integer,
	"filename" text NOT NULL,
	"mime_type" text,
	"file_size" integer,
	"url" text,
	"data" "bytea",
	"thumb_data" "bytea",
	"latitude" numeric(10, 8),
	"longitude" numeric(11, 8),
	"uploaded_by" integer NOT NULL,
	"uploaded_by_name" text,
	"uploaded_by_role" text,
	"uploaded_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "task_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"list_id" integer,
	"title" text NOT NULL,
	"description" text,
	"store_id" integer,
	"created_by" integer NOT NULL,
	"recurrence_type" text,
	"recurrence_pattern" text,
	"estimated_duration" integer,
	"photo_required" boolean DEFAULT false,
	"photo_count" integer DEFAULT 1,
	"assignee_type" text DEFAULT 'store_wide' NOT NULL,
	"assignee_id" integer,
	"priority" text DEFAULT 'normal',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "task_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"from_user_id" integer NOT NULL,
	"to_user_id" integer NOT NULL,
	"reason" text,
	"transferred_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer,
	"store_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"assignee_type" text NOT NULL,
	"assignee_id" integer,
	"claimed_by" integer,
	"completed_by" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" text DEFAULT 'normal',
	"scheduled_for" timestamp,
	"due_at" timestamp,
	"claimed_at" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"estimated_duration" integer,
	"actual_duration" integer,
	"photo_required" boolean DEFAULT false,
	"photo_count" integer DEFAULT 1,
	"photos_uploaded" integer DEFAULT 0,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text,
	"first_name" text,
	"last_name" text,
	"role" text DEFAULT 'employee' NOT NULL,
	"pin" text,
	"password_hash" text,
	"store_id" integer,
	"is_active" boolean DEFAULT true,
	"last_login" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");