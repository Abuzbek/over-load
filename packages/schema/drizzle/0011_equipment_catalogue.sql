CREATE TABLE `equipment` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`kind` text NOT NULL,
	`defaults` text NOT NULL,
	`satisfies` text NOT NULL
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
CREATE INDEX `gym_equipment_gym_idx` ON `gym_equipment` (`gym_id`);