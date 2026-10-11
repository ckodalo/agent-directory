import { dialect, query, parameter as p, close } from '../database.js';
import { up as discovery } from '../sql/migrations/001-discovery.js';
import { up as onboarding } from '../sql/migrations/002-onboarding.js';
import { up as locationEvidence } from '../sql/migrations/003-location-evidence.js';
import { up as kisumuLocations } from '../sql/migrations/004-kisumu-locations.js';

try {
  await query(dialect === 'sqlserver'
    ? "IF OBJECT_ID('schema_migrations','U') IS NULL CREATE TABLE schema_migrations(version VARCHAR(100) PRIMARY KEY,applied_at DATETIME2 DEFAULT SYSDATETIME())"
    : 'CREATE TABLE IF NOT EXISTS schema_migrations(version VARCHAR(100) PRIMARY KEY,applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
  for (const [version, up] of [['001-discovery', discovery], ['002-onboarding', onboarding], ['003-location-evidence', locationEvidence], ['004-kisumu-locations', kisumuLocations]]) {
  const applied = await query(`SELECT version FROM schema_migrations WHERE version=${p('version')}`, { version });
  if (!applied.length) {
    await up();
    await query(`INSERT INTO schema_migrations(version) VALUES (${p('version')})`, { version });
    console.log(`Applied ${version}`);
  } else console.log(`${version} already applied`);
  }
} finally { await close(); }
