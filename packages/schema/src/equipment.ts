import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { gyms } from './gyms';
import { syncColumns } from './sync';

/** The thirteen groups the gym screen renders, in the order it renders them. */
export const EQUIPMENT_CATEGORIES = [
  'free_weights',
  'loaded_bars',
  'fixed_weight_bars',
  'bands_ropes',
  'body_weights',
  'benches_racks',
  'accessories_functional',
  'loaded_accessories',
  'cable_machines',
  'plate_loaded_machines',
  'pin_loaded_machines',
  'cardio',
  'other',
] as const;
export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number];

/**
 * How a piece of equipment's weight is edited. This is a property of the
 * category, not of the item — every loaded bar is a list of bar weights even
 * when you own exactly one bar.
 */
export const WEIGHT_KINDS = ['none', 'list', 'base', 'range', 'labels'] as const;
export type WeightKind = (typeof WEIGHT_KINDS)[number];

/** A weight you own, optionally colour-coded the way plates and bumpers are. */
export type WeightValue = { kg: number; label?: string };

export type EquipmentConfig =
  | { kind: 'none' }
  | { kind: 'list'; values: WeightValue[] }
  | { kind: 'base'; baseKg: number }
  | { kind: 'range'; minKg: number; maxKg: number; incrementKg: number }
  | { kind: 'labels'; labels: string[] };

/**
 * The catalogue: seeded reference data, the same for everyone. What a
 * particular gym owns, and the weights it actually has, lives in
 * `gym_equipment`.
 */
export const equipment = sqliteTable(
  'equipment',
  {
    ...syncColumns,
    name: text('name').notNull(),
    category: text('category', { enum: EQUIPMENT_CATEGORIES }).notNull(),
    kind: text('kind', { enum: WEIGHT_KINDS }).notNull(),
    /** The catalogue's starting values, copied into gym_equipment on first use. */
    defaults: text('defaults', { mode: 'json' }).$type<EquipmentConfig>().notNull(),
    /**
     * Which of the exercise catalogue's coarse equipment values this unlocks
     * ("barbell", "cable", "machine"). Empty for a bench: owning one does not
     * make an exercise possible on its own.
     */
    satisfies: text('satisfies', { mode: 'json' }).$type<string[]>().notNull(),
  },
  (table) => ({
    categoryIdx: index('equipment_category_idx').on(table.category),
  }),
);

/**
 * What one gym owns, and the weights it actually has. A row exists only for
 * equipment the gym owns — absent means not owned, so nothing has to be
 * back-filled when the catalogue grows.
 */
export const gymEquipment = sqliteTable(
  'gym_equipment',
  {
    ...syncColumns,
    gymId: text('gym_id').notNull().references(() => gyms.id),
    equipmentId: text('equipment_id').notNull().references(() => equipment.id),
    /** Starts as the catalogue defaults; edited per gym from there. */
    config: text('config', { mode: 'json' }).$type<EquipmentConfig>().notNull(),
  },
  (table) => ({
    gymIdx: index('gym_equipment_gym_idx').on(table.gymId),
  }),
);

export type Equipment = typeof equipment.$inferSelect;
export type GymEquipment = typeof gymEquipment.$inferSelect;
