CREATE TABLE `gyms` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`name` text NOT NULL,
	`equipment` text NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `app_settings` ADD `active_gym_id` text REFERENCES gyms(id);