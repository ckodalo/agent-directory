import { dialect, query, parameter as p, close } from '../database.js';
import { up } from '../sql/migrations/001-discovery.js';

try {
  await query(dialect === 'sqlserver'
    ? "IF OBJECT_ID('schema_migrations','U') IS NULL CREATE TABLE schema_migrations(version VARCHAR(100) PRIMARY KEY,applied_at DATETIME2 DEFAULT SYSDATETIME())"
    : 'CREATE TABLE IF NOT EXISTS schema_migrations(version VARCHAR(100) PRIMARY KEY,applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
  const version = '001-discovery';
  const applied = await query(`SELECT version FROM schema_migrations WHERE version=${p('version')}`, { version });
  if (!applied.length) {
    await up();
    await query(`INSERT INTO schema_migrations(version) VALUES (${p('version')})`, { version });
    console.log(`Applied ${version}`);
  } else console.log(`${version} already applied`);
} finally { await close(); }
