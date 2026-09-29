CREATE TABLE `weigh_ins` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`weight_kg` real NOT NULL,
	`measured_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `weigh_ins_measured_idx` ON `weigh_ins` (`measured_at`);--> statement-breakpoint
CREATE TRIGGER `weigh_ins_outbox_insert` AFTER INSERT ON `weigh_ins` WHEN (SELECT applying FROM sync_flags WHERE id = 1) = 0 BEGIN
  INSERT INTO sync_outbox (table_name, row_id, seq)
  VALUES ('weigh_ins', NEW.id, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_outbox))
  ON CONFLICT (table_name, row_id) DO UPDATE SET seq = excluded.seq;
END;
--> statement-breakpoint
CREATE TRIGGER `weigh_ins_outbox_update` AFTER UPDATE ON `weigh_ins` WHEN (SELECT applying FROM sync_flags WHERE id = 1) = 0 BEGIN
  INSERT INTO sync_outbox (table_name, row_id, seq)
  VALUES ('weigh_ins', NEW.id, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_outbox))
  ON CONFLICT (table_name, row_id) DO UPDATE SET seq = excluded.seq;
END;
