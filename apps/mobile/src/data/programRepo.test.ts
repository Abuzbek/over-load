import { appSettings, newId, now, programs, routines } from '@overload/schema';
import { createTestDb } from '@overload/schema/testing';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  activateProgram,
  createProgram,
  ensureDefaultProgram,
  getActiveProgram,
  listPrograms,
} from './programRepo';

let db: ReturnType<typeof createTestDb>['db'];
let close: () => void;

beforeEach(() => {
  ({ db, close } = createTestDb());
});

afterEach(() => close());

describe('createProgram', () => {
  it('creates a program with the given fields', () => {
    const program = createProgram(db, { name: 'Push Pull Legs', icon: 'dumbbell', iconColor: '#fff' }, now());
    expect(program.name).toBe('Push Pull Legs');
    expect(program.icon).toBe('dumbbell');
    expect(program.iconColor).toBe('#fff');
  });

  it('leaves icon and iconColor null when omitted', () => {
    const program = createProgram(db, { name: 'Bare' }, now());
    expect(program.icon).toBeNull();
    expect(program.iconColor).toBeNull();
  });

  it('orders by max(orderIndex) + 1 over all rows, including tombstoned', () => {
    const a = createProgram(db, { name: 'A' }, now());
    const b = createProgram(db, { name: 'B' }, now());
    db.update(programs).set({ deletedAt: now() }).where(eq(programs.id, b.id)).run();
    const c = createProgram(db, { name: 'C' }, now());

    expect(a.orderIndex).toBe(0);
    expect(b.orderIndex).toBe(1);
    expect(c.orderIndex).toBe(2);
  });
});

describe('activateProgram', () => {
  it('activates exactly one program at a time: activating B deactivates A', () => {
    const a = createProgram(db, { name: 'A' }, now());
    const b = createProgram(db, { name: 'B' }, now());

    activateProgram(db, a.id, now());
    activateProgram(db, b.id, now());

    const summaries = listPrograms(db);
    const active = summaries.filter((s) => s.isActive);
    expect(active).toHaveLength(1);
    expect(active[0]!.program.id).toBe(b.id);
    expect(summaries.find((s) => s.program.id === a.id)!.isActive).toBe(false);
  });

  it('is reflected by getActiveProgram', () => {
    const a = createProgram(db, { name: 'A' }, now());
    activateProgram(db, a.id, now());
    expect(getActiveProgram(db)?.id).toBe(a.id);
  });
});

describe('listPrograms', () => {
  it('lists active program first, then the rest by orderIndex', () => {
    const a = createProgram(db, { name: 'A' }, now());
    const b = createProgram(db, { name: 'B' }, now());
    const c = createProgram(db, { name: 'C' }, now());
    activateProgram(db, c.id, now());

    expect(listPrograms(db).map((s) => s.program.id)).toEqual([c.id, a.id, b.id]);
  });

  it('counts only live routines toward workoutCount', () => {
    const program = createProgram(db, { name: 'A' }, now());
    db.insert(routines).values([
      { id: newId(), name: 'R1', programId: program.id },
      { id: newId(), name: 'R2', programId: program.id },
    ]).run();

    expect(listPrograms(db).find((s) => s.program.id === program.id)!.workoutCount).toBe(2);
  });

  // --- one tombstone test per joined level ---

  it('level 1: excludes a tombstoned program', () => {
    const program = createProgram(db, { name: 'A' }, now());
    db.update(programs).set({ deletedAt: now() }).where(eq(programs.id, program.id)).run();
    expect(listPrograms(db)).toHaveLength(0);
  });

  it('level 2: does not count a tombstoned routine toward workoutCount', () => {
    const program = createProgram(db, { name: 'A' }, now());
    const live = newId();
    const dead = newId();
    db.insert(routines).values([
      { id: live, name: 'R1', programId: program.id },
      { id: dead, name: 'R2', programId: program.id },
    ]).run();
    db.update(routines).set({ deletedAt: now() }).where(eq(routines.id, dead)).run();

    expect(listPrograms(db).find((s) => s.program.id === program.id)!.workoutCount).toBe(1);
  });
});

describe('ensureDefaultProgram', () => {
  it('creates and activates "My Program" and adopts orphaned routines when none exists', () => {
    const r1 = { id: newId(), name: 'R1' };
    const r2 = { id: newId(), name: 'R2' };
    db.insert(routines).values([r1, r2]).run();

    const created = ensureDefaultProgram(db, now());

    expect(created.name).toBe('My Program');
    expect(getActiveProgram(db)?.id).toBe(created.id);
    const rows = db.select().from(routines).all();
    expect(rows.every((r) => r.programId === created.id)).toBe(true);
  });

  it('is idempotent: calling it twice creates only one program and does not re-parent routines', () => {
    const r1 = { id: newId(), name: 'R1' };
    db.insert(routines).values([r1]).run();

    const first = ensureDefaultProgram(db, now());
    // Move the routine to a different program to prove a second call leaves it alone.
    const other = createProgram(db, { name: 'Other' }, now());
    db.update(routines).set({ programId: other.id }).where(eq(routines.id, r1.id)).run();

    const second = ensureDefaultProgram(db, now());

    expect(second.id).toBe(first.id);
    expect(db.select().from(programs).all()).toHaveLength(2);
    expect(db.select().from(routines).where(eq(routines.id, r1.id)).get()!.programId).toBe(other.id);
  });

  it('does nothing when a live program already exists, even with orphaned routines', () => {
    createProgram(db, { name: 'Existing' }, now());
    const r1 = { id: newId(), name: 'R1' };
    db.insert(routines).values([r1]).run();

    ensureDefaultProgram(db, now());

    expect(db.select().from(programs).all()).toHaveLength(1);
    expect(db.select().from(routines).where(eq(routines.id, r1.id)).get()!.programId).toBeNull();
  });
});

describe('appSettings has no row yet', () => {
  it('getActiveProgram returns undefined', () => {
    expect(getActiveProgram(db)).toBeUndefined();
  });

  it('does not insert a settings row on a plain read', () => {
    getActiveProgram(db);
    expect(db.select().from(appSettings).all()).toHaveLength(0);
  });
});
