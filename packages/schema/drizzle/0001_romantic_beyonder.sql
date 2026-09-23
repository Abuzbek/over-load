CREATE TABLE `sync_cursors` (
	`table_name` text PRIMARY KEY NOT NULL,
	`cursor` integer NOT NULL,
	`uid` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_flags` (
	`id` integer PRIMARY KEY NOT NULL,
	`applying` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_outbox` (
	`table_name` text NOT NULL,
	`row_id` text NOT NULL,
	`seq` integer NOT NULL,
	PRIMARY KEY(`table_name`, `row_id`)
);
--> statement-breakpoint
CREATE INDEX `sync_outbox_seq_idx` ON `sync_outbox` (`seq`);