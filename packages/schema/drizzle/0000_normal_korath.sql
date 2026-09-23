CREATE TABLE `app_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`weight_unit` text DEFAULT 'kg' NOT NULL,
	`distance_unit` text DEFAULT 'km' NOT NULL,
	`height_unit` text DEFAULT 'cm' NOT NULL,
	`active_program_id` text,
	`active_gym_id` text,
	`profile_name` text,
	`birth_date` integer,
	`gender` text,
	`bodyweight_kg` real,
	`height_cm` real,
	`lifting_experience` text,
	`cardio_experience` text,
	FOREIGN KEY (`active_program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`active_gym_id`) REFERENCES `gyms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`name` text NOT NULL,
	`tracking_type` text NOT NULL,
	`primary_muscle` text NOT NULL,
	`equipment` text NOT NULL,
	`instructions` text,
	`is_custom` integer DEFAULT false NOT NULL,
	`exercise_type_id` text,
	`region_id` text,
	`rom` integer,
	`stability` integer,
	`bodyweight` real,
	`recommendation_strength` real,
	`recommendation_hypertrophy` real,
	`search_boost` real DEFAULT 0 NOT NULL,
	`search_text` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `exercises_name_idx` ON `exercises` (`name`);--> statement-breakpoint
CREATE TABLE `gyms` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`name` text NOT NULL,
	`icon` text DEFAULT 'dumbbell' NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `equipment` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`kind` text NOT NULL,
	`defaults` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `equipment_category_idx` ON `equipment` (`category`);--> statement-breakpoint
CREATE TABLE `gym_equipment` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`gym_id` text NOT NULL,
	`equipment_id` text NOT NULL,
	`config` text NOT NULL,
	FOREIGN KEY (`gym_id`) REFERENCES `gyms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `gym_equipment_gym_idx` ON `gym_equipment` (`gym_id`);--> statement-breakpoint
CREATE TABLE `catalogue_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `exercise_equipment` (
	`exercise_id` text NOT NULL,
	`need` text NOT NULL,
	`option` integer NOT NULL,
	`equipment_id` text NOT NULL,
	PRIMARY KEY(`exercise_id`, `need`, `option`, `equipment_id`),
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `exercise_links` (
	`exercise_id` text NOT NULL,
	`role` text NOT NULL,
	`position` integer NOT NULL,
	`lookup_id` text NOT NULL,
	PRIMARY KEY(`exercise_id`, `role`, `position`),
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lookup_id`) REFERENCES `lookups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `exercise_links_value_idx` ON `exercise_links` (`role`,`lookup_id`,`exercise_id`);--> statement-breakpoint
CREATE TABLE `exercise_muscles` (
	`exercise_id` text NOT NULL,
	`muscle_id` text NOT NULL,
	`weight` real NOT NULL,
	PRIMARY KEY(`exercise_id`, `muscle_id`),
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`muscle_id`) REFERENCES `lookups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `lookups` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`data` text
);
--> statement-breakpoint
CREATE INDEX `lookups_type_idx` ON `lookups` (`type`);--> statement-breakpoint
CREATE TABLE `program_days` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`program_id` text NOT NULL,
	`day_index` integer NOT NULL,
	`workout_id` text,
	`completed_at` integer,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workout_id`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `program_days_program_idx` ON `program_days` (`program_id`);--> statement-breakpoint
CREATE TABLE `programs` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`name` text NOT NULL,
	`icon` text,
	`icon_color` text,
	`order_index` integer DEFAULT 0 NOT NULL,
	`cycle_number` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workout_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`workout_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`order_index` integer NOT NULL,
	`notes` text,
	`rest_seconds` integer,
	`superset_group` integer,
	FOREIGN KEY (`workout_id`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `workout_exercises_workout_idx` ON `workout_exercises` (`workout_id`);--> statement-breakpoint
CREATE TABLE `workout_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`workout_exercise_id` text NOT NULL,
	`order_index` integer NOT NULL,
	`set_type` text DEFAULT 'normal' NOT NULL,
	`target_reps` integer,
	`target_weight_kg` real,
	`target_rpe` real,
	FOREIGN KEY (`workout_exercise_id`) REFERENCES `workout_exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `workout_sets_parent_idx` ON `workout_sets` (`workout_exercise_id`);--> statement-breakpoint
CREATE TABLE `workouts` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`name` text NOT NULL,
	`notes` text,
	`order_index` integer DEFAULT 0 NOT NULL,
	`program_id` text,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `session_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`session_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`order_index` integer NOT NULL,
	`notes` text,
	`rest_seconds` integer,
	`superset_group` integer,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `session_exercises_session_idx` ON `session_exercises` (`session_id`);--> statement-breakpoint
CREATE INDEX `session_exercises_exercise_idx` ON `session_exercises` (`exercise_id`);--> statement-breakpoint
CREATE TABLE `session_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`session_exercise_id` text NOT NULL,
	`order_index` integer NOT NULL,
	`set_type` text DEFAULT 'normal' NOT NULL,
	`weight_kg` real,
	`reps` integer,
	`duration_seconds` integer,
	`distance_m` real,
	`rpe` real,
	`rir` integer,
	`completed_at` integer,
	FOREIGN KEY (`session_exercise_id`) REFERENCES `session_exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `session_sets_parent_idx` ON `session_sets` (`session_exercise_id`);--> statement-breakpoint
CREATE INDEX `session_sets_completed_idx` ON `session_sets` (`completed_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`workout_id` text,
	`name` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`notes` text,
	FOREIGN KEY (`workout_id`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sessions_started_idx` ON `sessions` (`started_at`);--> statement-breakpoint
CREATE TABLE `personal_records` (
	`id` text PRIMARY KEY NOT NULL,
	`exercise_id` text NOT NULL,
	`type` text NOT NULL,
	`value` real NOT NULL,
	`set_id` text NOT NULL,
	`achieved_at` integer NOT NULL,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `personal_records_exercise_idx` ON `personal_records` (`exercise_id`);