CREATE TABLE `cycle_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`workout_exercise_id` text NOT NULL,
	`cycle` integer NOT NULL,
	`sets` text NOT NULL,
	FOREIGN KEY (`workout_exercise_id`) REFERENCES `workout_exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cycle_plans_exercise_idx` ON `cycle_plans` (`workout_exercise_id`);--> statement-breakpoint
ALTER TABLE `programs` ADD `cycle_count` integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE `programs` ADD `deload` text DEFAULT 'last' NOT NULL;--> statement-breakpoint
ALTER TABLE `programs` ADD `periodized` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `programs` ADD `goal` text;--> statement-breakpoint
ALTER TABLE `programs` ADD `archived_at` integer;--> statement-breakpoint
ALTER TABLE `session_sets` ADD `suggested_reps` integer;--> statement-breakpoint
-- A generated program was always periodized; a hand-built one never chose a deload.
UPDATE `programs` SET `periodized` = `generated`, `deload` = CASE WHEN `generated` = 1 THEN 'last' ELSE 'none' END;
--> statement-breakpoint
CREATE TRIGGER `cycle_plans_outbox_insert` AFTER INSERT ON `cycle_plans` WHEN (SELECT applying FROM sync_flags WHERE id = 1) = 0 BEGIN
  INSERT INTO sync_outbox (table_name, row_id, seq)
  VALUES ('cycle_plans', NEW.id, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_outbox))
  ON CONFLICT (table_name, row_id) DO UPDATE SET seq = excluded.seq;
END;
--> statement-breakpoint
CREATE TRIGGER `cycle_plans_outbox_update` AFTER UPDATE ON `cycle_plans` WHEN (SELECT applying FROM sync_flags WHERE id = 1) = 0 BEGIN
  INSERT INTO sync_outbox (table_name, row_id, seq)
  VALUES ('cycle_plans', NEW.id, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_outbox))
  ON CONFLICT (table_name, row_id) DO UPDATE SET seq = excluded.seq;
END;
