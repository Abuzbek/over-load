CREATE TABLE `__new_program_days` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`program_id` text NOT NULL,
	`day_index` integer NOT NULL,
	`routine_id` text,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`routine_id`) REFERENCES `routines`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_program_days` (`id`, `created_at`, `updated_at`, `deleted_at`, `program_id`, `day_index`, `routine_id`) SELECT `id`, `created_at`, `updated_at`, `deleted_at`, `program_id`, `weekday`, `routine_id` FROM `program_days`;
--> statement-breakpoint
DROP TABLE `program_days`;
--> statement-breakpoint
ALTER TABLE `__new_program_days` RENAME TO `program_days`;
--> statement-breakpoint
CREATE INDEX `program_days_program_idx` ON `program_days` (`program_id`);
