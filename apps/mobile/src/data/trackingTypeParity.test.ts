import { TRACKING_TYPES as DOMAIN_TYPES } from '@overload/domain';
import { TRACKING_TYPES as SCHEMA_TYPES } from '@overload/schema';
import { expect, it } from 'vitest';

// packages/domain cannot import the schema, so the union is duplicated there.
// This test is the only thing keeping the two copies honest.
it('domain and schema agree on the tracking types', () => {
  expect([...DOMAIN_TYPES].sort()).toEqual([...SCHEMA_TYPES].sort());
});
