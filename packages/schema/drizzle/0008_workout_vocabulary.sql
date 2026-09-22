ALTER TABLE `workouts` RENAME TO `sessions`;--> statement-breakpoint
ALTER TABLE `workout_exercises` RENAME TO `session_exercises`;--> statement-breakpoint
ALTER TABLE `sets` RENAME TO `session_sets`;--> statement-breakpoint
ALTER TABLE `routines` RENAME TO `workouts`;--> statement-breakpoint
ALTER TABLE `routine_exercises` RENAME TO `workout_exercises`;--> statement-breakpoint
ALTER TABLE `routine_sets` RENAME TO `workout_sets`;--> statement-breakpoint
ALTER TABLE `sessions` RENAME COLUMN `routine_id` TO `workout_id`;--> statement-breakpoint
ALTER TABLE `session_exercises` RENAME COLUMN `workout_id` TO `session_id`;--> statement-breakpoint
ALTER TABLE `session_sets` RENAME COLUMN `workout_exercise_id` TO `session_exercise_id`;--> statement-breakpoint
ALTER TABLE `workout_exercises` RENAME COLUMN `routine_id` TO `workout_id`;--> statement-breakpoint
ALTER TABLE `workout_sets` RENAME COLUMN `routine_exercise_id` TO `workout_exercise_id`;--> statement-breakpoint
ALTER TABLE `program_days` RENAME COLUMN `routine_id` TO `workout_id`;--> statement-breakpoint
DROP INDEX IF EXISTS `workouts_started_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `workout_exercises_workout_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `workout_exercises_exercise_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `sets_parent_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `sets_completed_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `routine_exercises_routine_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `routine_sets_parent_idx`;--> statement-breakpoint
CREATE INDEX `sessions_started_idx` ON `sessions` (`started_at`);--> statement-breakpoint
CREATE INDEX `session_exercises_session_idx` ON `session_exercises` (`session_id`);--> statement-breakpoint
CREATE INDEX `session_exercises_exercise_idx` ON `session_exercises` (`exercise_id`);--> statement-breakpoint
CREATE INDEX `session_sets_parent_idx` ON `session_sets` (`session_exercise_id`);--> statement-breakpoint
CREATE INDEX `session_sets_completed_idx` ON `session_sets` (`completed_at`);--> statement-breakpoint
CREATE INDEX `workout_exercises_workout_idx` ON `workout_exercises` (`workout_id`);--> statement-breakpoint
CREATE INDEX `workout_sets_parent_idx` ON `workout_sets` (`workout_exercise_id`);
