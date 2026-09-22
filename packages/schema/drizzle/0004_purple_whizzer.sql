CREATE TABLE `programs` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`name` text NOT NULL,
	`icon` text,
	`icon_color` text,
	`order_index` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `app_settings` ADD `active_program_id` text REFERENCES programs(id);--> statement-breakpoint
ALTER TABLE `routines` ADD `program_id` text REFERENCES programs(id);