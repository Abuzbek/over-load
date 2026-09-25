// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from './meta/_journal.json';
import m0000 from './0000_normal_korath.sql';
import m0001 from './0001_romantic_beyonder.sql';
import m0002 from './0002_sync_outbox.sql';
import m0003 from './0003_wonderful_morlocks.sql';
import m0004 from './0004_steady_dexter_bennett.sql';
import m0005 from './0005_cuddly_yellow_claw.sql';
import m0006 from './0006_bright_excalibur.sql';
import m0007 from './0007_gorgeous_talos.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002,
m0003,
m0004,
m0005,
m0006,
m0007
    }
  }
  