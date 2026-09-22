CREATE TABLE `program_days` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`program_id` text NOT NULL,
	`weekday` integer NOT NULL,
	`routine_id` text,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`routine_id`) REFERENCES `routines`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `program_days_program_idx` ON `program_days` (`program_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_routines` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`name` text NOT NULL,
	`notes` text,
	`order_index` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_routines`("id", "created_at", "updated_at", "deleted_at", "name", "notes", "order_index") SELECT "id", "created_at", "updated_at", "deleted_at", "name", "notes", "order_index" FROM `routines`;--> statement-breakpoint
DROP TABLE `routines`;--> statement-breakpoint
ALTER TABLE `__new_routines` RENAME TO `routines`;--> statement-breakpoint
PRAGMA foreign_keys=ON;