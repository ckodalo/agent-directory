import { dialect, query } from '../../database.js';

export async function up() {
  const sqlServer = dialect === 'sqlserver';
  await query(sqlServer ? `IF OBJECT_ID('users','U') IS NULL CREATE TABLE users (
    id VARCHAR(36) PRIMARY KEY,email VARCHAR(254) NOT NULL UNIQUE,password_hash VARCHAR(256) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'agent' CHECK(role IN ('agent','moderator')),
    created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME())`
    : `CREATE TABLE IF NOT EXISTS users (id VARCHAR(36) PRIMARY KEY,email VARCHAR(254) NOT NULL UNIQUE,
      password_hash VARCHAR(256) NOT NULL,role VARCHAR(20) NOT NULL DEFAULT 'agent' CHECK(role IN ('agent','moderator')),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await query(sqlServer ? `IF OBJECT_ID('sessions','U') IS NULL CREATE TABLE sessions (
    session_id VARCHAR(128) PRIMARY KEY,session_json NVARCHAR(MAX) NOT NULL,expires_at FLOAT NOT NULL)`
    : 'CREATE TABLE IF NOT EXISTS sessions (session_id VARCHAR(128) PRIMARY KEY,session_json LONGTEXT NOT NULL,expires_at DOUBLE NOT NULL)');
  await query(sqlServer ? `IF OBJECT_ID('profile_actions','U') IS NULL CREATE TABLE profile_actions (
    id VARCHAR(36) PRIMARY KEY,agent_id INT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    actor_id VARCHAR(36) NOT NULL REFERENCES users(id),action VARCHAR(20) NOT NULL,
    reason NVARCHAR(1000),created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME())`
    : `CREATE TABLE IF NOT EXISTS profile_actions (id VARCHAR(36) PRIMARY KEY,agent_id INT NOT NULL,
      actor_id VARCHAR(36) NOT NULL,action VARCHAR(20) NOT NULL,reason VARCHAR(1000),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(agent_id) REFERENCES agents(id) ON DELETE CASCADE,FOREIGN KEY(actor_id) REFERENCES users(id))`);
  const columns = sqlServer
    ? await query("SELECT name FROM sys.columns WHERE object_id=OBJECT_ID('agents')")
    : await query("SELECT COLUMN_NAME AS name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='agents'");
  const existing = new Set(columns.map(column => column.name));
  for (const [name, definition] of Object.entries({
    owner_id: 'VARCHAR(36) NULL', profile_status: "VARCHAR(20) NOT NULL DEFAULT 'draft'",
    rejection_reason: sqlServer ? 'NVARCHAR(1000) NULL' : 'VARCHAR(1000) NULL', profile_version: 'INT NOT NULL DEFAULT 0'
  })) if (!existing.has(name)) await query(`ALTER TABLE agents ADD ${name} ${definition}`);
  const indexes = sqlServer ? await query("SELECT name FROM sys.indexes WHERE object_id=OBJECT_ID('agents')")
    : await query("SELECT INDEX_NAME AS name FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='agents'");
  if (!indexes.some(index => index.name === 'idx_agent_owner')) await query(`CREATE UNIQUE INDEX idx_agent_owner ON agents(owner_id)${sqlServer ? ' WHERE owner_id IS NOT NULL' : ''}`);
  const constraints = sqlServer ? await query("SELECT name FROM sys.objects WHERE parent_object_id=OBJECT_ID('agents')")
    : await query("SELECT CONSTRAINT_NAME AS name FROM information_schema.table_constraints WHERE table_schema=DATABASE() AND table_name='agents'");
  if (!constraints.some(item => item.name === 'fk_agent_owner')) await query('ALTER TABLE agents ADD CONSTRAINT fk_agent_owner FOREIGN KEY(owner_id) REFERENCES users(id)');
  if (!constraints.some(item => item.name === 'ck_profile_status')) await query("ALTER TABLE agents ADD CONSTRAINT ck_profile_status CHECK(profile_status IN ('draft','pending','approved','rejected'))");
  await query("UPDATE agents SET profile_status='approved' WHERE owner_id IS NULL AND is_published=1 AND profile_status='draft'");
}
