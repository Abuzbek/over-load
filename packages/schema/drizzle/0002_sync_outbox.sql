-- Queues every change to the user's own rows for the next push (see
-- packages/schema/src/syncState.ts). Custom exercises only: the seeded
-- catalogue ships in the app. Skipped while a pull is applying remote rows.
INSERT INTO `sync_flags` (`id`, `applying`) VALUES (1, 0);
--> statement-breakpoint
CREATE TRIGGER `gyms_outbox_insert` AFTER INSERT ON `gyms` WHEN (SELECT applying FROM sync_flags WHERE id = 1) = 0 BEGIN
  INSERT INTO sync_outbox (table_name, row_id, seq)
  VALUES ('gyms', NEW.id, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_outbox))
  ON CONFLICT (table_name, row_id) DO UPDATE SET seq = excluded.seq;
END;
--> statement-breakpoint
CREATE TRIGGER `gyms_outbox_update` AFTER UPDATE ON `gyms` WHEN (SELECT applying FROM sync_flags WHERE id = 1) = 0 BEGIN
  INSERT INTO sync_outbox (table_name, row_id, seq)
  VALUES ('gyms', NEW.id, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_outbox))
  ON CONFLICT (table_name, row_id) DO UPDATE SET seq = excluded.seq;
END;
--> statement-breakpoint
CREATE TRIGGER `gym_equipment_outbox_insert` AFTER INSERT ON `gym_equipment` WHEN (SELECT applying FROM sync_flags WHERE id = 1) = 0 BEGIN
  INSERT INTO sync_outbox (table_name, row_id, seq)
  VALUES ('gym_equipment', NEW.id, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_outbox))
  ON CONFLICT (table_name, row_id) DO UPDATE SET seq = excluded.seq;
END;
--> statement-breakpoint
CREATE TRIGGER `gym_equipment_outbox_update` AFTER UPDATE ON `gym_equipment` WHEN (SELECT applying FROM sync_flags WHERE id = 1) = 0 BEGIN
  INSERT INTO sync_outbox (table_name, row_id, seq)
  VALUES ('gym_equipment', NEW.id, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_outbox))
  ON CONFLICT (table_name, row_id) DO UPDATE SET seq = excluded.seq;
END;
--> statement-breakpoint
CREATE TRIGGER `exercises_outbox_insert` AFTER INSERT ON `exercises` WHEN (SELECT applying FROM sync_flags WHERE id = 1) = 0 AND NEW.is_custom = 1 BEGIN
  INSERT INTO sync_outbox (table_name, row_id, seq)
  VALUES ('exercises', NEW.id, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_outbox))
  ON CONFLICT (table_name, row_id) DO UPDATE SET seq = excluded.seq;
END;
--> statement-breakpoint
CREATE TRIGGER `exercises_outbox_update` AFTER UPDATE ON `exercises` WHEN (SELECT applying FROM sync_flags WHERE id = 1) = 0 AND NEW.is_custom = 1 BEGIN
  INSERT INTO sync_outbox (table_name, row_id, seq)
  VALUES ('exercises', NEW.id, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_outbox))
  ON CONFLICT (table_name, row_id) DO UPDATE SET seq = excluded.seq;
END;
--> statement-breakpoint
CREATE TRIGGER `programs_outbox_insert` AFTER INSERT ON `programs` WHEN (SELECT applying FROM sync_flags WHERE id = 1) = 0 BEGIN
  INSERT INTO sync_outbox (table_name, row_id, seq)
  VALUES ('programs', NEW.id, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_outbox))
  ON CONFLICT (table_name, row_id) DO UPDATE SET seq = excluded.seq;
END;
--> statement-breakpoint
CREATE TRIGGER `programs_outbox_update` AFTER UPDATE ON `programs` WHEN (SELECT applying FROM sync_flags WHERE id = 1) = 0 BEGIN
  INSERT INTO sync_outbox (table_name, row_id, seq)
  VALUES ('programs', NEW.id, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_outbox))
  ON CONFLICT (table_name, row_id) DO UPDATE SET seq = excluded.seq;
END;
--> statement-breakpoint
CREATE TRIGGER `workouts_outbox_insert` AFTER INSERT ON `workouts` WHEN (SELECT applying FROM sync_flags WHERE id = 1) = 0 BEGIN
  INSERT INTO sync_outbox (table_name, row_id, seq)
  VALUES ('workouts', NEW.id, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_outbox))
  ON CONFLICT (table_name, row_id) DO UPDATE SET seq = excluded.seq;
END;
--> statement-breakpoint
CREATE TRIGGER `workouts_outbox_update` AFTER UPDATE ON `workouts` WHEN (SELECT applying FROM sync_flags WHERE id = 1) = 0 BEGIN
  INSERT INTO sync_outbox (table_name, row_id, seq)
  VALUES ('workouts', NEW.id, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_outbox))
  ON CONFLICT (table_name, row_id) DO UPDATE SET seq = excluded.seq;
END;
--> statement-breakpoint
CREATE TRIGGER `program_days_outbox_insert` AFTER INSERT ON `program_days` WHEN (SELECT applying FROM sync_flags WHERE id = 1) = 0 BEGIN
  INSERT INTO sync_outbox (table_name, row_id, seq)
  VALUES ('program_days', NEW.id, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_outbox))
  ON CONFLICT (table_name, row_id) DO UPDATE SET seq = excluded.seq;
END;
--> statement-breakpoint
CREATE TRIGGER `program_days_outbox_update` AFTER UPDATE ON `program_days` WHEN (SELECT applying FROM sync_flags WHERE id = 1) = 0 BEGIN
  INSERT INTO sync_outbox (table_name, row_id, seq)
  VALUES ('program_days', NEW.id, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_outbox))
  ON CONFLICT (table_name, row_id) DO UPDATE SET seq = excluded.seq;
END;
--> statement-breakpoint
CREATE TRIGGER `workout_exercises_outbox_insert` AFTER INSERT ON `workout_exercises` WHEN (SELECT applying FROM sync_flags WHERE id = 1) = 0 BEGIN
  INSERT INTO sync_outbox (table_name, row_id, seq)
  VALUES ('workout_exercises', NEW.id, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_outbox))
  ON CONFLICT (table_name, row_id) DO UPDATE SET seq = excluded.seq;
END;
--> statement-breakpoint
CREATE TRIGGER `workout_exercises_outbox_update` AFTER UPDATE ON `workout_exercises` WHEN (SELECT applying FROM sync_flags WHERE id = 1) = 0 BEGIN
  INSERT INTO sync_outbox (table_name, row_id, seq)
  VALUES ('workout_exercises', NEW.id, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_outbox))
  ON CONFLICT (table_name, row_id) DO UPDATE SET seq = excluded.seq;
END;
--> statement-breakpoint
CREATE TRIGGER `workout_sets_outbox_insert` AFTER INSERT ON `workout_sets` WHEN (SELECT applying FROM sync_flags WHERE id = 1) = 0 BEGIN
  INSERT INTO sync_outbox (table_name, row_id, seq)
  VALUES ('workout_sets', NEW.id, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_outbox))
  ON CONFLICT (table_name, row_id) DO UPDATE SET seq = excluded.seq;
END;
--> statement-breakpoint
CREATE TRIGGER `workout_sets_outbox_update` AFTER UPDATE ON `workout_sets` WHEN (SELECT applying FROM sync_flags WHERE id = 1) = 0 BEGIN
  INSERT INTO sync_outbox (table_name, row_id, seq)
  VALUES ('workout_sets', NEW.id, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_outbox))
  ON CONFLICT (table_name, row_id) DO UPDATE SET seq = excluded.seq;
END;
--> statement-breakpoint
CREATE TRIGGER `sessions_outbox_insert` AFTER INSERT ON `sessions` WHEN (SELECT applying FROM sync_flags WHERE id = 1) = 0 BEGIN
  INSERT INTO sync_outbox (table_name, row_id, seq)
  VALUES ('sessions', NEW.id, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_outbox))
  ON CONFLICT (table_name, row_id) DO UPDATE SET seq = excluded.seq;
END;
--> statement-breakpoint
CREATE TRIGGER `sessions_outbox_update` AFTER UPDATE ON `sessions` WHEN (SELECT applying FROM sync_flags WHERE id = 1) = 0 BEGIN
  INSERT INTO sync_outbox (table_name, row_id, seq)
  VALUES ('sessions', NEW.id, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_outbox))
  ON CONFLICT (table_name, row_id) DO UPDATE SET seq = excluded.seq;
END;
--> statement-breakpoint
CREATE TRIGGER `session_exercises_outbox_insert` AFTER INSERT ON `session_exercises` WHEN (SELECT applying FROM sync_flags WHERE id = 1) = 0 BEGIN
  INSERT INTO sync_outbox (table_name, row_id, seq)
  VALUES ('session_exercises', NEW.id, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_outbox))
  ON CONFLICT (table_name, row_id) DO UPDATE SET seq = excluded.seq;
END;
--> statement-breakpoint
CREATE TRIGGER `session_exercises_outbox_update` AFTER UPDATE ON `session_exercises` WHEN (SELECT applying FROM sync_flags WHERE id = 1) = 0 BEGIN
  INSERT INTO sync_outbox (table_name, row_id, seq)
  VALUES ('session_exercises', NEW.id, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_outbox))
  ON CONFLICT (table_name, row_id) DO UPDATE SET seq = excluded.seq;
END;
--> statement-breakpoint
CREATE TRIGGER `session_sets_outbox_insert` AFTER INSERT ON `session_sets` WHEN (SELECT applying FROM sync_flags WHERE id = 1) = 0 BEGIN
  INSERT INTO sync_outbox (table_name, row_id, seq)
  VALUES ('session_sets', NEW.id, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_outbox))
  ON CONFLICT (table_name, row_id) DO UPDATE SET seq = excluded.seq;
END;
--> statement-breakpoint
CREATE TRIGGER `session_sets_outbox_update` AFTER UPDATE ON `session_sets` WHEN (SELECT applying FROM sync_flags WHERE id = 1) = 0 BEGIN
  INSERT INTO sync_outbox (table_name, row_id, seq)
  VALUES ('session_sets', NEW.id, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_outbox))
  ON CONFLICT (table_name, row_id) DO UPDATE SET seq = excluded.seq;
END;
--> statement-breakpoint
CREATE TRIGGER `app_settings_outbox_insert` AFTER INSERT ON `app_settings` WHEN (SELECT applying FROM sync_flags WHERE id = 1) = 0 BEGIN
  INSERT INTO sync_outbox (table_name, row_id, seq)
  VALUES ('app_settings', NEW.id, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_outbox))
  ON CONFLICT (table_name, row_id) DO UPDATE SET seq = excluded.seq;
END;
--> statement-breakpoint
CREATE TRIGGER `app_settings_outbox_update` AFTER UPDATE ON `app_settings` WHEN (SELECT applying FROM sync_flags WHERE id = 1) = 0 BEGIN
  INSERT INTO sync_outbox (table_name, row_id, seq)
  VALUES ('app_settings', NEW.id, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_outbox))
  ON CONFLICT (table_name, row_id) DO UPDATE SET seq = excluded.seq;
END;
