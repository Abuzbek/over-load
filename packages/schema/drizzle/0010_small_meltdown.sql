CREATE TABLE `measurements` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`measured_at` integer NOT NULL,
	`values` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `measurements_measured_idx` ON `measurements` (`measured_at`);--> statement-breakpoint
CREATE TABLE `progress_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`taken_at` integer NOT NULL,
	`pose` text NOT NULL,
	`uri` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `progress_photos_taken_idx` ON `progress_photos` (`taken_at`);--> statement-breakpoint
ALTER TABLE `weigh_ins` ADD `body_fat_percent` real;--> statement-breakpoint
CREATE TRIGGER `measurements_outbox_insert` AFTER INSERT ON `measurements` WHEN (SELECT applying FROM sync_flags WHERE id = 1) = 0 BEGIN
  INSERT INTO sync_outbox (table_name, row_id, seq)
  VALUES ('measurements', NEW.id, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_outbox))
  ON CONFLICT (table_name, row_id) DO UPDATE SET seq = excluded.seq;
END;
--> statement-breakpoint
CREATE TRIGGER `measurements_outbox_update` AFTER UPDATE ON `measurements` WHEN (SELECT applying FROM sync_flags WHERE id = 1) = 0 BEGIN
  INSERT INTO sync_outbox (table_name, row_id, seq)
  VALUES ('measurements', NEW.id, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_outbox))
  ON CONFLICT (table_name, row_id) DO UPDATE SET seq = excluded.seq;
END;
--> statement-breakpoint
CREATE TRIGGER `progress_photos_outbox_insert` AFTER INSERT ON `progress_photos` WHEN (SELECT applying FROM sync_flags WHERE id = 1) = 0 BEGIN
  INSERT INTO sync_outbox (table_name, row_id, seq)
  VALUES ('progress_photos', NEW.id, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_outbox))
  ON CONFLICT (table_name, row_id) DO UPDATE SET seq = excluded.seq;
END;
--> statement-breakpoint
CREATE TRIGGER `progress_photos_outbox_update` AFTER UPDATE ON `progress_photos` WHEN (SELECT applying FROM sync_flags WHERE id = 1) = 0 BEGIN
  INSERT INTO sync_outbox (table_name, row_id, seq)
  VALUES ('progress_photos', NEW.id, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_outbox))
  ON CONFLICT (table_name, row_id) DO UPDATE SET seq = excluded.seq;
END;
